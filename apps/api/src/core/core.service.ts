/**
 * CoreService (facade)
 * ====================
 *
 * Scope (end state, in progress):
 *   - This file is being incrementally split into 15 sub-services
 *     under ./services/ (see their Scope headers for owned methods).
 *   - The facade keeps the public API contract stable: controllers
 *     (core, public, archived) keep calling coreService.xxx(). Every
 *     method listed in core.service.public-surface.json remains
 *     callable on this class — the regression guard at
 *     core.service.public-surface.spec.ts fails if any disappears.
 *   - onModuleInit will eventually delegate all schema migrations to
 *     SchemaService.runAll(). Until that extraction lands, the guards
 *     live here so boot order is byte-identical.
 *
 * Scope (today, pre-extraction):
 *   - 132 public methods owned here directly. Each one will move to
 *     its sub-service in a separate commit, replaced by a one-line
 *     delegation (e.g. `getMenus(...args) { return this.menu.getMenus(...args); }`).
 *   - Private helpers (phone/date/hash/family/etc.) migrate to
 *     HelpersService and are reached through `this.helpers.xxx`.
 *
 * Dependencies (via @Optional() so `new CoreService()` still works in
 * unit tests that bypass Nest DI — production Nest provides real
 * instances for all 15):
 *   - AdminReportsService, AuditService, BillingService, DeliveryService,
 *     GaiaService, HelpersService, KitchenService, MediaService,
 *     MenuService, MultiOrderService, OrderService, SchemaService,
 *     SchoolsService, SiteSettingsService, UsersService.
 *
 * Consumers:
 *   - CoreController  (apps/api/src/core/core.controller.ts)
 *   - PublicController (apps/api/src/core/public.controller.ts)
 *   - ArchivedController (apps/api/src/core/archived.controller.ts — not
 *     registered in CoreModule but kept source-live for future reactivation)
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { readFile } from 'fs/promises';
import { createSign, randomUUID, scryptSync } from 'crypto';
import { runSql } from '../auth/db.util';
import { validatePasswordPolicy } from '../auth/password-policy';
import { AccessUser, CartItemInput, SessionType } from './core.types';
import { normalizeGradeLabel, resolveEffectiveGrade } from '../shared/grade.util';
import { AdminReportsService } from './services/admin-reports.service';
import { AuditService } from './services/audit.service';
import { BillingService } from './services/billing.service';
import { DeliveryService } from './services/delivery.service';
import { GaiaService } from './services/gaia.service';
import { HelpersService } from './services/helpers.service';
import { KitchenService } from './services/kitchen.service';
import { MediaService } from './services/media.service';
import { MenuService } from './services/menu.service';
import { MultiOrderService } from './services/multi-order.service';
import { OrderService } from './services/order.service';
import { SchemaService } from './services/schema.service';
import { SchoolsService } from './services/schools.service';
import { SiteSettingsService } from './services/site-settings.service';
import { UsersService } from './services/users.service';

type DbUserRow = {
  id: string;
  username: string;
  role: string;
  first_name: string;
  last_name: string;
};

type ChildRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  school_id: string;
  school_name: string;
  school_short_name?: string;
  school_grade: string;
  registration_grade?: string;
  current_school_grade?: string | null;
  registration_date?: string;
  date_of_birth: string;
  gender: string;
  dietary_allergies?: string;
};

type CartRow = {
  id: string;
  child_id: string;
  created_by_user_id: string;
  session: SessionType;
  service_date: string;
  status: 'OPEN' | 'SUBMITTED' | 'EXPIRED';
  expires_at: string;
};

type BlackoutType = 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';

type BlackoutRule = {
  blackout_date: string;
  type: BlackoutType;
  reason: string | null;
  session?: SessionType | null;
};

const SESSIONS: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST'];
const DISH_CATEGORIES = ['MAIN', 'APPETISER', 'COMPLEMENT', 'DESSERT', 'SIDES', 'GARNISH', 'DRINK'] as const;
type DishCategory = (typeof DISH_CATEGORIES)[number];
type AiFutureCategory = 'orders' | 'billing' | 'menu' | 'profile' | 'dietary' | 'unknown';

@Injectable()
export class CoreService implements OnModuleInit {
  private familyIdsReady = false;
  private readonly publicMenuCacheTtlMs = 60_000;
  private publicMenuCache = new Map<string, {
    data: {
      serviceDate: string;
      session: SessionType | 'ALL';
      items: unknown[];
      sessionSettings: Array<{ session: SessionType; is_active: boolean }>;
    };
    expiresAt: number;
  }>();

  // Sub-services scaffolded for the incremental split of this file.
  // @Optional() keeps `new CoreService()` valid in unit tests that
  // bypass Nest DI; in production Nest injects real instances.
  constructor(
    @Optional() protected readonly adminReports?: AdminReportsService,
    @Optional() protected readonly audit?: AuditService,
    @Optional() protected readonly billing?: BillingService,
    @Optional() protected readonly delivery?: DeliveryService,
    @Optional() protected readonly gaia?: GaiaService,
    @Optional() protected readonly helpers?: HelpersService,
    @Optional() protected readonly kitchen?: KitchenService,
    @Optional() protected readonly media?: MediaService,
    @Optional() protected readonly menu?: MenuService,
    @Optional() protected readonly multiOrder?: MultiOrderService,
    @Optional() protected readonly order?: OrderService,
    @Optional() protected readonly schema?: SchemaService,
    @Optional() protected readonly schools?: SchoolsService,
    @Optional() protected readonly siteSettings?: SiteSettingsService,
    @Optional() protected readonly users?: UsersService,
  ) {}

  async onModuleInit() {
    // Startup schema guards are run sequentially because the production DB helper is not
    // safe under parallel initialization and can tear down the shared pool mid-boot.
    // SchemaService.runAll() preserves the exact boot order; the audit trail (owned by
    // AuditService) and family_id columns (still on CoreService pending HelpersService
    // extraction) are invoked separately to keep their existing position in the sequence.
    await this.schema!.runAll();
    await this.audit!.ensureAdminAuditTrailTable();
    await this.ensureFamilyIdColumns();
  }

  private async setAdminVisiblePassword(userId: string, password: string, source: 'REGISTRATION' | 'RESET' | 'MANUAL_CREATE') {
    return this.users!.setAdminVisiblePassword(userId, password, source);
  }

  private async getAdminVisiblePasswordRow(userId: string) {
    return this.users!.getAdminVisiblePasswordRow(userId);
  }

  private parseJsonLine<T>(line: string): T {
    return this.helpers!.parseJsonLine(line);
  }

  private parseJsonLines<T>(raw: string): T[] {
    return this.helpers!.parseJsonLines(raw);
  }

  private toBase64Url(value: string | Buffer) {
    return this.media!.toBase64Url(value);
  }

  private normalizeGcsFolder(value?: string) {
    return this.media!.normalizeGcsFolder(value);
  }

  private getGcsBucket() {
    return this.media!.getGcsBucket();
  }

  private getGcsRootFolder() {
    return this.media!.getGcsRootFolder();
  }

  private getGcsCategoryFolder(kind: 'menu-images' | 'receipts' | 'payment-proofs') {
    return this.media!.getGcsCategoryFolder(kind);
  }

  private buildStoragePublicUrl(objectName: string) {
    return this.media!.buildStoragePublicUrl(objectName);
  }

  private buildGoogleStoragePublicUrl(objectName: string) {
    return this.media!.buildGoogleStoragePublicUrl(objectName);
  }

  private async getGoogleServiceAccount() {
    return this.media!.getGoogleServiceAccount();
  }

  private async getGoogleAccessToken(scopes: string[], delegatedUserEmail?: string) {
    return this.media!.getGoogleAccessToken(scopes, delegatedUserEmail);
  }

  private clipText(value: string, max = 72) {
    return this.helpers!.clipText(value, max);
  }

  private buildGeneratedPasswordFromPhone(phoneLike?: string | null) {
    return this.helpers!.buildGeneratedPasswordFromPhone(phoneLike);
  }

  private normalizePhone(raw?: string | null) {
    return this.helpers!.normalizePhone(raw);
  }

  private phoneCompareKey(raw?: string | null) {
    return this.helpers!.phoneCompareKey(raw);
  }

  private async findActiveUserByEmail(email?: string | null, excludeUserId?: string) {
    return this.helpers!.findActiveUserByEmail(email, excludeUserId);
  }

  private async findActiveUserByPhone(phoneNumber?: string | null, excludeUserId?: string) {
    return this.helpers!.findActiveUserByPhone(phoneNumber, excludeUserId);
  }

  async lookupNameByPhone(phoneNumber?: string | null) {
    return this.gaia!.lookupNameByPhone(phoneNumber);
  }

  private async resolveFamilyScopeByPhone(phoneNumber?: string | null) {
    return this.gaia!.resolveFamilyScopeByPhone(phoneNumber);
  }

  private buildTwoColumnDeliveryPdfLines(input: {
    title: string;
    serviceDate: string;
    deliveryName: string;
    orders: Array<{
      session: string;
      child_name: string;
      school_name?: string | null;
      youngster_mobile?: string | null;
      allergen_items?: string | null;
      status: string;
      delivery_status: string;
      dishes: Array<{ item_name: string; quantity: number }>;
    }>;
  }) {
    return this.media!.buildTwoColumnDeliveryPdfLines(input);
  }

  private async sendEmailWithPdfAttachment(input: {
    to: string;
    subject: string;
    bodyText: string;
    attachmentFileName: string;
    attachmentData: Buffer;
  }) {
    return this.media!.sendEmailWithPdfAttachment(input);
  }

  private async uploadToGcs(params: {
    objectName: string;
    contentType: string;
    data: Buffer;
    cacheControl?: string;
    publicRead?: boolean;
  }) {
    return this.media!.uploadToGcs(params);
  }

  private parseDataUrl(input: string): { contentType: string; data: Buffer } {
    return this.media!.parseDataUrl(input);
  }

  private detectImageMimeFromMagicBytes(data: Buffer) {
    return this.media!.detectImageMimeFromMagicBytes(data);
  }

  private isPdfBinary(data: Buffer) {
    return this.media!.isPdfBinary(data);
  }

  private assertSafeImagePayload(input: { contentType: string; data: Buffer; maxBytes: number; label: string }) {
    return this.media!.assertSafeImagePayload(input);
  }

  private getFileExtFromContentType(contentType: string) {
    return this.media!.getFileExtFromContentType(contentType);
  }

  private isAllowedProofImageUrl(urlRaw: string) {
    return this.media!.isAllowedProofImageUrl(urlRaw);
  }

  private isGoogleStorageHost(hostRaw: string) {
    return this.media!.isGoogleStorageHost(hostRaw);
  }

  private async fetchProofImageBinary(proofImageUrl: string) {
    return this.media!.fetchProofImageBinary(proofImageUrl);
  }

  private async fetchReceiptPdfBinary(pdfUrl: string) {
    return this.media!.fetchReceiptPdfBinary(pdfUrl);
  }

  private slugify(value: string) {
    return this.helpers!.slugify(value);
  }

  private async resolveMenuImageUrl(imageUrl: string, menuItemName: string) {
    return this.media!.resolveMenuImageUrl(imageUrl, menuItemName);
  }

  private escapePdfText(text: string) {
    return this.media!.escapePdfText(text);
  }

  private buildSimplePdf(lines: string[]) {
    return this.media!.buildSimplePdf(lines);
  }

  private normalizeSession(session?: string): SessionType {
    return this.helpers!.normalizeSession(session);
  }

  private validateServiceDate(serviceDate?: string) {
    return this.helpers!.validateServiceDate(serviceDate);
  }

  private async resolveCreateMenuServiceDate(session: SessionType) {
    return this.menu!.resolveCreateMenuServiceDate(session);
  }

  private nextWeekdayIsoDate() {
    return this.helpers!.nextWeekdayIsoDate();
  }

  private makassarTodayIsoDate() {
    return this.helpers!.makassarTodayIsoDate();
  }

  private getMakassarNowContext() {
    return this.helpers!.getMakassarNowContext();
  }

  private normalizeOrderingCutoffTime(raw?: string | null) {
    return this.helpers!.normalizeOrderingCutoffTime(raw);
  }

  private formatOrderingCutoffTimeLabel(cutoffTime: string) {
    return this.helpers!.formatOrderingCutoffTimeLabel(cutoffTime);
  }

  private async getOrderingCutoffTime() {
    return this.helpers!.getOrderingCutoffTime();
  }

  private async enforceParentYoungsterOrderingWindow(actor: AccessUser, serviceDate: string) {
    return this.helpers!.enforceParentYoungsterOrderingWindow(actor, serviceDate);
  }

  private addDaysIsoDate(dateIso: string, days: number) {
    return this.helpers!.addDaysIsoDate(dateIso, days);
  }

  private calculateTotalPrice(items: Array<{ price: string | number; quantity: number }>) {
    return this.helpers!.calculateTotalPrice(items);
  }

  private calculateMaxConsecutiveOrderDays(orderDates: string[]) {
    return this.helpers!.calculateMaxConsecutiveOrderDays(orderDates);
  }

  private getIsoWeek(dateIso: string) {
    return this.helpers!.getIsoWeek(dateIso);
  }

  private calculateMonthOrderStats(monthDates: string[], month: string) {
    return this.helpers!.calculateMonthOrderStats(monthDates, month);
  }

  private resolveBadgeLevel(input: {
    maxConsecutiveOrderDays: number;
    currentMonthOrders: number;
    currentMonthConsecutiveWeeks: number;
    previousMonthOrders: number;
    previousMonthConsecutiveWeeks: number;
  }) {
    return this.helpers!.resolveBadgeLevel(input);
  }

  private async isAfterOrAtMakassarCutoff(serviceDate: string) {
    return this.helpers!.isAfterOrAtMakassarCutoff(serviceDate);
  }

  private async lockOrdersForServiceDateIfCutoffPassed(serviceDate: string) {
    return this.helpers!.lockOrdersForServiceDateIfCutoffPassed(serviceDate);
  }

  private hashPassword(raw: string) {
    return this.helpers!.hashPassword(raw);
  }

  private sanitizeUsernamePart(value: string) {
    return this.helpers!.sanitizeUsernamePart(value);
  }

  private async getParentIdByUserId(userId: string) {
    return this.helpers!.getParentIdByUserId(userId);
  }

  private async getParentFamilyId(parentId: string) {
    return this.helpers!.getParentFamilyId(parentId);
  }

  private async getChildFamilyId(childId: string) {
    return this.helpers!.getChildFamilyId(childId);
  }

  private async getFamilyIdByUserId(userId: string, role: 'PARENT' | 'YOUNGSTER') {
    return this.helpers!.getFamilyIdByUserId(userId, role);
  }

  private async syncParentChildrenByLastName(parentId: string) {
    return this.helpers!.syncParentChildrenByLastName(parentId);
  }

  private async getChildIdByUserId(userId: string) {
    return this.helpers!.getChildIdByUserId(userId);
  }

  private async ensureParentOwnsChild(parentId: string, childId: string) {
    return this.helpers!.ensureParentOwnsChild(parentId, childId);
  }

  private async getParentIdByChildId(childId: string) {
    return this.helpers!.getParentIdByChildId(childId);
  }

  private async syncFamilyParentChildren(familyId: string) {
    return this.helpers!.syncFamilyParentChildren(familyId);
  }

  private async recordAiUsage(input: {
    actor: AccessUser;
    parentId?: string | null;
    viewerChildId?: string | null;
    childIds: string[];
    category: AiFutureCategory;
    promptChars: number;
    responseChars: number;
    success: boolean;
    errorCode?: string | null;
  }) {
    return this.gaia!.recordAiUsage(input);
  }

  private categorizeAiQuestion(question: string): AiFutureCategory {
    return this.gaia!.categorizeAiQuestion(question);
  }

  private isBlockedGaiaQuestion(question: string) {
    return this.gaia!.isBlockedGaiaQuestion(question);
  }

  private getAiRuntimeConfig() {
    return this.gaia!.getAiRuntimeConfig();
  }

  private async ensureAiFutureEnabled() {
    return this.gaia!.ensureAiFutureEnabled();
  }

  private async enforceAiDailyLimit(actor: AccessUser, maxRequestsPerDay: number) {
    return this.gaia!.enforceAiDailyLimit(actor, maxRequestsPerDay);
  }

  private async resolveAiFamilyScope(actor: AccessUser) {
    return this.gaia!.resolveAiFamilyScope(actor);
  }

  private async buildAiFamilyContext(
    actor: AccessUser,
    scope: Awaited<ReturnType<CoreService['resolveAiFamilyScope']>>,
    category: AiFutureCategory,
  ) {
    return this.gaia!.buildAiFamilyContext(actor, scope, category);
  }

  private async getComputeEngineAccessToken() {
    return this.media!.getComputeEngineAccessToken();
  }

  private buildGaiaPrompt(question: string, context: Record<string, unknown>) {
    return this.gaia!.buildGaiaPrompt(question, context);
  }

  private async callVertexGaia(question: string, context: Record<string, unknown>) {
    return this.gaia!.callVertexGaia(question, context);
  }

  async quickOrder(actor: AccessUser, input: { childUsername?: string; senderPhone?: string; date?: string; session?: string; dishes?: string[] }) {
    return this.gaia!.quickOrder(actor, input);
  }

  async queryGaia(actor: AccessUser, input: { question?: string }) {
    return this.gaia!.queryGaia(actor, input);
  }

  private deriveFamilyName(children: { first_name: string; last_name: string }[]): string {
    return this.helpers!.deriveFamilyName(children);
  }

  private assertValidUuid(value: string | undefined, label: string) {
    return this.helpers!.assertValidUuid(value, label);
  }

  private async ensureCartIsOpenAndOwned(cartId: string, actor: AccessUser): Promise<CartRow> {
    this.assertValidUuid(cartId, 'cartId');
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                status::text AS status, expires_at::text AS expires_at
         FROM order_carts
         WHERE id = $1
         LIMIT 1
       ) t;`,
      [cartId],
    );
    if (!out) throw new NotFoundException('Cart not found');
    const cart = this.parseJsonLine<CartRow>(out);

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId || childId !== cart.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, cart.child_id);
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    if (cart.status !== 'OPEN') {
      throw new BadRequestException(cart.status === 'EXPIRED' ? 'CART_EXPIRED' : 'CART_ALREADY_SUBMITTED');
    }
    if (new Date(cart.expires_at).getTime() <= Date.now()) {
      await runSql(
        `UPDATE order_carts
         SET status = 'EXPIRED', updated_at = now()
         WHERE id = $1
           AND status = 'OPEN';`,
        [cart.id],
      );
      throw new BadRequestException('CART_EXPIRED');
    }
    return cart;
  }

  private async validateOrderDayRules(serviceDate: string, session?: SessionType) {
    return this.schools!.validateOrderDayRules(serviceDate, session);
  }

  private async getBlackoutRuleForDate(serviceDate: string, session?: SessionType): Promise<BlackoutRule | null> {
    return this.schools!.getBlackoutRuleForDate(serviceDate, session);
  }


  private async isSessionActive(session: SessionType) {
    return this.schools!.isSessionActive(session);
  }

  private async assertSessionActiveForOrdering(session: SessionType) {
    return this.schools!.assertSessionActiveForOrdering(session);
  }

  private sanitizePackingRequirement(value?: string) {
    return this.menu!.sanitizePackingRequirement(value);
  }

  private normalizeDishCategory(value?: string): DishCategory {
    return this.menu!.normalizeDishCategory(value);
  }

  private normalizeAllergies(allergiesRaw?: string) {
    return this.menu!.normalizeAllergies(allergiesRaw);
  }

  private async getOrderDietarySnapshot(childId: string) {
    await this.schema!.ensureParentDietaryRestrictionsTable();
    const childAllergiesRaw = await runSql(
      `SELECT cdr.restriction_details
       FROM child_dietary_restrictions cdr
       WHERE cdr.child_id = $1
         AND cdr.is_active = true
         AND cdr.deleted_at IS NULL
         AND upper(cdr.restriction_label) = 'ALLERGIES'
       ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
       LIMIT 1;`,
      [childId],
    );
    const parentAllergiesRaw = await runSql(
      `SELECT COALESCE(string_agg(DISTINCT pdr.restriction_details, '; '), '')
       FROM parent_children pc
       JOIN parent_dietary_restrictions pdr ON pdr.parent_id = pc.parent_id
       WHERE pc.child_id = $1
         AND pdr.is_active = true
         AND pdr.deleted_at IS NULL;`,
      [childId],
    );

    const childAllergies = this.normalizeAllergies(childAllergiesRaw || '');
    const parentAllergies = this.normalizeAllergies(parentAllergiesRaw || '');
    const hasChild = childAllergies.toLowerCase() !== 'no allergies';
    const hasParent = parentAllergies.toLowerCase() !== 'no allergies';
    if (!hasChild && !hasParent) return 'No Allergies';
    if (hasChild && hasParent) return `Youngster Allergies: ${childAllergies}; Parent Allergies: ${parentAllergies}`;
    if (hasChild) return `Youngster Allergies: ${childAllergies}`;
    return `Parent Allergies: ${parentAllergies}`;
  }

  private async ensureMenuForDateSession(serviceDate: string, session: SessionType) {
    return this.menu!.ensureMenuForDateSession(serviceDate, session);
  }

  async getSchools(active = true) {
    return this.schools!.getSchools(active);
  }

  async updateSchool(actor: AccessUser, schoolId: string, input: { isActive?: boolean; name?: string; shortName?: string; city?: string; address?: string; contactPhone?: string }) {
    return this.schools!.updateSchool(actor, schoolId, input);
  }

  async getSessionSettings() {
    return this.schools!.getSessionSettings();
  }

  async updateSessionSetting(actor: AccessUser, sessionRaw: string, isActive?: boolean) {
    return this.menu!.updateSessionSetting(actor, sessionRaw, isActive);
  }

  async registerYoungster(
    actor: AccessUser,
    input: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      email?: string;
      dateOfBirth?: string;
      gender?: string;
      schoolId?: string;
      schoolGrade?: string;
      currentGrade?: string;
      parentId?: string;
      allergies?: string;
    },
  ) {
    return this.users!.registerYoungster(actor, input);
  }

  async getAdminParents() {
    return this.users!.getAdminParents();
  }

  private async ensureFamilyIdColumns() {
    return this.helpers!.ensureFamilyIdColumns();
  }

  private async assignFamilyIdToParents(parentIds: string[], familyId: string) {
    return this.helpers!.assignFamilyIdToParents(parentIds, familyId);
  }

  private async assignFamilyIdToChildren(childIds: string[], familyId: string) {
    return this.helpers!.assignFamilyIdToChildren(childIds, familyId);
  }

  private async backfillFamilyIds() {
    return this.helpers!.backfillFamilyIds();
  }

  private withEffectiveGrade<T extends Record<string, unknown>>(row: T) {
    return this.helpers!.withEffectiveGrade(row);
  }

  private normalizeMenuText(raw?: string | null) {
    return this.menu!.normalizeMenuText(raw);
  }

  private async ensureTbaIngredientId() {
    return this.menu!.ensureTbaIngredientId();
  }

  async getAdminChildren() {
    return this.users!.getAdminChildren();
  }

  async getAdminDashboard(dateRaw?: string) {
    return this.adminReports!.getAdminDashboard(dateRaw);
  }

  async getAdminOrders(
    actor: AccessUser,
    input?: { dateRaw?: string; schoolId?: string; deliveryUserId?: string; session?: string },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const serviceDate = input?.dateRaw ? this.validateServiceDate(input.dateRaw) : '';
    const params: unknown[] = [];
    const filters: string[] = ['o.deleted_at IS NULL', `o.status <> 'CANCELLED'`];

    if (serviceDate) {
      params.push(serviceDate);
      filters.push(`o.service_date = $${params.length}::date`);
    }
    if (input?.schoolId && input.schoolId !== 'ALL') {
      params.push(input.schoolId);
      filters.push(`s.id = $${params.length}::uuid`);
    }
    if (input?.deliveryUserId && input.deliveryUserId !== 'ALL') {
      if (input.deliveryUserId === 'UNASSIGNED') {
        filters.push('da.delivery_user_id IS NULL');
      } else {
        params.push(input.deliveryUserId);
        filters.push(`da.delivery_user_id = $${params.length}::uuid`);
      }
    }
    if (input?.session && input.session !== 'ALL') {
      params.push(this.normalizeSession(input.session));
      filters.push(`o.session = $${params.length}::session_type`);
    }

    const whereSql = `WHERE ${filters.join('\n          AND ')}`;
    const rowsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id AS order_id,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.status::text AS status,
               o.delivery_status::text AS delivery_status,
               o.total_price,
               c.id AS child_id,
               s.id AS school_id,
               s.name AS school_name,
               c.school_grade AS registration_grade,
               c.current_school_grade,
               c.created_at::text AS registration_date,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               COALESCE((up.first_name || ' ' || up.last_name), '-') AS account_name,
               da.delivery_user_id::text AS delivery_user_id,
               COALESCE((du.first_name || ' ' || du.last_name), 'Unassigned') AS delivery_name,
               COALESCE(br.status::text, 'UNBILLED') AS billing_status,
               COALESCE((
                 SELECT json_agg(row_to_json(d) ORDER BY d.item_name)
                 FROM (
                   SELECT oi.item_name_snapshot AS item_name,
                          SUM(oi.quantity)::int AS quantity
                   FROM order_items oi
                   WHERE oi.order_id = o.id
                   GROUP BY oi.item_name_snapshot
                 ) d
               ), '[]'::json) AS dishes
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN users up ON up.id = o.placed_by_user_id
        LEFT JOIN LATERAL (
          SELECT da1.delivery_user_id
          FROM delivery_assignments da1
          WHERE da1.order_id = o.id
          ORDER BY da1.assigned_at DESC NULLS LAST, da1.created_at DESC NULLS LAST
          LIMIT 1
        ) da ON true
        LEFT JOIN users du ON du.id = da.delivery_user_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        ${whereSql}
        ORDER BY o.service_date DESC, s.name ASC, o.session ASC, child_name ASC
      ) t;
      `,
      params,
    );

    const schoolsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, name
        FROM schools
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      ) t;
      `,
    );
    const deliveryUsersOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT u.id AS user_id,
               (u.first_name || ' ' || u.last_name) AS name
        FROM users u
        WHERE u.role = 'DELIVERY'
          AND u.deleted_at IS NULL
        ORDER BY name ASC
      ) t;
      `,
    );

    const rows = this.parseJsonLines<Record<string, unknown> & { total_price?: string | number; delivery_status?: string }>(rowsOut)
      .map((row) => ({
        ...this.withEffectiveGrade(row),
        total_price: Number(row.total_price || 0),
        is_completed: String(row.delivery_status || '').toUpperCase() === 'DELIVERED',
      }));

    return {
      filters: {
        schools: this.parseJsonLines(schoolsOut),
        deliveryUsers: [
          { user_id: 'UNASSIGNED', name: 'Unassigned' },
          ...this.parseJsonLines(deliveryUsersOut),
        ],
      },
      outstanding: rows.filter((row) => !row.is_completed),
      completed: rows.filter((row) => row.is_completed),
    };
  }

  async getBlackoutDays(query: { fromDate?: string; toDate?: string; session?: string }) {
    return this.schools!.getBlackoutDays(query);
  }

  async createBlackoutDay(actor: AccessUser, input: { blackoutDate?: string; type?: string; reason?: string; session?: string }) {
    return this.schools!.createBlackoutDay(actor, input);
  }

  async deleteBlackoutDay(actor: AccessUser, id: string) {
    return this.schools!.deleteBlackoutDay(actor, id);
  }

  async getParentChildrenPages(actor: AccessUser) {
    return this.users!.getParentChildrenPages(actor);
  }

  async getYoungsterChildrenPages(actor: AccessUser) {
    return this.users!.getYoungsterChildrenPages(actor);
  }

  private async mergeFamilyIds(targetFamilyId: string, sourceFamilyId: string) {
    return this.helpers!.mergeFamilyIds(targetFamilyId, sourceFamilyId);
  }

  private async alignFamilyIdsForLink(actor: AccessUser, parentId: string, childId: string) {
    return this.helpers!.alignFamilyIdsForLink(actor, parentId, childId);
  }

  async linkParentChild(actor: AccessUser, parentId: string, childId: string) {
    return this.users!.linkParentChild(actor, parentId, childId);
  }

  async getMenus(actor: AccessUser, query: {
    serviceDate?: string;
    session?: string;
    search?: string;
    priceMin?: string;
    priceMax?: string;
    allergenExclude?: string;
    favouritesOnly?: string;
  }) {
    return this.menu!.getMenus(actor, query);
  }

  async getPublicActiveMenu(query: { serviceDate?: string; session?: string }) {
    return this.menu!.getPublicActiveMenu(query);
  }

  async getAdminIngredients() {
    return this.menu!.getAdminIngredients();
  }

  async getAdminMenus(query: { session?: string }) {
    return this.menu!.getAdminMenus(query);
  }

  async getAdminMenuRatings(query: { serviceDate?: string; session?: string }) {
    return this.menu!.getAdminMenuRatings(query);
  }

  async createOrUpdateMenuRating(actor: AccessUser, input: { menuItemId: string; stars: number }) {
    return this.menu!.createOrUpdateMenuRating(actor, input);
  }

  async uploadMenuImage(buffer: Buffer, mimetype: string): Promise<{ url: string }> {
    return this.media!.uploadMenuImage(buffer, mimetype);
  }

  async uploadSiteHeroImage(buffer: Buffer, mimetype: string): Promise<{ url: string }> {
    return this.media!.uploadSiteHeroImage(buffer, mimetype);
  }

  async createAdminMenuItem(actor: AccessUser, input: {
    serviceDate?: string;
    session?: string;
    name?: string;
    description?: string;
    nutritionFactsText?: string;
    caloriesKcal?: number;
    price?: number;
    imageUrl?: string;
    ingredientIds?: string[];
    isAvailable?: boolean;
    displayOrder?: number;
    cutleryRequired?: boolean;
    packingRequirement?: string;
    isVegetarian?: boolean;
    isGlutenFree?: boolean;
    isDairyFree?: boolean;
    containsPeanut?: boolean;
    dishCategory?: string;
  }) {
    return this.menu!.createAdminMenuItem(actor, input);
  }

  async updateAdminMenuItem(
    actor: AccessUser,
    itemId: string,
    input: {
      serviceDate?: string;
      session?: string;
      name?: string;
      description?: string;
      nutritionFactsText?: string;
      caloriesKcal?: number;
      price?: number;
      imageUrl?: string;
      ingredientIds?: string[];
      isAvailable?: boolean;
      displayOrder?: number;
      cutleryRequired?: boolean;
      packingRequirement?: string;
      isVegetarian?: boolean;
      isGlutenFree?: boolean;
      isDairyFree?: boolean;
      containsPeanut?: boolean;
      dishCategory?: string;
    },
  ) {
    return this.menu!.updateAdminMenuItem(actor, itemId, input);
  }

  async seedAdminMenuSample(serviceDateRaw?: string) {
    return this.menu!.seedAdminMenuSample(serviceDateRaw);
  }

  private pickSeedDeliveryUser(
    schoolId: string,
    bySchool: Map<string, string[]>,
    fallback: string[],
    cursor: number,
  ) {
    return this.delivery!.pickSeedDeliveryUser(schoolId, bySchool, fallback, cursor);
  }

  private async applySeedOrderLifecycle(
    orderId: string,
    schoolId: string,
    bySchool: Map<string, string[]>,
    allDeliveryUserIds: string[],
    seedNumber: number,
  ) {
    return this.delivery!.applySeedOrderLifecycle(orderId, schoolId, bySchool, allDeliveryUserIds, seedNumber);
  }

  async seedAdminOrdersSample(
    actor: AccessUser,
    input: { fromDate?: string; toDate?: string; ordersPerDay?: number },
  ) {
    return this.delivery!.seedAdminOrdersSample(actor, input);
  }

  async getYoungsterMe(actor: AccessUser) {
    return this.users!.getYoungsterMe(actor);
  }

  async createCart(actor: AccessUser, input: { childId?: string; serviceDate?: string; session?: string }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const serviceDate = this.validateServiceDate(input.serviceDate);
    const session = this.normalizeSession(input.session);
    const childId = (input.childId || '').trim();

    await this.enforceParentYoungsterOrderingWindow(actor, serviceDate);
    await this.validateOrderDayRules(serviceDate, session);
    await this.assertSessionActiveForOrdering(session);

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      await this.ensureParentOwnsChild(parentId, childId);
    }

    const existingOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                status::text AS status, expires_at::text AS expires_at
         FROM order_carts
         WHERE child_id = $1
           AND session = $2::session_type
           AND service_date = $3::date
           AND status = 'OPEN'
         LIMIT 1
       ) t;`,
      [childId, session, serviceDate],
    );
    if (existingOut) {
      return this.parseJsonLine<CartRow>(existingOut);
    }

    const expiresAtUtc = `${serviceDate}T00:00:00.000Z`;
    const createdOut = await runSql(
      `WITH inserted AS (
         INSERT INTO order_carts (child_id, created_by_user_id, session, service_date, status, expires_at)
         VALUES ($1, $2, $3::session_type, $4::date, 'OPEN', $5::timestamptz)
         RETURNING id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                   status::text AS status, expires_at::text AS expires_at
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [childId, actor.uid, session, serviceDate, expiresAtUtc],
    );
    return this.parseJsonLine<CartRow>(createdOut);
  }

  async getCarts(actor: AccessUser, query: { childId?: string; serviceDate?: string; session?: string }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.childId) {
      params.push(query.childId);
      conditions.push(`oc.child_id = $${params.length}`);
    }
    if (query.serviceDate) {
      params.push(this.validateServiceDate(query.serviceDate));
      conditions.push(`oc.service_date = $${params.length}::date`);
    }
    if (query.session) {
      params.push(this.normalizeSession(query.session));
      conditions.push(`oc.session = $${params.length}::session_type`);
    }

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId) return [];
      params.push(childId);
      conditions.push(`oc.child_id = $${params.length}`);
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) return [];
      const familyId = await this.getParentFamilyId(parentId);
      if (!familyId) return [];
      params.push(familyId);
      conditions.push(`EXISTS (
        SELECT 1
        FROM children c
        WHERE c.id = oc.child_id
          AND c.family_id = $${params.length}::uuid
          AND c.deleted_at IS NULL
          AND c.is_active = true
      )`);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oc.id, oc.child_id, oc.session::text AS session, oc.service_date::text AS service_date,
               oc.status::text AS status, oc.expires_at::text AS expires_at
        FROM order_carts oc
        ${whereSql}
        ORDER BY oc.created_at DESC
        LIMIT 100
      ) t;
    `,
      params,
    );
    return this.parseJsonLines(out);
  }

  async getCartById(actor: AccessUser, cartId: string) {
    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor).catch(async (err) => {
      if (err instanceof BadRequestException && ['CART_EXPIRED', 'CART_ALREADY_SUBMITTED'].includes(String(err.message))) {
        // continue and return snapshot for non-open carts too
      } else {
        throw err;
      }
      const out = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT id, child_id, created_by_user_id, session::text AS session, service_date::text AS service_date,
                  status::text AS status, expires_at::text AS expires_at
           FROM order_carts
           WHERE id = $1
           LIMIT 1
         ) t;`,
        [cartId],
      );
      if (!out) throw new NotFoundException('Cart not found');
      return this.parseJsonLine<CartRow>(out);
    });

    const itemsOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT ci.id, ci.menu_item_id, ci.quantity, mi.name, mi.price
         FROM cart_items ci
         JOIN menu_items mi ON mi.id = ci.menu_item_id
         WHERE ci.cart_id = $1
         ORDER BY ci.created_at ASC
       ) t;`,
      [cartId],
    );

    return {
      ...cart,
      items: this.parseJsonLines(itemsOut),
    };
  }

  async replaceCartItems(actor: AccessUser, cartId: string, items: CartItemInput[]) {
    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor);
    if (items.length > 5) throw new BadRequestException('CART_ITEM_LIMIT_EXCEEDED');

    const normalized = items.map((item) => ({
      menuItemId: (item.menuItemId || '').trim(),
      quantity: Number(item.quantity || 0),
    }));

    for (const item of normalized) {
      if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Invalid cart item');
      }
    }

    const ids = [...new Set(normalized.map((item) => item.menuItemId))];
    if (ids.length !== normalized.length) throw new BadRequestException('Duplicate menu items are not allowed');

    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      const validCount = await runSql(
        `SELECT count(*)::int
         FROM menu_items mi
         JOIN menus m ON m.id = mi.menu_id
         WHERE mi.id IN (${placeholders})
           AND mi.is_available = true
           AND mi.deleted_at IS NULL
           AND m.is_published = true
           AND m.deleted_at IS NULL
           AND m.session = $${ids.length + 1}::session_type;`,
        [...ids, cart.session],
      );
      if (Number(validCount || 0) !== ids.length) {
        throw new BadRequestException('CART_MENU_ITEM_UNAVAILABLE');
      }
    }

    await runSql(`DELETE FROM cart_items WHERE cart_id = $1;`, [cartId]);

    for (const item of normalized) {
      await runSql(
        `INSERT INTO cart_items (cart_id, menu_item_id, quantity)
         VALUES ($1, $2, $3);`,
        [cartId, item.menuItemId, item.quantity],
      );
    }

    return this.getCartById(actor, cartId);
  }

  async discardCart(actor: AccessUser, cartId: string) {
    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor);
    await runSql(
      `UPDATE order_carts
       SET status = 'EXPIRED', updated_at = now()
       WHERE id = $1
         AND status = 'OPEN';`,
      [cart.id],
    );
    await runSql(`DELETE FROM cart_items WHERE cart_id = $1;`, [cart.id]);
    return { ok: true };
  }

  async submitCart(actor: AccessUser, cartId: string) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const cart = await this.ensureCartIsOpenAndOwned(cartId, actor);

    const itemsOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT ci.menu_item_id, ci.quantity, mi.name, mi.price
         FROM cart_items ci
         JOIN menu_items mi ON mi.id = ci.menu_item_id
         WHERE ci.cart_id = $1
         ORDER BY ci.created_at ASC
       ) t;`,
      [cartId],
    );
    const items = this.parseJsonLines<{ menu_item_id: string; quantity: number; name: string; price: string }>(itemsOut);
    if (items.length === 0) throw new BadRequestException('Cart is empty');
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    await this.validateOrderDayRules(cart.service_date, cart.session);
    await this.enforceParentYoungsterOrderingWindow(actor, cart.service_date);
    await this.assertSessionActiveForOrdering(cart.session);

    const dietarySnapshot = await this.getOrderDietarySnapshot(cart.child_id);
    const totalPrice = this.calculateTotalPrice(items);

    let billingParentId: string | null = null;
    if (actor.role === 'PARENT') {
      billingParentId = await this.getParentIdByUserId(actor.uid);
    } else {
      billingParentId = await this.getParentIdByChildId(cart.child_id);
    }

    if (!billingParentId) {
      throw new BadRequestException('No linked parent for billing');
    }

    const menuItemIds = items.map((item) => item.menu_item_id);
    const itemNames = items.map((item) => item.name);
    const itemPrices = items.map((item) => Number(Number(item.price).toFixed(2)));
    const itemQuantities = items.map((item) => Number(item.quantity));
    const mutationAfter = JSON.stringify({ cartId: cart.id, totalItems: items.length, totalPrice });

    let orderOut: string;
    try {
      // Single SQL statement keeps all writes atomic and prevents partial commits.
      orderOut = await runSql(
        `
        WITH inserted_order AS (
          INSERT INTO orders (cart_id, child_id, placed_by_user_id, session, service_date, status, total_price, dietary_snapshot)
          VALUES ($1, $2, $3, $4::session_type, $5::date, 'PLACED', $6, $7)
          RETURNING id, order_number::text, child_id, session::text AS session, service_date::text AS service_date,
                    status::text AS status, total_price, dietary_snapshot, placed_at::text AS placed_at
        ),
        inserted_items AS (
          INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
          SELECT o.id, x.menu_item_id, x.item_name_snapshot, x.price_snapshot, x.quantity
          FROM inserted_order o
          JOIN unnest($8::uuid[], $9::text[], $10::numeric[], $11::int[])
            AS x(menu_item_id, item_name_snapshot, price_snapshot, quantity) ON true
        ),
        inserted_billing AS (
          INSERT INTO billing_records (order_id, parent_id, status, delivery_status)
          SELECT id, $12::uuid, 'UNPAID', 'PENDING'
          FROM inserted_order
        ),
        inserted_mutation AS (
          INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
          SELECT id, 'ORDER_PLACED', $13::uuid, NULL, $14::jsonb
          FROM inserted_order
        ),
        updated_cart AS (
          UPDATE order_carts
          SET status = 'SUBMITTED', updated_at = now()
          WHERE id = $15
        )
        SELECT row_to_json(inserted_order)::text
        FROM inserted_order;
      `,
        [
          cart.id,
          cart.child_id,
          actor.uid,
          cart.session,
          cart.service_date,
          totalPrice,
          dietarySnapshot || null,
          menuItemIds,
          itemNames,
          itemPrices,
          itemQuantities,
          billingParentId,
          actor.uid,
          mutationAfter,
          cart.id,
        ],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('orders_child_session_date_active_uq') || msg.includes('23505')) {
        throw new ConflictException('ORDER_ALREADY_EXISTS_FOR_DATE');
      }
      throw err;
    }
    const order = this.parseJsonLine<{
      id: string;
      order_number: string;
      child_id: string;
      session: string;
      service_date: string;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
      placed_at: string;
    }>(orderOut);

    return {
      ...order,
      total_price: Number(order.total_price),
      items,
      billingParentId,
    };
  }

  async getOrderDetail(actor: AccessUser, orderId: string) {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.order_number::text AS order_number,
               o.child_id,
               o.session::text AS session,
               o.service_date::text AS service_date,
               o.status::text AS status,
               o.total_price,
               o.dietary_snapshot,
               o.placed_at::text AS placed_at,
               (u.first_name || ' ' || u.last_name) AS child_name
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        WHERE o.id = $1
          AND o.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [orderId],
    );
    if (!out) throw new NotFoundException('Order not found');
    const order = this.parseJsonLine<{
      id: string;
      order_number: string;
      child_id: string;
      session: SessionType;
      service_date: string;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
      placed_at: string;
      child_name: string;
    }>(out);
    await this.lockOrdersForServiceDateIfCutoffPassed(order.service_date);

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId || childId !== order.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, order.child_id);
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    const itemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.menu_item_id, oi.item_name_snapshot, oi.price_snapshot, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      ) t;
    `,
      [order.id],
    );
    const items = this.parseJsonLines(itemsOut);

    return {
      ...order,
      total_price: Number(order.total_price),
      can_edit: order.status === 'PLACED' && !(await this.isAfterOrAtMakassarCutoff(order.service_date)),
      items,
    };
  }

  async getParentConsolidatedOrders(actor: AccessUser) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    await this.lockOrdersForServiceDateIfCutoffPassed(this.makassarTodayIsoDate());

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.order_number::text AS order_number,
               o.child_id,
               o.session::text AS session,
               o.service_date::text AS service_date,
               o.status::text AS status,
               o.total_price,
               o.dietary_snapshot,
               o.placed_at::text AS placed_at,
               (u.first_name || ' ' || u.last_name) AS child_name,
               br.status::text AS billing_status,
               br.delivery_status::text AS delivery_status,
               CASE WHEN o.placed_by_user_id = c.user_id THEN 'YOUNGSTER' ELSE 'PARENT' END AS placed_by_role
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE c.family_id = $1::uuid
          AND o.deleted_at IS NULL
        ORDER BY o.service_date DESC, o.created_at DESC
        LIMIT 200
      ) t;
    `,
      [familyId],
    );

    const orders = this.parseJsonLines<{
      id: string;
      order_number: string;
      child_id: string;
      session: SessionType;
      service_date: string;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
      placed_at: string;
      child_name: string;
      billing_status?: string | null;
      delivery_status?: string | null;
      placed_by_role?: 'YOUNGSTER' | 'PARENT';
    }>(out);

    const orderIds = orders.map((order) => order.id);
    const itemsByOrder = new Map<string, Array<{ menu_item_id: string; item_name_snapshot: string; price_snapshot: string | number; quantity: number }>>();
    if (orderIds.length > 0) {
      const allItemsOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT oi.order_id::text AS order_id, oi.menu_item_id, oi.item_name_snapshot, oi.price_snapshot, oi.quantity
          FROM order_items oi
          WHERE oi.order_id = ANY($1::uuid[])
          ORDER BY oi.order_id ASC, oi.created_at ASC
        ) t;
      `,
        [orderIds],
      );
      const allItems = this.parseJsonLines<{
        order_id: string;
        menu_item_id: string;
        item_name_snapshot: string;
        price_snapshot: string | number;
        quantity: number;
      }>(allItemsOut);
      for (const item of allItems) {
        const list = itemsByOrder.get(item.order_id) || [];
        list.push({
          menu_item_id: item.menu_item_id,
          item_name_snapshot: item.item_name_snapshot,
          price_snapshot: item.price_snapshot,
          quantity: item.quantity,
        });
        itemsByOrder.set(item.order_id, list);
      }
    }

    const result: Array<Record<string, unknown>> = await Promise.all(orders.map(async (order) => ({
      ...order,
      total_price: Number(order.total_price),
      can_edit: order.status === 'PLACED' && !(await this.isAfterOrAtMakassarCutoff(order.service_date)),
      placed_by_role: order.placed_by_role,
      items: itemsByOrder.get(order.id) || [],
    })));

    return {
      parentId,
      familyId,
      orders: result,
    };
  }

  async getYoungsterConsolidatedOrders(actor: AccessUser) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const childId = await this.getChildIdByUserId(actor.uid);
    if (!childId) throw new BadRequestException('Youngster profile not found');
    await this.lockOrdersForServiceDateIfCutoffPassed(this.makassarTodayIsoDate());

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.order_number::text AS order_number,
               o.child_id,
               o.session::text AS session,
               o.service_date::text AS service_date,
               o.status::text AS status,
               o.total_price,
               o.dietary_snapshot,
               o.placed_at::text AS placed_at,
               (u.first_name || ' ' || u.last_name) AS child_name,
               br.status::text AS billing_status,
               br.delivery_status::text AS delivery_status
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE o.child_id = $1
          AND o.deleted_at IS NULL
        ORDER BY o.service_date DESC, o.created_at DESC
        LIMIT 120
      ) t;
      `,
      [childId],
    );

    const orders = this.parseJsonLines<{
      id: string;
      order_number: string;
      child_id: string;
      session: SessionType;
      service_date: string;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
      placed_at: string;
      child_name: string;
      billing_status?: string | null;
      delivery_status?: string | null;
    }>(out);

    const orderIds = orders.map((order) => order.id);
    const itemsByOrder = new Map<string, Array<{ menu_item_id: string; item_name_snapshot: string; price_snapshot: string | number; quantity: number }>>();
    if (orderIds.length > 0) {
      const allItemsOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT oi.order_id::text AS order_id, oi.menu_item_id, oi.item_name_snapshot, oi.price_snapshot, oi.quantity
          FROM order_items oi
          WHERE oi.order_id = ANY($1::uuid[])
          ORDER BY oi.order_id ASC, oi.created_at ASC
        ) t;
      `,
        [orderIds],
      );
      const allItems = this.parseJsonLines<{
        order_id: string;
        menu_item_id: string;
        item_name_snapshot: string;
        price_snapshot: string | number;
        quantity: number;
      }>(allItemsOut);
      for (const item of allItems) {
        const list = itemsByOrder.get(item.order_id) || [];
        list.push({
          menu_item_id: item.menu_item_id,
          item_name_snapshot: item.item_name_snapshot,
          price_snapshot: item.price_snapshot,
          quantity: item.quantity,
        });
        itemsByOrder.set(item.order_id, list);
      }
    }
    const result: Array<Record<string, unknown>> = orders.map((order) => ({
      ...order,
      total_price: Number(order.total_price),
      can_edit: false,
      items: itemsByOrder.get(order.id) || [],
    }));
    return { childId, orders: result };
  }

  async getFavourites(actor: AccessUser, query: { childId?: string; session?: string }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const filters: string[] = [
      `fm.created_by_user_id = $1`,
      `fm.is_active = true`,
      `fm.deleted_at IS NULL`,
    ];
    const params: unknown[] = [actor.uid];
    if (query.childId) {
      params.push(query.childId);
      filters.push(`fm.child_id = $${params.length}`);
    }
    if (query.session) {
      params.push(this.normalizeSession(query.session));
      filters.push(`fm.session = $${params.length}::session_type`);
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT fm.id, fm.label, fm.session::text AS session, fm.child_id, fm.created_at::text AS created_at,
               COALESCE(json_agg(
                 json_build_object(
                   'menu_item_id', fmi.menu_item_id,
                   'quantity', fmi.quantity,
                   'name', mi.name,
                   'price', mi.price
                 )
               ) FILTER (WHERE fmi.id IS NOT NULL), '[]'::json) AS items
        FROM favourite_meals fm
        LEFT JOIN favourite_meal_items fmi ON fmi.favourite_meal_id = fm.id
        LEFT JOIN menu_items mi ON mi.id = fmi.menu_item_id
        WHERE ${filters.join(' AND ')}
        GROUP BY fm.id
        ORDER BY fm.created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines(out);
  }

  async createFavourite(actor: AccessUser, input: {
    childId?: string;
    label?: string;
    session?: string;
    items?: CartItemInput[];
  }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const label = (input.label || '').trim();
    const session = this.normalizeSession(input.session);
    const childId = (input.childId || '').trim() || null;
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || (childId && childId !== ownChildId)) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT' && childId) {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, childId);
    }

    const activeCount = Number(await runSql(
      `SELECT count(*)::int
       FROM favourite_meals
       WHERE created_by_user_id = $1
         AND is_active = true
         AND deleted_at IS NULL;`,
      [actor.uid],
    ) || 0);
    if (activeCount >= 20) throw new BadRequestException('FAVOURITES_LIMIT_EXCEEDED');

    const favOut = await runSql(
      `WITH inserted AS (
         INSERT INTO favourite_meals (created_by_user_id, child_id, label, session, is_active)
         VALUES ($1, $2, $3, $4::session_type, true)
         RETURNING id, label
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [actor.uid, childId || null, label, session],
    );
    const fav = this.parseJsonLine<{ id: string; label: string }>(favOut);
    for (const item of items) {
      if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Invalid favourite item');
      }
      await runSql(
        `INSERT INTO favourite_meal_items (favourite_meal_id, menu_item_id, quantity)
         VALUES ($1, $2, $3);`,
        [fav.id, item.menuItemId, Number(item.quantity)],
      );
    }
    return { ok: true, favouriteId: fav.id, label: fav.label };
  }

  async deleteFavourite(actor: AccessUser, favouriteId: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const favId = (favouriteId || '').trim();

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, created_by_user_id, is_active, deleted_at
        FROM favourite_meals
        WHERE id = $1
        LIMIT 1
      ) t;
    `,
      [favId],
    );
    if (!out) throw new NotFoundException('Favourite not found');
    const fav = this.parseJsonLine<{ id: string; created_by_user_id: string; is_active: boolean; deleted_at?: string | null }>(out);
    if (fav.created_by_user_id !== actor.uid) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    if (fav.deleted_at) return { ok: true, alreadyDeleted: true };

    await runSql(
      `UPDATE favourite_meals
       SET is_active = false,
           deleted_at = now(),
           updated_at = now()
       WHERE id = $1;`,
      [fav.id],
    );
    return { ok: true };
  }

  async quickReorder(actor: AccessUser, input: { sourceOrderId?: string; serviceDate?: string }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const sourceOrderId = (input.sourceOrderId || '').trim();
    const serviceDate = this.validateServiceDate(input.serviceDate);

    const srcOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, child_id, session::text AS session, status::text AS status
        FROM orders
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [sourceOrderId],
    );
    if (!srcOut) throw new NotFoundException('Source order not found');
    const source = this.parseJsonLine<{ id: string; child_id: string; session: SessionType; status: string }>(srcOut);
    if (!['PLACED', 'LOCKED'].includes(source.status)) {
      throw new BadRequestException('Only PLACED/LOCKED source orders can be reordered');
    }

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== source.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, source.child_id);
    }

    const cart = await this.createCart(actor, {
      childId: source.child_id,
      serviceDate,
      session: source.session,
    });

    const srcItemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.menu_item_id, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = $1
      ) t;
    `,
      [source.id],
    );
    const srcItems = this.parseJsonLines<{ menu_item_id: string; quantity: number }>(srcItemsOut);
    const ids = [...new Set(srcItems.map((x) => x.menu_item_id))];
    const excludedItemIds: string[] = [];
    const validIds = new Set<string>();
    if (ids.length > 0) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(', ');
      const validOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT mi.id
          FROM menu_items mi
          JOIN menus m ON m.id = mi.menu_id
          WHERE mi.id IN (${ph})
            AND mi.is_available = true
            AND mi.deleted_at IS NULL
            AND m.is_published = true
            AND m.deleted_at IS NULL
            AND m.service_date = $${ids.length + 1}::date
            AND m.session = $${ids.length + 2}::session_type
        ) t;
      `,
        [...ids, serviceDate, source.session],
      );
      for (const row of this.parseJsonLines<{ id: string }>(validOut)) validIds.add(row.id);
      for (const id of ids) if (!validIds.has(id)) excludedItemIds.push(id);
    }
    const accepted = srcItems
      .filter((x) => validIds.has(x.menu_item_id))
      .map((x) => ({ menuItemId: x.menu_item_id, quantity: Number(x.quantity) }));
    if (accepted.length > 0) {
      await this.replaceCartItems(actor, cart.id, accepted);
    }
    return {
      cartId: cart.id,
      serviceDate,
      session: source.session,
      excludedItemIds,
    };
  }

  async mealPlanWizard(actor: AccessUser, input: {
    childId?: string;
    sourceOrderId?: string;
    dates?: string[];
  }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const childId = (input.childId || '').trim();
    const sourceOrderId = (input.sourceOrderId || '').trim();
    const rawDates = Array.isArray(input.dates) ? input.dates : [];
    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, childId);
    }

    const sourceOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, child_id, session::text AS session
        FROM orders
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [sourceOrderId],
    );
    if (!sourceOut) throw new NotFoundException('Source order not found');
    const source = this.parseJsonLine<{ id: string; child_id: string; session: SessionType }>(sourceOut);
    if (source.child_id !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');

    const srcItemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.menu_item_id, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = $1
      ) t;
    `,
      [source.id],
    );
    const srcItems = this.parseJsonLines<{ menu_item_id: string; quantity: number }>(srcItemsOut);
    const itemsPayload = srcItems.map((x) => ({ menuItemId: x.menu_item_id, quantity: Number(x.quantity) }));

    const success: Array<{ date: string; orderId: string; cartId: string }> = [];
    const failures: Array<{ date: string; reason: string }> = [];
    for (const d of rawDates) {
      let date = '';
      try {
        date = this.validateServiceDate(d);
        const cart = await this.createCart(actor, { childId, serviceDate: date, session: source.session });
        await this.replaceCartItems(actor, cart.id, itemsPayload);
        const order = await this.submitCart(actor, cart.id) as { id: string };
        success.push({ date, orderId: order.id, cartId: cart.id });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Meal plan date failed';
        failures.push({ date: date || d, reason });
      }
    }
    return {
      totalDates: rawDates.length,
      successCount: success.length,
      failureCount: failures.length,
      success,
      failures,
    };
  }

  async applyFavouriteToCart(actor: AccessUser, input: { favouriteId?: string; serviceDate?: string }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const favouriteId = (input.favouriteId || '').trim();
    const serviceDate = this.validateServiceDate(input.serviceDate);

    const favOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, child_id, session::text AS session
        FROM favourite_meals
        WHERE id = $1
          AND created_by_user_id = $2
          AND is_active = true
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [favouriteId, actor.uid],
    );
    if (!favOut) throw new NotFoundException('Favourite not found');
    const fav = this.parseJsonLine<{ id: string; child_id: string | null; session: SessionType }>(favOut);
    const childId = fav.child_id || (await this.getChildIdByUserId(actor.uid));
    if (!childId) throw new BadRequestException('Favourite is not linked to a child');
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, childId);
    } else {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }

    const favItemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT menu_item_id, quantity
        FROM favourite_meal_items
        WHERE favourite_meal_id = $1
      ) t;
    `,
      [fav.id],
    );
    const favItems = this.parseJsonLines<{ menu_item_id: string; quantity: number }>(favItemsOut);
    const cart = await this.createCart(actor, { childId, serviceDate, session: fav.session });
    const ids = [...new Set(favItems.map((x) => x.menu_item_id))];
    const excludedItemIds: string[] = [];
    const validIds = new Set<string>();
    if (ids.length > 0) {
      const ph = ids.map((_, i) => `$${i + 1}`).join(', ');
      const validOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT mi.id
          FROM menu_items mi
          JOIN menus m ON m.id = mi.menu_id
          WHERE mi.id IN (${ph})
            AND mi.is_available = true
            AND mi.deleted_at IS NULL
            AND m.is_published = true
            AND m.deleted_at IS NULL
            AND m.service_date = $${ids.length + 1}::date
            AND m.session = $${ids.length + 2}::session_type
        ) t;
      `,
        [...ids, serviceDate, fav.session],
      );
      for (const row of this.parseJsonLines<{ id: string }>(validOut)) validIds.add(row.id);
      for (const id of ids) if (!validIds.has(id)) excludedItemIds.push(id);
    }
    const accepted = favItems
      .filter((x) => validIds.has(x.menu_item_id))
      .map((x) => ({ menuItemId: x.menu_item_id, quantity: Number(x.quantity) }));
    if (accepted.length > 0) {
      await this.replaceCartItems(actor, cart.id, accepted);
    }
    return { cartId: cart.id, excludedItemIds };
  }

  async getParentConsolidatedBillingLegacy(actor: AccessUser, sessionFilter?: string) {
    return this.billing!.getParentConsolidatedBillingLegacy(actor, sessionFilter);
  }

  async getYoungsterConsolidatedBillingLegacy(actor: AccessUser, sessionFilter?: string) {
    return this.billing!.getYoungsterConsolidatedBillingLegacy(actor, sessionFilter);
  }

  async uploadBillingProof(actor: AccessUser, billingId: string, proofImageData?: string) {
    return this.billing!.uploadBillingProof(actor, billingId, proofImageData);
  }

  async uploadBillingProofBatch(actor: AccessUser, billingIdsRaw: string[], proofImageData?: string) {
    return this.billing!.uploadBillingProofBatch(actor, billingIdsRaw, proofImageData);
  }

  async getBillingProofImage(actor: AccessUser, billingId: string) {
    return this.billing!.getBillingProofImage(actor, billingId);
  }

  async getAdminBillingLegacy(status?: string, sessionRaw?: string) {
    return this.billing!.getAdminBillingLegacy(status, sessionRaw);
  }

  async verifyBilling(actor: AccessUser, billingId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) {
    return this.billing!.verifyBilling(actor, billingId, decision, note);
  }

  async deleteBilling(actor: AccessUser, billingId: string) {
    return this.billing!.deleteBilling(actor, billingId);
  }

  async generateReceipt(actor: AccessUser, billingId: string) {
    return this.billing!.generateReceipt(actor, billingId);
  }

  async getBillingReceipt(actor: AccessUser, billingId: string) {
    return this.billing!.getBillingReceipt(actor, billingId);
  }

  async getBillingReceiptFile(actor: AccessUser, billingId: string) {
    return this.billing!.getBillingReceiptFile(actor, billingId);
  }

  async revertBillingProof(actor: AccessUser, billingId: string) {
    return this.billing!.revertBillingProof(actor, billingId);
  }

  async getDeliveryUsers(includeInactive = false) {
    return this.delivery!.getDeliveryUsers(includeInactive);
  }

  async getDeliverySchoolAssignments() {
    return this.delivery!.getDeliverySchoolAssignments();
  }

  async upsertDeliverySchoolAssignment(actor: AccessUser, input: { deliveryUserId?: string; schoolId?: string; session?: string; isActive?: boolean }) {
    return this.delivery!.upsertDeliverySchoolAssignment(actor, input);
  }

  async deleteDeliverySchoolAssignment(actor: AccessUser, deliveryUserId: string, schoolId: string, sessionRaw?: string) {
    return this.delivery!.deleteDeliverySchoolAssignment(actor, deliveryUserId, schoolId, sessionRaw);
  }

  private async autoAssignDeliveriesForDate(serviceDate: string) {
    return this.delivery!.autoAssignDeliveriesForDate(serviceDate);
  }

  async autoAssignDeliveries(actor: AccessUser, dateRaw?: string) {
    return this.delivery!.autoAssignDeliveries(actor, dateRaw);
  }

  async assignDelivery(actor: AccessUser, input: { orderIds?: string[]; deliveryUserId?: string }) {
    return this.delivery!.assignDelivery(actor, input);
  }

  async getDeliveryAssignments(actor: AccessUser, dateRaw?: string) {
    return this.delivery!.getDeliveryAssignments(actor, dateRaw);
  }

  async getDeliveryDailyNote(actor: AccessUser, dateRaw?: string) {
    return this.delivery!.getDeliveryDailyNote(actor, dateRaw);
  }

  async updateDeliveryDailyNote(actor: AccessUser, dateRaw: string, note?: string) {
    return this.delivery!.updateDeliveryDailyNote(actor, dateRaw, note);
  }

  async getDailyWhatsappOrderNotifications(actor: AccessUser, dateRaw?: string) {
    return this.delivery!.getDailyWhatsappOrderNotifications(actor, dateRaw);
  }

  async getDailyOrdersByPhone(actor: AccessUser, input: { date?: string; phone?: string }) {
    return this.gaia!.getDailyOrdersByPhone(actor, input);
  }

  async getAdminFamilyContextByPhone(actor: AccessUser, input: { phone?: string }) {
    return this.gaia!.getAdminFamilyContextByPhone(actor, input);
  }

  async getAdminFamilyOrdersByPhone(actor: AccessUser, input: { phone?: string; date?: string }) {
    return this.gaia!.getAdminFamilyOrdersByPhone(actor, input);
  }

  async markDailyWhatsappOrderNotificationSent(
    actor: AccessUser,
    orderId: string,
    body: {
      sentTo?: string;
      targetSource?: 'STUDENT' | 'PARENT';
      sentVia?: string;
      provider?: string;
      providerMessageId?: string;
      sentAt?: string;
      messageHash?: string;
    },
  ) {
    return this.delivery!.markDailyWhatsappOrderNotificationSent(actor, orderId, body);
  }

  async markDailyWhatsappOrderNotificationFailed(
    actor: AccessUser,
    orderId: string,
    body: {
      failedAt?: string;
      targetPhone?: string;
      targetSource?: 'STUDENT' | 'PARENT';
      sentVia?: string;
      provider?: string;
      reason?: string;
    },
  ) {
    return this.delivery!.markDailyWhatsappOrderNotificationFailed(actor, orderId, body);
  }

  async sendDeliveryNotificationEmails(actor: AccessUser) {
    return this.delivery!.sendDeliveryNotificationEmails(actor);
  }

  async getDeliverySummary(actor: AccessUser, dateRaw?: string) {
    return this.delivery!.getDeliverySummary(actor, dateRaw);
  }

  async confirmDelivery(actor: AccessUser, assignmentId: string, note?: string) {
    return this.delivery!.confirmDelivery(actor, assignmentId, note);
  }

  async toggleDeliveryCompletion(actor: AccessUser, assignmentId: string, note?: string) {
    return this.delivery!.toggleDeliveryCompletion(actor, assignmentId, note);
  }

  async updateOrder(
    actor: AccessUser,
    orderId: string,
    input: { serviceDate?: string; session?: string; items?: CartItemInput[] },
  ) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id, o.child_id, o.service_date::text AS service_date, o.session::text AS session,
               o.status::text AS status, o.total_price, o.dietary_snapshot
        FROM orders o
        WHERE o.id = $1
          AND o.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [orderId],
    );
    if (!out) throw new NotFoundException('Order not found');
    const order = this.parseJsonLine<{
      id: string;
      child_id: string;
      service_date: string;
      session: SessionType;
      status: string;
      total_price: string | number;
      dietary_snapshot?: string | null;
    }>(out);

    if (actor.role === 'YOUNGSTER') {
      throw new ForbiddenException('ORDER_CHILD_UPDATE_FORBIDDEN');
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, order.child_id);
      if (await this.isAfterOrAtMakassarCutoff(order.service_date)) {
        throw new BadRequestException('ORDER_CUTOFF_EXCEEDED');
      }
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    if (order.status !== 'PLACED') {
      throw new BadRequestException('Only PLACED orders can be updated');
    }

    const targetServiceDate = input.serviceDate ? this.validateServiceDate(input.serviceDate) : order.service_date;
    const targetSession = input.session ? this.normalizeSession(input.session) : order.session;
    if (actor.role === 'PARENT' && await this.isAfterOrAtMakassarCutoff(targetServiceDate)) {
      throw new BadRequestException('ORDER_CUTOFF_EXCEEDED');
    }
    await this.enforceParentYoungsterOrderingWindow(actor, targetServiceDate);
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    const normalized = items.map((item) => ({
      menuItemId: (item.menuItemId || '').trim(),
      quantity: Number(item.quantity || 0),
    }));
    for (const item of normalized) {
      if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Invalid order item');
      }
    }

    await this.validateOrderDayRules(targetServiceDate, targetSession);
    await this.assertSessionActiveForOrdering(targetSession);

    const ids = [...new Set(normalized.map((item) => item.menuItemId))];
    if (ids.length !== normalized.length) {
      throw new BadRequestException('Duplicate menu items are not allowed');
    }
    const idPh = ids.map((_, i) => `$${i + 1}`).join(', ');
    const validOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id, mi.name, mi.price
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE mi.id IN (${idPh})
          AND mi.is_available = true
          AND mi.deleted_at IS NULL
          AND m.is_published = true
          AND m.deleted_at IS NULL
          AND m.service_date = $${ids.length + 1}::date
          AND m.session = $${ids.length + 2}::session_type
      ) t;
    `,
      [...ids, targetServiceDate, targetSession],
    );
    const validRows = this.parseJsonLines<{ id: string; name: string; price: string | number }>(validOut);
    if (validRows.length !== ids.length) {
      throw new BadRequestException('ORDER_MENU_UNAVAILABLE');
    }
    const byId = new Map(validRows.map((row) => [row.id, row]));

    const totalPrice = normalized.reduce((sum, item) => {
      const price = Number(byId.get(item.menuItemId)?.price || 0);
      return sum + price * item.quantity;
    }, 0);

    const dietarySnapshot = await this.getOrderDietarySnapshot(order.child_id);

    await runSql(
      `UPDATE orders
       SET service_date = $1::date,
           session = $2::session_type,
           total_price = $3,
           dietary_snapshot = $4,
           updated_at = now()
       WHERE id = $5;`,
      [targetServiceDate, targetSession, Number(totalPrice.toFixed(2)), dietarySnapshot || null, order.id],
    );

    await runSql(`DELETE FROM order_items WHERE order_id = $1;`, [order.id]);
    for (const item of normalized) {
      const row = byId.get(item.menuItemId);
      await runSql(
        `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
         VALUES ($1, $2, $3, $4, $5);`,
        [order.id, item.menuItemId, row?.name || '', Number(Number(row?.price || 0).toFixed(2)), item.quantity],
      );
    }

    await runSql(
      `INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
       VALUES ($1, 'ORDER_UPDATED', $2, $3::jsonb, $4::jsonb);`,
      [
        order.id,
        actor.uid,
        JSON.stringify({
          serviceDate: order.service_date,
          session: order.session,
          totalPrice: Number(order.total_price),
        }),
        JSON.stringify({
          serviceDate: targetServiceDate,
          session: targetSession,
          totalPrice,
          itemCount: normalized.length,
        }),
      ],
    );

    return {
      id: order.id,
      service_date: targetServiceDate,
      session: targetSession,
      total_price: totalPrice,
      items: normalized.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        item_name_snapshot: byId.get(item.menuItemId)?.name || '',
        price_snapshot: Number(byId.get(item.menuItemId)?.price || 0),
      })),
    };
  }

  async deleteOrder(actor: AccessUser, orderId: string) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id, o.child_id, o.service_date::text AS service_date, o.status::text AS status
        FROM orders o
        WHERE o.id = $1
          AND o.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [orderId],
    );
    if (!out) throw new NotFoundException('Order not found');
    const order = this.parseJsonLine<{ id: string; child_id: string; service_date: string; status: string }>(out);

    if (actor.role === 'YOUNGSTER') {
      throw new ForbiddenException('ORDER_CHILD_UPDATE_FORBIDDEN');
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.ensureParentOwnsChild(parentId, order.child_id);
      if (await this.isAfterOrAtMakassarCutoff(order.service_date)) {
        throw new BadRequestException('ORDER_CUTOFF_EXCEEDED');
      }
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    await runSql(
      `UPDATE orders
       SET status = 'CANCELLED', deleted_at = now(), updated_at = now()
       WHERE id = $1;`,
      [order.id],
    );

    await runSql(
      `INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
       VALUES ($1, 'ORDER_CANCELLED', $2, $3::jsonb, $4::jsonb);`,
      [order.id, actor.uid, JSON.stringify({ status: order.status }), JSON.stringify({ status: 'CANCELLED' })],
    );

    return { ok: true };
  }

  async getAdminRevenueDashboard(input: {
    fromDateRaw?: string;
    toDateRaw?: string;
    day?: string;
    month?: string;
    year?: string;
    schoolId?: string;
    deliveryUserId?: string;
    parentId?: string;
    session?: string;
    dish?: string;
    orderStatus?: string;
    billingStatus?: string;
  }) {
    return this.adminReports!.getAdminRevenueDashboard(input);
  }

  async getAdminPrintReport(dateRaw?: string) {
    return this.adminReports!.getAdminPrintReport(dateRaw);
  }

  async getParentSpendingDashboard(actor: AccessUser, monthRaw?: string) {
    return this.adminReports!.getParentSpendingDashboard(actor, monthRaw);
  }

  async getYoungsterSpendingDashboard(actor: AccessUser, monthRaw?: string) {
    return this.adminReports!.getYoungsterSpendingDashboard(actor, monthRaw);
  }

  async getYoungsterInsights(actor: AccessUser, dateRaw?: string) {
    return this.adminReports!.getYoungsterInsights(actor, dateRaw);
  }

  async getKitchenDailySummary(actor: AccessUser, dateRaw?: string) {
    return this.kitchen!.getKitchenDailySummary(actor, dateRaw);
  }

  async markKitchenOrderComplete(actor: AccessUser, orderId: string) {
    return this.kitchen!.markKitchenOrderComplete(actor, orderId);
  }

  // ─── Schools CRUD ────────────────────────────────────────────────────────

  async createSchool(actor: AccessUser, input: { name?: string; shortName?: string; address?: string; city?: string; contactPhone?: string }) {
    return this.schools!.createSchool(actor, input);
  }

  async deleteSchool(actor: AccessUser, schoolId: string) {
    return this.schools!.deleteSchool(actor, schoolId);
  }

  // ─── Parent CRUD ─────────────────────────────────────────────────────────

  async updateParentProfile(actor: AccessUser, targetParentId: string, input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; address?: string; parent2FirstName?: string; parent2Phone?: string; parent2Email?: string }) {
    return this.users!.updateParentProfile(actor, targetParentId, input);
  }

  async deleteParent(actor: AccessUser, targetParentId: string) {
    return this.users!.deleteParent(actor, targetParentId);
  }

  private async getParentDeleteBlockers(parentId: string, userId: string) {
    return this.users!.getParentDeleteBlockers(parentId, userId);
  }

  private async softDeleteParent(parentId: string, userId: string) {
    return this.users!.softDeleteParent(parentId, userId);
  }

  private async getYoungsterDeleteBlockers(youngsterId: string, userId: string) {
    return this.users!.getYoungsterDeleteBlockers(youngsterId, userId);
  }

  private async softDeleteYoungster(youngsterId: string, userId: string) {
    return this.users!.softDeleteYoungster(youngsterId, userId);
  }

  private async hardDeleteYoungsterIfSafe(youngsterId: string, userId: string) {
    return this.users!.hardDeleteYoungsterIfSafe(youngsterId, userId);
  }

  // ─── Youngster CRUD ──────────────────────────────────────────────────────

  async updateYoungsterProfile(
    actor: AccessUser,
    youngsterId: string,
    input: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      email?: string;
      dateOfBirth?: string;
      schoolGrade?: string;
      currentGrade?: string;
      schoolId?: string;
      gender?: string;
      parentId?: string;
      allergies?: string;
    },
  ) {
    return this.users!.updateYoungsterProfile(actor, youngsterId, input);
  }

  async deleteYoungster(actor: AccessUser, youngsterId: string) {
    return this.users!.deleteYoungster(actor, youngsterId);
  }

  async adminResetUserPassword(actor: AccessUser, userId: string, newPasswordRaw?: string) {
    return this.users!.adminResetUserPassword(actor, userId, newPasswordRaw);
  }

  async adminGetUserPassword(actor: AccessUser, userId: string) {
    return this.users!.adminGetUserPassword(actor, userId);
  }

  async adminResetYoungsterPassword(actor: AccessUser, youngsterId: string, newPasswordRaw?: string) {
    return this.users!.adminResetYoungsterPassword(actor, youngsterId, newPasswordRaw);
  }

  async adminGetYoungsterPassword(actor: AccessUser, youngsterId: string) {
    return this.users!.adminGetYoungsterPassword(actor, youngsterId);
  }

  // ─── Ingredients CRUD ────────────────────────────────────────────────────

  async createIngredient(actor: AccessUser, input: { name?: string; allergenFlag?: boolean }) {
    return this.menu!.createIngredient(actor, input);
  }

  async updateIngredient(actor: AccessUser, ingredientId: string, input: { name?: string; allergenFlag?: boolean; isActive?: boolean }) {
    return this.menu!.updateIngredient(actor, ingredientId, input);
  }

  async deleteIngredient(actor: AccessUser, ingredientId: string) {
    return this.menu!.deleteIngredient(actor, ingredientId);
  }

  // ─── Menu Items CRUD ─────────────────────────────────────────────────────

  async deleteMenuItem(actor: AccessUser, itemId: string) {
    return this.menu!.deleteMenuItem(actor, itemId);
  }

  // ─── Delivery User CRUD ──────────────────────────────────────────────────

  async createDeliveryUser(
    actor: AccessUser,
    input: { username?: string; password?: string; firstName?: string; lastName?: string; phoneNumber?: string; email?: string },
  ) {
    return this.delivery!.createDeliveryUser(actor, input);
  }

  async deactivateDeliveryUser(actor: AccessUser, targetUserId: string) {
    return this.delivery!.deactivateDeliveryUser(actor, targetUserId);
  }

  async updateDeliveryUser(
    actor: AccessUser,
    targetUserId: string,
    input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; username?: string; isActive?: boolean },
  ) {
    return this.delivery!.updateDeliveryUser(actor, targetUserId, input);
  }

  async deleteDeliveryUser(actor: AccessUser, targetUserId: string) {
    return this.delivery!.deleteDeliveryUser(actor, targetUserId);
  }

  private getPublicMenuCacheKey(serviceDate: string, session: SessionType | null) {
    return this.menu!.getPublicMenuCacheKey(serviceDate, session);
  }

  private clearPublicMenuCache() {
    return this.menu!.clearPublicMenuCache();
  }

  async getAdminAuditLogs(actor: AccessUser, input: { limit?: string; action?: string; targetType?: string }) {
    return this.audit!.getAdminAuditLogs(actor, input);
  }

  // ─── Site settings (chef message, etc.) ───────────────────────────────────

  async getSiteSettings() {
    return this.siteSettings!.getSiteSettings();
  }

  async updateSiteSettings(actor: AccessUser, input: {
    chef_message?: string;
    hero_image_url?: string;
    hero_image_caption?: string;
    ordering_cutoff_time?: string;
    assistance_message?: string;
    multiorder_future_enabled?: boolean;
    ai_future_enabled?: boolean;
  }) {
    return this.siteSettings!.updateSiteSettings(actor, input);
  }

  private normalizeMultiOrderRepeatDays(repeatDaysRaw: string[]) {
    return this.multiOrder!.normalizeMultiOrderRepeatDays(repeatDaysRaw);
  }

  private async getMultiOrderParentId(actor: AccessUser, childId: string) {
    return this.multiOrder!.getMultiOrderParentId(actor, childId);
  }

  async mergeFamily(actor: AccessUser, input: { sourceFamilyId?: string; targetFamilyId?: string }) {
    return this.users!.mergeFamily(actor, input);
  }

  private async getMultiOrderOwnerChildId(actor: AccessUser, childIdRaw: string) {
    return this.multiOrder!.getMultiOrderOwnerChildId(actor, childIdRaw);
  }

  private async getMultiOrderMenuSnapshot(session: SessionType, items: CartItemInput[]) {
    return this.multiOrder!.getMultiOrderMenuSnapshot(session, items);
  }

  private async getMultiOrderSkippedReason(serviceDate: string, session: SessionType, childId: string) {
    return this.multiOrder!.getMultiOrderSkippedReason(serviceDate, session, childId);
  }

  private async collectMultiOrderPlan(input: {
    childId: string;
    session: SessionType;
    startDate: string;
    endDate: string;
    repeatDays: number[];
    items: CartItemInput[];
  }) {
    return this.multiOrder!.collectMultiOrderPlan(input);
  }

  private async getMultiOrderGroupOwned(actor: AccessUser, groupId: string) {
    return this.multiOrder!.getMultiOrderGroupOwned(actor, groupId);
  }

  private async getMultiOrderOccurrences(groupId: string) {
    return this.multiOrder!.getMultiOrderOccurrences(groupId);
  }

  private async canOwnerEditMultiOrder(group: Record<string, unknown> & { id?: string | null; start_date?: string | null }) {
    return this.multiOrder!.canOwnerEditMultiOrder(group);
  }

  private async upsertMultiOrderBilling(groupId: string, parentId: string | null) {
    return this.multiOrder!.upsertMultiOrderBilling(groupId, parentId);
  }

  private async createMultiOrderOrders(actor: AccessUser, input: {
    groupId: string;
    childId: string;
    session: SessionType;
    dates: string[];
    menuSnapshot: Array<{ menuItemId: string; quantity: number; itemNameSnapshot: string; priceSnapshot: number }>;
  }) {
    return this.multiOrder!.createMultiOrderOrders(actor, input);
  }

  private async recalculateMultiOrderGroupStatus(groupId: string) {
    return this.multiOrder!.recalculateMultiOrderGroupStatus(groupId);
  }

  private async deleteOccurrenceOrders(orderIds: string[], actorId: string) {
    return this.multiOrder!.deleteOccurrenceOrders(orderIds, actorId);
  }

  private isImmutableMultiOrderStatus(statusRaw?: string | null) {
    return this.multiOrder!.isImmutableMultiOrderStatus(statusRaw);
  }

  async getMultiOrders(actor: AccessUser) {
    return this.multiOrder!.getMultiOrders(actor);
  }

  async createMultiOrder(actor: AccessUser, input: {
    childId?: string;
    session?: string;
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    items?: CartItemInput[];
  }) {
    return this.multiOrder!.createMultiOrder(actor, input);
  }

  async getMultiOrderDetail(actor: AccessUser, groupId: string) {
    return this.multiOrder!.getMultiOrderDetail(actor, groupId);
  }

  async updateMultiOrder(actor: AccessUser, groupId: string, input: {
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    items?: CartItemInput[];
  }) {
    return this.multiOrder!.updateMultiOrder(actor, groupId, input);
  }

  async deleteMultiOrder(actor: AccessUser, groupId: string) {
    return this.multiOrder!.deleteMultiOrder(actor, groupId);
  }

  async createMultiOrderRequest(actor: AccessUser, groupId: string, input: {
    requestType?: string;
    reason?: string;
    replacementPlan?: { startDate?: string; endDate?: string; repeatDays?: string[]; items?: CartItemInput[] };
  }) {
    return this.multiOrder!.createMultiOrderRequest(actor, groupId, input);
  }

  async getMultiOrderBilling(actor: AccessUser, groupId: string) {
    return this.multiOrder!.getMultiOrderBilling(actor, groupId);
  }

  async uploadMultiOrderBillingProof(actor: AccessUser, groupId: string, proofImageData?: string) {
    return this.multiOrder!.uploadMultiOrderBillingProof(actor, groupId, proofImageData);
  }

  async revertMultiOrderBillingProof(actor: AccessUser, groupId: string) {
    return this.multiOrder!.revertMultiOrderBillingProof(actor, groupId);
  }

  async getMultiOrderProofImage(actor: AccessUser, groupId: string) {
    return this.multiOrder!.getMultiOrderProofImage(actor, groupId);
  }

  async getAdminMultiOrders(actor: AccessUser, input: {
    student?: string;
    parent?: string;
    session?: string;
    status?: string;
    requestStatus?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    return this.multiOrder!.getAdminMultiOrders(actor, input);
  }

  async trimMultiOrderFuture(actor: AccessUser, groupId: string) {
    return this.multiOrder!.trimMultiOrderFuture(actor, groupId);
  }

  async createMultiOrderReplacement(actor: AccessUser, groupId: string, input: {
    childId?: string;
    session?: string;
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    items?: CartItemInput[];
  }) {
    return this.multiOrder!.createMultiOrderReplacement(actor, groupId, input);
  }

  async deleteMultiOrderOccurrence(actor: AccessUser, groupId: string, occurrenceId: string) {
    return this.multiOrder!.deleteMultiOrderOccurrence(actor, groupId, occurrenceId);
  }

  async resolveMultiOrderRequest(actor: AccessUser, groupId: string, input: { decision?: string; note?: string }) {
    return this.multiOrder!.resolveMultiOrderRequest(actor, groupId, input);
  }

  async verifyMultiOrderBilling(actor: AccessUser, groupId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) {
    return this.multiOrder!.verifyMultiOrderBilling(actor, groupId, decision, note);
  }

  async generateMultiOrderReceipt(actor: AccessUser, groupId: string) {
    return this.multiOrder!.generateMultiOrderReceipt(actor, groupId);
  }

  async getMultiOrderReceipt(actor: AccessUser, groupId: string) {
    return this.multiOrder!.getMultiOrderReceipt(actor, groupId);
  }

  async getMultiOrderReceiptFile(actor: AccessUser, groupId: string) {
    return this.multiOrder!.getMultiOrderReceiptFile(actor, groupId);
  }

  async getParentConsolidatedBilling(actor: AccessUser, sessionFilter?: string) {
    return this.billing!.getParentConsolidatedBilling(actor, sessionFilter);
  }

  async getYoungsterConsolidatedBilling(actor: AccessUser, sessionFilter?: string) {
    return this.billing!.getYoungsterConsolidatedBilling(actor, sessionFilter);
  }

  async getAdminBilling(status?: string, sessionRaw?: string) {
    return this.billing!.getAdminBilling(status, sessionRaw);
  }

  // ─── Health check ─────────────────────────────────────────────────────────

  async healthCheck() {
    const dbCheck = await runSql('SELECT 1;').then(() => 'ok').catch(() => 'error');
    return {
      status: dbCheck === 'ok' ? 'healthy' : 'degraded',
      db: dbCheck,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
