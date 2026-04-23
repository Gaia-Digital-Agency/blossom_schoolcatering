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
    return this.order!.ensureCartIsOpenAndOwned(cartId, actor);
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
    return this.order!.getOrderDietarySnapshot(childId);
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
    return this.order!.getAdminOrders(actor, input);
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
    return this.order!.createCart(actor, input);
  }

  async getCarts(actor: AccessUser, query: { childId?: string; serviceDate?: string; session?: string }) {
    return this.order!.getCarts(actor, query);
  }

  async getCartById(actor: AccessUser, cartId: string) {
    return this.order!.getCartById(actor, cartId);
  }

  async replaceCartItems(actor: AccessUser, cartId: string, items: CartItemInput[]) {
    return this.order!.replaceCartItems(actor, cartId, items);
  }

  async discardCart(actor: AccessUser, cartId: string) {
    return this.order!.discardCart(actor, cartId);
  }

  async submitCart(actor: AccessUser, cartId: string) {
    return this.order!.submitCart(actor, cartId);
  }

  async getOrderDetail(actor: AccessUser, orderId: string) {
    return this.order!.getOrderDetail(actor, orderId);
  }

  async getParentConsolidatedOrders(actor: AccessUser) {
    return this.order!.getParentConsolidatedOrders(actor);
  }

  async getYoungsterConsolidatedOrders(actor: AccessUser) {
    return this.order!.getYoungsterConsolidatedOrders(actor);
  }

  async getFavourites(actor: AccessUser, query: { childId?: string; session?: string }) {
    return this.order!.getFavourites(actor, query);
  }

  async createFavourite(actor: AccessUser, input: {
    childId?: string;
    label?: string;
    session?: string;
    items?: CartItemInput[];
  }) {
    return this.order!.createFavourite(actor, input);
  }

  async deleteFavourite(actor: AccessUser, favouriteId: string) {
    return this.order!.deleteFavourite(actor, favouriteId);
  }

  async quickReorder(actor: AccessUser, input: { sourceOrderId?: string; serviceDate?: string }) {
    return this.order!.quickReorder(actor, input);
  }

  async mealPlanWizard(actor: AccessUser, input: {
    childId?: string;
    sourceOrderId?: string;
    dates?: string[];
  }) {
    return this.order!.mealPlanWizard(actor, input);
  }

  async applyFavouriteToCart(actor: AccessUser, input: { favouriteId?: string; serviceDate?: string }) {
    return this.order!.applyFavouriteToCart(actor, input);
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
    return this.order!.updateOrder(actor, orderId, input);
  }

  async deleteOrder(actor: AccessUser, orderId: string) {
    return this.order!.deleteOrder(actor, orderId);
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
