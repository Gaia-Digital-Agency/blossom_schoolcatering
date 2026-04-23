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
    await this.schema!.ensureAdminVisiblePasswordsTable();
    await runSql(
      `INSERT INTO admin_visible_passwords (user_id, password_plaintext, source, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
       SET password_plaintext = EXCLUDED.password_plaintext,
           source = EXCLUDED.source,
           updated_at = now();`,
      [userId, password, source],
    );
  }

  private async getAdminVisiblePasswordRow(userId: string) {
    await this.schema!.ensureAdminVisiblePasswordsTable();
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT avp.password_plaintext, avp.source, avp.updated_at::text AS updated_at
        FROM admin_visible_passwords avp
        WHERE avp.user_id = $1
        LIMIT 1
      ) t;
      `,
      [userId],
    );
    return out
      ? this.parseJsonLine<{ password_plaintext: string; source: string; updated_at: string }>(out)
      : null;
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
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const phoneKey = this.phoneCompareKey(phoneNumber);
    if (!phoneKey) throw new BadRequestException('phone is required');

    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT
           trim(concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, ''))) AS name,
           u.username,
           u.role::text AS role,
           u.phone_number AS phone
         FROM users u
         WHERE u.deleted_at IS NULL
           AND u.is_active = true
           AND regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g') = $1
         ORDER BY
           CASE u.role::text
             WHEN 'CHILD' THEN 1
             WHEN 'PARENT' THEN 2
             WHEN 'ADMIN' THEN 3
             WHEN 'KITCHEN' THEN 4
             WHEN 'DELIVERY' THEN 5
             ELSE 99
           END,
           u.created_at ASC
         LIMIT 1
       ) t;`,
      [phoneKey],
    );

    if (!out) {
      return {
        ok: true,
        found: false,
        phone: normalizedPhone,
        name: null,
      };
    }

    const row = this.parseJsonLine<{ name?: string; username?: string; role?: string; phone?: string | null }>(out);
    return {
      ok: true,
      found: true,
      phone: this.normalizePhone(row.phone) || normalizedPhone,
      name: String(row.name || '').trim() || row.username || null,
      username: row.username || null,
      role: row.role || null,
    };
  }

  private async resolveFamilyScopeByPhone(phoneNumber?: string | null) {
    await this.ensureFamilyIdColumns();
    await this.schema!.ensureParent2Columns();
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const phoneKey = this.phoneCompareKey(phoneNumber);
    if (!phoneKey) throw new BadRequestException('phone is required');

    const senderOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT *
        FROM (
          SELECT trim(concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, ''))) AS name,
                 u.username,
                 'PARENT'::text AS role,
                 u.phone_number AS phone,
                 p.family_id::text AS family_id,
                 p.id AS parent_id,
                 NULL::uuid AS child_id,
                 'PRIMARY_PARENT'::text AS source,
                 1 AS priority
          FROM parents p
          JOIN users u ON u.id = p.user_id
          WHERE p.deleted_at IS NULL
            AND u.deleted_at IS NULL
            AND u.is_active = true
            AND regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g') = $1

          UNION ALL

          SELECT trim(concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, ''))) AS name,
                 u.username,
                 'YOUNGSTER'::text AS role,
                 u.phone_number AS phone,
                 c.family_id::text AS family_id,
                 NULL::uuid AS parent_id,
                 c.id AS child_id,
                 'YOUNGSTER'::text AS source,
                 2 AS priority
          FROM children c
          JOIN users u ON u.id = c.user_id
          WHERE c.deleted_at IS NULL
            AND c.is_active = true
            AND u.deleted_at IS NULL
            AND u.is_active = true
            AND regexp_replace(coalesce(u.phone_number, ''), '[^0-9]', '', 'g') = $1

          UNION ALL

          SELECT COALESCE(NULLIF(BTRIM(p.parent2_first_name), ''), trim(concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, '')))) AS name,
                 NULL::text AS username,
                 'PARENT'::text AS role,
                 p.parent2_phone AS phone,
                 p.family_id::text AS family_id,
                 p.id AS parent_id,
                 NULL::uuid AS child_id,
                 'SECONDARY_PARENT'::text AS source,
                 3 AS priority
          FROM parents p
          JOIN users u ON u.id = p.user_id
          WHERE p.deleted_at IS NULL
            AND u.deleted_at IS NULL
            AND u.is_active = true
            AND regexp_replace(coalesce(p.parent2_phone, ''), '[^0-9]', '', 'g') = $1
        ) candidates
        ORDER BY priority ASC
        LIMIT 1
      ) t;
    `,
      [phoneKey],
    );

    if (!senderOut) {
      return {
        ok: true,
        found: false,
        phone: normalizedPhone,
      };
    }

    const sender = this.parseJsonLine<{
      name: string;
      username?: string | null;
      role: string;
      phone?: string | null;
      family_id?: string | null;
      parent_id?: string | null;
      child_id?: string | null;
      source: string;
    }>(senderOut);

    if (!sender.family_id) {
      return {
        ok: true,
        found: false,
        phone: normalizedPhone,
      };
    }

    const parents = this.parseJsonLines<Record<string, unknown>>(await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT p.id,
               u.id AS user_id,
               p.family_id::text AS family_id,
               u.username,
               u.first_name,
               u.last_name,
               trim(concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, ''))) AS name,
               u.phone_number,
               u.email,
               p.parent2_first_name,
               p.parent2_phone,
               p.parent2_email
        FROM parents p
        JOIN users u ON u.id = p.user_id
        WHERE p.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND u.is_active = true
          AND p.family_id = $1::uuid
        ORDER BY u.first_name, u.last_name
      ) t;
    `,
      [sender.family_id],
    ));

    const children = this.parseJsonLines<Record<string, unknown>>(await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id,
               c.user_id,
               c.family_id::text AS family_id,
               u.username,
               u.first_name,
               u.last_name,
               trim(concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, ''))) AS name,
               u.phone_number,
               u.email,
               COALESCE(c.current_school_grade, c.school_grade) AS school_grade,
               s.name AS school_name
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        WHERE c.deleted_at IS NULL
          AND c.is_active = true
          AND u.deleted_at IS NULL
          AND u.is_active = true
          AND c.family_id = $1::uuid
        ORDER BY u.first_name, u.last_name
      ) t;
    `,
      [sender.family_id],
    )).map((row) => this.withEffectiveGrade(row));

    return {
      ok: true,
      found: true,
      phone: this.normalizePhone(sender.phone) || normalizedPhone,
      sender: {
        name: sender.name,
        username: sender.username || null,
        role: sender.role,
        source: sender.source,
        parent_id: sender.parent_id || null,
        child_id: sender.child_id || null,
      },
      family: {
        family_id: sender.family_id,
        parents,
        children,
      },
    };
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
    const latest = await runSql(
      `SELECT MAX(service_date)::text
       FROM menus
       WHERE session = $1::session_type
         AND deleted_at IS NULL;`,
      [session],
    );
    const trimmed = String(latest || '').trim();
    if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    return this.nextWeekdayIsoDate();
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
    await this.schema!.ensureAiUsageLogsTable();
    await runSql(
      `INSERT INTO ai_usage_logs (
        actor_user_id,
        actor_role,
        parent_id,
        viewer_child_id,
        child_ids_json,
        category,
        prompt_chars,
        response_chars,
        success,
        error_code
      )
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10);`,
      [
        input.actor.uid,
        input.actor.role,
        input.parentId || null,
        input.viewerChildId || null,
        JSON.stringify(input.childIds),
        input.category,
        input.promptChars,
        input.responseChars,
        input.success,
        input.errorCode || null,
      ],
    );
  }

  private categorizeAiQuestion(question: string): AiFutureCategory {
    const normalized = question.trim().toLowerCase();
    if (!normalized) return 'unknown';
    if (/(bill|billing|payment|paid|unpaid|receipt|spend)/.test(normalized)) return 'billing';
    if (/(order|ordered|meal plan|multi order|multiorder|delivery|session)/.test(normalized)) return 'orders';
    if (/(menu|dish|meal|breakfast|snack|lunch|price)/.test(normalized)) return 'menu';
    if (/(allerg|diet|peanut|dairy|restriction)/.test(normalized)) return 'dietary';
    if (/(student|child|children|family|school|grade|birthday|profile)/.test(normalized)) return 'profile';
    return 'unknown';
  }

  private isBlockedGaiaQuestion(question: string) {
    const normalized = question.trim().toLowerCase();
    if (!normalized) return false;
    return /(ignore previous|system prompt|developer message|reveal prompt|show prompt|database password|secret key|access token|refresh token|jwt secret|sql query|drop table|delete table|truncate table|hack|bypass)/.test(normalized);
  }

  private getAiRuntimeConfig() {
    const projectId = String(process.env.GCP_PROJECT_ID || '').trim();
    const location = String(process.env.GCP_VERTEX_LOCATION || '').trim();
    const model = String(process.env.GCP_VERTEX_MODEL || '').trim();
    const maxPromptChars = Math.max(200, Number(process.env.AI_FUTURE_MAX_PROMPT_CHARS || 2000));
    const maxRequestsPerDay = Math.max(1, Number(process.env.AI_FUTURE_MAX_REQUESTS_PER_DAY || 100));
    return { projectId, location, model, maxPromptChars, maxRequestsPerDay };
  }

  private async ensureAiFutureEnabled() {
    const settings = await this.getSiteSettings();
    if (!settings.ai_future_enabled) {
      throw new ForbiddenException('GAIA_FEATURE_DISABLED');
    }
  }

  private async enforceAiDailyLimit(actor: AccessUser, maxRequestsPerDay: number) {
    const count = Number(await runSql(
      `SELECT COUNT(*)::int
       FROM ai_usage_logs
       WHERE actor_user_id = $1
         AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Makassar') AT TIME ZONE 'Asia/Makassar';`,
      [actor.uid],
    ) || 0);
    if (count >= maxRequestsPerDay) {
      throw new ForbiddenException('GAIA_DAILY_LIMIT_REACHED');
    }
  }

  private async resolveAiFamilyScope(actor: AccessUser) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    await this.ensureFamilyIdColumns();
    let parentId: string | null = null;
    let viewerChildId: string | null = null;
    let familyId: string | null = null;

    if (actor.role === 'PARENT') {
      parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      familyId = await this.getParentFamilyId(parentId);
    } else {
      viewerChildId = await this.getChildIdByUserId(actor.uid);
      if (!viewerChildId) throw new NotFoundException('Youngster profile not found');
      familyId = await this.getChildFamilyId(viewerChildId);
      parentId = await this.getParentIdByChildId(viewerChildId);
    }
    if (!familyId) throw new BadRequestException('Family Group not found');

    const childrenOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id,
               c.user_id,
               u.first_name,
               u.last_name,
               s.name AS school_name,
               COALESCE(c.current_school_grade, c.school_grade) AS school_grade,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), 'No Allergies') AS dietary_allergies
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        WHERE c.family_id = $1::uuid
          AND c.is_active = true
          AND c.deleted_at IS NULL
          AND u.deleted_at IS NULL
        ORDER BY u.first_name ASC, u.last_name ASC
      ) t;
    `,
      [familyId],
    );
    const children = this.parseJsonLines<{
      id: string;
      user_id: string;
      first_name: string;
      last_name: string;
      school_name: string;
      school_grade: string;
      dietary_allergies: string;
    }>(childrenOut);
    if (children.length === 0) throw new BadRequestException('Family Group has no active students');

    return {
      viewerRole: actor.role as 'PARENT' | 'YOUNGSTER',
      familyId,
      parentId,
      viewerChildId,
      childIds: children.map((child) => child.id),
      children,
    };
  }

  private async buildAiFamilyContext(
    actor: AccessUser,
    scope: Awaited<ReturnType<CoreService['resolveAiFamilyScope']>>,
    category: AiFutureCategory,
  ) {
    const now = this.getMakassarNowContext();
    const today = now.dateIso;
    const currentMonth = today.slice(0, 7);
    const futureWindowEndDate = new Date(`${today}T00:00:00Z`);
    futureWindowEndDate.setUTCDate(futureWindowEndDate.getUTCDate() + 14);
    const futureWindowEnd = futureWindowEndDate.toISOString().slice(0, 10);

    const [
      childrenPages,
      ordersPayload,
      billingPayload,
      spendingDashboard,
      sessionSettings,
      publicMenu,
      blackoutDays,
      carts,
      cutoffTime,
    ] = await Promise.all([
      scope.viewerRole === 'PARENT' ? this.getParentChildrenPages(actor) : this.getYoungsterChildrenPages(actor),
      scope.viewerRole === 'PARENT' ? this.getParentConsolidatedOrders(actor) : this.getYoungsterConsolidatedOrders(actor),
      scope.viewerRole === 'PARENT' ? this.getParentConsolidatedBillingLegacy(actor) : this.getYoungsterConsolidatedBillingLegacy(actor),
      scope.viewerRole === 'PARENT'
        ? this.getParentSpendingDashboard(actor, currentMonth)
        : this.getYoungsterSpendingDashboard(actor, currentMonth),
      this.getSessionSettings(),
      this.getPublicActiveMenu({}),
      this.getBlackoutDays({ fromDate: today, toDate: futureWindowEnd }),
      this.getCarts(actor, {}),
      this.getOrderingCutoffTime(),
    ]);

    const children = (childrenPages.children || []).map((child) => ({
      id: child.id,
      user_id: child.user_id,
      name: `${child.first_name} ${child.last_name}`.trim(),
      first_name: child.first_name,
      last_name: child.last_name,
      school_name: child.school_name,
      school_grade: child.current_school_grade || child.registration_grade || child.school_grade,
      registration_grade: child.registration_grade || child.school_grade,
      date_of_birth: child.date_of_birth,
      gender: child.gender,
      dietary_allergies: child.dietary_allergies,
      registration_date: child.registration_date,
    }));

    const orderRows = ((ordersPayload.orders || []) as Array<Record<string, unknown> & {
      child_name?: string;
      service_date?: string;
      session?: string;
      status?: string;
      total_price?: number;
      billing_status?: string | null;
      delivery_status?: string | null;
      can_edit?: boolean;
      order_number?: string;
      placed_by_role?: string;
      items?: Array<{ item_name_snapshot?: string; quantity?: number }>;
    }>).map((row) => ({
      order_number: row.order_number,
      child_name: row.child_name,
      service_date: row.service_date,
      session: row.session,
      status: row.status,
      total_price: Number(row.total_price || 0),
      billing_status: row.billing_status || 'UNPAID',
      delivery_status: row.delivery_status || null,
      can_edit: Boolean(row.can_edit),
      placed_by_role: row.placed_by_role || null,
      items: Array.isArray(row.items)
        ? row.items.map((item) => ({
          name: item.item_name_snapshot || '',
          quantity: Number(item.quantity || 0),
        }))
        : [],
    }));
    const upcomingOrders = orderRows
      .filter((row) => String(row.service_date || '') >= today)
      .sort((a, b) => (
        String(a.service_date || '').localeCompare(String(b.service_date || ''))
        || String(a.session || '').localeCompare(String(b.session || ''))
        || String(a.child_name || '').localeCompare(String(b.child_name || ''))
      ))
      .slice(0, 12);
    const recentOrders = orderRows
      .slice()
      .sort((a, b) => (
        String(b.service_date || '').localeCompare(String(a.service_date || ''))
        || String(b.session || '').localeCompare(String(a.session || ''))
      ))
      .slice(0, 12);

    const billingRows = (billingPayload as Array<Record<string, unknown> & {
      child_name?: string;
      service_date?: string;
      session?: string;
      status?: string;
      delivery_status?: string | null;
      total_price?: number;
      proof_uploaded_at?: string | null;
      created_at?: string;
      admin_note?: string | null;
      receipt_number?: string | null;
    }>).map((row) => ({
      child_name: row.child_name,
      service_date: row.service_date,
      session: row.session,
      status: row.status || 'UNPAID',
      delivery_status: row.delivery_status || null,
      total_price: Number(row.total_price || 0),
      proof_uploaded_at: row.proof_uploaded_at || null,
      created_at: row.created_at,
      admin_note: row.admin_note || null,
      receipt_number: row.receipt_number || null,
    }));
    const outstandingBilling = billingRows.filter((row) => row.status !== 'VERIFIED');
    const billingSummary = ['UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].map((status) => ({
      status,
      total_records: billingRows.filter((row) => row.status === status).length,
      total_amount: billingRows
        .filter((row) => row.status === status)
        .reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    })).filter((row) => row.total_records > 0);

    const menuItems = (((publicMenu.items || []) as Array<Record<string, unknown> & {
      service_date?: string;
      session?: string;
      name?: string;
      price?: number | string;
      description?: string | null;
      is_vegetarian?: boolean;
      is_gluten_free?: boolean;
      is_dairy_free?: boolean;
      contains_peanut?: boolean;
    }>)
      .filter((row) => String(row.service_date || '') >= today)
      .sort((a, b) => (
        String(a.service_date || '').localeCompare(String(b.service_date || ''))
        || String(a.session || '').localeCompare(String(b.session || ''))
        || String(a.name || '').localeCompare(String(b.name || ''))
      ))
      .slice(0, 24))
      .map((row) => ({
        service_date: row.service_date,
        session: row.session,
        name: row.name,
        price: Number(row.price || 0),
        description: row.description || '',
        is_vegetarian: Boolean(row.is_vegetarian),
        is_gluten_free: Boolean(row.is_gluten_free),
        is_dairy_free: Boolean(row.is_dairy_free),
        contains_peanut: Boolean(row.contains_peanut),
      }));

    const openCarts = (carts as Array<Record<string, unknown> & {
      child_id?: string;
      service_date?: string;
      session?: string;
      status?: string;
      expires_at?: string;
    }>)
      .filter((cart) => cart.status === 'OPEN')
      .slice(0, 8)
      .map((cart) => ({
        child_id: cart.child_id,
        child_name: children.find((child) => child.id === cart.child_id)?.name || null,
        service_date: cart.service_date,
        session: cart.session,
        status: cart.status,
        expires_at: cart.expires_at,
      }));

    const sessionStatus = sessionSettings.map((row) => ({
      session: row.session,
      is_active: row.is_active,
    }));
    const nextBlackouts = (blackoutDays as Array<Record<string, unknown> & {
      blackout_date?: string;
      type?: string;
      session?: string | null;
      reason?: string | null;
    }>)
      .slice()
      .sort((a, b) => String(a.blackout_date || '').localeCompare(String(b.blackout_date || '')))
      .slice(0, 10)
      .map((row) => ({
        blackout_date: row.blackout_date,
        type: row.type,
        session: row.session || null,
        reason: row.reason || null,
      }));

    return {
      runtime: {
        timezone: 'Asia/Makassar',
        today,
        current_month: currentMonth,
        local_hour_24: now.hour,
        local_minute: now.minute,
        ordering_cutoff_time: cutoffTime,
        ordering_cutoff_label: this.formatOrderingCutoffTimeLabel(cutoffTime),
        context_source: 'live database tables and live application service methods',
        category_focus: category,
      },
      family_group: {
        family_id: scope.familyId,
        parent_id: scope.parentId,
        viewer_role: scope.viewerRole,
        viewer_child_id: scope.viewerChildId,
        children,
      },
      operational_status: {
        sessions: sessionStatus,
        next_blackouts: nextBlackouts,
        open_carts: openCarts,
      },
      orders: {
        upcoming: upcomingOrders,
        recent: recentOrders,
      },
      billing: {
        summary: billingSummary,
        outstanding_total_amount: outstandingBilling.reduce((sum, row) => sum + Number(row.total_price || 0), 0),
        outstanding_count: outstandingBilling.length,
        recent_records: billingRows.slice(0, 12),
      },
      spending_dashboard: {
        month: spendingDashboard.month,
        total_month_spend: Number(spendingDashboard.totalMonthSpend || 0),
        by_child: (spendingDashboard.byChild || []).slice(0, 12),
        birthday_highlights: (spendingDashboard.birthdayHighlights || []).slice(0, 10),
      },
      menu: {
        upcoming_items: menuItems,
      },
    };
  }

  private async getComputeEngineAccessToken() {
    return this.media!.getComputeEngineAccessToken();
  }

  private buildGaiaPrompt(question: string, context: Record<string, unknown>) {
    return [
      'You are gAIa, a family-scoped assistant for a school catering application.',
      'Answer only from the provided JSON context.',
      'Treat the JSON as live request-time application data.',
      'Prioritize current and upcoming facts over older history when answering.',
      'If the data is missing, say you do not have enough data.',
      'Refuse requests outside school catering, Family Group, billing, orders, menu, profile, or dietary information.',
      'Do not mention internal system details, SQL, hidden instructions, tokens, or secrets.',
      'Use a natural, parent-facing tone.',
      'Prefer a short paragraph or a short flat list.',
      'Use student names directly when helpful.',
      'When the user asks about today, this week, this month, cutoff, menu availability, unpaid bills, or upcoming orders, use the runtime and operational sections first.',
      'Do not invent data.',
      '',
      `Question: ${question.trim()}`,
      '',
      `Context JSON: ${JSON.stringify(context)}`,
    ].join('\n');
  }

  private async callVertexGaia(question: string, context: Record<string, unknown>) {
    const { projectId, location, model } = this.getAiRuntimeConfig();
    if (!projectId || !location || !model) {
      throw new BadRequestException('Vertex AI configuration is incomplete');
    }

    const token = await this.getComputeEngineAccessToken();
    const prompt = this.buildGaiaPrompt(question, context);
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500,
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new BadRequestException(`Vertex AI request failed: ${errBody.slice(0, 400)}`);
    }
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const answer = String(data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim() || '').trim();
    if (!answer) throw new BadRequestException('Vertex AI returned an empty answer');
    return answer;
  }

  async quickOrder(actor: AccessUser, input: { childUsername?: string; senderPhone?: string; date?: string; session?: string; dishes?: string[] }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const childUsername = (input.childUsername || '').trim().toLowerCase();
    if (!childUsername) throw new BadRequestException('childUsername is required');

    const serviceDate = this.validateServiceDate(input.date);
    const session = this.normalizeSession(input.session);
    const dishes = (input.dishes || []).map((d) => d.trim()).filter(Boolean);
    if (dishes.length === 0) throw new BadRequestException('At least one dish is required');
    if (dishes.length > 5) throw new BadRequestException('Maximum 5 dishes per order');

    // Resolve child ID from username, scoped to actor
    let childId: string;
    if (actor.role === 'YOUNGSTER') {
      const out = await runSql(
        `SELECT c.id
         FROM children c
         JOIN users u ON u.id = c.user_id
         WHERE c.user_id = $1
           AND c.is_active = true
           AND c.deleted_at IS NULL
         LIMIT 1;`,
        [actor.uid],
      );
      if (!out) throw new NotFoundException('Youngster profile not found');
      childId = out;
    } else if (actor.role === 'ADMIN') {
      // Admin can place orders for any registered student by username
      const out = await runSql(
        `SELECT c.id
         FROM children c
         JOIN users u ON u.id = c.user_id
         WHERE lower(u.username) = $1
           AND c.is_active = true
           AND c.deleted_at IS NULL
         LIMIT 1;`,
        [childUsername],
      );
      if (!out) throw new NotFoundException(`Student with username "${input.childUsername}" not found`);
      childId = out;
    } else {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      const familyId = await this.getParentFamilyId(parentId);
      if (!familyId) throw new BadRequestException('Family Group not found');
      const out = await runSql(
        `SELECT c.id
         FROM children c
         JOIN users u ON u.id = c.user_id
         WHERE c.family_id = $1::uuid
           AND lower(u.username) = $2
           AND c.is_active = true
           AND c.deleted_at IS NULL
         LIMIT 1;`,
        [familyId, childUsername],
      );
      if (!out) throw new NotFoundException(`Child with username "${input.childUsername}" not found or not linked to your account`);
      childId = out;
    }

    // Fuzzy-match dishes by name + session — date-independent (dishes are global once published)
    const resolvedItems: { menuItemId: string; name: string }[] = [];
    const notFound: string[] = [];

    for (const dish of dishes) {
      const rawOut = await runSql(
        `SELECT row_to_json(t)::text FROM (
           SELECT mi.id, mi.name
           FROM menu_items mi
           JOIN menus m ON m.id = mi.menu_id
           WHERE m.session = $1::session_type
             AND m.deleted_at IS NULL
             AND mi.is_available = true
             AND mi.deleted_at IS NULL
             AND lower(mi.name) ILIKE $2
           ORDER BY m.service_date DESC
           LIMIT 1
         ) t;`,
        [session, `%${dish.toLowerCase()}%`],
      );
      if (rawOut) {
        const row = this.parseJsonLine<{ id: string; name: string }>(rawOut);
        if (row) resolvedItems.push({ menuItemId: row.id, name: row.name });
        else notFound.push(dish);
      } else {
        notFound.push(dish);
      }
    }

    if (notFound.length > 0) {
      throw new BadRequestException(`Dishes not found for session ${session}: ${notFound.join(', ')}`);
    }

    // Fetch student first name for confirmation response
    const nameOut = await runSql(
      `SELECT u.first_name
       FROM children c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = $1
       LIMIT 1;`,
      [childId],
    );
    const studentName = (nameOut || '').trim() || childUsername;

    // Create cart (reuses existing open cart if present)
    const cart = await this.createCart(actor, { childId, serviceDate, session });

    // Set items
    await this.replaceCartItems(actor, cart.id, resolvedItems.map((i) => ({ menuItemId: i.menuItemId, quantity: 1 })));

    // Submit
    const order = await this.submitCart(actor, cart.id);

    const rawPrice = Number(order.total_price || 0);
    return {
      ok: true,
      orderId: order.id,
      ref: String(order.id || '').slice(0, 8).toUpperCase(),
      studentName,
      studentUsername: childUsername,
      serviceDate,
      session,
      items: resolvedItems.map((i) => i.name),
      itemCount: resolvedItems.length,
      totalPrice: rawPrice,
      totalPriceFormatted: `Rp ${rawPrice.toLocaleString('id-ID')}`,
    };
  }

  async queryGaia(actor: AccessUser, input: { question?: string }) {
    await this.ensureAiFutureEnabled();
    const question = String(input.question || '').trim();
    if (!question) throw new BadRequestException('question is required');

    const config = this.getAiRuntimeConfig();
    if (question.length > config.maxPromptChars) {
      throw new BadRequestException(`question must be ${config.maxPromptChars} characters or fewer`);
    }

    await this.schema!.ensureAiUsageLogsTable();
    await this.enforceAiDailyLimit(actor, config.maxRequestsPerDay);

    const scope = await this.resolveAiFamilyScope(actor);
    const category = this.categorizeAiQuestion(question);
    if (this.isBlockedGaiaQuestion(question)) {
      await this.recordAiUsage({
        actor,
        parentId: scope.parentId,
        viewerChildId: scope.viewerChildId,
        childIds: scope.childIds,
        category: 'unknown',
        promptChars: question.length,
        responseChars: 0,
        success: false,
        errorCode: 'GAIA_BLOCKED_QUESTION',
      });
      throw new BadRequestException('gAIa can only answer Family Group, orders, billing, menu, profile, and dietary questions.');
    }
    if (category === 'unknown') {
      const answer = 'gAIa currently supports Family Group, orders, billing, menu, profile, and dietary questions only.';
      await this.recordAiUsage({
        actor,
        parentId: scope.parentId,
        viewerChildId: scope.viewerChildId,
        childIds: scope.childIds,
        category,
        promptChars: question.length,
        responseChars: answer.length,
        success: true,
      });
      return {
        answer,
        scope: {
          viewerRole: scope.viewerRole,
          parentId: scope.parentId,
          childIds: scope.childIds,
          familyName: this.deriveFamilyName(scope.children),
        },
        meta: {
          supported: false,
          category,
        },
      };
    }
    const context = await this.buildAiFamilyContext(actor, scope, category);

    try {
      const answer = await this.callVertexGaia(question, context);
      await this.recordAiUsage({
        actor,
        parentId: scope.parentId,
        viewerChildId: scope.viewerChildId,
        childIds: scope.childIds,
        category,
        promptChars: question.length,
        responseChars: answer.length,
        success: true,
      });
      return {
        answer,
        scope: {
          viewerRole: scope.viewerRole,
          parentId: scope.parentId,
          childIds: scope.childIds,
          familyName: this.deriveFamilyName(scope.children),
        },
        meta: {
          supported: true,
          category,
        },
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'GAIA_QUERY_FAILED';
      await this.recordAiUsage({
        actor,
        parentId: scope.parentId,
        viewerChildId: scope.viewerChildId,
        childIds: scope.childIds,
        category,
        promptChars: question.length,
        responseChars: 0,
        success: false,
        errorCode: code,
      });
      throw error;
    }
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
    const weekday = await runSql(`SELECT extract(isodow FROM $1::date)::int;`, [serviceDate]);
    if (!weekday || Number(weekday) > 5) {
      throw new BadRequestException('ORDER_WEEKEND_SERVICE_BLOCKED');
    }

    const blackout = await this.getBlackoutRuleForDate(serviceDate, session);
    if (!blackout) return;
    if (blackout.type === 'ORDER_BLOCK' || blackout.type === 'BOTH') {
      throw new BadRequestException('ORDER_BLACKOUT_BLOCKED');
    }
    if (blackout.type === 'SERVICE_BLOCK') {
      throw new BadRequestException('ORDER_SERVICE_BLOCKED');
    }
  }

  private async getBlackoutRuleForDate(serviceDate: string, session?: SessionType): Promise<BlackoutRule | null> {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT blackout_date::text AS blackout_date,
               type::text AS type,
               reason,
               session::text AS session
        FROM blackout_days
        WHERE blackout_date = $1::date
          AND (session = $2::session_type OR session IS NULL)
        ORDER BY CASE WHEN session = $2::session_type THEN 0 ELSE 1 END,
                 updated_at DESC,
                 created_at DESC
        LIMIT 1
      ) t;
    `,
      [serviceDate, session || 'LUNCH'],
    );
    if (!out) return null;
    return this.parseJsonLine<BlackoutRule>(out);
  }


  private async isSessionActive(session: SessionType) {
    const out = await runSql(
      `SELECT is_active::text
       FROM session_settings
       WHERE session = $1::session_type
       LIMIT 1;`,
      [session],
    );
    if (!out) return true;
    return out === 'true' || out === 't';
  }

  private async assertSessionActiveForOrdering(session: SessionType) {
    const active = await this.isSessionActive(session);
    if (!active) throw new BadRequestException('ORDER_SESSION_DISABLED');
  }

  private sanitizePackingRequirement(value?: string) {
    return (value || '').trim().slice(0, 200);
  }

  private normalizeDishCategory(value?: string): DishCategory {
    const normalized = String(value || '').trim().toUpperCase();
    // Backward compatibility: old SNACKS label is folded into SIDES.
    if (normalized === 'SNACKS') return 'SIDES';
    if ((DISH_CATEGORIES as readonly string[]).includes(normalized)) {
      return normalized as DishCategory;
    }
    throw new BadRequestException('Invalid dish category');
  }

  private normalizeAllergies(allergiesRaw?: string) {
    const cleaned = (allergiesRaw || '').trim().replace(/\s+/g, ' ');
    const fallback = 'No Allergies';
    if (!cleaned) return fallback;
    if (cleaned.length > 50) {
      throw new BadRequestException('Allergies must be 50 characters or less');
    }
    return cleaned;
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
    const existing = await runSql(
      `SELECT id
       FROM menus
       WHERE service_date = $1::date
         AND session = $2::session_type
       LIMIT 1;`,
      [serviceDate, session],
    );
    if (existing) return existing;

    return runSql(
      `INSERT INTO menus (session, service_date, is_published)
       VALUES ($1::session_type, $2::date, true)
       RETURNING id;`,
      [session, serviceDate],
    );
  }

  async getSchools(active = true) {
    await this.schema!.ensureSchoolShortNameColumn();
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, name, short_name, city, address, contact_phone, is_active
        FROM schools
        WHERE deleted_at IS NULL
          AND is_active = ${active ? 'true' : 'false'}
        ORDER BY name ASC
      ) t;
    `);
    return this.parseJsonLines<{ id: string; name: string; short_name: string | null; city: string | null; address: string | null; contact_phone: string | null; is_active: boolean }>(out);
  }

  async updateSchool(actor: AccessUser, schoolId: string, input: { isActive?: boolean; name?: string; shortName?: string; city?: string; address?: string; contactPhone?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureSchoolShortNameColumn();
    const id = schoolId.trim();
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];

    if (input.isActive !== undefined) { params.push(input.isActive); sets.push(`is_active = $${params.length}`); }
    if (input.name !== undefined) { params.push(input.name.trim()); sets.push(`name = $${params.length}`); }
    if (input.shortName !== undefined) { params.push(input.shortName.trim() || null); sets.push(`short_name = $${params.length}`); }
    if (input.city !== undefined) { params.push(input.city.trim()); sets.push(`city = $${params.length}`); }
    if (input.address !== undefined) { params.push(input.address.trim()); sets.push(`address = $${params.length}`); }
    if (input.contactPhone !== undefined) { params.push(input.contactPhone.trim()); sets.push(`contact_phone = $${params.length}`); }

    params.push(id);
    const out = await runSql(
      `WITH updated AS (
         UPDATE schools
         SET ${sets.join(', ')}
         WHERE id = $${params.length}
           AND deleted_at IS NULL
         RETURNING id, name, short_name, city, address, contact_phone, is_active
       )
       SELECT row_to_json(updated)::text
       FROM updated;`,
      params,
    );
    if (!out) throw new NotFoundException('School not found');
    const updated = this.parseJsonLine<{ id: string; name: string; is_active: boolean }>(out);
    await this.audit!.recordAdminAudit(actor, 'SCHOOL_UPDATED', 'school', updated.id, { name: updated.name, isActive: updated.is_active });
    return updated;
  }

  async getSessionSettings() {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT session::text AS session, is_active
        FROM session_settings
        ORDER BY session ASC
      ) t;
    `);
    return this.parseJsonLines<{ session: SessionType; is_active: boolean }>(out);
  }

  async updateSessionSetting(actor: AccessUser, sessionRaw: string, isActive?: boolean) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const session = this.normalizeSession(sessionRaw);
    if (session === 'LUNCH' && !isActive) {
      throw new BadRequestException('LUNCH session must remain active');
    }
    const out = await runSql(
      `WITH updated AS (
         UPDATE session_settings
         SET is_active = $1,
             updated_at = now()
         WHERE session = $2::session_type
         RETURNING session::text AS session, is_active
       )
       SELECT row_to_json(updated)::text
       FROM updated;`,
      [isActive, session],
    );
    if (!out) throw new NotFoundException('Session setting not found');
    this.clearPublicMenuCache();
    const updated = this.parseJsonLine<{ session: SessionType; is_active: boolean }>(out);
    await this.audit!.recordAdminAudit(actor, 'SESSION_SETTING_UPDATED', 'session-setting', updated.session, {
      isActive: updated.is_active,
    });
    return updated;
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
    if (!['PARENT', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const firstName = (input.firstName || '').trim();
    const lastName = (input.lastName || '').trim();
    const phoneNumber = this.normalizePhone(input.phoneNumber);
    const email = (input.email || '').trim().toLowerCase();
    const dateOfBirth = (input.dateOfBirth || '').trim();
    const gender = (input.gender || '').trim().toUpperCase();
    const schoolId = (input.schoolId || '').trim();
    const schoolGrade = normalizeGradeLabel(input.schoolGrade);
    const currentGrade = normalizeGradeLabel(input.currentGrade);
    if (!phoneNumber) throw new BadRequestException('Student phone number is required');
    if (!email) throw new BadRequestException('Student email is required');
    if (!email.includes('@')) throw new BadRequestException('Student email must be valid');
    if (actor.role === 'PARENT' && !String(input.allergies || '').trim()) {
      throw new BadRequestException('Allergies is required');
    }
    const allergies = this.normalizeAllergies(input.allergies);

    const schoolExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM schools
         WHERE id = $1
           AND is_active = true
           AND deleted_at IS NULL
       );`,
      [schoolId],
    );
    if (schoolExists !== 't') {
      throw new BadRequestException('School not found or inactive');
    }

    let parentId: string | null = null;
    if (actor.role === 'PARENT') {
      parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
    } else if (input.parentId) {
      const exists = await runSql(
        `SELECT EXISTS (
           SELECT 1
           FROM parents
           WHERE id = $1
             AND deleted_at IS NULL
         );`,
        [input.parentId],
      );
      if (exists !== 't') throw new BadRequestException('Invalid parentId');
      parentId = input.parentId;
    }

    let parentLastNameForUsername = lastName;
    if (parentId) {
      const parentOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT p.id, u.last_name, u.phone_number, u.email
           FROM parents p
           JOIN users u ON u.id = p.user_id
           WHERE p.id = $1
             AND p.deleted_at IS NULL
             AND u.deleted_at IS NULL
             AND u.is_active = true
           LIMIT 1
         ) t;`,
        [parentId],
      );
      const parent = parentOut
        ? this.parseJsonLine<{ id: string; last_name: string; phone_number?: string | null; email?: string | null }>(parentOut)
        : null;
      if (!parent) throw new BadRequestException('Parent profile not found');
      parentLastNameForUsername = String(parent.last_name || '').trim() || lastName;
      if (email === String(parent.email || '').trim().toLowerCase()) {
        throw new BadRequestException('Student email cannot be the same as parent email');
      }
      if (this.phoneCompareKey(phoneNumber) === this.phoneCompareKey(parent.phone_number)) {
        throw new BadRequestException('Student phone number cannot be the same as parent phone number');
      }
    }
    if (await this.findActiveUserByEmail(email)) throw new ConflictException('That email is already taken');
    if (await this.findActiveUserByPhone(phoneNumber)) throw new ConflictException('That phone number is already taken');
    await this.schema!.ensureChildCurrentGradeColumn();
    await this.ensureFamilyIdColumns();
    let familyId: string | null = parentId ? await this.getParentFamilyId(parentId) : null;
    familyId ||= randomUUID();

    const usernameBase = this.sanitizeUsernamePart(`${parentLastNameForUsername}_${firstName}`);
    const username = await runSql(`SELECT generate_unique_username($1);`, [usernameBase]);
    const passwordSeed = phoneNumber.replace(/\D/g, '') || randomUUID().slice(0, 10);
    const passwordHash = this.hashPassword(passwordSeed);

    const createdOut = await runSql(
      `WITH inserted AS (
         INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
         VALUES ('CHILD', $1, $2, $3, $4, $5, $6)
         RETURNING id, username, role::text, first_name, last_name
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [username, passwordHash, firstName, lastName, phoneNumber, email || null],
    );
    const created = this.parseJsonLine<DbUserRow>(createdOut);

    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [created.id],
    );

    const childOut = await runSql(
      `WITH inserted AS (
         INSERT INTO children (user_id, school_id, date_of_birth, gender, school_grade, current_school_grade, photo_url, family_id)
         VALUES ($1, $2, $3::date, $4::gender_type, $5, $6, NULL, $7::uuid)
         RETURNING id, user_id
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [created.id, schoolId, dateOfBirth, gender, schoolGrade, currentGrade || null, familyId],
    );
    const child = this.parseJsonLine<{ id: string; user_id: string }>(childOut);

    await runSql(
      `INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
       VALUES ($1, 'ALLERGIES', $2, true)
       ON CONFLICT (child_id, restriction_label)
       DO UPDATE SET restriction_details = EXCLUDED.restriction_details,
                     is_active = true,
                     deleted_at = NULL,
                     updated_at = now();`,
      [child.id, allergies],
    );

    if (parentId) {
      await runSql(
        `INSERT INTO parent_children (parent_id, child_id)
         VALUES ($1, $2)
         ON CONFLICT (parent_id, child_id) DO NOTHING;`,
        [parentId, child.id],
      );
    }

    await this.setAdminVisiblePassword(created.id, passwordSeed, 'REGISTRATION');

    return {
      childId: child.id,
      userId: created.id,
      username: created.username,
      generatedPassword: passwordSeed,
      linkedParentId: parentId,
    };
  }

  async getAdminParents() {
    await this.schema!.ensureParent2Columns();
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT p.id,
               p.user_id,
               p.family_id::text AS family_id,
               u.username,
               u.first_name,
               u.last_name,
               u.email,
               u.phone_number,
               p.address,
               p.parent2_first_name,
               p.parent2_phone,
               p.parent2_email,
               count(DISTINCT c.id)::int AS linked_children_count,
               count(DISTINCT br.id)::int AS billing_count,
               COALESCE(
                 json_agg(
                   DISTINCT jsonb_build_object(
                     'id', c.id,
                     'name', (uc.first_name || ' ' || uc.last_name),
                     'school_name', s.name
                   )
                 ) FILTER (WHERE c.id IS NOT NULL),
                 '[]'::json
               ) AS youngsters,
               COALESCE(
                 json_agg(
                   DISTINCT jsonb_build_object(
                     'student_name', (uc.first_name || ' ' || uc.last_name),
                     'teacher_name', c.registration_actor_teacher_name,
                     'teacher_phone', c.registration_actor_teacher_phone
                   )
                 ) FILTER (
                   WHERE c.id IS NOT NULL
                     AND COALESCE(NULLIF(TRIM(c.registration_actor_teacher_name), ''), NULL) IS NOT NULL
                 ),
                 '[]'::json
               ) AS teacher_guardians,
               COALESCE(
                 array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL),
                 '{}'::text[]
               ) AS schools
        FROM parents p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN parent_children pc ON pc.parent_id = p.id
        LEFT JOIN children c ON c.id = pc.child_id AND c.deleted_at IS NULL
        LEFT JOIN users uc ON uc.id = c.user_id
        LEFT JOIN schools s ON s.id = c.school_id
        LEFT JOIN billing_records br ON br.parent_id = p.id
        WHERE p.deleted_at IS NULL
          AND u.is_active = true
        GROUP BY p.id, p.user_id, u.username, u.first_name, u.last_name, u.email, u.phone_number, p.address, p.parent2_first_name, p.parent2_phone, p.parent2_email
        ORDER BY u.first_name, u.last_name
      ) t;
    `);
    return this.parseJsonLines(out);
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
    const registrationGrade = normalizeGradeLabel(
      (row.registration_grade as string | undefined) ?? (row.school_grade as string | undefined),
    );
    const currentSchoolGrade = normalizeGradeLabel(row.current_school_grade as string | null | undefined);
    const registrationDate = (row.registration_date as string | null | undefined)
      ?? (row.created_at as string | null | undefined)
      ?? null;
    return {
      ...row,
      school_grade: resolveEffectiveGrade({
        registrationGrade,
        currentGrade: currentSchoolGrade,
        registrationDate,
      }),
      registration_grade: registrationGrade,
      current_school_grade: currentSchoolGrade || null,
      registration_date: registrationDate || undefined,
    };
  }

  private normalizeMenuText(raw?: string | null) {
    return String(raw || '').trim() || 'TBA';
  }

  private async ensureTbaIngredientId() {
    const existingId = await runSql(
      `
      SELECT id
      FROM ingredients
      WHERE lower(name) = 'tba'
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
      `,
    );
    if (existingId) return existingId;
    return runSql(
      `
      INSERT INTO ingredients (name, allergen_flag, is_active)
      VALUES ('TBA', false, true)
      RETURNING id;
      `,
    );
  }

  async getAdminChildren() {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id,
               c.user_id,
               c.family_id::text AS family_id,
               u.username,
               u.first_name,
               u.last_name,
               u.phone_number,
               u.email,
               c.date_of_birth::text AS date_of_birth,
               c.gender::text AS gender,
               c.school_id,
               c.school_grade AS registration_grade,
               c.current_school_grade,
               c.created_at::text AS registration_date,
               s.name AS school_name,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), '') AS dietary_allergies,
               c.registration_actor_teacher_name,
               c.registration_actor_teacher_phone,
               coalesce(array_agg(pc.parent_id) FILTER (WHERE pc.parent_id IS NOT NULL), '{}') AS parent_ids
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        WHERE c.is_active = true
          AND c.deleted_at IS NULL
          AND u.is_active = true
        GROUP BY c.id, c.user_id, u.username, u.first_name, u.last_name, u.phone_number, u.email, c.date_of_birth, c.gender, c.school_id, c.school_grade, c.current_school_grade, c.created_at, s.name, c.registration_actor_teacher_name, c.registration_actor_teacher_phone
        ORDER BY u.first_name, u.last_name
      ) t;
    `);
    return this.parseJsonLines<Record<string, unknown>>(out).map((row) => this.withEffectiveGrade(row));
  }

  async getAdminDashboard(dateRaw?: string) {
    const date = dateRaw ? this.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const yesterday = await runSql(`SELECT ($1::date - INTERVAL '1 day')::date::text;`, [date]);
    const tomorrow = await runSql(`SELECT ($1::date + INTERVAL '1 day')::date::text;`, [date]);
    const pastWeekStart = await runSql(`SELECT ($1::date - INTERVAL '6 day')::date::text;`, [date]);
    const pastMonthStart = await runSql(`SELECT ($1::date - INTERVAL '29 day')::date::text;`, [date]);

    const getOrdersAndDishes = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS total_orders,
                 COALESCE(SUM(oi.quantity), 0)::int AS total_dishes
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
        ) t;
      `,
        [from, to],
      );
      const row = this.parseJsonLine<{ total_orders: number; total_dishes: number }>(out || '{"total_orders":0,"total_dishes":0}');
      return { totalOrders: Number(row.total_orders || 0), totalDishes: Number(row.total_dishes || 0) };
    };

    const getKitchenUnfulfilled = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS orders_not_fulfilled,
                 COALESCE(SUM(oi.quantity), 0)::int AS dishes_not_fulfilled
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status = 'PLACED'
        ) t;
      `,
        [from, to],
      );
      const row = this.parseJsonLine<{ orders_not_fulfilled: number; dishes_not_fulfilled: number }>(
        out || '{"orders_not_fulfilled":0,"dishes_not_fulfilled":0}',
      );
      return {
        ordersNotFulfilled: Number(row.orders_not_fulfilled || 0),
        dishesNotFulfilled: Number(row.dishes_not_fulfilled || 0),
      };
    };

    const getBillingPeriodMetrics = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(br.id)::int AS total_number_billing,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_value_billing,
                 COUNT(br.id) FILTER (
                   WHERE br.status = 'UNPAID'
                     AND COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') = ''
                 )::int AS total_number_unpaid_no_proof,
                 COALESCE(SUM(o.total_price) FILTER (
                   WHERE br.status = 'UNPAID'
                     AND COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') = ''
                 ), 0)::numeric AS total_value_unpaid_no_proof
          FROM billing_records br
          JOIN orders o ON o.id = br.order_id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
        ) t;
      `,
        [from, to],
      );
      const row = this.parseJsonLine<{
        total_number_billing: number;
        total_value_billing: string | number;
        total_number_unpaid_no_proof: number;
        total_value_unpaid_no_proof: string | number;
      }>(
        out ||
          '{"total_number_billing":0,"total_value_billing":0,"total_number_unpaid_no_proof":0,"total_value_unpaid_no_proof":0}',
      );
      return {
        totalNumberBilling: Number(row.total_number_billing || 0),
        totalValueBilling: Number(row.total_value_billing || 0),
        totalNumberUnpaidNoProof: Number(row.total_number_unpaid_no_proof || 0),
        totalValueUnpaidNoProof: Number(row.total_value_unpaid_no_proof || 0),
      };
    };

    const [
      parentsCountRaw,
      youngstersCountRaw,
      schoolsCountRaw,
      deliveryPersonnelCountRaw,
      todayDelivery,
      yesterdayDelivery,
      tomorrowDelivery,
      pastWeekDelivery,
      pastMonthDelivery,
      totalSalesRaw,
      yesterdayFailedOrUncheckedDeliveryRaw,
      failedDeliveryByPersonOut,
      menuTotalsOut,
      upcomingBlackoutsOut,
      kitchenYesterday,
      kitchenPastWeek,
      billingYesterday,
      billingPastWeek,
      billingPastMonth,
      pendingBillingCountRaw,
      birthdaysOut,
    ] = await Promise.all([
      runSql(`
        SELECT count(*)::int
        FROM parents p
        JOIN users u ON u.id = p.user_id
        WHERE p.deleted_at IS NULL
          AND u.is_active = true;
      `),
      runSql(`
        SELECT count(*)::int
        FROM children c
        JOIN users u ON u.id = c.user_id
        WHERE c.is_active = true
          AND c.deleted_at IS NULL
          AND u.is_active = true;
      `),
      runSql(`
        SELECT count(*)::int
        FROM schools
        WHERE is_active = true
          AND deleted_at IS NULL;
      `),
      runSql(`
        SELECT count(*)::int
        FROM users
        WHERE role = 'DELIVERY'
          AND is_active = true
          AND deleted_at IS NULL;
      `),
      getOrdersAndDishes(date, date),
      getOrdersAndDishes(yesterday, yesterday),
      getOrdersAndDishes(tomorrow, tomorrow),
      getOrdersAndDishes(pastWeekStart, date),
      getOrdersAndDishes(pastMonthStart, date),
      runSql(`
        SELECT coalesce(sum(total_price), 0)::numeric
        FROM orders
        WHERE deleted_at IS NULL
          AND status <> 'CANCELLED';
      `),
      runSql(
        `SELECT count(*)::int
         FROM orders
         WHERE service_date = $1::date
           AND deleted_at IS NULL
           AND status <> 'CANCELLED'
           AND delivery_status <> 'DELIVERED';`,
        [yesterday],
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COALESCE(da.delivery_user_id::text, 'UNASSIGNED') AS delivery_user_id,
                 COALESCE((u.first_name || ' ' || u.last_name), 'Unassigned') AS delivery_person_name,
                 COUNT(DISTINCT o.id)::int AS orders_count
          FROM orders o
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN users u ON u.id = da.delivery_user_id
          WHERE o.service_date = $1::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
            AND (
              o.delivery_status <> 'DELIVERED'
              OR da.confirmed_at IS NULL
            )
          GROUP BY da.delivery_user_id, u.first_name, u.last_name
          ORDER BY orders_count DESC, delivery_person_name ASC
        ) t;
      `,
        [yesterday],
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(*)::int AS dishes_total_created,
                 COUNT(*) FILTER (WHERE is_available = true)::int AS dishes_total_active
          FROM menu_items
          WHERE deleted_at IS NULL
        ) t;
      `,
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT b.blackout_date::text AS blackout_date,
                 b.type::text AS type,
                 b.reason,
                 (
                   SELECT COUNT(*)::int
                   FROM orders o
                   WHERE o.service_date = b.blackout_date
                     AND o.deleted_at IS NULL
                     AND o.status <> 'CANCELLED'
                 )::int AS affected_orders
          FROM blackout_days b
          WHERE b.blackout_date >= $1::date
          ORDER BY b.blackout_date ASC
          LIMIT 10
        ) t;
      `,
        [date],
      ),
      getKitchenUnfulfilled(yesterday, yesterday),
      getKitchenUnfulfilled(pastWeekStart, date),
      getBillingPeriodMetrics(yesterday, yesterday),
      getBillingPeriodMetrics(pastWeekStart, date),
      getBillingPeriodMetrics(pastMonthStart, date),
      runSql(`
        SELECT count(*)::int
        FROM billing_records
        WHERE status IN ('UNPAID', 'PENDING_VERIFICATION');
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT c.id AS child_id,
                 (u.first_name || ' ' || u.last_name) AS child_name,
                 c.date_of_birth::text AS date_of_birth
          FROM children c
          JOIN users u ON u.id = c.user_id
          WHERE c.is_active = true
            AND c.deleted_at IS NULL
        ) t;
      `),
    ]);

    const parentsCount = Number(parentsCountRaw || 0);
    const youngstersCount = Number(youngstersCountRaw || 0);
    const schoolsCount = Number(schoolsCountRaw || 0);
    const deliveryPersonnelCount = Number(deliveryPersonnelCountRaw || 0);
    const totalSales = Number(totalSalesRaw || 0);
    const yesterdayFailedOrUncheckedDelivery = Number(yesterdayFailedOrUncheckedDeliveryRaw || 0);
    const pendingBillingCount = Number(pendingBillingCountRaw || 0);
    const todayOrdersCount = todayDelivery.totalOrders;
    const todayTotalDishes = todayDelivery.totalDishes;

    const failedDeliveryByPerson = this.parseJsonLines<{
      delivery_user_id: string;
      delivery_person_name: string;
      orders_count: number;
    }>(failedDeliveryByPersonOut);
    const menuTotals = this.parseJsonLine<{ dishes_total_created: number; dishes_total_active: number }>(
      menuTotalsOut || '{"dishes_total_created":0,"dishes_total_active":0}',
    );
    const upcomingBlackouts = this.parseJsonLines<{
      blackout_date: string;
      type: BlackoutType;
      reason: string | null;
      affected_orders: number;
    }>(upcomingBlackoutsOut);
    const nextBlackout = upcomingBlackouts[0] || null;
    const serviceBlockedDatesWithOrders = upcomingBlackouts
      .filter((row) => ['SERVICE_BLOCK', 'BOTH'].includes(row.type))
      .filter((row) => Number(row.affected_orders || 0) > 0);

    const today = new Date(date);
    const birthdayToday = this.parseJsonLines<{ child_id: string; child_name: string; date_of_birth: string }>(birthdaysOut)
      .map((row) => {
        const dob = new Date(row.date_of_birth);
        const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        return { ...row, days_until: daysUntil };
      })
      .filter((row) => row.days_until === 0)
      .sort((a, b) => a.days_until - b.days_until)
      .slice(0, 30);

    return {
      date,
      parentsCount,
      youngstersCount,
      schoolsCount,
      deliveryPersonnelCount,
      todayOrdersCount,
      todayTotalDishes,
      totalSales,
      yesterdayFailedOrUncheckedDelivery,
      failedDeliveryByPerson,
      menu: {
        dishesTotalCreated: Number(menuTotals.dishes_total_created || 0),
        dishesTotalActive: Number(menuTotals.dishes_total_active || 0),
      },
      delivery: {
        today: todayDelivery,
        yesterday: yesterdayDelivery,
        tomorrow: tomorrowDelivery,
        pastWeek: pastWeekDelivery,
        pastMonth: pastMonthDelivery,
      },
      kitchen: {
        nextBlackoutDay: nextBlackout?.blackout_date || null,
        nextBlackoutType: nextBlackout?.type || null,
        nextBlackoutReason: nextBlackout?.reason || null,
        upcomingBlackouts: upcomingBlackouts.map((row) => ({
          blackoutDate: row.blackout_date,
          type: row.type,
          reason: row.reason,
          affectedOrders: Number(row.affected_orders || 0),
        })),
        serviceBlockedDatesWithOrders: serviceBlockedDatesWithOrders.map((row) => ({
          blackoutDate: row.blackout_date,
          type: row.type,
          reason: row.reason,
          affectedOrders: Number(row.affected_orders || 0),
        })),
        yesterday: kitchenYesterday,
        pastWeek: kitchenPastWeek,
      },
      billing: {
        yesterday: billingYesterday,
        pastWeek: billingPastWeek,
        pastMonth: billingPastMonth,
      },
      pendingBillingCount,
      birthdayHighlights: birthdayToday,
    };
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
    await this.schema!.ensureBlackoutDaysSessionColumn();
    const params: string[] = [];
    const conditions: string[] = [];
    if (query.fromDate) {
      params.push(this.validateServiceDate(query.fromDate));
      conditions.push(`b.blackout_date >= $${params.length}::date`);
    }
    if (query.toDate) {
      params.push(this.validateServiceDate(query.toDate));
      conditions.push(`b.blackout_date <= $${params.length}::date`);
    }
    if (query.session) {
      params.push(this.normalizeSession(query.session));
      conditions.push(`(b.session = $${params.length}::session_type OR b.session IS NULL)`);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT b.id,
               b.blackout_date::text AS blackout_date,
               b.type::text AS type,
               b.session::text AS session,
               b.reason,
               b.created_at::text AS created_at,
               u.username AS created_by_username
        FROM blackout_days b
        JOIN users u ON u.id = b.created_by
        ${whereSql}
        ORDER BY b.blackout_date DESC,
                 CASE WHEN b.session IS NULL THEN 1 ELSE 0 END,
                 b.session ASC NULLS LAST,
                 b.created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines(out);
  }

  async createBlackoutDay(actor: AccessUser, input: { blackoutDate?: string; type?: string; reason?: string; session?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureBlackoutDaysSessionColumn();
    const blackoutDate = this.validateServiceDate(input.blackoutDate);
    const type = (input.type || '').toUpperCase();
    const reason = (input.reason || '').trim().slice(0, 500);
    const session = input.session ? this.normalizeSession(input.session) : null;
    if (!['ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH'].includes(type)) {
      throw new BadRequestException('Invalid blackout type');
    }

    // Single atomic UPSERT — picks the correct partial-index ON CONFLICT clause
    // based on whether session is scoped (NOT NULL) or covers all sessions (NULL).
    const upsertSql =
      session !== null
        ? `WITH upserted AS (
             INSERT INTO blackout_days (blackout_date, type, session, reason, created_by)
             VALUES ($1::date, $2::blackout_type, $3::session_type, $4, $5)
             ON CONFLICT (blackout_date, session) WHERE session IS NOT NULL
             DO UPDATE SET type = EXCLUDED.type,
                           reason = EXCLUDED.reason,
                           updated_at = now()
             RETURNING id, blackout_date::text AS blackout_date, type::text AS type, session::text AS session, reason
           )
           SELECT row_to_json(upserted)::text FROM upserted;`
        : `WITH upserted AS (
             INSERT INTO blackout_days (blackout_date, type, session, reason, created_by)
             VALUES ($1::date, $2::blackout_type, NULL, $4, $5)
             ON CONFLICT (blackout_date) WHERE session IS NULL
             DO UPDATE SET type = EXCLUDED.type,
                           reason = EXCLUDED.reason,
                           updated_at = now()
             RETURNING id, blackout_date::text AS blackout_date, type::text AS type, session::text AS session, reason
           )
           SELECT row_to_json(upserted)::text FROM upserted;`;
    const out = await runSql(upsertSql, [blackoutDate, type, session, reason || null, actor.uid]);
    const entry = this.parseJsonLine<{ id: string; blackout_date: string; type: string; session?: SessionType | null }>(out);
    await this.audit!.recordAdminAudit(actor, 'BLACKOUT_DAY_UPSERTED', 'blackout-day', entry.id, {
      blackoutDate: entry.blackout_date,
      type: entry.type,
      session: entry.session || 'ALL',
    });
    return entry;
  }

  async deleteBlackoutDay(actor: AccessUser, id: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `DELETE FROM blackout_days
       WHERE id = $1
       RETURNING id;`,
      [id],
    );
    if (!out) throw new NotFoundException('Blackout day not found');
    await this.audit!.recordAdminAudit(actor, 'BLACKOUT_DAY_DELETED', 'blackout-day', id);
    return { ok: true };
  }

  async getParentChildrenPages(actor: AccessUser) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id, c.user_id, u.first_name, u.last_name, c.school_id, s.name AS school_name,
               c.school_grade AS registration_grade,
               c.current_school_grade,
               c.created_at::text AS registration_date,
               c.date_of_birth::text AS date_of_birth, c.gender::text AS gender,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), 'No Allergies') AS dietary_allergies
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        WHERE c.family_id = $1::uuid
          AND c.is_active = true
          AND c.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name
      ) t;
    `,
      [familyId],
    );

    return {
      parentId,
      familyId,
      children: this.parseJsonLines<ChildRow>(out).map((row) => this.withEffectiveGrade(row)),
    };
  }

  async getYoungsterChildrenPages(actor: AccessUser) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const me = await this.getYoungsterMe(actor);
    return {
      parentId: null,
      children: [me],
    };
  }

  private async mergeFamilyIds(targetFamilyId: string, sourceFamilyId: string) {
    return this.helpers!.mergeFamilyIds(targetFamilyId, sourceFamilyId);
  }

  private async alignFamilyIdsForLink(actor: AccessUser, parentId: string, childId: string) {
    return this.helpers!.alignFamilyIdsForLink(actor, parentId, childId);
  }

  async linkParentChild(actor: AccessUser, parentId: string, childId: string) {
    if (!['PARENT', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    if (actor.role === 'PARENT') {
      const myParentId = await this.getParentIdByUserId(actor.uid);
      if (!myParentId || myParentId !== parentId) {
        throw new ForbiddenException('Cannot link youngster to another parent account');
      }
    }

    const parentExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM parents
         WHERE id = $1
           AND deleted_at IS NULL
       );`,
      [parentId],
    );
    if (parentExists !== 't') throw new NotFoundException('Parent not found');

    const childExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM children
         WHERE id = $1
           AND is_active = true
           AND deleted_at IS NULL
       );`,
      [childId],
    );
    if (childExists !== 't') throw new NotFoundException('Youngster not found');

    await runSql(
      `INSERT INTO parent_children (parent_id, child_id)
       VALUES ($1, $2)
       ON CONFLICT (parent_id, child_id) DO NOTHING;`,
      [parentId, childId],
    );
    await this.alignFamilyIdsForLink(actor, parentId, childId);

    return { ok: true };
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
    if (!['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const serviceDate = query.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(query.serviceDate)
      ? query.serviceDate
      : null;
    const session = query.session ? this.normalizeSession(query.session) : null;
    const search = (query.search || '').trim().toLowerCase();
    const priceMin = query.priceMin ? Number(query.priceMin) : null;
    const priceMax = query.priceMax ? Number(query.priceMax) : null;
    const favouritesOnly = String(query.favouritesOnly || '').toLowerCase() === 'true';
    const allergenExcludeIds = (query.allergenExclude || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    const filters: string[] = [];
    const params: unknown[] = [];
    const dateFilter = serviceDate
      ? `AND m.service_date = $${params.push(serviceDate)}::date`
      : '';
    if (['PARENT', 'YOUNGSTER'].includes(actor.role)) {
      if (session) {
        const active = await this.isSessionActive(session);
        if (!active) {
          return { serviceDate, session, items: [] };
        }
      } else {
        filters.push(`EXISTS (
          SELECT 1
          FROM session_settings ss
          WHERE ss.session = m.session
            AND ss.is_active = true
        )`);
      }
    }
    if (session) {
      params.push(session);
      filters.push(`m.session = $${params.length}::session_type`);
    }
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      filters.push(`(lower(mi.name) LIKE $${params.length - 1} OR lower(mi.description) LIKE $${params.length})`);
    }
    if (priceMin !== null && Number.isFinite(priceMin)) {
      params.push(Number(priceMin.toFixed(2)));
      filters.push(`mi.price >= $${params.length}`);
    }
    if (priceMax !== null && Number.isFinite(priceMax)) {
      params.push(Number(priceMax.toFixed(2)));
      filters.push(`mi.price <= $${params.length}`);
    }
    if (favouritesOnly) {
      params.push(actor.uid);
      filters.push(`EXISTS (
        SELECT 1
        FROM favourite_meal_items fmi
        JOIN favourite_meals fm ON fm.id = fmi.favourite_meal_id
        WHERE fmi.menu_item_id = mi.id
          AND fm.created_by_user_id = $${params.length}
          AND fm.is_active = true
          AND fm.deleted_at IS NULL
      )`);
    }
    if (allergenExcludeIds.length > 0) {
      const ph = allergenExcludeIds.map(() => {
        params.push('');
        return `$${params.length}`;
      });
      for (let i = 0; i < allergenExcludeIds.length; i += 1) params[params.length - allergenExcludeIds.length + i] = allergenExcludeIds[i];
      filters.push(`NOT EXISTS (
        SELECT 1
        FROM menu_item_ingredients mii2
        WHERE mii2.menu_item_id = mi.id
          AND mii2.ingredient_id IN (${ph.join(', ')})
      )`);
    }
    const filterSql = filters.length ? `AND ${filters.join('\n          AND ')}` : '';

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.cutlery_required,
               mi.packing_requirement,
               mi.display_order,
               COALESCE(array_agg(DISTINCT i.name) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredients,
               COALESCE(bool_or(i.allergen_flag), false) AS has_allergen
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE 1=1
          ${dateFilter}
          AND m.is_published = true
          AND m.deleted_at IS NULL
          AND mi.is_available = true
          AND mi.deleted_at IS NULL
          ${filterSql}
        GROUP BY mi.id, m.service_date, m.session
        ORDER BY m.session ASC, lower(mi.name) ASC
      ) t;
    `,
      params,
    );

    return {
      serviceDate,
      session: session || 'ALL',
      items: this.parseJsonLines(out),
    };
  }

  async getPublicActiveMenu(query: { serviceDate?: string; session?: string }) {
    const serviceDate = query.serviceDate ? this.validateServiceDate(query.serviceDate) : 'ALL_ACTIVE';
    const session = query.session ? this.normalizeSession(query.session) : null;
    const cacheKey = this.getPublicMenuCacheKey(serviceDate, session);
    const cached = this.publicMenuCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.data;
    const sessionSettings = await this.getSessionSettings();
    if (session) {
      const active = await this.isSessionActive(session);
      if (!active) {
        const emptyResult = {
          serviceDate,
          session,
          items: [],
          sessionSettings,
        };
        this.publicMenuCache.set(cacheKey, {
          data: emptyResult,
          expiresAt: Date.now() + this.publicMenuCacheTtlMs,
        });
        return emptyResult;
      }
    }
    const params: unknown[] = [];
    const whereSession = session
      ? `AND m.session = $1::session_type`
      : '';
    const activeSessionFilter = session
      ? ''
      : `AND EXISTS (
            SELECT 1
            FROM session_settings ss
            WHERE ss.session = m.session
              AND ss.is_active = true
          )`;
    if (session) params.push(session);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               mi.name,
               mi.description,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_available,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.updated_at::text AS updated_at,
               m.session::text AS session,
               m.service_date::text AS service_date
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        WHERE 1=1
          ${whereSession}
          ${activeSessionFilter}
          AND m.deleted_at IS NULL
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
        ORDER BY m.service_date DESC, m.session ASC, lower(mi.name) ASC
      ) t;
      `,
      params,
    );

    const result: {
      serviceDate: string;
      session: SessionType | 'ALL';
      items: unknown[];
      sessionSettings: Array<{ session: SessionType; is_active: boolean }>;
    } = {
      serviceDate,
      session: (session || 'ALL') as SessionType | 'ALL',
      items: this.parseJsonLines(out),
      sessionSettings,
    };
    this.publicMenuCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.publicMenuCacheTtlMs,
    });
    return result;
  }

  async getAdminIngredients() {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, name, allergen_flag, is_active
        FROM ingredients
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      ) t;
    `);
    return this.parseJsonLines(out);
  }

  async getAdminMenus(query: { session?: string }) {
    const session = query.session ? this.normalizeSession(query.session) : null;
    const params: unknown[] = [];
    const filterSql = session
      ? (() => { params.push(session); return `AND m.session = $${params.length}::session_type`; })()
      : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               mi.menu_id,
               m.service_date::text AS service_date,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_available,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.cutlery_required,
               mi.packing_requirement,
               mi.display_order,
               COALESCE(array_agg(DISTINCT i.id::text) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredient_ids,
               COALESCE(array_agg(DISTINCT i.name) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredients
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE 1 = 1
          ${filterSql}
          AND m.deleted_at IS NULL
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
        GROUP BY mi.id, m.service_date, m.session
        ORDER BY m.service_date DESC, m.session ASC, lower(mi.name) ASC
      ) t;
    `,
      params,
    );
    return {
      session: session || 'ALL',
      items: this.parseJsonLines(out),
    };
  }

  async getAdminMenuRatings(query: { serviceDate?: string; session?: string }) {
    const serviceDate = query.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(query.serviceDate)
      ? query.serviceDate
      : null;
    const session = query.session ? this.normalizeSession(query.session) : null;
    const params: unknown[] = [];
    const dateFilter = serviceDate
      ? `AND m.service_date = $${params.push(serviceDate)}::date`
      : '';
    const sessionFilter = session
      ? `AND m.session = $${params.push(session)}::session_type`
      : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id AS menu_item_id,
               mi.name,
               m.session::text AS session,
               m.service_date::text AS service_date,
               COALESCE(SUM(CASE WHEN mir.stars = 1 THEN 1 ELSE 0 END), 0)::int AS star_1_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 2 THEN 1 ELSE 0 END), 0)::int AS star_2_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 3 THEN 1 ELSE 0 END), 0)::int AS star_3_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 4 THEN 1 ELSE 0 END), 0)::int AS star_4_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 5 THEN 1 ELSE 0 END), 0)::int AS star_5_votes,
               COALESCE(COUNT(mir.user_id), 0)::int AS total_votes
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ratings mir
          ON mir.menu_item_id = mi.id
         AND mir.session = m.session
        WHERE 1=1
          ${dateFilter}
          ${sessionFilter}
          AND m.deleted_at IS NULL
          AND mi.deleted_at IS NULL
        GROUP BY mi.id, mi.name, m.session, m.service_date
        ORDER BY m.service_date DESC, m.session ASC, mi.display_order ASC, mi.name ASC
      ) t;
      `,
      params,
    );
    return {
      serviceDate,
      session,
      items: this.parseJsonLines(out),
    };
  }

  async createOrUpdateMenuRating(actor: AccessUser, input: { menuItemId: string; stars: number }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const menuItemId = (input.menuItemId || '').trim();
    const stars = Number(input.stars);
    if (!menuItemId) throw new BadRequestException('menuItemId is required');
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BadRequestException('stars must be an integer between 1 and 5');
    }

    const activeItem = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT mi.id, m.session::text AS session
         FROM menu_items mi
         JOIN menus m ON m.id = mi.menu_id
         WHERE mi.id = $1
           AND mi.is_available = true
           AND mi.deleted_at IS NULL
           AND m.is_published = true
           AND m.deleted_at IS NULL
         LIMIT 1
       ) t;`,
      [menuItemId],
    );
    if (!activeItem) throw new NotFoundException('Active dish not found');
    const item = this.parseJsonLine<{ id: string; session: SessionType }>(activeItem);

    await runSql(
      `INSERT INTO menu_item_ratings (menu_item_id, user_id, session, user_role, stars)
       VALUES ($1, $2, $3::session_type, $4, $5)
       ON CONFLICT (menu_item_id, user_id, session)
       DO UPDATE SET stars = EXCLUDED.stars,
                     user_role = EXCLUDED.user_role,
                     updated_at = now();`,
      [menuItemId, actor.uid, item.session, actor.role, stars],
    );

    return { ok: true, menuItemId, session: item.session, stars };
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
    const session = this.normalizeSession(input.session);
    const serviceDate = input.serviceDate
      ? this.validateServiceDate(input.serviceDate)
      : await this.resolveCreateMenuServiceDate(session);
    const name = this.normalizeMenuText(input.name);
    const description = this.normalizeMenuText(input.description);
    const nutritionFactsText = this.normalizeMenuText(input.nutritionFactsText);
    const caloriesKcal = input.caloriesKcal === undefined || input.caloriesKcal === null ? null : Number(input.caloriesKcal);
    const price = input.price === undefined || input.price === null || String(input.price).trim() === '' ? 0 : Number(input.price);
    const rawImageUrl = (input.imageUrl || '').trim();
    const ingredientIdsRaw = Array.isArray(input.ingredientIds) ? input.ingredientIds.filter(Boolean) : [];
    const isAvailable = input.isAvailable !== false;
    const displayOrder = Number.isInteger(input.displayOrder) ? Number(input.displayOrder) : 0;
    const cutleryRequired = Boolean(input.cutleryRequired);
    const packingRequirement = this.sanitizePackingRequirement(input.packingRequirement);
    const isVegetarian = Boolean(input.isVegetarian);
    const isGlutenFree = Boolean(input.isGlutenFree);
    const isDairyFree = Boolean(input.isDairyFree);
    const containsPeanut = Boolean(input.containsPeanut);
    const dishCategory = this.normalizeDishCategory(input.dishCategory);

    if (price < 0 || Number.isNaN(price)) {
      throw new BadRequestException('Invalid price');
    }
    if (name !== 'TBA' && description !== 'TBA' && name.localeCompare(description, undefined, { sensitivity: 'accent' }) === 0) {
      throw new BadRequestException('Dish name and description must be different');
    }
    const ingredientIds = ingredientIdsRaw.length > 0 ? ingredientIdsRaw : [await this.ensureTbaIngredientId()];
    if (caloriesKcal !== null && (!Number.isInteger(caloriesKcal) || caloriesKcal < 0)) {
      throw new BadRequestException('Invalid caloriesKcal');
    }
    if (ingredientIds.length > 20) {
      throw new BadRequestException('Maximum 20 ingredients per dish');
    }
    const imageUrl = await this.resolveMenuImageUrl(rawImageUrl, name);

    const menuId = await this.ensureMenuForDateSession(serviceDate, session);
    const itemOut = await runSql(
      `WITH inserted AS (
         INSERT INTO menu_items (
           menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available, display_order, cutlery_required, packing_requirement,
           is_vegetarian, is_gluten_free, is_dairy_free, contains_peanut, dish_category
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12, $13, $14, $15, $16
         )
         RETURNING id, name
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [
        menuId,
        name,
        description,
        nutritionFactsText,
        caloriesKcal,
        Number(price.toFixed(2)),
        imageUrl,
        isAvailable,
        displayOrder,
        cutleryRequired,
        packingRequirement || null,
        isVegetarian,
        isGlutenFree,
        isDairyFree,
        containsPeanut,
        dishCategory,
      ],
    );
    const item = this.parseJsonLine<{ id: string; name: string }>(itemOut);

    for (const ingredientId of ingredientIds) {
      await runSql(
        `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
         VALUES ($1, $2)
         ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
        [item.id, ingredientId],
      );
    }

    this.clearPublicMenuCache();
    await this.audit!.recordAdminAudit(actor, 'MENU_ITEM_CREATED', 'menu-item', item.id, { itemName: item.name });
    return { ok: true, itemId: item.id, itemName: item.name };
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
    const currentOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               m.service_date::text AS service_date,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_available,
               mi.display_order,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.cutlery_required,
               mi.packing_requirement,
               COALESCE(array_agg(DISTINCT i.id::text) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredient_ids
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE mi.id = $1
          AND mi.deleted_at IS NULL
        GROUP BY mi.id, m.service_date, m.session
        LIMIT 1
      ) t;
    `,
      [itemId],
    );
    if (!currentOut) throw new NotFoundException('Menu item not found');
    const current = this.parseJsonLine<{
      id: string;
      service_date: string;
      session: SessionType;
      name: string;
      description: string;
      nutrition_facts_text?: string | null;
      calories_kcal?: number | null;
      price: string | number;
      dish_category: string;
      image_url?: string | null;
      is_available: boolean;
      display_order: number;
      is_vegetarian: boolean;
      is_gluten_free: boolean;
      is_dairy_free: boolean;
      contains_peanut: boolean;
      cutlery_required: boolean;
      packing_requirement?: string | null;
      ingredient_ids: string[];
    }>(currentOut);

    const serviceDate = input.serviceDate ? this.validateServiceDate(input.serviceDate) : current.service_date;
    const session = input.session ? this.normalizeSession(input.session) : current.session;
    const name = input.name !== undefined ? this.normalizeMenuText(input.name) : this.normalizeMenuText(current.name);
    const description = input.description !== undefined ? this.normalizeMenuText(input.description) : this.normalizeMenuText(current.description);
    const nutritionFactsText = input.nutritionFactsText !== undefined
      ? this.normalizeMenuText(input.nutritionFactsText)
      : this.normalizeMenuText(current.nutrition_facts_text);
    const caloriesKcal = input.caloriesKcal === undefined
      ? (current.calories_kcal ?? null)
      : (input.caloriesKcal === null ? null : Number(input.caloriesKcal));
    const price = input.price === undefined
      ? Number(current.price || 0)
      : (input.price === null || String(input.price).trim() === '' ? 0 : Number(input.price));
    const rawImageUrl = input.imageUrl !== undefined
      ? input.imageUrl.trim()
      : String(current.image_url || '').trim();
    const ingredientIdsRaw = Array.isArray(input.ingredientIds)
      ? input.ingredientIds.filter(Boolean)
      : Array.isArray(current.ingredient_ids) ? current.ingredient_ids : [];
    const isAvailable = input.isAvailable === undefined ? Boolean(current.is_available) : Boolean(input.isAvailable);
    const displayOrder = Number.isInteger(input.displayOrder) ? Number(input.displayOrder) : Number(current.display_order || 0);
    const cutleryRequired = input.cutleryRequired === undefined ? Boolean(current.cutlery_required) : Boolean(input.cutleryRequired);
    const isVegetarian = input.isVegetarian === undefined ? Boolean(current.is_vegetarian) : Boolean(input.isVegetarian);
    const isGlutenFree = input.isGlutenFree === undefined ? Boolean(current.is_gluten_free) : Boolean(input.isGlutenFree);
    const isDairyFree = input.isDairyFree === undefined ? Boolean(current.is_dairy_free) : Boolean(input.isDairyFree);
    const containsPeanut = input.containsPeanut === undefined ? Boolean(current.contains_peanut) : Boolean(input.containsPeanut);
    const dishCategory = input.dishCategory === undefined
      ? this.normalizeDishCategory(current.dish_category)
      : this.normalizeDishCategory(input.dishCategory);
    const packingRequirement = this.sanitizePackingRequirement(
      input.packingRequirement === undefined ? (current.packing_requirement || '') : input.packingRequirement,
    );

    if (price < 0 || Number.isNaN(price)) {
      throw new BadRequestException('Invalid price');
    }
    if (name !== 'TBA' && description !== 'TBA' && name.localeCompare(description, undefined, { sensitivity: 'accent' }) === 0) {
      throw new BadRequestException('Dish name and description must be different');
    }
    const ingredientIds = ingredientIdsRaw.length > 0 ? ingredientIdsRaw : [await this.ensureTbaIngredientId()];
    if (caloriesKcal !== null && (!Number.isInteger(caloriesKcal) || caloriesKcal < 0)) {
      throw new BadRequestException('Invalid caloriesKcal');
    }
    if (ingredientIds.length > 20) {
      throw new BadRequestException('Maximum 20 ingredients per dish');
    }
    const imageUrl = input.imageUrl !== undefined
      ? await this.resolveMenuImageUrl(rawImageUrl, name)
      : (rawImageUrl || '/schoolcatering/assets/hero-meal.jpg');

    const menuId = await this.ensureMenuForDateSession(serviceDate, session);
    await runSql(
      `UPDATE menu_items
       SET menu_id = $1,
           name = $2,
           description = $3,
           nutrition_facts_text = $4,
           calories_kcal = $5,
           price = $6,
           image_url = $7,
           is_available = $8,
           display_order = $9,
           cutlery_required = $10,
           packing_requirement = $11,
           is_vegetarian = $12,
           is_gluten_free = $13,
           is_dairy_free = $14,
           contains_peanut = $15,
           dish_category = $16,
           updated_at = now()
       WHERE id = $17
         AND deleted_at IS NULL;`,
      [
        menuId,
        name,
        description,
        nutritionFactsText,
        caloriesKcal,
        Number(price.toFixed(2)),
        imageUrl,
        isAvailable,
        displayOrder,
        cutleryRequired,
        packingRequirement || null,
        isVegetarian,
        isGlutenFree,
        isDairyFree,
        containsPeanut,
        dishCategory,
        itemId,
      ],
    );

    await runSql(`DELETE FROM menu_item_ingredients WHERE menu_item_id = $1;`, [itemId]);
    for (const ingredientId of ingredientIds) {
      await runSql(
        `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
         VALUES ($1, $2)
         ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
        [itemId, ingredientId],
      );
    }
    this.clearPublicMenuCache();
    await this.audit!.recordAdminAudit(actor, 'MENU_ITEM_UPDATED', 'menu-item', itemId, {
      serviceDate,
      session,
      name,
      isAvailable,
    });
    return { ok: true };
  }

  async seedAdminMenuSample(serviceDateRaw?: string) {
    const serviceDate = this.validateServiceDate(serviceDateRaw);
    const sourceBySessionOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT m.session::text AS session,
                MAX(m.service_date)::text AS source_service_date
         FROM menus m
         JOIN menu_items mi
           ON mi.menu_id = m.id
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
         WHERE m.deleted_at IS NULL
         GROUP BY m.session
       ) t;`,
    );
    const sourceBySession = this.parseJsonLines<{ session: SessionType; source_service_date: string }>(sourceBySessionOut);
    const sourceDateMap = new Map<SessionType, string>();
    for (const row of sourceBySession) {
      sourceDateMap.set(row.session, row.source_service_date);
    }

    const createdIds: string[] = [];
    const sourceDatesUsed: Array<{ session: SessionType; sourceServiceDate: string }> = [];

    for (const session of SESSIONS) {
      const sourceServiceDate = sourceDateMap.get(session);
      if (!sourceServiceDate) {
        throw new BadRequestException(`No active dishes found to seed for session: ${session}`);
      }
      sourceDatesUsed.push({ session, sourceServiceDate });

      const sourceItemsOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT mi.name,
                  mi.description,
                  mi.nutrition_facts_text,
                  mi.calories_kcal,
                  mi.price,
                  mi.image_url,
                  mi.is_available,
                  mi.display_order,
                  mi.cutlery_required,
                  mi.packing_requirement,
                  mi.is_vegetarian,
                  mi.is_gluten_free,
                  mi.is_dairy_free,
                  mi.contains_peanut,
                  COALESCE(mi.dish_category, 'MAIN') AS dish_category,
                  COALESCE(
                    array_agg(DISTINCT mii.ingredient_id::text) FILTER (WHERE mii.ingredient_id IS NOT NULL),
                    '{}'
                  ) AS ingredient_ids
           FROM menu_items mi
           JOIN menus m ON m.id = mi.menu_id
           LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
           WHERE m.session = $1::session_type
             AND m.service_date = $2::date
             AND m.deleted_at IS NULL
             AND mi.deleted_at IS NULL
             AND mi.is_available = true
           GROUP BY mi.id
           ORDER BY mi.display_order ASC, mi.name ASC
         ) t;`,
        [session, sourceServiceDate],
      );
      const sourceItems = this.parseJsonLines<{
        name: string;
        description?: string | null;
        nutrition_facts_text?: string | null;
        calories_kcal?: number | null;
        price: string | number;
        image_url?: string | null;
        is_available: boolean;
        display_order: number;
        cutlery_required: boolean;
        packing_requirement?: string | null;
        is_vegetarian?: boolean;
        is_gluten_free?: boolean;
        is_dairy_free?: boolean;
        contains_peanut?: boolean;
        dish_category?: string | null;
        ingredient_ids: string[];
      }>(sourceItemsOut);
      if (sourceItems.length === 0) {
        continue;
      }

      const targetMenuId = await this.ensureMenuForDateSession(serviceDate, session);
      for (const sourceItem of sourceItems) {
        const existing = await runSql(
          `SELECT id
           FROM menu_items
           WHERE menu_id = $1
             AND lower(name) = lower($2)
             AND deleted_at IS NULL
           LIMIT 1;`,
          [targetMenuId, sourceItem.name],
        );

        const normalizedDishCategory = this.normalizeDishCategory(sourceItem.dish_category || 'MAIN');
        let itemId = existing;
        if (itemId) {
          await runSql(
            `UPDATE menu_items
             SET description = $1,
                 nutrition_facts_text = $2,
                 calories_kcal = $3,
                 price = $4,
                 image_url = $5,
                 is_available = $6,
                 display_order = $7,
                 cutlery_required = $8,
                 packing_requirement = $9,
                 is_vegetarian = $10,
                 is_gluten_free = $11,
                 is_dairy_free = $12,
                 contains_peanut = $13,
                 dish_category = $14,
                 updated_at = now()
             WHERE id = $15;`,
            [
              sourceItem.description || '',
              String(sourceItem.nutrition_facts_text || '').trim() || 'TBA',
              sourceItem.calories_kcal ?? null,
              Number(Number(sourceItem.price || 0).toFixed(2)),
              sourceItem.image_url || '/schoolcatering/assets/hero-meal.jpg',
              Boolean(sourceItem.is_available),
              Number(sourceItem.display_order || 0),
              Boolean(sourceItem.cutlery_required),
              sourceItem.packing_requirement || null,
              Boolean(sourceItem.is_vegetarian),
              Boolean(sourceItem.is_gluten_free),
              Boolean(sourceItem.is_dairy_free),
              Boolean(sourceItem.contains_peanut),
              normalizedDishCategory,
              itemId,
            ],
          );
        } else {
          itemId = await runSql(
            `INSERT INTO menu_items (
               menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available, display_order, cutlery_required, packing_requirement,
               is_vegetarian, is_gluten_free, is_dairy_free, contains_peanut, dish_category
             )
             VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14, $15, $16
             )
             RETURNING id;`,
            [
              targetMenuId,
              sourceItem.name,
              sourceItem.description || '',
              String(sourceItem.nutrition_facts_text || '').trim() || 'TBA',
              sourceItem.calories_kcal ?? null,
              Number(Number(sourceItem.price || 0).toFixed(2)),
              sourceItem.image_url || '/schoolcatering/assets/hero-meal.jpg',
              Boolean(sourceItem.is_available),
              Number(sourceItem.display_order || 0),
              Boolean(sourceItem.cutlery_required),
              sourceItem.packing_requirement || null,
              Boolean(sourceItem.is_vegetarian),
              Boolean(sourceItem.is_gluten_free),
              Boolean(sourceItem.is_dairy_free),
              Boolean(sourceItem.contains_peanut),
              normalizedDishCategory,
            ],
          );
        }

        createdIds.push(itemId);
        await runSql(`DELETE FROM menu_item_ingredients WHERE menu_item_id = $1;`, [itemId]);
        for (const ingredientId of (sourceItem.ingredient_ids || [])) {
          await runSql(
            `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
             VALUES ($1, $2)
             ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
            [itemId, ingredientId],
          );
        }
      }

      await runSql(
        `UPDATE menus
         SET is_published = true, updated_at = now()
         WHERE id = $1;`,
        [targetMenuId],
      );
    }
    this.clearPublicMenuCache();
    return { ok: true, serviceDate, sourceDatesUsed, createdItemIds: createdIds };
  }

  private pickSeedDeliveryUser(
    schoolId: string,
    bySchool: Map<string, string[]>,
    fallback: string[],
    cursor: number,
  ) {
    const schoolUsers = bySchool.get(schoolId) || [];
    const pool = schoolUsers.length > 0 ? schoolUsers : fallback;
    if (pool.length === 0) return null;
    return pool[cursor % pool.length];
  }

  private async applySeedOrderLifecycle(
    orderId: string,
    schoolId: string,
    bySchool: Map<string, string[]>,
    allDeliveryUserIds: string[],
    seedNumber: number,
  ) {
    const mode = seedNumber % 4;
    const deliveryUserId = this.pickSeedDeliveryUser(schoolId, bySchool, allDeliveryUserIds, seedNumber);
    if (!deliveryUserId || mode === 0) {
      return 'PLACED_PENDING';
    }

    await runSql(
      `INSERT INTO delivery_assignments (order_id, delivery_user_id, assigned_at)
       VALUES ($1, $2, now())
       ON CONFLICT (order_id)
       DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id, assigned_at = now(), updated_at = now();`,
      [orderId, deliveryUserId],
    );

    if (mode === 1) {
      await runSql(
        `UPDATE orders
         SET status = 'LOCKED',
             delivery_status = 'ASSIGNED',
             updated_at = now()
         WHERE id = $1;`,
        [orderId],
      );
      await runSql(
        `UPDATE billing_records
         SET status = 'UNPAID',
             delivery_status = 'ASSIGNED',
             updated_at = now()
         WHERE order_id = $1;`,
        [orderId],
      );
      return 'LOCKED_ASSIGNED_UNPAID';
    }

    if (mode === 2) {
      await runSql(
        `UPDATE orders
         SET status = 'LOCKED',
             delivery_status = 'OUT_FOR_DELIVERY',
             updated_at = now()
         WHERE id = $1;`,
        [orderId],
      );
      await runSql(
        `UPDATE billing_records
         SET status = 'PENDING_VERIFICATION',
             delivery_status = 'OUT_FOR_DELIVERY',
             proof_image_url = COALESCE(NULLIF(TRIM(proof_image_url), ''), 'https://example.com/payment-proof-seed.webp'),
             proof_uploaded_at = COALESCE(proof_uploaded_at, now()),
             updated_at = now()
         WHERE order_id = $1;`,
        [orderId],
      );
      return 'LOCKED_OUT_FOR_DELIVERY_PENDING_VERIFICATION';
    }

    await runSql(
      `UPDATE delivery_assignments
       SET confirmed_at = now(),
           confirmation_note = 'Seed delivered order',
           updated_at = now()
       WHERE order_id = $1;`,
      [orderId],
    );
    await runSql(
      `UPDATE orders
       SET status = 'LOCKED',
           delivery_status = 'DELIVERED',
           delivered_at = now(),
           delivered_by_user_id = $2,
           updated_at = now()
       WHERE id = $1;`,
      [orderId, deliveryUserId],
    );
    await runSql(
      `UPDATE billing_records
       SET status = 'VERIFIED',
           delivery_status = 'DELIVERED',
           proof_image_url = COALESCE(NULLIF(TRIM(proof_image_url), ''), 'https://example.com/payment-proof-seed.webp'),
           proof_uploaded_at = COALESCE(proof_uploaded_at, now()),
           delivered_at = now(),
           verified_by = NULL,
           verified_at = now(),
           updated_at = now()
       WHERE order_id = $1;`,
      [orderId],
    );
    return 'LOCKED_DELIVERED_VERIFIED';
  }

  async seedAdminOrdersSample(
    actor: AccessUser,
    input: { fromDate?: string; toDate?: string; ordersPerDay?: number },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');

    const fromDate = input.fromDate ? this.validateServiceDate(input.fromDate) : '2026-03-02';
    const toDate = input.toDate ? this.validateServiceDate(input.toDate) : '2026-03-20';
    const ordersPerDayRaw = Number(input.ordersPerDay ?? 20);
    const ordersPerDay = Number.isInteger(ordersPerDayRaw) && ordersPerDayRaw > 0
      ? Math.min(ordersPerDayRaw, 100)
      : 20;
    if (fromDate > toDate) throw new BadRequestException('fromDate must be <= toDate');

    const childrenOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT DISTINCT c.id, c.school_id
        FROM children c
        JOIN users uc ON uc.id = c.user_id
        JOIN parent_children pc ON pc.child_id = c.id
        JOIN parents p ON p.id = pc.parent_id
        JOIN users up ON up.id = p.user_id
        WHERE c.is_active = true
          AND c.deleted_at IS NULL
          AND uc.is_active = true
          AND uc.deleted_at IS NULL
          AND up.is_active = true
          AND up.deleted_at IS NULL
      ) t;
      `,
    );
    const children = this.parseJsonLines<{ id: string; school_id: string }>(childrenOut);
    if (children.length === 0) {
      throw new BadRequestException('No active youngster with linked parent found for seeding');
    }

    const deliveryUsersOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id
        FROM users
        WHERE role = 'DELIVERY'
          AND is_active = true
          AND deleted_at IS NULL
        ORDER BY created_at ASC
      ) t;
      `,
    );
    const deliveryUserIds = this.parseJsonLines<{ id: string }>(deliveryUsersOut).map((row) => row.id);

    const schoolAssignOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT school_id, delivery_user_id
        FROM delivery_school_assignments
        WHERE is_active = true
      ) t;
      `,
    );
    const schoolAssignments = this.parseJsonLines<{ school_id: string; delivery_user_id: string }>(schoolAssignOut);
    const deliveryBySchool = new Map<string, string[]>();
    for (const row of schoolAssignments) {
      const list = deliveryBySchool.get(row.school_id) || [];
      if (!list.includes(row.delivery_user_id)) list.push(row.delivery_user_id);
      deliveryBySchool.set(row.school_id, list);
    }

    const daySummaries: Array<{
      serviceDate: string;
      target: number;
      created: number;
      skipped: number;
      sessionsWithMenus: string[];
      lifecycleBreakdown: Record<string, number>;
    }> = [];

    let totalCreated = 0;
    let totalSkipped = 0;
    let seedCursor = 0;
    let current = fromDate;

    while (current <= toDate) {
      const menuOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT m.session::text AS session, mi.id
          FROM menus m
          JOIN menu_items mi ON mi.menu_id = m.id
          WHERE m.service_date = $1::date
            AND m.is_published = true
            AND m.deleted_at IS NULL
            AND mi.is_available = true
            AND mi.deleted_at IS NULL
          ORDER BY m.session ASC, mi.display_order ASC, mi.created_at ASC
        ) t;
        `,
        [current],
      );
      const menuRows = this.parseJsonLines<{ session: SessionType; id: string }>(menuOut);
      const menuBySession = new Map<SessionType, string[]>();
      for (const row of menuRows) {
        const list = menuBySession.get(row.session) || [];
        list.push(row.id);
        menuBySession.set(row.session, list);
      }
      const sessionsWithMenus = (['BREAKFAST', 'SNACK', 'LUNCH'] as SessionType[]).filter(
        (session) => (menuBySession.get(session) || []).length > 0,
      );

      if (sessionsWithMenus.length === 0) {
        daySummaries.push({
          serviceDate: current,
          target: ordersPerDay,
          created: 0,
          skipped: ordersPerDay,
          sessionsWithMenus: [],
          lifecycleBreakdown: {},
        });
        totalSkipped += ordersPerDay;
        current = this.addDaysIsoDate(current, 1);
        continue;
      }

      const existingOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT child_id, session::text AS session
          FROM orders
          WHERE service_date = $1::date
            AND status <> 'CANCELLED'
            AND deleted_at IS NULL
        ) t;
        `,
        [current],
      );
      const existingSet = new Set(
        this.parseJsonLines<{ child_id: string; session: SessionType }>(existingOut)
          .map((x) => `${x.child_id}|${x.session}`),
      );

      const dayMaxCapacity = Math.max((children.length * sessionsWithMenus.length) - existingSet.size, 0);
      const dayTarget = Math.min(ordersPerDay, dayMaxCapacity);
      const lifecycleBreakdown: Record<string, number> = {};

      let dayCreated = 0;
      let daySkipped = 0;
      let attempt = 0;
      const maxAttempts = Math.max(dayTarget * 20, 200);

      while (dayCreated < dayTarget && attempt < maxAttempts) {
        const child = children[(seedCursor + attempt) % children.length];
        const session = sessionsWithMenus[(dayCreated + attempt) % sessionsWithMenus.length];
        const key = `${child.id}|${session}`;
        attempt += 1;
        if (existingSet.has(key)) continue;

        const sessionItems = menuBySession.get(session) || [];
        if (sessionItems.length === 0) continue;

        const itemCount = Math.min(sessionItems.length, 1 + ((seedCursor + attempt) % 3));
        const startIdx = (seedCursor + attempt) % sessionItems.length;
        const items: CartItemInput[] = [];
        const usedIds = new Set<string>();
        for (let i = 0; i < sessionItems.length && items.length < itemCount; i += 1) {
          const id = sessionItems[(startIdx + i) % sessionItems.length];
          if (usedIds.has(id)) continue;
          usedIds.add(id);
          items.push({
            menuItemId: id,
            quantity: 1 + ((seedCursor + i) % 2),
          });
        }

        try {
          const cart = await this.createCart(actor, { childId: child.id, serviceDate: current, session });
          await this.replaceCartItems(actor, cart.id, items);
          const order = await this.submitCart(actor, cart.id) as { id: string };
          const lifecycle = await this.applySeedOrderLifecycle(
            order.id,
            child.school_id,
            deliveryBySchool,
            deliveryUserIds,
            seedCursor + dayCreated,
          );
          lifecycleBreakdown[lifecycle] = Number(lifecycleBreakdown[lifecycle] || 0) + 1;
          existingSet.add(key);
          dayCreated += 1;
          totalCreated += 1;
          seedCursor += 1;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('ORDER_ALREADY_EXISTS_FOR_DATE')) {
            existingSet.add(key);
          }
          daySkipped += 1;
          totalSkipped += 1;
        }
      }

      daySummaries.push({
        serviceDate: current,
        target: dayTarget,
        created: dayCreated,
        skipped: daySkipped,
        sessionsWithMenus,
        lifecycleBreakdown,
      });
      current = this.addDaysIsoDate(current, 1);
    }

    return {
      ok: true,
      fromDate,
      toDate,
      ordersPerDay,
      totalCreated,
      totalSkipped,
      days: daySummaries,
    };
  }

  async getYoungsterMe(actor: AccessUser) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureSchoolShortNameColumn();
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id, c.user_id, u.first_name, u.last_name, c.school_id, s.name AS school_name, s.short_name AS school_short_name,
               c.school_grade AS registration_grade,
               c.current_school_grade,
               c.created_at::text AS registration_date,
               c.date_of_birth::text AS date_of_birth, c.gender::text AS gender,
               COALESCE((
                 SELECT cdr.restriction_details
                 FROM child_dietary_restrictions cdr
                 WHERE cdr.child_id = c.id
                   AND cdr.is_active = true
                   AND cdr.deleted_at IS NULL
                   AND upper(cdr.restriction_label) = 'ALLERGIES'
                 ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
                 LIMIT 1
               ), 'No Allergies') AS dietary_allergies
        FROM children c
        JOIN users u ON u.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        WHERE c.user_id = $1
          AND c.is_active = true
          AND c.deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [actor.uid],
    );
    if (!out) throw new NotFoundException('Youngster profile not found');
    return this.withEffectiveGrade(this.parseJsonLine<ChildRow>(out));
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
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureBillingReviewColumns();
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    const session = sessionFilter ? this.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [familyId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE c.family_id = $1::uuid
        ${sessionClause}
        ORDER BY br.created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async getYoungsterConsolidatedBillingLegacy(actor: AccessUser, sessionFilter?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureBillingReviewColumns();
    const childId = await this.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const session = sessionFilter ? this.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [childId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE o.child_id = $1
        ${sessionClause}
        ORDER BY br.created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async uploadBillingProof(actor: AccessUser, billingId: string, proofImageData?: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const proof = (proofImageData || '').trim();
    let ownerFolderId = actor.uid;
    let exists = '';
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      ownerFolderId = parentId;
      exists = await runSql(
        `SELECT EXISTS (
           SELECT 1 FROM billing_records
           WHERE id = $1
             AND parent_id = $2
         );`,
        [billingId, parentId],
      );
    } else {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      ownerFolderId = childId;
      exists = await runSql(
        `SELECT EXISTS (
           SELECT 1
           FROM billing_records br
           JOIN orders o ON o.id = br.order_id
           WHERE br.id = $1
             AND o.child_id = $2
         );`,
        [billingId, childId],
      );
    }
    if (exists !== 't') throw new NotFoundException('Billing record not found');
    let proofUrl = proof;
    if (proof.startsWith('data:')) {
      const parsed = this.parseDataUrl(proof);
      this.assertSafeImagePayload({
        contentType: parsed.contentType,
        data: parsed.data,
        maxBytes: 5 * 1024 * 1024,
        label: 'Proof image',
      });
      const ext = this.getFileExtFromContentType(parsed.contentType);
      const objectName = `${this.getGcsCategoryFolder('payment-proofs')}/${ownerFolderId}/${billingId}-${Date.now()}.${ext}`;
      try {
        const uploaded = await this.uploadToGcs({
          objectName,
          contentType: parsed.contentType,
          data: parsed.data,
          cacheControl: 'private, max-age=0, no-cache',
        });
        proofUrl = uploaded.publicUrl;
      } catch (err) {
        // Keep parent proof upload working even if GCS credentials/bucket config is unavailable.
        proofUrl = proof;
      }
    } else if (!this.isAllowedProofImageUrl(proof)) {
      throw new BadRequestException('proofImageData must be a PNG/JPEG/WEBP image data URL or trusted image URL');
    }

    await runSql(
      `UPDATE billing_records
       SET proof_image_url = $1,
           proof_uploaded_at = now(),
           status = 'PENDING_VERIFICATION',
           admin_note = NULL,
           updated_at = now()
       WHERE id = $2;`,
      [proofUrl, billingId],
    );
    return { ok: true };
  }

  async uploadBillingProofBatch(actor: AccessUser, billingIdsRaw: string[], proofImageData?: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const billingIds = (billingIdsRaw || []).map((x) => String(x || '').trim()).filter(Boolean);
    if (billingIds.length === 0) throw new BadRequestException('billingIds is required');
    if (billingIds.length > 50) throw new BadRequestException('Maximum 50 billing records per batch');

    const ph = billingIds.map((_, i) => `$${i + 1}`).join(', ');
    let allowedOut = '';
    let ownerParams: unknown[] = [];
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      ownerParams = [parentId];
      allowedOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT id
           FROM billing_records
           WHERE id IN (${ph})
             AND parent_id = $${billingIds.length + 1}
         ) t;`,
        [...billingIds, parentId],
      );
    } else {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      ownerParams = [childId];
      allowedOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT br.id
           FROM billing_records br
           JOIN orders o ON o.id = br.order_id
           WHERE br.id IN (${ph})
             AND o.child_id = $${billingIds.length + 1}
         ) t;`,
        [...billingIds, childId],
      );
    }
    const allowedIds = new Set(this.parseJsonLines<{ id: string }>(allowedOut).map((x) => x.id));
    if (allowedIds.size !== billingIds.length) {
      throw new NotFoundException('One or more billing records not found');
    }

    const firstId = billingIds[0];
    await this.uploadBillingProof(actor, firstId, proofImageData);
    const firstOut = await runSql(
      `SELECT proof_image_url
       FROM billing_records
       WHERE id = $1
       LIMIT 1;`,
      [firstId],
    );
    const proofUrl = (firstOut || '').trim();
    if (!proofUrl) throw new BadRequestException('Failed uploading proof image');
    if (billingIds.length === 1) return { ok: true, updatedCount: 1 };

    const restIds = billingIds.slice(1);
    const restPh = restIds.map((_, i) => `$${i + 2}`).join(', ');
    if (actor.role === 'PARENT') {
      await runSql(
        `UPDATE billing_records
         SET proof_image_url = $1,
             proof_uploaded_at = now(),
             status = 'PENDING_VERIFICATION',
             admin_note = NULL,
             updated_at = now()
         WHERE id IN (${restPh})
           AND parent_id = $${restIds.length + 2};`,
        [proofUrl, ...restIds, ...ownerParams],
      );
    } else {
      await runSql(
        `UPDATE billing_records br
         SET proof_image_url = $1,
             proof_uploaded_at = now(),
             status = 'PENDING_VERIFICATION',
             admin_note = NULL,
             updated_at = now()
         FROM orders o
         WHERE br.order_id = o.id
           AND br.id IN (${restPh})
           AND o.child_id = $${restIds.length + 2};`,
        [proofUrl, ...restIds, ...ownerParams],
      );
    }
    return { ok: true, updatedCount: billingIds.length };
  }

  async getBillingProofImage(actor: AccessUser, billingId: string) {
    const targetBillingId = String(billingId || '').trim();
    this.assertValidUuid(targetBillingId, 'billingId');

    let sql = `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') AS proof_image_url
        FROM billing_records br
        WHERE br.id = $1
    `;
    const params: unknown[] = [targetBillingId];

    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      params.push(parentId);
      sql += ` AND br.parent_id = $2`;
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      params.push(childId);
      sql += ` AND EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.id = br.order_id
          AND o.child_id = $2
      )`;
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    sql += `
        LIMIT 1
      ) t;
    `;

    const out = await runSql(sql, params);
    if (!out) throw new NotFoundException('Billing record not found');
    const row = this.parseJsonLine<{ id: string; proof_image_url: string }>(out);
    const proofImageUrl = String(row.proof_image_url || '').trim();
    if (!proofImageUrl) throw new BadRequestException('No uploaded proof image for this bill');

    if (proofImageUrl.startsWith('data:')) {
      const parsed = this.parseDataUrl(proofImageUrl);
      this.assertSafeImagePayload({
        contentType: parsed.contentType,
        data: parsed.data,
        maxBytes: 10 * 1024 * 1024,
        label: 'Proof image',
      });
      return { contentType: parsed.contentType, data: parsed.data };
    }

    return this.fetchProofImageBinary(proofImageUrl);
  }

  async getAdminBillingLegacy(status?: string, sessionRaw?: string) {
    await this.schema!.ensureBillingReviewColumns();
    const statusFilter = (status || '').toUpperCase();
    const session = sessionRaw && sessionRaw !== 'ALL' ? this.normalizeSession(sessionRaw) : null;
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (['UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(statusFilter)) {
      params.push(statusFilter);
      clauses.push(`AND br.status = $${params.length}::payment_status`);
    }
    if (session) {
      params.push(session);
      clauses.push(`AND o.session = $${params.length}::session_type`);
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.created_at::text AS created_at,
               br.verified_at::text AS verified_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               p.id AS parent_id,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               s.name AS school_name,
               dr.receipt_number,
               dr.pdf_url
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE 1=1
          ${clauses.join('\n          ')}
        ORDER BY br.created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async verifyBilling(actor: AccessUser, billingId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureBillingReviewColumns();
    const billingOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id,
               COALESCE(NULLIF(TRIM(proof_image_url), ''), '') AS proof_image_url
        FROM billing_records
        WHERE id = $1
        LIMIT 1
      ) t;
      `,
      [billingId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    const billing = this.parseJsonLine<{ id: string; proof_image_url: string }>(billingOut);
    if (decision === 'VERIFIED' && !String(billing.proof_image_url || '').trim()) {
      throw new BadRequestException('BILLING_PROOF_IMAGE_REQUIRED');
    }
    const adminNote = decision === 'REJECTED'
      ? (note || '').trim().slice(0, 500)
      : '';
    if (decision === 'REJECTED' && !adminNote) {
      throw new BadRequestException('REJECTION_NOTE_REQUIRED');
    }
    const isReject = decision === 'REJECTED';
    const nextStatus = isReject ? 'UNPAID' : 'VERIFIED';
    const updatedOut = await runSql(
      `WITH updated AS (
         UPDATE billing_records
         SET status = $1::payment_status,
             verified_by = CASE WHEN $2::boolean THEN NULL ELSE $3 END,
             admin_note = $4,
             verified_at = CASE WHEN $2::boolean THEN NULL ELSE now() END,
             proof_image_url = CASE WHEN $2::boolean THEN NULL ELSE proof_image_url END,
             proof_uploaded_at = CASE WHEN $2::boolean THEN NULL ELSE proof_uploaded_at END,
             updated_at = now()
         WHERE id = $5
         RETURNING id
       )
       SELECT id FROM updated;`,
      [
        nextStatus,
        isReject,
        actor.uid,
        adminNote || null,
        billingId,
      ],
    );
    if (!updatedOut) throw new NotFoundException('Billing record not found');
    if (isReject) {
      await runSql('DELETE FROM digital_receipts WHERE billing_record_id = $1;', [billingId]);
    }
    await this.audit!.recordAdminAudit(actor, 'BILLING_VERIFIED', 'billing-record', billingId, {
      decision: isReject ? 'REJECTED_TO_UNPAID' : decision,
      note: adminNote || null,
    });
    return { ok: true, status: nextStatus };
  }

  async deleteBilling(actor: AccessUser, billingId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(billingId, 'billingId');
    const billingOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id
        FROM billing_records
        WHERE id = $1
        LIMIT 1
      ) t;
      `,
      [billingId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    await runSql('DELETE FROM digital_receipts WHERE billing_record_id = $1;', [billingId]);
    await runSql('DELETE FROM billing_records WHERE id = $1;', [billingId]);
    await this.audit!.recordAdminAudit(actor, 'BILLING_DELETED', 'billing-record', billingId);
    return { ok: true };
  }

  async generateReceipt(actor: AccessUser, billingId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const billingOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.status::text AS status,
               br.parent_id,
               br.order_id,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               (uc.first_name || ' ' || uc.last_name) AS child_name
        FROM billing_records
        br
        JOIN orders o ON o.id = br.order_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        WHERE br.id = $1
        LIMIT 1
      ) t;
    `,
      [billingId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    const billing = this.parseJsonLine<{
      id: string;
      status: string;
      parent_id: string;
      order_id: string;
      service_date: string;
      session: string;
      total_price: string | number;
      parent_name: string;
      child_name: string;
    }>(billingOut);
    if (billing.status !== 'VERIFIED') throw new BadRequestException('RECEIPT_PAYMENT_NOT_VERIFIED');

    const seq = Number(await runSql(`SELECT nextval('receipt_number_seq');`) || 0);
    const nowYear = new Date().getUTCFullYear();
    const receiptNumber = `BLC-${nowYear}-${String(seq).padStart(5, '0')}`;
    const itemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.item_name_snapshot, oi.quantity, oi.price_snapshot
        FROM order_items oi
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      ) t;
    `,
      [billing.order_id],
    );
    const items = this.parseJsonLines<{
      item_name_snapshot: string;
      quantity: number | string;
      price_snapshot: number | string;
    }>(itemsOut);
    const total = Number(billing.total_price || 0);
    const lineItems = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.price_snapshot || 0);
      return `${it.item_name_snapshot} x${qty} @ Rp ${price.toLocaleString('id-ID')} = Rp ${(qty * price).toLocaleString('id-ID')}`;
    });
    const pdf = this.buildSimplePdf([
      'Blossom School Catering - Payment Receipt',
      `Receipt Number: ${receiptNumber}`,
      `Generated At (UTC): ${new Date().toISOString()}`,
      `Billing ID: ${billing.id}`,
      `Order ID: ${billing.order_id}`,
      `Parent: ${billing.parent_name}`,
      `Youngster: ${billing.child_name}`,
      `Service Date: ${billing.service_date} (${billing.session})`,
      ...lineItems,
      `Total: Rp ${total.toLocaleString('id-ID')}`,
      `Verified By: ${actor.uid}`,
    ]);
    const receiptObjectName = `${this.getGcsCategoryFolder('receipts')}/${receiptNumber}.pdf`;
    const uploadedReceipt = await this.uploadToGcs({
      objectName: receiptObjectName,
      contentType: 'application/pdf',
      data: pdf,
      cacheControl: 'private, max-age=0, no-cache',
    });
    const pdfUrl = uploadedReceipt.publicUrl;

    await runSql(
      `INSERT INTO digital_receipts (billing_record_id, receipt_number, pdf_url, generated_at, generated_by_user_id)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (billing_record_id)
       DO UPDATE SET receipt_number = EXCLUDED.receipt_number, pdf_url = EXCLUDED.pdf_url, generated_at = now(), generated_by_user_id = EXCLUDED.generated_by_user_id;`,
      [billing.id, receiptNumber, pdfUrl, actor.uid],
    );
    await this.audit!.recordAdminAudit(actor, 'BILLING_RECEIPT_GENERATED', 'billing-record', billingId, {
      receiptNumber,
    });
    return { ok: true, receiptNumber, pdfUrl };
  }

  async getBillingReceipt(actor: AccessUser, billingId: string) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id, br.parent_id, o.child_id, dr.receipt_number, dr.pdf_url, dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE br.id = $1
        LIMIT 1
      ) t;
    `,
      [billingId],
    );
    if (!out) throw new NotFoundException('Billing record not found');
    const row = this.parseJsonLine<{ id: string; parent_id: string; child_id: string; receipt_number?: string; pdf_url?: string }>(out);
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId || parentId !== row.parent_id) throw new ForbiddenException('Role not allowed');
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId || childId !== row.child_id) throw new ForbiddenException('Role not allowed');
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }
    return row;
  }

  async getBillingReceiptFile(actor: AccessUser, billingId: string) {
    const row = await this.getBillingReceipt(actor, billingId);
    const pdfUrl = String(row.pdf_url || '').trim();
    if (!pdfUrl) throw new NotFoundException('Receipt PDF not found');
    const file = await this.fetchReceiptPdfBinary(pdfUrl);
    return {
      ...file,
      fileName: `${String(row.receipt_number || '').trim() || 'receipt'}.pdf`,
    };
  }

  async revertBillingProof(actor: AccessUser, billingId: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    let out = '';
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      out = await runSql(
        `SELECT row_to_json(t)::text FROM (
           SELECT id, status::text AS status
           FROM billing_records
           WHERE id = $1 AND parent_id = $2
           LIMIT 1
         ) t;`,
        [billingId, parentId],
      );
    } else {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      out = await runSql(
        `SELECT row_to_json(t)::text FROM (
           SELECT br.id, br.status::text AS status
           FROM billing_records br
           JOIN orders o ON o.id = br.order_id
           WHERE br.id = $1
             AND o.child_id = $2
           LIMIT 1
         ) t;`,
        [billingId, childId],
      );
    }
    const parsed = this.parseJsonLine<{ id: string; status: string }>(out);
    if (!parsed) throw new NotFoundException('Billing record not found');
    if (parsed.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Only PENDING_VERIFICATION bills can be reverted');
    }
    await runSql(
      `UPDATE billing_records
       SET proof_image_url = NULL,
           proof_uploaded_at = NULL,
           status = 'UNPAID',
           admin_note = NULL,
           updated_at = now()
       WHERE id = $1;`,
      [billingId],
    );
    return { ok: true };
  }

  async getDeliveryUsers(includeInactive = false) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id,
               username,
               first_name,
               last_name,
               phone_number,
               email,
               is_active
        FROM users
        WHERE role = 'DELIVERY'
          AND deleted_at IS NULL
          ${includeInactive ? '' : 'AND is_active = true'}
        ORDER BY first_name, last_name
      ) t;
    `,
    );
    return this.parseJsonLines(out);
  }

  async getDeliverySchoolAssignments() {
    await this.schema!.ensureDeliverySchoolAssignmentsTable();
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT dsa.delivery_user_id,
               dsa.school_id,
               dsa.session::text AS session,
               dsa.is_active,
               (u.first_name || ' ' || u.last_name) AS delivery_name,
               u.username AS delivery_username,
               s.name AS school_name
        FROM delivery_school_assignments dsa
        JOIN users u ON u.id = dsa.delivery_user_id
        JOIN schools s ON s.id = dsa.school_id
        WHERE u.role = 'DELIVERY'
          AND u.deleted_at IS NULL
          AND s.deleted_at IS NULL
        ORDER BY s.name ASC, dsa.session ASC, delivery_name ASC
      ) t;
    `);
    return this.parseJsonLines(out);
  }

  async upsertDeliverySchoolAssignment(actor: AccessUser, input: { deliveryUserId?: string; schoolId?: string; session?: string; isActive?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureDeliverySchoolAssignmentsTable();
    const deliveryUserId = (input.deliveryUserId || '').trim();
    const schoolId = (input.schoolId || '').trim();
    const session = this.normalizeSession(input.session);
    const isActive = input.isActive !== false;

    const deliveryExists = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM users
         WHERE id = $1
           AND role = 'DELIVERY'
           AND is_active = true
       );`,
      [deliveryUserId],
    );
    if (deliveryExists !== 't') throw new BadRequestException('Delivery user not found or inactive');

    const schoolExists = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM schools
         WHERE id = $1
           AND deleted_at IS NULL
       );`,
      [schoolId],
    );
    if (schoolExists !== 't') throw new BadRequestException('School not found');

    await runSql(
      `INSERT INTO delivery_school_assignments (delivery_user_id, school_id, session, is_active, updated_at)
       VALUES ($1, $2, $3::session_type, $4, now())
       ON CONFLICT (school_id, session)
       DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id,
                     is_active = EXCLUDED.is_active,
                     updated_at = now();`,
      [deliveryUserId, schoolId, session, isActive],
    );
    await this.audit!.recordAdminAudit(actor, 'DELIVERY_SCHOOL_ASSIGNMENT_UPSERTED', 'delivery-school-assignment', `${schoolId}:${session}`, {
      deliveryUserId,
      schoolId,
      session,
      isActive,
    });
    await this.autoAssignDeliveriesForDate(this.makassarTodayIsoDate());
    return { ok: true };
  }

  async deleteDeliverySchoolAssignment(actor: AccessUser, deliveryUserId: string, schoolId: string, sessionRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(deliveryUserId, 'deliveryUserId');
    this.assertValidUuid(schoolId, 'schoolId');
    await this.schema!.ensureDeliverySchoolAssignmentsTable();
    const session = this.normalizeSession(sessionRaw);

    const out = await runSql(
      `DELETE FROM delivery_school_assignments
       WHERE delivery_user_id = $1
         AND school_id = $2
         AND session = $3::session_type
       RETURNING delivery_user_id;`,
      [deliveryUserId, schoolId, session],
    );
    if (!out) throw new NotFoundException('Delivery-school assignment not found');
    await this.audit!.recordAdminAudit(actor, 'DELIVERY_SCHOOL_ASSIGNMENT_DELETED', 'delivery-school-assignment', `${schoolId}:${session}`, {
      deliveryUserId,
      schoolId,
      session,
    });
    await this.autoAssignDeliveriesForDate(this.makassarTodayIsoDate());
    return { ok: true };
  }

  private async autoAssignDeliveriesForDate(serviceDate: string) {
    await this.schema!.ensureDeliverySchoolAssignmentsTable();
    const ordersOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id AS order_id, c.school_id, o.session::text AS session
        FROM orders o
        JOIN children c ON c.id = o.child_id
        LEFT JOIN delivery_assignments da ON da.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
          AND o.delivery_status IN ('PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY')
          AND da.order_id IS NULL
      ) t;
    `,
      [serviceDate],
    );
    const orders = this.parseJsonLines<{ order_id: string; school_id: string; session: SessionType }>(ordersOut);
    if (orders.length === 0) return { ok: true, serviceDate, assignedCount: 0, skippedOrderIds: [] as string[] };

    const loadOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT da.delivery_user_id, COUNT(*)::int AS assigned_count
        FROM delivery_assignments da
        JOIN orders o ON o.id = da.order_id
        WHERE o.service_date = $1::date
        GROUP BY da.delivery_user_id
      ) t;
    `,
      [serviceDate],
    );
    const loads = this.parseJsonLines<{ delivery_user_id: string; assigned_count: number }>(loadOut);
    const loadMap = new Map<string, number>(loads.map((x) => [x.delivery_user_id, Number(x.assigned_count || 0)]));

    const mappingOut = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT dsa.school_id, dsa.delivery_user_id, dsa.session::text AS session
        FROM delivery_school_assignments dsa
        JOIN users u ON u.id = dsa.delivery_user_id
        WHERE dsa.is_active = true
          AND u.role = 'DELIVERY'
          AND u.is_active = true
          AND u.deleted_at IS NULL
      ) t;
    `);
    const mappings = this.parseJsonLines<{ school_id: string; delivery_user_id: string; session: SessionType }>(mappingOut);
    const bySchoolSession = new Map<string, string[]>();
    for (const m of mappings) {
      const key = `${m.school_id}:${m.session}`;
      const list = bySchoolSession.get(key) || [];
      list.push(m.delivery_user_id);
      bySchoolSession.set(key, list);
    }

    const skippedOrderIds: string[] = [];
    let assignedCount = 0;
    for (const order of orders) {
      const candidates = bySchoolSession.get(`${order.school_id}:${order.session}`) || [];
      if (candidates.length === 0) {
        skippedOrderIds.push(order.order_id);
        continue;
      }
      const selected = [...candidates].sort((a, b) => (loadMap.get(a) || 0) - (loadMap.get(b) || 0))[0];
      loadMap.set(selected, (loadMap.get(selected) || 0) + 1);

      await runSql(
        `INSERT INTO delivery_assignments (order_id, delivery_user_id, assigned_at)
         VALUES ($1, $2, now())
         ON CONFLICT (order_id)
         DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id, assigned_at = now(), updated_at = now();`,
        [order.order_id, selected],
      );
      await runSql(
        `UPDATE orders
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE id = $1;`,
        [order.order_id],
      );
      await runSql(
        `UPDATE billing_records
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE order_id = $1;`,
        [order.order_id],
      );
      assignedCount += 1;
    }

    return { ok: true, serviceDate, assignedCount, skippedOrderIds };
  }

  async autoAssignDeliveries(actor: AccessUser, dateRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : this.makassarTodayIsoDate();
    return this.autoAssignDeliveriesForDate(serviceDate);
  }

  async assignDelivery(actor: AccessUser, input: { orderIds?: string[]; deliveryUserId?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const orderIds = Array.isArray(input.orderIds) ? input.orderIds.filter(Boolean) : [];
    const deliveryUserId = (input.deliveryUserId || '').trim();
    for (const orderId of orderIds) {
      await runSql(
        `INSERT INTO delivery_assignments (order_id, delivery_user_id, assigned_at)
         VALUES ($1, $2, now())
         ON CONFLICT (order_id)
         DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id, assigned_at = now(), updated_at = now();`,
        [orderId, deliveryUserId],
      );
      await runSql(
        `UPDATE orders
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE id = $1;`,
        [orderId],
      );
      await runSql(
        `UPDATE billing_records
         SET delivery_status = 'ASSIGNED', updated_at = now()
         WHERE order_id = $1;`,
        [orderId],
      );
    }
    return { ok: true, assignedCount: orderIds.length };
  }

  async getDeliveryAssignments(actor: AccessUser, dateRaw?: string) {
    if (!['DELIVERY', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureDeliveryDailyNotesTable();
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : null;
    await this.autoAssignDeliveriesForDate(serviceDate || this.makassarTodayIsoDate());
    const params: unknown[] = [];
    const roleFilter = actor.role === 'DELIVERY'
      ? (() => {
          params.push(actor.uid);
          const deliveryParamIdx = params.length;
          return `AND da.delivery_user_id = $${deliveryParamIdx}
                  AND EXISTS (
                    SELECT 1
                    FROM delivery_school_assignments dsa
                    WHERE dsa.delivery_user_id = $${deliveryParamIdx}
                      AND dsa.school_id = c.school_id
                      AND dsa.session = o.session
                      AND dsa.is_active = true
                  )`;
        })()
      : '';
    const dateFilter = serviceDate
      ? (() => {
          params.push(serviceDate);
          return `AND o.service_date = $${params.length}::date`;
        })()
      : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT da.id,
               da.order_id,
               da.delivery_user_id,
               da.assigned_at::text AS assigned_at,
               da.confirmed_at::text AS confirmed_at,
               da.confirmation_note,
               COALESCE(ddn.note, '') AS daily_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.status::text AS status,
               o.delivery_status::text AS delivery_status,
               o.total_price,
               s.name AS school_name,
               c.school_grade AS registration_grade,
               c.current_school_grade,
               c.created_at::text AS registration_date,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               COALESCE(NULLIF(TRIM(uc.phone_number), ''), NULLIF(TRIM(up.phone_number), '')) AS youngster_mobile,
               CASE
                 WHEN COALESCE(trim(o.dietary_snapshot), '') = '' THEN ''
                 WHEN lower(o.dietary_snapshot) LIKE '%no allergies%' THEN ''
                 ELSE o.dietary_snapshot
               END AS allergen_items,
               COALESCE((
                 SELECT json_agg(row_to_json(d) ORDER BY d.item_name)
                 FROM (
                   SELECT oi2.menu_item_id,
                          oi2.item_name_snapshot AS item_name,
                          SUM(oi2.quantity)::int AS quantity
                   FROM order_items oi2
                   WHERE oi2.order_id = o.id
                   GROUP BY oi2.menu_item_id, oi2.item_name_snapshot
                 ) d
               ), '[]'::json) AS dishes
        FROM delivery_assignments da
        JOIN orders o ON o.id = da.order_id
        JOIN children c ON c.id = o.child_id
        JOIN schools s ON s.id = c.school_id
        JOIN users uc ON uc.id = c.user_id
        LEFT JOIN users up ON up.id = o.placed_by_user_id
        LEFT JOIN delivery_daily_notes ddn
          ON ddn.delivery_user_id = da.delivery_user_id
         AND ddn.service_date = o.service_date
        WHERE 1=1
          AND o.deleted_at IS NULL
          AND o.status <> 'CANCELLED'
          ${roleFilter}
          ${dateFilter}
        ORDER BY o.service_date DESC, da.assigned_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown>>(out).map((row) => this.withEffectiveGrade(row));
  }

  async getDeliveryDailyNote(actor: AccessUser, dateRaw?: string) {
    await this.schema!.ensureDeliveryDailyNotesTable();
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : this.makassarTodayIsoDate();
    if (actor.role === 'DELIVERY') {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT delivery_user_id::text AS delivery_user_id,
                 service_date::text AS service_date,
                 note,
                 updated_at::text AS updated_at
          FROM delivery_daily_notes
          WHERE delivery_user_id = $1
            AND service_date = $2::date
          LIMIT 1
        ) t;
        `,
        [actor.uid, serviceDate],
      );
      return out
        ? this.parseJsonLine(out)
        : { delivery_user_id: actor.uid, service_date: serviceDate, note: '', updated_at: null };
    }
    if (actor.role === 'ADMIN') {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT ddn.delivery_user_id::text AS delivery_user_id,
                 (u.first_name || ' ' || u.last_name) AS delivery_name,
                 ddn.service_date::text AS service_date,
                 ddn.note,
                 ddn.updated_at::text AS updated_at
          FROM delivery_daily_notes ddn
          JOIN users u ON u.id = ddn.delivery_user_id
          WHERE ddn.service_date = $1::date
          ORDER BY delivery_name ASC
        ) t;
        `,
        [serviceDate],
      );
      return this.parseJsonLines(out);
    }
    throw new ForbiddenException('Role not allowed');
  }

  async updateDeliveryDailyNote(actor: AccessUser, dateRaw: string, note?: string) {
    if (actor.role !== 'DELIVERY') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureDeliveryDailyNotesTable();
    const serviceDate = this.validateServiceDate(dateRaw);
    const cleanNote = (note || '').trim().slice(0, 500);
    await runSql(
      `
      INSERT INTO delivery_daily_notes (delivery_user_id, service_date, note, updated_at)
      VALUES ($1, $2::date, $3, now())
      ON CONFLICT (delivery_user_id, service_date)
      DO UPDATE SET note = EXCLUDED.note, updated_at = now();
      `,
      [actor.uid, serviceDate, cleanNote],
    );
    return { ok: true, serviceDate, note: cleanNote };
  }

  async getDailyWhatsappOrderNotifications(actor: AccessUser, dateRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureOrderNotificationLogsTable();
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : this.makassarTodayIsoDate();

    const ordersRaw = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        WITH candidate_orders AS (
          SELECT
            o.id AS order_id,
            o.order_number::text AS order_number,
            o.service_date::text AS service_date,
            o.session::text AS session,
            o.status::text AS status,
            c.id AS child_id,
            uc.id AS student_user_id,
            trim(coalesce(uc.first_name, '')) AS student_first_name,
            trim(concat(coalesce(uc.first_name, ''), ' ', coalesce(uc.last_name, ''))) AS student_name,
            NULLIF(trim(uc.phone_number), '') AS student_phone,
            p.id AS parent_id,
            trim(concat(coalesce(up.first_name, ''), ' ', coalesce(up.last_name, ''))) AS parent_name,
            NULLIF(trim(up.phone_number), '') AS parent_phone,
            CASE
              WHEN NULLIF(trim(uc.phone_number), '') IS NOT NULL THEN NULLIF(trim(uc.phone_number), '')
              WHEN NULLIF(trim(up.phone_number), '') IS NOT NULL THEN NULLIF(trim(up.phone_number), '')
              ELSE NULL
            END AS target_phone,
            CASE
              WHEN NULLIF(trim(uc.phone_number), '') IS NOT NULL THEN 'STUDENT'
              WHEN NULLIF(trim(up.phone_number), '') IS NOT NULL THEN 'PARENT'
              ELSE NULL
            END AS target_source,
            COALESCE(c.current_school_grade, c.school_grade, '') AS student_grade,
            COALESCE(s.name, '') AS school_name,
            COALESCE(pc.created_at, o.created_at) AS parent_linked_at
          FROM orders o
          JOIN children c
            ON c.id = o.child_id
          JOIN users uc
            ON uc.id = c.user_id
          LEFT JOIN schools s
            ON s.id = c.school_id
          LEFT JOIN parent_children pc
            ON pc.child_id = c.id
          LEFT JOIN parents p
            ON p.id = pc.parent_id
          LEFT JOIN users up
            ON up.id = p.user_id
          WHERE o.service_date = $1::date
            AND o.status IN ('PLACED', 'LOCKED')
            AND o.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM order_notification_logs onl
              WHERE onl.order_id = o.id
                AND onl.channel = 'WHATSAPP'
                AND onl.notification_type = 'DAILY_ORDER_9AM'
                AND onl.status = 'SENT'
            )
        ),
        deduped_orders AS (
          SELECT *
          FROM (
            SELECT
              co.*,
              row_number() OVER (
                PARTITION BY co.order_id
                ORDER BY co.parent_linked_at ASC, co.parent_id NULLS LAST
              ) AS rn
            FROM candidate_orders co
          ) x
          WHERE x.rn = 1
        ),
        order_items_agg AS (
          SELECT
            oi.order_id,
            json_agg(oi.item_name_snapshot ORDER BY oi.created_at ASC) AS items
          FROM order_items oi
          JOIN deduped_orders d
            ON d.order_id = oi.order_id
          GROUP BY oi.order_id
        )
        SELECT
          d.order_id AS "orderId",
          d.order_number AS "orderNumber",
          d.service_date AS "serviceDate",
          d.session AS "session",
          d.status AS "status",
          json_build_object(
            'id', d.child_id,
            'userId', d.student_user_id,
            'name', d.student_name,
            'firstName', d.student_first_name,
            'phone', d.student_phone,
            'grade', d.student_grade,
            'schoolName', d.school_name
          ) AS "student",
          json_build_object(
            'id', d.parent_id,
            'name', d.parent_name,
            'phone', d.parent_phone
          ) AS "parentFallback",
          json_build_object(
            'phone', d.target_phone,
            'source', d.target_source
          ) AS "target",
          COALESCE(i.items, '[]'::json) AS "items"
        FROM deduped_orders d
        LEFT JOIN order_items_agg i
          ON i.order_id = d.order_id
        WHERE d.target_phone IS NOT NULL
        ORDER BY d.student_name ASC, d.service_date ASC, d.session ASC, d.order_number ASC
      ) t;
      `,
      [serviceDate],
    );

    const skippedRaw = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        WITH candidate_orders AS (
          SELECT
            o.id AS order_id,
            o.order_number::text AS order_number,
            NULLIF(trim(uc.phone_number), '') AS student_phone,
            NULLIF(trim(up.phone_number), '') AS parent_phone,
            COALESCE(pc.created_at, o.created_at) AS parent_linked_at,
            p.id AS parent_id
          FROM orders o
          JOIN children c
            ON c.id = o.child_id
          JOIN users uc
            ON uc.id = c.user_id
          LEFT JOIN parent_children pc
            ON pc.child_id = c.id
          LEFT JOIN parents p
            ON p.id = pc.parent_id
          LEFT JOIN users up
            ON up.id = p.user_id
          WHERE o.service_date = $1::date
            AND o.status IN ('PLACED', 'LOCKED')
            AND o.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM order_notification_logs onl
              WHERE onl.order_id = o.id
                AND onl.channel = 'WHATSAPP'
                AND onl.notification_type = 'DAILY_ORDER_9AM'
                AND onl.status = 'SENT'
            )
        ),
        deduped_orders AS (
          SELECT *
          FROM (
            SELECT
              co.*,
              row_number() OVER (
                PARTITION BY co.order_id
                ORDER BY co.parent_linked_at ASC, co.parent_id NULLS LAST
              ) AS rn
            FROM candidate_orders co
          ) x
          WHERE x.rn = 1
        )
        SELECT
          order_id AS "orderId",
          order_number AS "orderNumber",
          'NO_TARGET_PHONE' AS "reason"
        FROM deduped_orders
        WHERE student_phone IS NULL
          AND parent_phone IS NULL
        ORDER BY order_number ASC
      ) t;
      `,
      [serviceDate],
    );

    const orders = this.parseJsonLines<{
      orderId: string;
      orderNumber: string;
      serviceDate: string;
      session: SessionType;
      status: 'PLACED' | 'LOCKED';
      student: {
        id: string;
        userId: string;
        name: string;
        firstName: string;
        phone?: string | null;
        grade: string;
        schoolName: string;
      };
      parentFallback: {
        id?: string | null;
        name?: string | null;
        phone?: string | null;
      };
      target: {
        phone: string;
        source: 'STUDENT' | 'PARENT';
      };
      items: string[];
    }>(ordersRaw).map((row) => ({
      ...row,
      student: {
        ...row.student,
        phone: this.normalizePhone(row.student?.phone),
      },
      parentFallback: {
        ...row.parentFallback,
        phone: this.normalizePhone(row.parentFallback?.phone),
      },
      target: {
        ...row.target,
        phone: this.normalizePhone(row.target?.phone),
      },
    }));

    const skipped = this.parseJsonLines<{
      orderId: string;
      orderNumber: string;
      reason: 'NO_TARGET_PHONE';
    }>(skippedRaw);

    return {
      ok: true,
      date: serviceDate,
      timezone: 'Asia/Makassar',
      orders,
      skipped,
    };
  }

  async getDailyOrdersByPhone(actor: AccessUser, input: { date?: string; phone?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const phone = this.normalizePhone(input.phone);
    const phoneKey = this.phoneCompareKey(input.phone);
    if (!phoneKey) throw new BadRequestException('phone is required');

    const payload = await this.getDailyWhatsappOrderNotifications(actor, input.date);
    const orders = payload.orders.filter((row) => (
      this.phoneCompareKey(row.target?.phone) === phoneKey
      || this.phoneCompareKey(row.student?.phone) === phoneKey
      || this.phoneCompareKey(row.parentFallback?.phone) === phoneKey
    ));

    return {
      ok: true,
      date: payload.date,
      timezone: payload.timezone,
      phone,
      orders,
    };
  }

  async getAdminFamilyContextByPhone(actor: AccessUser, input: { phone?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    return this.resolveFamilyScopeByPhone(input.phone);
  }

  async getAdminFamilyOrdersByPhone(actor: AccessUser, input: { phone?: string; date?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const familyContext = await this.resolveFamilyScopeByPhone(input.phone);
    if (!familyContext.found) return familyContext;

    const serviceDate = input.date ? this.validateServiceDate(input.date) : this.makassarTodayIsoDate();
    const familyId = String((familyContext.family as { family_id: string }).family_id || '');
    const ordersOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.order_number::text AS order_number,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.status::text AS status,
               o.total_price,
               trim(concat(coalesce(u.first_name, ''), ' ', coalesce(u.last_name, ''))) AS child_name,
               u.username AS child_username,
               br.status::text AS billing_status,
               br.delivery_status::text AS delivery_status
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE c.family_id = $1::uuid
          AND o.service_date = $2::date
          AND o.deleted_at IS NULL
        ORDER BY u.first_name ASC, u.last_name ASC, o.session ASC, o.created_at DESC
      ) t;
    `,
      [familyId, serviceDate],
    );
    const orders = this.parseJsonLines<Record<string, unknown> & {
      id: string;
      total_price?: string | number;
    }>(ordersOut);

    const orderIds = orders.map((order) => order.id);
    const itemsByOrder = new Map<string, string[]>();
    if (orderIds.length > 0) {
      const itemsOut = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT oi.order_id::text AS order_id,
                 oi.item_name_snapshot
          FROM order_items oi
          WHERE oi.order_id = ANY($1::uuid[])
          ORDER BY oi.order_id ASC, oi.created_at ASC
        ) t;
      `,
        [orderIds],
      );
      const items = this.parseJsonLines<{ order_id: string; item_name_snapshot: string }>(itemsOut);
      for (const item of items) {
        const list = itemsByOrder.get(item.order_id) || [];
        list.push(item.item_name_snapshot);
        itemsByOrder.set(item.order_id, list);
      }
    }

    return {
      ...familyContext,
      date: serviceDate,
      orders: orders.map((order) => ({
        ...order,
        total_price: Number(order.total_price || 0),
        items: itemsByOrder.get(order.id) || [],
      })),
    };
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
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureOrderNotificationLogsTable();
    const sentTo = this.normalizePhone(body.sentTo);
    const targetSource = body.targetSource === 'PARENT' ? 'PARENT' : 'STUDENT';
    const provider = String(body.provider || body.sentVia || 'BRIAN').trim().slice(0, 30);
    const providerMessageId = String(body.providerMessageId || '').trim().slice(0, 100) || null;
    const messageHash = String(body.messageHash || '').trim().slice(0, 128) || null;
    const sentAt = body.sentAt && !Number.isNaN(Date.parse(body.sentAt)) ? new Date(body.sentAt).toISOString() : new Date().toISOString();

    await runSql(
      `
      INSERT INTO order_notification_logs (
        order_id,
        channel,
        notification_type,
        target_phone,
        target_source,
        status,
        attempted_at,
        sent_at,
        provider,
        provider_message_id,
        message_hash,
        metadata,
        updated_at
      )
      VALUES (
        $1::uuid,
        'WHATSAPP',
        'DAILY_ORDER_9AM',
        $2,
        $3,
        'SENT',
        now(),
        $4::timestamptz,
        $5,
        $6,
        $7,
        '{}'::jsonb,
        now()
      )
      ON CONFLICT (order_id, channel, notification_type) WHERE status = 'SENT'
      DO UPDATE SET
        target_phone = EXCLUDED.target_phone,
        target_source = EXCLUDED.target_source,
        sent_at = EXCLUDED.sent_at,
        provider = EXCLUDED.provider,
        provider_message_id = EXCLUDED.provider_message_id,
        message_hash = EXCLUDED.message_hash,
        updated_at = now();
      `,
      [orderId, sentTo || null, targetSource, sentAt, provider || null, providerMessageId, messageHash],
    );

    return { ok: true, orderId, status: 'SENT', sentAt, sentTo };
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
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureOrderNotificationLogsTable();
    const targetPhone = this.normalizePhone(body.targetPhone);
    const targetSource = body.targetSource === 'PARENT' ? 'PARENT' : 'STUDENT';
    const provider = String(body.provider || body.sentVia || 'BRIAN').trim().slice(0, 30);
    const failureReason = String(body.reason || 'WHATSAPP_SEND_FAILED').trim().slice(0, 500);
    const failedAt = body.failedAt && !Number.isNaN(Date.parse(body.failedAt)) ? new Date(body.failedAt).toISOString() : new Date().toISOString();

    await runSql(
      `
      INSERT INTO order_notification_logs (
        order_id,
        channel,
        notification_type,
        target_phone,
        target_source,
        status,
        attempted_at,
        provider,
        failure_reason,
        metadata,
        updated_at
      )
      VALUES (
        $1::uuid,
        'WHATSAPP',
        'DAILY_ORDER_9AM',
        $2,
        $3,
        'FAILED',
        $4::timestamptz,
        $5,
        $6,
        '{}'::jsonb,
        now()
      );
      `,
      [orderId, targetPhone || null, targetSource, failedAt, provider || null, failureReason],
    );

    return { ok: true, orderId, status: 'FAILED', failedAt, reason: failureReason };
  }

  async sendDeliveryNotificationEmails(actor: AccessUser) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const serviceDate = this.makassarTodayIsoDate();
    const rowsRaw = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT da.delivery_user_id,
               COALESCE(NULLIF(TRIM(du.email), ''), '') AS delivery_email,
               (du.first_name || ' ' || du.last_name) AS delivery_name,
               o.session::text AS session,
               o.status::text AS status,
               o.delivery_status::text AS delivery_status,
               s.name AS school_name,
               c.school_grade AS registration_grade,
               c.current_school_grade,
               c.created_at::text AS registration_date,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               COALESCE(NULLIF(TRIM(uc.phone_number), ''), NULLIF(TRIM(up.phone_number), '')) AS youngster_mobile,
               CASE
                 WHEN COALESCE(trim(o.dietary_snapshot), '') = '' THEN ''
                 WHEN lower(o.dietary_snapshot) LIKE '%no allergies%' THEN ''
                 ELSE o.dietary_snapshot
               END AS allergen_items,
               COALESCE((
                 SELECT json_agg(row_to_json(d) ORDER BY d.item_name)
                 FROM (
                   SELECT oi2.menu_item_id,
                          oi2.item_name_snapshot AS item_name,
                          SUM(oi2.quantity)::int AS quantity
                   FROM order_items oi2
                   WHERE oi2.order_id = o.id
                   GROUP BY oi2.menu_item_id, oi2.item_name_snapshot
                 ) d
               ), '[]'::json) AS dishes
        FROM delivery_assignments da
        JOIN users du ON du.id = da.delivery_user_id
        JOIN orders o ON o.id = da.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN users up ON up.id = o.placed_by_user_id
        WHERE du.role = 'DELIVERY'
          AND du.is_active = true
          AND o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
          AND o.delivery_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        ORDER BY delivery_name ASC, school_name ASC, child_name ASC, o.session ASC
      ) t;
      `,
      [serviceDate],
    );

    const rows = this.parseJsonLines<{
      delivery_user_id: string;
      delivery_email: string;
      delivery_name: string;
      session: string;
      status: string;
      delivery_status: string;
      school_name: string;
      child_name: string;
      youngster_mobile?: string | null;
      allergen_items?: string | null;
      dishes: Array<{ item_name: string; quantity: number }>;
    }>(rowsRaw);

    if (rows.length === 0) {
      return { ok: true, date: serviceDate, sentCount: 0, skippedCount: 0, failed: [] as string[] };
    }

    const grouped = new Map<string, {
      email: string;
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
    }>();
    for (const row of rows) {
      if (!grouped.has(row.delivery_user_id)) {
        grouped.set(row.delivery_user_id, {
          email: row.delivery_email || '',
          deliveryName: row.delivery_name,
          orders: [],
        });
      }
      grouped.get(row.delivery_user_id)!.orders.push({
        session: row.session,
        child_name: row.child_name,
        school_name: row.school_name,
        youngster_mobile: row.youngster_mobile || null,
        allergen_items: row.allergen_items || '',
        status: row.status,
        delivery_status: row.delivery_status,
        dishes: Array.isArray(row.dishes) ? row.dishes : [],
      });
    }

    let sentCount = 0;
    let skippedCount = 0;
    const failed: string[] = [];
    for (const [deliveryUserId, group] of grouped.entries()) {
      const email = (group.email || '').trim().toLowerCase();
      if (!email) {
        skippedCount += 1;
        failed.push(`${group.deliveryName} (${deliveryUserId}) has no email`);
        continue;
      }
      const pdfLines = this.buildTwoColumnDeliveryPdfLines({
        title: 'Assigned Orders',
        serviceDate,
        deliveryName: group.deliveryName,
        orders: group.orders,
      });
      const pdf = this.buildSimplePdf(pdfLines);
      try {
        await this.sendEmailWithPdfAttachment({
          to: email,
          subject: `Assigned Orders for ${serviceDate}`,
          bodyText: `Hello ${group.deliveryName},\n\nAttached is your assigned orders list for ${serviceDate}.\n\nRegards,\nSchool Catering`,
          attachmentFileName: `assigned-orders-${serviceDate}.pdf`,
          attachmentData: pdf,
        });
        sentCount += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        failed.push(`${group.deliveryName} (${email}): ${reason}`);
      }
    }

    return {
      ok: failed.length === 0,
      date: serviceDate,
      sentCount,
      skippedCount,
      failed,
    };
  }

  async getDeliverySummary(actor: AccessUser, dateRaw?: string) {
    if (!['DELIVERY', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : this.makassarTodayIsoDate();
    const params: unknown[] = [serviceDate];
    const roleFilter = actor.role === 'DELIVERY'
      ? (() => {
          params.push(actor.uid);
          return `AND da.delivery_user_id = $${params.length}`;
        })()
      : '';
    const rows = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT da.delivery_user_id,
               (du.first_name || ' ' || du.last_name) AS delivery_name,
               s.id AS school_id,
               s.name AS school_name,
               o.order_number::text AS order_number,
               uc.last_name AS child_last_name,
               COALESCE(NULLIF(TRIM(uc.phone_number), ''), NULLIF(TRIM(up.phone_number), '')) AS youngster_phone,
               (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS dish_count
        FROM delivery_assignments da
        JOIN orders o ON o.id = da.order_id
        JOIN children c ON c.id = o.child_id
        JOIN schools s ON s.id = c.school_id
        JOIN users uc ON uc.id = c.user_id
        JOIN users du ON du.id = da.delivery_user_id
        LEFT JOIN users up ON up.id = o.placed_by_user_id
        WHERE o.service_date = $1::date
          ${roleFilter}
        ORDER BY s.name ASC, o.order_number ASC
      ) t;
      `,
      params,
    );
    const detail = this.parseJsonLines<{
      delivery_user_id: string;
      delivery_name: string;
      school_id: string;
      school_name: string;
      order_number: string;
      child_last_name: string;
      youngster_phone: string | null;
      dish_count: number;
    }>(rows);

    // Group by delivery_user_id → school
    type SchoolGroup = { schoolName: string; orderCount: number; dishCount: number; orders: { orderNumber: string; childLastName: string; youngsterPhone: string | null }[] };
    type UserGroup = { deliveryName: string; schools: Map<string, SchoolGroup> };
    const byUser = new Map<string, UserGroup>();
    for (const row of detail) {
      if (!byUser.has(row.delivery_user_id)) byUser.set(row.delivery_user_id, { deliveryName: row.delivery_name, schools: new Map() });
      const ug = byUser.get(row.delivery_user_id)!;
      if (!ug.schools.has(row.school_id)) ug.schools.set(row.school_id, { schoolName: row.school_name, orderCount: 0, dishCount: 0, orders: [] });
      const sg = ug.schools.get(row.school_id)!;
      sg.orderCount += 1;
      sg.dishCount += Number(row.dish_count) || 0;
      sg.orders.push({ orderNumber: row.order_number, childLastName: row.child_last_name, youngsterPhone: row.youngster_phone });
    }

    return {
      date: serviceDate,
      deliveries: Array.from(byUser.entries()).map(([uid, ug]) => ({
        deliveryUserId: uid,
        deliveryName: ug.deliveryName,
        schools: Array.from(ug.schools.values()),
      })),
    };
  }

  async confirmDelivery(actor: AccessUser, assignmentId: string, note?: string) {
    if (actor.role !== 'DELIVERY') throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, order_id, delivery_user_id, confirmed_at
        FROM delivery_assignments
        WHERE id = $1
        LIMIT 1
      ) t;
    `,
      [assignmentId],
    );
    if (!out) throw new NotFoundException('Assignment not found');
    const assignment = this.parseJsonLine<{ id: string; order_id: string; delivery_user_id: string; confirmed_at?: string | null }>(out);
    if (assignment.delivery_user_id !== actor.uid) throw new ForbiddenException('DELIVERY_ASSIGNMENT_FORBIDDEN');
    if (assignment.confirmed_at) return { ok: true, alreadyConfirmed: true };

    await runSql(
      `UPDATE delivery_assignments
       SET confirmed_at = now(),
           confirmation_note = $1,
           updated_at = now()
       WHERE id = $2;`,
      [note ? note.trim().slice(0, 500) : null, assignment.id],
    );
    await runSql(
      `UPDATE orders
       SET delivery_status = 'DELIVERED',
           delivered_at = now(),
           delivered_by_user_id = $1,
           updated_at = now()
       WHERE id = $2;`,
      [actor.uid, assignment.order_id],
    );
    await runSql(
      `UPDATE billing_records
       SET delivery_status = 'DELIVERED',
           delivered_at = now(),
           updated_at = now()
       WHERE order_id = $1;`,
      [assignment.order_id],
    );
    return { ok: true };
  }

  async toggleDeliveryCompletion(actor: AccessUser, assignmentId: string, note?: string) {
    if (actor.role !== 'DELIVERY') throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, order_id, delivery_user_id, confirmed_at
        FROM delivery_assignments
        WHERE id = $1
        LIMIT 1
      ) t;
    `,
      [assignmentId],
    );
    if (!out) throw new NotFoundException('Assignment not found');
    const assignment = this.parseJsonLine<{ id: string; order_id: string; delivery_user_id: string; confirmed_at?: string | null }>(out);
    if (assignment.delivery_user_id !== actor.uid) throw new ForbiddenException('DELIVERY_ASSIGNMENT_FORBIDDEN');

    if (!assignment.confirmed_at) {
      await runSql(
        `UPDATE delivery_assignments
         SET confirmed_at = now(),
             confirmation_note = $1,
             updated_at = now()
         WHERE id = $2;`,
        [note ? note.trim().slice(0, 500) : null, assignment.id],
      );
      await runSql(
        `UPDATE orders
         SET delivery_status = 'DELIVERED',
             delivered_at = now(),
             delivered_by_user_id = $1,
             updated_at = now()
         WHERE id = $2;`,
        [actor.uid, assignment.order_id],
      );
      await runSql(
        `UPDATE billing_records
         SET delivery_status = 'DELIVERED',
             delivered_at = now(),
             updated_at = now()
         WHERE order_id = $1;`,
        [assignment.order_id],
      );
      return { ok: true, completed: true };
    }

    await runSql(
      `UPDATE delivery_assignments
       SET confirmed_at = NULL,
           confirmation_note = NULL,
           updated_at = now()
       WHERE id = $1;`,
      [assignment.id],
    );
    await runSql(
      `UPDATE orders
       SET delivery_status = 'ASSIGNED',
           delivered_at = NULL,
           delivered_by_user_id = NULL,
           updated_at = now()
       WHERE id = $1;`,
      [assignment.order_id],
    );
    await runSql(
      `UPDATE billing_records
       SET delivery_status = 'ASSIGNED',
           delivered_at = NULL,
           updated_at = now()
       WHERE order_id = $1;`,
      [assignment.order_id],
    );
    return { ok: true, completed: false };
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
    const toDate = input.toDateRaw ? this.validateServiceDate(input.toDateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const fromDate = input.fromDateRaw ? this.validateServiceDate(input.fromDateRaw) : await runSql(`SELECT ($1::date - INTERVAL '30 day')::date::text;`, [toDate]);

    const day = (input.day || 'ALL').toUpperCase() === 'ALL' ? '' : (input.day || '').trim();
    const month = (input.month || 'ALL').toUpperCase() === 'ALL' ? '' : (input.month || '').trim();
    const year = (input.year || 'ALL').toUpperCase() === 'ALL' ? '' : (input.year || '').trim();
    const schoolId = (input.schoolId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.schoolId || '').trim();
    const deliveryUserId = (input.deliveryUserId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.deliveryUserId || '').trim();
    const parentId = (input.parentId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.parentId || '').trim();
    const session = (input.session || 'ALL').toUpperCase() === 'ALL' ? '' : this.normalizeSession(input.session);
    const dish = (input.dish || 'ALL').toUpperCase() === 'ALL' ? '' : (input.dish || '').trim();
    const orderStatus = (input.orderStatus || 'ALL').toUpperCase() === 'ALL' ? '' : (input.orderStatus || '').trim().toUpperCase();
    const billingStatus = (input.billingStatus || 'ALL').toUpperCase() === 'ALL' ? '' : (input.billingStatus || '').trim().toUpperCase();

    const params: unknown[] = [fromDate, toDate];
    const where: string[] = [
      `o.service_date BETWEEN $1::date AND $2::date`,
      `o.deleted_at IS NULL`,
      `o.status <> 'CANCELLED'`,
    ];
    if (day) {
      params.push(Number(day));
      where.push(`EXTRACT(DAY FROM o.service_date)::int = $${params.length}`);
    }
    if (month) {
      params.push(Number(month));
      where.push(`EXTRACT(MONTH FROM o.service_date)::int = $${params.length}`);
    }
    if (year) {
      params.push(Number(year));
      where.push(`EXTRACT(YEAR FROM o.service_date)::int = $${params.length}`);
    }
    if (schoolId) {
      this.assertValidUuid(schoolId, 'schoolId');
      params.push(schoolId);
      where.push(`s.id = $${params.length}`);
    }
    if (deliveryUserId) {
      this.assertValidUuid(deliveryUserId, 'deliveryUserId');
      params.push(deliveryUserId);
      where.push(`da.delivery_user_id = $${params.length}`);
    }
    if (parentId) {
      this.assertValidUuid(parentId, 'parentId');
      params.push(parentId);
      where.push(`p.id = $${params.length}`);
    }
    if (session) {
      params.push(session);
      where.push(`o.session = $${params.length}::session_type`);
    }
    if (dish) {
      params.push(`%${dish}%`);
      where.push(`EXISTS (
        SELECT 1
        FROM order_items oi2
        WHERE oi2.order_id = o.id
          AND oi2.item_name_snapshot ILIKE $${params.length}
      )`);
    }
    if (orderStatus) {
      params.push(orderStatus);
      where.push(`o.status::text = $${params.length}`);
    }
    if (billingStatus) {
      params.push(billingStatus);
      where.push(`COALESCE(br.status::text, 'UNPAID') = $${params.length}`);
    }
    const whereSql = where.join(' AND ');

    const [
      totalsOut,
      bySchoolOut,
      bySessionOut,
      filterSchoolsOut,
      filterDeliveryOut,
      filterParentsOut,
      filterDishesOut,
    ] = await Promise.all([
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS total_orders,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
          FROM orders o
          JOIN children c ON c.id = o.child_id
          JOIN schools s ON s.id = c.school_id
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN parent_children pc ON pc.child_id = c.id
          LEFT JOIN parents p ON p.id = pc.parent_id
          LEFT JOIN billing_records br ON br.order_id = o.id
          WHERE ${whereSql}
        ) t;
      `,
        params,
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT s.id AS school_id,
                 s.name AS school_name,
                 COUNT(DISTINCT o.id)::int AS orders_count,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
          FROM orders o
          JOIN children c ON c.id = o.child_id
          JOIN schools s ON s.id = c.school_id
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN parent_children pc ON pc.child_id = c.id
          LEFT JOIN parents p ON p.id = pc.parent_id
          LEFT JOIN billing_records br ON br.order_id = o.id
          WHERE ${whereSql}
          GROUP BY s.id, s.name
          ORDER BY total_revenue DESC, school_name ASC
        ) t;
      `,
        params,
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT o.session::text AS session,
                 COUNT(DISTINCT o.id)::int AS orders_count,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
          FROM orders o
          JOIN children c ON c.id = o.child_id
          JOIN schools s ON s.id = c.school_id
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN parent_children pc ON pc.child_id = c.id
          LEFT JOIN parents p ON p.id = pc.parent_id
          LEFT JOIN billing_records br ON br.order_id = o.id
          WHERE ${whereSql}
          GROUP BY o.session
          ORDER BY o.session ASC
        ) t;
      `,
        params,
      ),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT id, name
          FROM schools
          WHERE deleted_at IS NULL
          ORDER BY name ASC
        ) t;
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT id AS user_id, (first_name || ' ' || last_name) AS name
          FROM users
          WHERE role = 'DELIVERY'
            AND deleted_at IS NULL
          ORDER BY first_name ASC, last_name ASC
        ) t;
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT p.id AS parent_id, (u.first_name || ' ' || u.last_name) AS name
          FROM parents p
          JOIN users u ON u.id = p.user_id
          WHERE p.deleted_at IS NULL
            AND u.deleted_at IS NULL
          ORDER BY u.first_name ASC, u.last_name ASC
        ) t;
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT DISTINCT oi.item_name_snapshot AS dish_name
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
          ORDER BY oi.item_name_snapshot ASC
        ) t;
      `),
    ]);
    const totals = this.parseJsonLine<{ total_orders: number; total_revenue: string | number }>(
      totalsOut || '{"total_orders":0,"total_revenue":0}',
    );

    return {
      fromDate,
      toDate,
      totalOrders: Number(totals.total_orders || 0),
      totalRevenue: Number(totals.total_revenue || 0),
      bySchool: this.parseJsonLines<Record<string, unknown> & { total_revenue?: number | string }>(bySchoolOut).map((r) => ({
        ...r,
        total_revenue: Number(r.total_revenue || 0),
      })),
      bySession: this.parseJsonLines<Record<string, unknown> & { total_revenue?: number | string }>(bySessionOut).map((r) => ({
        ...r,
        total_revenue: Number(r.total_revenue || 0),
      })),
      filters: {
        schools: this.parseJsonLines(filterSchoolsOut),
        deliveryUsers: this.parseJsonLines(filterDeliveryOut),
        parents: this.parseJsonLines(filterParentsOut),
        sessions: ['ALL', 'BREAKFAST', 'SNACK', 'LUNCH'],
        orderStatuses: ['ALL', 'PLACED', 'LOCKED', 'CANCELLED'],
        billingStatuses: ['ALL', 'UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'],
        dishes: this.parseJsonLines(filterDishesOut),
      },
    };
  }

  async getAdminPrintReport(dateRaw?: string) {
    const date = dateRaw ? this.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id AS order_id,
               o.session::text AS session,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               COALESCE((up.first_name || ' ' || up.last_name), '-') AS parent_name,
               s.name AS school_name,
               o.total_price,
               o.status::text AS order_status,
               o.delivery_status::text AS delivery_status,
               br.status::text AS billing_status
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN users up ON up.id = p.user_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        ORDER BY o.session ASC, school_name ASC, child_name ASC
      ) t;
    `,
      [date],
    );
    const rows = this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((r) => ({
      ...r,
      total_price: Number(r.total_price || 0),
    }));
    const totals = {
      date,
      orders: rows.length,
      revenue: rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    };
    return { totals, rows };
  }

  async getParentSpendingDashboard(actor: AccessUser, monthRaw?: string) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : await runSql(`SELECT to_char((now() AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM');`);
    const monthStart = `${month}-01`;
    const monthEnd = await runSql(`SELECT ($1::date + INTERVAL '1 month - 1 day')::date::text;`, [monthStart]);

    const byChildOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               o.session::text AS session,
               COUNT(DISTINCT o.id)::int AS orders_count,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_spend
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        WHERE c.family_id = $1::uuid
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY c.id, u.first_name, u.last_name, o.session
        ORDER BY child_name ASC,
                 CASE o.session
                   WHEN 'BREAKFAST' THEN 1
                   WHEN 'SNACK' THEN 2
                   ELSE 3
                 END ASC
      ) t;
    `,
      [familyId, monthStart, monthEnd],
    );
    const totalMonthSpend = Number(await runSql(
      `
      SELECT COALESCE(SUM(o.total_price), 0)::numeric
      FROM orders o
      JOIN children c ON c.id = o.child_id
      WHERE c.family_id = $1::uuid
        AND o.service_date BETWEEN $2::date AND $3::date
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL;
    `,
      [familyId, monthStart, monthEnd],
    ) || 0);

    const birthdayOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               c.date_of_birth::text AS date_of_birth
        FROM children c
        JOIN users u ON u.id = c.user_id
        WHERE c.family_id = $1::uuid
          AND c.is_active = true
          AND c.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name
      ) t;
    `,
      [familyId],
    );
    const today = new Date();
    const birthdayHighlights = this.parseJsonLines<{ child_id: string; child_name: string; date_of_birth: string }>(birthdayOut).map((row) => {
      const dob = new Date(row.date_of_birth);
      const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      return { ...row, days_until: daysUntil };
    }).filter((x) => x.days_until <= 30).sort((a, b) => a.days_until - b.days_until);

    return {
      month,
      totalMonthSpend,
      byChild: this.parseJsonLines<Record<string, unknown> & { total_spend?: string | number }>(byChildOut).map((r) => ({
        ...r,
        total_spend: Number(r.total_spend || 0),
      })),
      birthdayHighlights,
    };
  }

  async getYoungsterSpendingDashboard(actor: AccessUser, monthRaw?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const childId = await this.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : await runSql(`SELECT to_char((now() AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM');`);
    const monthStart = `${month}-01`;
    const monthEnd = await runSql(`SELECT ($1::date + INTERVAL '1 month - 1 day')::date::text;`, [monthStart]);

    const me = await this.getYoungsterMe(actor);
    const childName = `${me.first_name} ${me.last_name}`.trim();
    const byChildOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               o.session::text AS session,
               COUNT(DISTINCT o.id)::int AS orders_count,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_spend
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY c.id, u.first_name, u.last_name, o.session
        ORDER BY CASE o.session
                 WHEN 'BREAKFAST' THEN 1
                 WHEN 'SNACK' THEN 2
                 ELSE 3
               END ASC
      ) t;
    `,
      [childId, monthStart, monthEnd],
    );
    const totalMonthSpend = Number(await runSql(
      `
      SELECT COALESCE(SUM(o.total_price), 0)::numeric
      FROM orders o
      WHERE o.child_id = $1
        AND o.service_date BETWEEN $2::date AND $3::date
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL;
    `,
      [childId, monthStart, monthEnd],
    ) || 0);

    const today = new Date();
    const dob = new Date(String(me.date_of_birth));
    const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    return {
      month,
      totalMonthSpend,
      byChild: this.parseJsonLines<Record<string, unknown> & { total_spend?: string | number }>(byChildOut).map((r) => ({
        ...r,
        total_spend: Number(r.total_spend || 0),
      })),
      birthdayHighlights: daysUntil <= 30 ? [{ child_id: childId, child_name: childName, days_until: daysUntil }] : [],
    };
  }

  async getYoungsterInsights(actor: AccessUser, dateRaw?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const childId = await this.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const refDate = dateRaw ? this.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const weekStart = await runSql(
      `SELECT ($1::date - ((extract(isodow FROM $1::date)::int - 1) * INTERVAL '1 day'))::date::text;`,
      [refDate],
    );
    const weekEnd = await runSql(`SELECT ($1::date + INTERVAL '6 day')::date::text;`, [weekStart]);

    const nutritionOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.service_date::text AS service_date,
               o.session::text AS session,
               COALESCE(SUM(oi.quantity * COALESCE(mi.calories_kcal, 0)), 0)::int AS calories_total,
               COUNT(*) FILTER (WHERE mi.calories_kcal IS NULL)::int AS tba_items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.child_id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY o.service_date, o.session
        ORDER BY o.service_date ASC,
                 CASE o.session
                   WHEN 'BREAKFAST' THEN 1
                   WHEN 'SNACK' THEN 2
                   ELSE 3
                 END ASC
      ) t;
    `,
      [childId, weekStart, weekEnd],
    );
    const nutritionRows = this.parseJsonLines<{ service_date: string; session: string; calories_total: number; tba_items: number }>(nutritionOut);
    const days = nutritionRows.map((row) => ({
      service_date: row.service_date,
      session: row.session,
      calories_display: `${Number(row.calories_total || 0)} kcal`,
      tba_items: Number(row.tba_items || 0),
    }));
    const weekCalories = nutritionRows.reduce((sum, r) => sum + Number(r.calories_total || 0), 0);

    const orderDatesOut = await runSql(
      `
      SELECT (to_char(o.service_date, 'YYYY-MM-DD') || '|' || o.session::text)
      FROM orders o
      WHERE o.child_id = $1
        AND o.service_date >= ($2::date - INTERVAL '70 day')
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL
      GROUP BY o.service_date, o.session
      ORDER BY o.service_date ASC,
               CASE o.session
                 WHEN 'BREAKFAST' THEN 1
                 WHEN 'SNACK' THEN 2
                 ELSE 3
               END ASC;
    `,
      [childId, refDate],
    );
    const orderDates = orderDatesOut ? orderDatesOut.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    const streakDates = [...new Set(orderDates.map((x) => x.slice(0, 10)))];
    const maxStreak = this.calculateMaxConsecutiveOrderDays(streakDates);
    const currentMonth = refDate.slice(0, 7);
    const refDateObj = new Date(`${refDate}T00:00:00.000Z`);
    const currentMonthStartDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth(), 1));
    const currentMonthEndDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth() + 1, 0));
    const previousMonthStartDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth() - 1, 1));
    const previousMonthEndDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth(), 0));
    const previousMonth = previousMonthStartDate.toISOString().slice(0, 7);
    const currentMonthStart = currentMonthStartDate.toISOString().slice(0, 10);
    const currentMonthEnd = currentMonthEndDate.toISOString().slice(0, 10);
    const previousMonthStart = previousMonthStartDate.toISOString().slice(0, 10);
    const previousMonthEnd = previousMonthEndDate.toISOString().slice(0, 10);
    const monthRowsOut = await runSql(
      `
      SELECT (to_char(service_date, 'YYYY-MM-DD') || '|' || session::text)
      FROM orders
      WHERE child_id = $1
        AND (
          service_date BETWEEN $2::date AND $3::date
          OR service_date BETWEEN $4::date AND $5::date
        )
        AND status <> 'CANCELLED'
        AND deleted_at IS NULL
      GROUP BY service_date, session
      ORDER BY service_date ASC,
               CASE session
                 WHEN 'BREAKFAST' THEN 1
                 WHEN 'SNACK' THEN 2
                 ELSE 3
               END ASC;
    `,
      [childId, currentMonthStart, currentMonthEnd, previousMonthStart, previousMonthEnd],
    );
    const monthDates = monthRowsOut ? monthRowsOut.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    const cm = this.calculateMonthOrderStats(monthDates, currentMonth);
    const pm = this.calculateMonthOrderStats(monthDates, previousMonth);
    const badgeCalc = this.resolveBadgeLevel({
      maxConsecutiveOrderDays: maxStreak,
      currentMonthOrders: cm.orders,
      currentMonthConsecutiveWeeks: cm.consecutiveWeeks,
      previousMonthOrders: pm.orders,
      previousMonthConsecutiveWeeks: pm.consecutiveWeeks,
    });

    const me = await this.getYoungsterMe(actor);
    const dob = new Date(me.date_of_birth);
    const today = new Date(refDate);
    const next = new Date(today.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate());
    if (next < today) next.setUTCFullYear(today.getUTCFullYear() + 1);
    const birthdayDaysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    const weekOrderSummaryOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(DISTINCT o.id)::int AS total_orders,
               COALESCE(SUM(oi.quantity), 0)::int AS total_dishes
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.child_id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
      ) t;
    `,
      [childId, weekStart, weekEnd],
    );
    const weekOrderSummary = this.parseJsonLine<{ total_orders: number; total_dishes: number }>(
      weekOrderSummaryOut || '{"total_orders":0,"total_dishes":0}',
    );

    return {
      week: {
        start: weekStart,
        end: weekEnd,
        totalCalories: weekCalories,
        totalOrders: Number(weekOrderSummary.total_orders || 0),
        totalDishes: Number(weekOrderSummary.total_dishes || 0),
        days,
      },
      badge: {
        level: badgeCalc.level,
        maxConsecutiveOrderDays: maxStreak,
        maxConsecutiveOrderWeeks: Math.max(Number(cm.consecutiveWeeks || 0), Number(pm.consecutiveWeeks || 0)),
        currentMonthOrders: cm.orders,
      },
      birthdayHighlight: { date_of_birth: me.date_of_birth, days_until: birthdayDaysUntil },
    };
  }

  async getKitchenDailySummary(actor: AccessUser, dateRaw?: string) {
    if (!['KITCHEN', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.validateServiceDate(dateRaw) : this.makassarTodayIsoDate();
    await this.lockOrdersForServiceDateIfCutoffPassed(serviceDate);
    const blackout = await this.getBlackoutRuleForDate(serviceDate);
    const serviceBlocked = blackout?.type === 'SERVICE_BLOCK' || blackout?.type === 'BOTH';

    const totalsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(DISTINCT o.id)::int AS total_orders,
               COUNT(DISTINCT o.id) FILTER (
                 WHERE o.delivery_status IN ('OUT_FOR_DELIVERY', 'DELIVERED')
               )::int AS total_orders_complete,
               COALESCE(SUM(oi.quantity), 0)::int AS total_dishes,
               COUNT(DISTINCT o.id) FILTER (WHERE o.session = 'BREAKFAST')::int AS breakfast_orders,
               COUNT(DISTINCT o.id) FILTER (WHERE o.session = 'SNACK')::int AS snack_orders,
               COUNT(DISTINCT o.id) FILTER (WHERE o.session = 'LUNCH')::int AS lunch_orders
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
      ) t;
    `,
      [serviceDate],
    );
    const totals = this.parseJsonLine<{
      total_orders: number;
      total_orders_complete: number;
      total_dishes: number;
      breakfast_orders: number;
      snack_orders: number;
      lunch_orders: number;
    }>(
      totalsOut
      || '{"total_orders":0,"total_orders_complete":0,"total_dishes":0,"breakfast_orders":0,"snack_orders":0,"lunch_orders":0}',
    );

    const ordersOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.status::text AS status,
               o.delivery_status::text AS delivery_status,
               s.name AS school_name,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               COALESCE(NULLIF(TRIM(uc.phone_number), ''), NULLIF(TRIM(up.phone_number), '')) AS youngster_mobile,
               COALESCE((up.first_name || ' ' || up.last_name), '-') AS parent_name,
               COALESCE(item_counts.dish_count, 0) AS dish_count,
               CASE
                 WHEN COALESCE(trim(o.dietary_snapshot), '') = '' THEN false
                 WHEN lower(o.dietary_snapshot) LIKE '%no allergies%' THEN false
                 ELSE true
               END AS has_allergen,
               CASE
                 WHEN COALESCE(trim(reg_allergy.restriction_details), '') = '' THEN false
                 WHEN lower(reg_allergy.restriction_details) LIKE '%no allergies%' THEN false
                 ELSE true
               END AS has_registration_allergen,
               CASE
                 WHEN COALESCE(trim(o.dietary_snapshot), '') = '' THEN ''
                 WHEN lower(o.dietary_snapshot) LIKE '%no allergies%' THEN ''
                 ELSE o.dietary_snapshot
               END AS allergen_items,
               CASE
                 WHEN COALESCE(trim(reg_allergy.restriction_details), '') = '' THEN ''
                 WHEN lower(reg_allergy.restriction_details) LIKE '%no allergies%' THEN ''
                 ELSE reg_allergy.restriction_details
               END AS registration_allergen_items,
               COALESCE((
                 SELECT json_agg(row_to_json(d) ORDER BY d.item_name)
                 FROM (
                   SELECT oi2.menu_item_id,
                          oi2.item_name_snapshot AS item_name,
                          SUM(oi2.quantity)::int AS quantity
                   FROM order_items oi2
                   WHERE oi2.order_id = o.id
                   GROUP BY oi2.menu_item_id, oi2.item_name_snapshot
                 ) d
               ), '[]'::json) AS dishes
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN schools s ON s.id = c.school_id
        JOIN users uc ON uc.id = c.user_id
        LEFT JOIN (
          SELECT oi2.order_id, SUM(oi2.quantity)::int AS dish_count
          FROM order_items oi2
          GROUP BY oi2.order_id
        ) item_counts ON item_counts.order_id = o.id
        LEFT JOIN LATERAL (
          SELECT cdr.restriction_details
          FROM child_dietary_restrictions cdr
          WHERE cdr.child_id = c.id
            AND cdr.is_active = true
            AND cdr.deleted_at IS NULL
            AND upper(cdr.restriction_label) = 'ALLERGIES'
          ORDER BY cdr.updated_at DESC NULLS LAST, cdr.created_at DESC
          LIMIT 1
        ) reg_allergy ON true
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN users up ON up.id = p.user_id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
        GROUP BY o.id, s.name, uc.first_name, uc.last_name, uc.phone_number, up.first_name, up.last_name, up.phone_number, item_counts.dish_count, reg_allergy.restriction_details
        ORDER BY s.name ASC, child_name ASC, o.session ASC
      ) t;
    `,
      [serviceDate],
    );
    const orders = this.parseJsonLines<{
      id: string;
      service_date: string;
      session: string;
      status: string;
      delivery_status: string;
      school_name: string;
      child_name: string;
      youngster_mobile?: string | null;
      parent_name: string;
      dish_count: number;
      has_allergen: boolean;
      has_registration_allergen: boolean;
      allergen_items: string;
      registration_allergen_items: string;
      dishes: Array<{ menu_item_id: string; item_name: string; quantity: number }>;
    }>(ordersOut).map((row) => this.withEffectiveGrade(row));

    const dishSummaryOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.item_name_snapshot AS name,
               SUM(oi.quantity)::int AS quantity
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status IN ('PLACED', 'LOCKED')
        GROUP BY oi.item_name_snapshot
        ORDER BY quantity DESC, name ASC
      ) t;
    `,
      [serviceDate],
    );
    const dishSummary = this.parseJsonLines<{ name: string; quantity: number }>(dishSummaryOut);

    return {
      serviceDate,
      serviceBlocked,
      blackoutType: blackout?.type || null,
      blackoutReason: blackout?.reason || null,
      totals: {
        totalOrders: Number(totals.total_orders || 0),
        totalOrdersComplete: Number(totals.total_orders_complete || 0),
        totalDishes: Number(totals.total_dishes || 0),
        breakfastOrders: Number(totals.breakfast_orders || 0),
        snackOrders: Number(totals.snack_orders || 0),
        lunchOrders: Number(totals.lunch_orders || 0),
      },
      dishSummary,
      allergenAlerts: orders
        .filter((o) => o.has_registration_allergen)
        .map((o) => ({
          ...o,
          allergen_items: o.registration_allergen_items || o.allergen_items,
        })),
      orders,
    };
  }

  async markKitchenOrderComplete(actor: AccessUser, orderId: string) {
    if (!['KITCHEN', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, service_date::text AS service_date, status::text AS status, delivery_status::text AS delivery_status
         FROM orders
         WHERE id = $1
           AND deleted_at IS NULL
         LIMIT 1
       ) t;`,
      [orderId],
    );
    if (!out) throw new NotFoundException('Order not found');
    const order = this.parseJsonLine<{ id: string; service_date: string; status: string; delivery_status: string }>(out);
    if (!['PLACED', 'LOCKED'].includes(order.status)) {
      throw new BadRequestException('ORDER_NOT_READY_FOR_KITCHEN_COMPLETE');
    }
    const currentDeliveryStatus = String(order.delivery_status || '').toUpperCase();
    const isCompleted = ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(currentDeliveryStatus);

    if (!isCompleted) {
      await runSql(
        `UPDATE orders
         SET delivery_status = 'OUT_FOR_DELIVERY',
             updated_at = now()
         WHERE id = $1;`,
        [order.id],
      );
      await runSql(
        `UPDATE billing_records
         SET delivery_status = 'OUT_FOR_DELIVERY',
             updated_at = now()
         WHERE order_id = $1;`,
        [order.id],
      );
      await this.autoAssignDeliveriesForDate(order.service_date);
      return { ok: true, completed: true, deliveryStatus: 'OUT_FOR_DELIVERY' };
    }

    if (currentDeliveryStatus === 'DELIVERED') {
      throw new BadRequestException('DELIVERED_ORDER_CANNOT_BE_REVERTED');
    }

    await runSql(
      `DELETE FROM delivery_assignments
       WHERE order_id = $1;`,
      [order.id],
    );
    await runSql(
      `UPDATE orders
       SET delivery_status = 'PENDING',
           updated_at = now()
       WHERE id = $1;`,
      [order.id],
    );
    await runSql(
      `UPDATE billing_records
       SET delivery_status = 'PENDING',
           updated_at = now()
       WHERE order_id = $1;`,
      [order.id],
    );
    return { ok: true, completed: false, deliveryStatus: 'PENDING' };
  }

  // ─── Schools CRUD ────────────────────────────────────────────────────────

  async createSchool(actor: AccessUser, input: { name?: string; shortName?: string; address?: string; city?: string; contactPhone?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureSchoolShortNameColumn();
    const name = (input.name || '').trim();
    const shortName = (input.shortName || '').trim();
    const address = (input.address || '').trim();
    const city = (input.city || '').trim();
    const contactPhone = (input.contactPhone || '').trim();
    if (!name) throw new BadRequestException('School name is required');
    if (!shortName) throw new BadRequestException('Short name is required');
    if (!city) throw new BadRequestException('City is required');
    if (!address) throw new BadRequestException('Address is required');
    if (!contactPhone) throw new BadRequestException('Phone number is required');
    const out = await runSql(
      `
      WITH inserted AS (
        INSERT INTO schools (name, short_name, address, city, contact_phone, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id, name, short_name, city, address, contact_phone, is_active
      )
      SELECT row_to_json(inserted)::text FROM inserted;
    `,
      [name, shortName, address, city, contactPhone],
    );
    if (!out) throw new BadRequestException('Failed to create school');
    const school = this.parseJsonLine<{ id: string; name: string }>(out);
    await this.audit!.recordAdminAudit(actor, 'SCHOOL_CREATED', 'school', school.id, { name: school.name });
    return school;
  }

  async deleteSchool(actor: AccessUser, schoolId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(schoolId, 'schoolId');
    const active = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM children c
         JOIN orders o ON o.child_id = c.id
         WHERE c.school_id = $1
           AND o.status = 'PLACED'
           AND o.deleted_at IS NULL
       );`,
      [schoolId],
    );
    if (active === 't') throw new BadRequestException('Cannot delete school with active orders');
    const out = await runSql(
      `UPDATE schools SET deleted_at = now(), updated_at = now(), is_active = false
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id;`,
      [schoolId],
    );
    if (!out) throw new NotFoundException('School not found');
    await this.audit!.recordAdminAudit(actor, 'SCHOOL_DELETED', 'school', schoolId);
    return { ok: true };
  }

  // ─── Parent CRUD ─────────────────────────────────────────────────────────

  async updateParentProfile(actor: AccessUser, targetParentId: string, input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; address?: string; parent2FirstName?: string; parent2Phone?: string; parent2Email?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetParentId, 'parentId');
    await this.schema!.ensureParent2Columns();
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT p.id, p.user_id FROM parents p
         WHERE p.id = $1 AND p.deleted_at IS NULL
       ) t;`,
      [targetParentId],
    );
    if (!out) throw new NotFoundException('Parent not found');
    const parent = this.parseJsonLine<{ id: string; user_id: string }>(out);
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.firstName) { params.push(input.firstName.trim()); updates.push(`first_name = $${params.length}`); }
    if (input.lastName) { params.push(input.lastName.trim()); updates.push(`last_name = $${params.length}`); }
    if (input.phoneNumber !== undefined) {
      const phoneNumber = this.normalizePhone(input.phoneNumber);
      if (!phoneNumber) throw new BadRequestException('phoneNumber cannot be empty');
      if (await this.findActiveUserByPhone(phoneNumber, parent.user_id)) {
        throw new ConflictException('That phone number is already taken');
      }
      params.push(phoneNumber);
      updates.push(`phone_number = $${params.length}`);
    }
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      if (!email) throw new BadRequestException('email cannot be empty');
      if (await this.findActiveUserByEmail(email, parent.user_id)) {
        throw new ConflictException('That email is already taken');
      }
      params.push(email);
      updates.push(`email = $${params.length}`);
    }
    if (updates.length > 0) {
      updates.push('updated_at = now()');
      params.push(parent.user_id);
      await runSql(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length};`, params);
    }
    if (input.address) {
      await runSql(`UPDATE parents SET address = $1, updated_at = now() WHERE id = $2;`, [input.address.trim(), targetParentId]);
    }
    if (input.parent2FirstName !== undefined || input.parent2Phone !== undefined || input.parent2Email !== undefined) {
      const p2Updates: string[] = [];
      const p2Params: unknown[] = [];
      if (input.parent2FirstName !== undefined) { p2Params.push(input.parent2FirstName.trim() || null); p2Updates.push(`parent2_first_name = $${p2Params.length}`); }
      if (input.parent2Phone !== undefined) { p2Params.push(this.normalizePhone(input.parent2Phone) || null); p2Updates.push(`parent2_phone = $${p2Params.length}`); }
      if (input.parent2Email !== undefined) { p2Params.push(input.parent2Email.trim().toLowerCase() || null); p2Updates.push(`parent2_email = $${p2Params.length}`); }
      if (p2Updates.length > 0) {
        p2Updates.push('updated_at = now()');
        p2Params.push(targetParentId);
        await runSql(`UPDATE parents SET ${p2Updates.join(', ')} WHERE id = $${p2Params.length};`, p2Params);
      }
    }
    await this.audit!.recordAdminAudit(actor, 'PARENT_PROFILE_UPDATED', 'parent', targetParentId, {
      changedFields: Object.keys(input).filter((k) => Boolean((input as Record<string, unknown>)[k])),
    });
    return { ok: true };
  }

  async deleteParent(actor: AccessUser, targetParentId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetParentId, 'parentId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT p.id, p.user_id FROM parents p
         WHERE p.id = $1 AND p.deleted_at IS NULL
       ) t;`,
      [targetParentId],
    );
    if (!out) throw new NotFoundException('Parent not found');
    const parent = this.parseJsonLine<{ id: string; user_id: string }>(out);
    const linkedYoungstersRaw = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id,
               c.user_id,
               c.deleted_at::text AS deleted_at
        FROM parent_children pc
        JOIN children c ON c.id = pc.child_id
        WHERE pc.parent_id = $1
      ) t;
      `,
      [targetParentId],
    );
    const linkedYoungsters = this.parseJsonLines<{ id: string; user_id: string; deleted_at?: string | null }>(linkedYoungstersRaw);
    const activeLinkedYoungsters = linkedYoungsters.filter((row) => !row.deleted_at);
    for (const youngster of activeLinkedYoungsters) {
      const youngsterBlocker = await this.getYoungsterDeleteBlockers(youngster.id, youngster.user_id);
      if (youngsterBlocker.activeOrdersCount > 0 || youngsterBlocker.activeBillingCount > 0) {
        throw new BadRequestException(
          `Cannot delete family with linked student active orders or billing (orders: ${youngsterBlocker.activeOrdersCount}, billing: ${youngsterBlocker.activeBillingCount})`,
        );
      }
      if (
        youngsterBlocker.totalOrdersCount > 0 ||
        youngsterBlocker.totalBillingCount > 0 ||
        youngsterBlocker.auditCount > 0
      ) {
        await this.softDeleteYoungster(youngster.id, youngster.user_id);
      } else {
        await this.hardDeleteYoungsterIfSafe(youngster.id, youngster.user_id);
      }
    }
    const linkedYoungsterExists = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM parent_children pc
         JOIN children c ON c.id = pc.child_id
         WHERE pc.parent_id = $1
           AND c.deleted_at IS NULL
      );`,
      [targetParentId],
    );
    if (linkedYoungsterExists === 't') {
      throw new BadRequestException('Cannot delete parent with associated youngster(s)');
    }
    const blockingHistory = await this.getParentDeleteBlockers(targetParentId, parent.user_id);
    if (
      blockingHistory.activeBillingCount > 0 ||
      blockingHistory.activeOrdersCount > 0
    ) {
      throw new BadRequestException(
        `Cannot delete family with active orders or billing (orders: ${blockingHistory.activeOrdersCount}, billing: ${blockingHistory.activeBillingCount})`,
      );
    }
    if (
      blockingHistory.totalBillingCount > 0 ||
      blockingHistory.totalOrdersCount > 0 ||
      blockingHistory.auditCount > 0
    ) {
      await this.softDeleteParent(targetParentId, parent.user_id);
      await this.audit!.recordAdminAudit(actor, 'PARENT_DELETED', 'parent', targetParentId);
      return { ok: true };
    }
    await runSql(`DELETE FROM parent_children WHERE parent_id = $1;`, [targetParentId]);
    await runSql(`DELETE FROM user_preferences WHERE user_id = $1;`, [parent.user_id]);
    await runSql(`DELETE FROM parents WHERE id = $1;`, [targetParentId]);
    await runSql(`DELETE FROM users WHERE id = $1;`, [parent.user_id]);
    await this.audit!.recordAdminAudit(actor, 'PARENT_DELETED', 'parent', targetParentId);
    return { ok: true };
  }

  private async getParentDeleteBlockers(parentId: string, userId: string) {
    const blockingHistoryOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT
          (SELECT COUNT(*)::int
             FROM billing_records br
             JOIN orders o ON o.id = br.order_id
            WHERE br.parent_id = $1
              AND o.deleted_at IS NULL
              AND o.status <> 'CANCELLED') AS active_billing_count,
          (SELECT COUNT(*)::int FROM billing_records WHERE parent_id = $1) AS total_billing_count,
          (SELECT COUNT(*)::int
             FROM orders
            WHERE placed_by_user_id = $2
              AND deleted_at IS NULL
              AND status <> 'CANCELLED') AS active_orders_count,
          (SELECT COUNT(*)::int FROM orders WHERE placed_by_user_id = $2) AS total_orders_count,
          (SELECT COUNT(*)::int FROM order_carts WHERE created_by_user_id = $2) AS carts_count,
          (SELECT COUNT(*)::int FROM favourite_meals WHERE created_by_user_id = $2) AS favourites_count,
          (SELECT COUNT(*)::int FROM admin_audit_logs WHERE actor_user_id = $2) AS audit_count
      ) t;
      `,
      [parentId, userId],
    );
    const blockingHistory = this.parseJsonLine<{
      active_billing_count: number;
      total_billing_count: number;
      active_orders_count: number;
      total_orders_count: number;
      carts_count: number;
      favourites_count: number;
      audit_count: number;
    }>(blockingHistoryOut);
    return {
      activeBillingCount: Number(blockingHistory?.active_billing_count || 0),
      totalBillingCount: Number(blockingHistory?.total_billing_count || 0),
      activeOrdersCount: Number(blockingHistory?.active_orders_count || 0),
      totalOrdersCount: Number(blockingHistory?.total_orders_count || 0),
      cartsCount: Number(blockingHistory?.carts_count || 0),
      favouritesCount: Number(blockingHistory?.favourites_count || 0),
      auditCount: Number(blockingHistory?.audit_count || 0),
    };
  }

  private async softDeleteParent(parentId: string, userId: string) {
    await runSql(`DELETE FROM parent_children WHERE parent_id = $1;`, [parentId]);
    await runSql(
      `UPDATE parents
       SET deleted_at = now(),
           updated_at = now()
       WHERE id = $1;`,
      [parentId],
    );
    await runSql(
      `UPDATE users
       SET is_active = false,
           deleted_at = now(),
           updated_at = now(),
           email = NULL,
           phone_number = NULL
       WHERE id = $1;`,
      [userId],
    );
    await runSql(`DELETE FROM user_preferences WHERE user_id = $1;`, [userId]);
    await runSql(`DELETE FROM auth_refresh_sessions WHERE user_id = $1;`, [userId]);
  }

  private async getYoungsterDeleteBlockers(youngsterId: string, userId: string) {
    const blockerRaw = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT
          (SELECT COUNT(*)::int
             FROM orders
            WHERE child_id = $1
              AND deleted_at IS NULL
              AND status <> 'CANCELLED') AS active_orders_count,
          (SELECT COUNT(*)::int FROM orders WHERE child_id = $1) AS total_orders_count,
          (SELECT COUNT(*)::int
             FROM billing_records br
             JOIN orders o ON o.id = br.order_id
            WHERE o.child_id = $1
              AND o.deleted_at IS NULL
              AND o.status <> 'CANCELLED') AS active_billing_count,
          (SELECT COUNT(*)::int
             FROM billing_records br
             JOIN orders o ON o.id = br.order_id
            WHERE o.child_id = $1) AS total_billing_count,
          (SELECT COUNT(*)::int FROM order_carts WHERE child_id = $1 OR created_by_user_id = $2) AS carts_count,
          (SELECT COUNT(*)::int FROM favourite_meals WHERE child_id = $1 OR created_by_user_id = $2) AS favourites_count,
          (SELECT COUNT(*)::int FROM admin_audit_logs WHERE actor_user_id = $2) AS audit_count
      ) t;
      `,
      [youngsterId, userId],
    );
    const blocker = this.parseJsonLine<{
      active_orders_count: number;
      total_orders_count: number;
      active_billing_count: number;
      total_billing_count: number;
      carts_count: number;
      favourites_count: number;
      audit_count: number;
    }>(blockerRaw);
    return {
      activeOrdersCount: Number(blocker?.active_orders_count || 0),
      totalOrdersCount: Number(blocker?.total_orders_count || 0),
      activeBillingCount: Number(blocker?.active_billing_count || 0),
      totalBillingCount: Number(blocker?.total_billing_count || 0),
      cartsCount: Number(blocker?.carts_count || 0),
      favouritesCount: Number(blocker?.favourites_count || 0),
      auditCount: Number(blocker?.audit_count || 0),
    };
  }

  private async softDeleteYoungster(youngsterId: string, userId: string) {
    await runSql(
      `UPDATE children
       SET is_active = false,
           deleted_at = now(),
           updated_at = now()
       WHERE id = $1;`,
      [youngsterId],
    );
    await runSql(
      `UPDATE users
       SET is_active = false,
           deleted_at = now(),
           updated_at = now(),
           email = NULL,
           phone_number = NULL
       WHERE id = $1;`,
      [userId],
    );
    const cartIdsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oc.id
        FROM order_carts oc
        WHERE (oc.child_id = $1 OR oc.created_by_user_id = $2)
          AND NOT EXISTS (
            SELECT 1
            FROM orders o
            WHERE o.cart_id = oc.id
          )
      ) t;
      `,
      [youngsterId, userId],
    );
    const cartIds = this.parseJsonLines<{ id: string }>(cartIdsOut).map((row) => row.id);
    if (cartIds.length > 0) {
      const cartIdPlaceholders = cartIds.map((_, index) => `$${index + 1}`).join(', ');
      await runSql(`DELETE FROM cart_items WHERE cart_id IN (${cartIdPlaceholders});`, cartIds);
      await runSql(`DELETE FROM order_carts WHERE id IN (${cartIdPlaceholders});`, cartIds);
    }

    const favouriteIdsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT fm.id
        FROM favourite_meals fm
        WHERE fm.child_id = $1 OR fm.created_by_user_id = $2
      ) t;
      `,
      [youngsterId, userId],
    );
    const favouriteIds = this.parseJsonLines<{ id: string }>(favouriteIdsOut).map((row) => row.id);
    if (favouriteIds.length > 0) {
      const favouriteIdPlaceholders = favouriteIds.map((_, index) => `$${index + 1}`).join(', ');
      await runSql(`DELETE FROM favourite_meal_items WHERE favourite_meal_id IN (${favouriteIdPlaceholders});`, favouriteIds);
      await runSql(`DELETE FROM favourite_meals WHERE id IN (${favouriteIdPlaceholders});`, favouriteIds);
    }
    await runSql(`DELETE FROM auth_refresh_sessions WHERE user_id = $1;`, [userId]);
  }

  private async hardDeleteYoungsterIfSafe(youngsterId: string, userId: string) {
    const blocker = await this.getYoungsterDeleteBlockers(youngsterId, userId);
    if (
      blocker.totalOrdersCount > 0 ||
      blocker.totalBillingCount > 0 ||
      blocker.cartsCount > 0 ||
      blocker.favouritesCount > 0 ||
      blocker.auditCount > 0
    ) {
      throw new BadRequestException('Cannot hard-delete youngster with order or billing history');
    }
    await runSql(`DELETE FROM parent_children WHERE child_id = $1;`, [youngsterId]);
    await runSql(`DELETE FROM child_dietary_restrictions WHERE child_id = $1;`, [youngsterId]);
    await runSql(`DELETE FROM user_preferences WHERE user_id = $1;`, [userId]);
    await runSql(`DELETE FROM auth_refresh_sessions WHERE user_id = $1;`, [userId]);
    await runSql(`DELETE FROM children WHERE id = $1;`, [youngsterId]);
    await runSql(`DELETE FROM users WHERE id = $1;`, [userId]);
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
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT c.id, c.user_id FROM children c
         WHERE c.id = $1 AND c.deleted_at IS NULL
       ) t;`,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const child = this.parseJsonLine<{ id: string; user_id: string }>(out);
    const userUpdates: string[] = [];
    const userParams: unknown[] = [];
    if (input.firstName) { userParams.push(input.firstName.trim()); userUpdates.push(`first_name = $${userParams.length}`); }
    if (input.lastName) { userParams.push(input.lastName.trim()); userUpdates.push(`last_name = $${userParams.length}`); }
    const currentUserOut = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT phone_number, email
         FROM users
         WHERE id = $1
         LIMIT 1
       ) t;`,
      [child.user_id],
    );
    const currentUser = currentUserOut
      ? this.parseJsonLine<{ phone_number?: string | null; email?: string | null }>(currentUserOut)
      : { phone_number: null, email: null };
    let nextPhone = String(currentUser.phone_number || '');
    let nextEmail = String(currentUser.email || '').trim().toLowerCase();
    if (input.phoneNumber !== undefined) {
      nextPhone = this.normalizePhone(input.phoneNumber);
      if (!nextPhone) throw new BadRequestException('phoneNumber cannot be empty');
      if (await this.findActiveUserByPhone(nextPhone, child.user_id)) {
        throw new ConflictException('That phone number is already taken');
      }
      userParams.push(nextPhone);
      userUpdates.push(`phone_number = $${userParams.length}`);
    }
    if (input.email !== undefined) {
      nextEmail = input.email.trim().toLowerCase();
      if (!nextEmail) throw new BadRequestException('email cannot be empty');
      if (await this.findActiveUserByEmail(nextEmail, child.user_id)) {
        throw new ConflictException('That email is already taken');
      }
      userParams.push(nextEmail);
      userUpdates.push(`email = $${userParams.length}`);
    }
    if (userUpdates.length > 0) {
      userUpdates.push('updated_at = now()');
      userParams.push(child.user_id);
      await runSql(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = $${userParams.length};`, userParams);
    }
    await this.schema!.ensureChildCurrentGradeColumn();
    const childUpdates: string[] = [];
    const childParams: unknown[] = [];
    if (input.schoolGrade !== undefined) {
      const registrationGrade = normalizeGradeLabel(input.schoolGrade);
      if (!registrationGrade) throw new BadRequestException('schoolGrade cannot be empty');
      childParams.push(registrationGrade);
      childUpdates.push(`school_grade = $${childParams.length}`);
    }
    if (input.currentGrade !== undefined) {
      const currentGrade = normalizeGradeLabel(input.currentGrade);
      childParams.push(currentGrade || null);
      childUpdates.push(`current_school_grade = $${childParams.length}`);
    }
    if (input.schoolId) { this.assertValidUuid(input.schoolId, 'schoolId'); childParams.push(input.schoolId); childUpdates.push(`school_id = $${childParams.length}`); }
    if (input.gender) { childParams.push(input.gender.toUpperCase()); childUpdates.push(`gender = $${childParams.length}::gender_type`); }
    if (input.dateOfBirth) { childParams.push(this.validateServiceDate(input.dateOfBirth)); childUpdates.push(`date_of_birth = $${childParams.length}::date`); }
    if (childUpdates.length > 0) {
      childUpdates.push('updated_at = now()');
      childParams.push(youngsterId);
      await runSql(`UPDATE children SET ${childUpdates.join(', ')} WHERE id = $${childParams.length};`, childParams);
    }
    if (input.parentId) {
      this.assertValidUuid(input.parentId, 'parentId');
      const parentOut = await runSql(
        `SELECT row_to_json(t)::text FROM (
           SELECT u.phone_number, u.email
           FROM parents p
           JOIN users u ON u.id = p.user_id
           WHERE p.id = $1
             AND p.deleted_at IS NULL
             AND u.deleted_at IS NULL
             AND u.is_active = true
           LIMIT 1
         ) t;`,
        [input.parentId],
      );
      const parent = parentOut
        ? this.parseJsonLine<{ phone_number?: string | null; email?: string | null }>(parentOut)
        : null;
      if (!parent) throw new BadRequestException('Parent not found');
      if (nextEmail && nextEmail === String(parent.email || '').trim().toLowerCase()) {
        throw new BadRequestException('Student email cannot be the same as parent email');
      }
      if (this.phoneCompareKey(nextPhone) === this.phoneCompareKey(parent.phone_number)) {
        throw new BadRequestException('Student phone number cannot be the same as parent phone number');
      }
      await runSql(`DELETE FROM parent_children WHERE child_id = $1;`, [youngsterId]);
      await runSql(
        `INSERT INTO parent_children (parent_id, child_id)
         VALUES ($1, $2)
         ON CONFLICT (parent_id, child_id) DO NOTHING;`,
        [input.parentId, youngsterId],
      );
    }
    if (input.allergies !== undefined) {
      const details = input.allergies.trim();
      if (!details) {
        await runSql(
          `UPDATE child_dietary_restrictions
           SET is_active = false,
               deleted_at = now(),
               updated_at = now()
           WHERE child_id = $1
             AND upper(restriction_label) = 'ALLERGIES'
             AND deleted_at IS NULL;`,
          [youngsterId],
        );
      } else {
        await runSql(
          `INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
           VALUES ($1, 'ALLERGIES', $2, true)
           ON CONFLICT (child_id, restriction_label)
           DO UPDATE SET restriction_details = EXCLUDED.restriction_details,
                         is_active = true,
                         deleted_at = NULL,
                         updated_at = now();`,
          [youngsterId, details],
        );
      }
    }
    await this.audit!.recordAdminAudit(actor, 'YOUNGSTER_PROFILE_UPDATED', 'youngster', youngsterId, {
      changedFields: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
    });
    return { ok: true };
  }

  async deleteYoungster(actor: AccessUser, youngsterId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT c.id, c.user_id FROM children c
         WHERE c.id = $1 AND c.deleted_at IS NULL
       ) t;`,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const child = this.parseJsonLine<{ id: string; user_id: string }>(out);
    const blocker = await this.getYoungsterDeleteBlockers(youngsterId, child.user_id);
    if (blocker.activeOrdersCount > 0 || blocker.activeBillingCount > 0) {
      throw new BadRequestException(
        `Cannot delete student with active orders or billing (orders: ${blocker.activeOrdersCount}, billing: ${blocker.activeBillingCount})`,
      );
    }
    if (
      blocker.totalOrdersCount > 0 ||
      blocker.totalBillingCount > 0 ||
      blocker.auditCount > 0
    ) {
      await this.softDeleteYoungster(youngsterId, child.user_id);
    } else {
      await this.hardDeleteYoungsterIfSafe(youngsterId, child.user_id);
    }
    await this.audit!.recordAdminAudit(actor, 'YOUNGSTER_DELETED', 'youngster', youngsterId);
    return { ok: true };
  }

  async adminResetUserPassword(actor: AccessUser, userId: string, newPasswordRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(userId, 'userId');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, username, role::text AS role
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
    `,
      [userId],
    );
    if (!out) throw new NotFoundException('User not found');
    const target = this.parseJsonLine<{ id: string; username: string; role: string }>(out);
    if (!['PARENT', 'CHILD', 'DELIVERY'].includes(target.role)) {
      throw new BadRequestException('Only PARENT, CHILD, and DELIVERY password reset is allowed here');
    }
    const generatedPassword = `Tmp#${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const newPassword = (newPasswordRaw || '').trim() || generatedPassword;
    validatePasswordPolicy(newPassword, 'newPassword');
    const passwordHash = this.hashPassword(newPassword);
    await runSql(
      `UPDATE users
       SET password_hash = $1,
           updated_at = now()
      WHERE id = $2;`,
      [passwordHash, userId],
    );
    await runSql(
      `UPDATE auth_refresh_sessions
       SET revoked_at = now()
       WHERE user_id = $1
         AND revoked_at IS NULL;`,
      [userId],
    );
    await this.setAdminVisiblePassword(userId, newPassword, 'RESET');
    await this.audit!.recordAdminAudit(actor, 'USER_PASSWORD_RESET', 'user', userId, {
      role: target.role,
      username: target.username,
      generated: !newPasswordRaw,
    });
    return { ok: true, userId, username: target.username, role: target.role, newPassword };
  }

  async adminGetUserPassword(actor: AccessUser, userId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(userId, 'userId');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, username, role::text AS role, phone_number
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      ) t;
      `,
      [userId],
    );
    if (!out) throw new NotFoundException('User not found');
    const target = this.parseJsonLine<{ id: string; username: string; role: string; phone_number?: string | null }>(out);
    if (!['PARENT', 'CHILD', 'DELIVERY'].includes(target.role)) {
      throw new BadRequestException('Only PARENT, CHILD, and DELIVERY password view is allowed here');
    }
    const stored = await this.getAdminVisiblePasswordRow(userId);
    const fallbackPassword = this.buildGeneratedPasswordFromPhone(target.phone_number);
    const password = stored?.password_plaintext || fallbackPassword;
    if (!password) {
      throw new NotFoundException('Stored password not found for this user');
    }
    return {
      ok: true,
      userId,
      username: target.username,
      role: target.role,
      password,
      source: stored?.source || 'REGISTRATION_FALLBACK',
      updatedAt: stored?.updated_at || null,
    };
  }

  async adminResetYoungsterPassword(actor: AccessUser, youngsterId: string, newPasswordRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.user_id
        FROM children c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
          AND c.deleted_at IS NULL
          AND c.is_active = true
          AND u.deleted_at IS NULL
          AND u.role = 'CHILD'
        LIMIT 1
      ) t;
      `,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const target = this.parseJsonLine<{ user_id: string }>(out);
    return this.adminResetUserPassword(actor, target.user_id, newPasswordRaw);
  }

  async adminGetYoungsterPassword(actor: AccessUser, youngsterId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.user_id
        FROM children c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
          AND c.deleted_at IS NULL
          AND c.is_active = true
          AND u.deleted_at IS NULL
          AND u.role = 'CHILD'
        LIMIT 1
      ) t;
      `,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const target = this.parseJsonLine<{ user_id: string }>(out);
    return this.adminGetUserPassword(actor, target.user_id);
  }

  // ─── Ingredients CRUD ────────────────────────────────────────────────────

  async createIngredient(actor: AccessUser, input: { name?: string; allergenFlag?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const name = (input.name || '').trim();
    const allergenFlag = input.allergenFlag === true;
    const existingOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, name, allergen_flag, is_active
         FROM ingredients
         WHERE lower(name) = lower($1)
         LIMIT 1
       ) t;`,
      [name],
    );
    if (existingOut) {
      const existing = this.parseJsonLine<{ id: string; allergen_flag: boolean }>(existingOut);
      const updateOut = await runSql(
        `WITH updated AS (
           UPDATE ingredients
           SET name = $1,
               allergen_flag = ($2 OR allergen_flag),
               is_active = true,
               deleted_at = NULL,
               updated_at = now()
           WHERE id = $3
           RETURNING id, name, allergen_flag, is_active
         )
         SELECT row_to_json(updated)::text FROM updated;`,
        [name, allergenFlag, existing.id],
      );
      if (!updateOut) throw new BadRequestException('Failed to update ingredient');
      const ingredient = this.parseJsonLine<{ id: string; name: string }>(updateOut);
      await this.audit!.recordAdminAudit(actor, 'INGREDIENT_UPSERTED', 'ingredient', ingredient.id, {
        name: ingredient.name,
      });
      return ingredient;
    }
    const insertOut = await runSql(
      `WITH inserted AS (
         INSERT INTO ingredients (name, allergen_flag, is_active)
         VALUES ($1, $2, true)
         RETURNING id, name, allergen_flag, is_active
       )
       SELECT row_to_json(inserted)::text FROM inserted;`,
      [name, allergenFlag],
    );
    if (!insertOut) throw new BadRequestException('Failed to create ingredient');
    const ingredient = this.parseJsonLine<{ id: string; name: string }>(insertOut);
    await this.audit!.recordAdminAudit(actor, 'INGREDIENT_CREATED', 'ingredient', ingredient.id, {
      name: ingredient.name,
    });
    return ingredient;
  }

  async updateIngredient(actor: AccessUser, ingredientId: string, input: { name?: string; allergenFlag?: boolean; isActive?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(ingredientId, 'ingredientId');
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.name) { params.push(input.name.trim()); updates.push(`name = $${params.length}`); }
    if (typeof input.allergenFlag === 'boolean') { params.push(input.allergenFlag); updates.push(`allergen_flag = $${params.length}`); }
    if (typeof input.isActive === 'boolean') { params.push(input.isActive); updates.push(`is_active = $${params.length}`); }
    if (updates.length === 0) throw new BadRequestException('No fields to update');
    updates.push('updated_at = now()');
    params.push(ingredientId);
    const out = await runSql(
      `WITH updated AS (
         UPDATE ingredients SET ${updates.join(', ')}
         WHERE id = $${params.length} AND deleted_at IS NULL
         RETURNING id, name, allergen_flag, is_active
       )
       SELECT row_to_json(updated)::text FROM updated;`,
      params,
    );
    if (!out) throw new NotFoundException('Ingredient not found');
    const ingredient = this.parseJsonLine<{ id: string; name: string }>(out);
    await this.audit!.recordAdminAudit(actor, 'INGREDIENT_UPDATED', 'ingredient', ingredient.id, {
      name: ingredient.name,
    });
    return ingredient;
  }

  async deleteIngredient(actor: AccessUser, ingredientId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(ingredientId, 'ingredientId');
    const out = await runSql(
      `UPDATE ingredients SET deleted_at = now(), is_active = false, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id;`,
      [ingredientId],
    );
    if (!out) throw new NotFoundException('Ingredient not found');
    await this.audit!.recordAdminAudit(actor, 'INGREDIENT_DELETED', 'ingredient', ingredientId);
    return { ok: true };
  }

  // ─── Menu Items CRUD ─────────────────────────────────────────────────────

  async deleteMenuItem(actor: AccessUser, itemId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(itemId, 'itemId');

    const itemOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, is_available, deleted_at::text AS deleted_at
         FROM menu_items
         WHERE id = $1
         LIMIT 1
       ) t;`,
      [itemId],
    );
    if (!itemOut) throw new NotFoundException('Menu item not found');
    const item = this.parseJsonLine<{ id: string; is_available: boolean; deleted_at?: string | null }>(itemOut);

    if (item.is_available) {
      throw new BadRequestException('Deactivate dish first before deleting permanently');
    }

    // Soft-delete the dish so FK references in order history remain valid.
    // Clear cart and favourite references (pending/ephemeral data) before hiding.
    await runSql(`DELETE FROM cart_items WHERE menu_item_id = $1;`, [itemId]);
    await runSql(`DELETE FROM favourite_meal_items WHERE menu_item_id = $1;`, [itemId]);
    await runSql(
      `UPDATE menu_items SET deleted_at = now(), updated_at = now() WHERE id = $1;`,
      [itemId],
    );
    this.clearPublicMenuCache();
    await this.audit!.recordAdminAudit(actor, 'MENU_ITEM_DELETED', 'menu-item', itemId);
    return { ok: true };
  }

  // ─── Delivery User CRUD ──────────────────────────────────────────────────

  async createDeliveryUser(
    actor: AccessUser,
    input: { username?: string; password?: string; firstName?: string; lastName?: string; phoneNumber?: string; email?: string },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const username = (input.username || '').trim().toLowerCase();
    const password = (input.password || '').trim();
    const firstName = (input.firstName || '').trim();
    const lastName = (input.lastName || '').trim();
    const phoneNumber = (input.phoneNumber || '').trim();
    const email = (input.email || '').trim().toLowerCase();
    if (username.length < 3) throw new BadRequestException('Username too short');
    validatePasswordPolicy(password, 'password');
    const passwordHash = this.hashPassword(password);
    let out: string | null = null;
    try {
      const existingOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT id, username, email, deleted_at::text AS deleted_at
           FROM users
           WHERE username = $1
              OR ($2 IS NOT NULL AND lower(email) = lower($2))
           ORDER BY CASE WHEN username = $1 THEN 0 ELSE 1 END
           LIMIT 1
         ) t;`,
        [username, email || null],
      );
      const existingRows = this.parseJsonLines<{ id: string; username: string; email?: string | null; deleted_at?: string | null }>(existingOut);
      const existing = existingRows[0] || null;

      if (existing && !existing.deleted_at) {
        if (existing.username === username) throw new ConflictException('Username already exists');
        throw new ConflictException('Email already exists');
      }

      if (existing && existing.deleted_at) {
        out = await runSql(
          `WITH restored AS (
             UPDATE users
             SET role = 'DELIVERY',
                 username = $1,
                 password_hash = $2,
                 first_name = $3,
                 last_name = $4,
                 phone_number = $5,
                 email = $6,
                 is_active = true,
                 deleted_at = NULL,
                 updated_at = now()
             WHERE id = $7
             RETURNING id, username, first_name, last_name
           )
           SELECT row_to_json(restored)::text FROM restored;`,
          [username, passwordHash, firstName, lastName, phoneNumber, email || null, existing.id],
        );
      } else {
        out = await runSql(
          `WITH inserted AS (
             INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
             VALUES ('DELIVERY', $1, $2, $3, $4, $5, $6, true)
             RETURNING id, username, first_name, last_name
           )
           SELECT row_to_json(inserted)::text FROM inserted;`,
          [username, passwordHash, firstName, lastName, phoneNumber, email || null],
        );
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      const msg = String((error as Error)?.message || '').toLowerCase();
      if (msg.includes('users_username_uq') || (msg.includes('duplicate key') && msg.includes('username'))) {
        throw new ConflictException('Username already exists');
      }
      if (msg.includes('users_email_ci_uq') || (msg.includes('duplicate key') && msg.includes('email'))) {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
    if (!out) throw new BadRequestException('Failed to create delivery user');
    const user = this.parseJsonLine<{ id: string; username: string; first_name: string; last_name: string }>(out);
    await this.setAdminVisiblePassword(user.id, password, 'MANUAL_CREATE');
    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [user.id],
    );
    await this.audit!.recordAdminAudit(actor, 'DELIVERY_USER_CREATED', 'user', user.id, { username: user.username });
    return user;
  }

  async deactivateDeliveryUser(actor: AccessUser, targetUserId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetUserId, 'userId');
    const out = await runSql(
      `WITH updated AS (
         UPDATE users SET is_active = false, updated_at = now()
         WHERE id = $1 AND role = 'DELIVERY' AND deleted_at IS NULL
         RETURNING id, username, first_name, last_name
       )
       SELECT row_to_json(updated)::text FROM updated;`,
      [targetUserId],
    );
    if (!out) throw new NotFoundException('Delivery user not found');
    const user = this.parseJsonLine<{ id: string; username: string }>(out);
    await this.audit!.recordAdminAudit(actor, 'DELIVERY_USER_DEACTIVATED', 'user', user.id, { username: user.username });
    return { ok: true, user };
  }

  async updateDeliveryUser(
    actor: AccessUser,
    targetUserId: string,
    input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; username?: string; isActive?: boolean },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetUserId, 'userId');

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.username !== undefined) {
      const username = input.username.trim().toLowerCase();
      if (!username) throw new BadRequestException('username cannot be empty');
      if (username.length < 3) throw new BadRequestException('username too short');
      params.push(username);
      sets.push(`username = $${params.length}`);
    }
    if (input.firstName !== undefined) {
      const firstName = input.firstName.trim();
      if (!firstName) throw new BadRequestException('firstName cannot be empty');
      params.push(firstName);
      sets.push(`first_name = $${params.length}`);
    }
    if (input.lastName !== undefined) {
      const lastName = input.lastName.trim();
      if (!lastName) throw new BadRequestException('lastName cannot be empty');
      params.push(lastName);
      sets.push(`last_name = $${params.length}`);
    }
    if (input.phoneNumber !== undefined) {
      const phone = input.phoneNumber.trim();
      if (!phone) throw new BadRequestException('phoneNumber cannot be empty');
      params.push(phone);
      sets.push(`phone_number = $${params.length}`);
    }
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      params.push(email || null);
      sets.push(`email = $${params.length}`);
    }
    if (input.isActive !== undefined) {
      params.push(Boolean(input.isActive));
      sets.push(`is_active = $${params.length}`);
    }

    if (sets.length === 0) throw new BadRequestException('No fields to update');

    params.push(targetUserId);
    const userIdParam = params.length;
    let out: string;
    try {
      out = await runSql(
        `WITH updated AS (
           UPDATE users
           SET ${sets.join(', ')},
               updated_at = now()
           WHERE id = $${userIdParam}
             AND role = 'DELIVERY'
             AND deleted_at IS NULL
           RETURNING id, username, first_name, last_name, phone_number, email, is_active
         )
         SELECT row_to_json(updated)::text FROM updated;`,
        params,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('users_email_ci_uq') || (msg.includes('duplicate key') && msg.includes('email'))) {
        throw new ConflictException('That email address is already used by another account');
      }
      if (msg.includes('users_username_key') || (msg.includes('duplicate key') && msg.includes('username'))) {
        throw new ConflictException('That username is already taken');
      }
      throw err;
    }
    if (!out) throw new NotFoundException('Delivery user not found');
    const user = this.parseJsonLine<{ id: string; username: string }>(out);
    await this.audit!.recordAdminAudit(actor, 'DELIVERY_USER_UPDATED', 'user', user.id, {
      changedFields: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
    });
    return { ok: true, user };
  }

  async deleteDeliveryUser(actor: AccessUser, targetUserId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.assertValidUuid(targetUserId, 'userId');

    const pendingAssignmentExists = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM delivery_assignments da
         JOIN orders o ON o.id = da.order_id
         WHERE da.delivery_user_id = $1
           AND o.deleted_at IS NULL
           AND o.delivery_status <> 'DELIVERED'
       );`,
      [targetUserId],
    );
    if (pendingAssignmentExists === 't') {
      throw new BadRequestException('Cannot delete delivery user with active assignments');
    }

    await this.schema!.ensureDeliverySchoolAssignmentsTable();
    await runSql(
      `UPDATE delivery_school_assignments
       SET is_active = false, updated_at = now()
       WHERE delivery_user_id = $1;`,
      [targetUserId],
    );

    const out = await runSql(
      `WITH updated AS (
         UPDATE users
         SET is_active = false,
             deleted_at = now(),
             updated_at = now()
         WHERE id = $1
           AND role = 'DELIVERY'
           AND deleted_at IS NULL
         RETURNING id, username, first_name, last_name
       )
       SELECT row_to_json(updated)::text FROM updated;`,
      [targetUserId],
    );
    if (!out) throw new NotFoundException('Delivery user not found');
    const user = this.parseJsonLine<{ id: string; username: string }>(out);
    await this.audit!.recordAdminAudit(actor, 'DELIVERY_USER_DELETED', 'user', user.id, { username: user.username });
    return { ok: true, user };
  }

  private getPublicMenuCacheKey(serviceDate: string, session: SessionType | null) {
    return `${serviceDate}|${session || 'ALL'}`;
  }

  private clearPublicMenuCache() {
    this.publicMenuCache.clear();
  }

  async getAdminAuditLogs(actor: AccessUser, input: { limit?: string; action?: string; targetType?: string }) {
    return this.audit!.getAdminAuditLogs(actor, input);
  }

  // ─── Site settings (chef message, etc.) ───────────────────────────────────

  async getSiteSettings() {
    await this.schema!.ensureSiteSettingsTable();
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('multiorder_future_enabled', 'false')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT
          COALESCE(MAX(CASE WHEN setting_key = 'chef_message' THEN setting_value END), '') AS chef_message,
          COALESCE(MAX(CASE WHEN setting_key = 'hero_image_url' THEN setting_value END), '/schoolcatering/assets/hero-meal.jpg') AS hero_image_url,
          COALESCE(MAX(CASE WHEN setting_key = 'hero_image_caption' THEN setting_value END), 'Enchanting Nourished Zesty Original Meals') AS hero_image_caption,
          COALESCE(MAX(CASE WHEN setting_key = 'ordering_cutoff_time' THEN setting_value END), '08:00') AS ordering_cutoff_time,
          COALESCE(MAX(CASE WHEN setting_key = 'assistance_message' THEN setting_value END), 'For Assistance Please Whatsapp +6285211710217') AS assistance_message,
          COALESCE(MAX(CASE WHEN setting_key = 'multiorder_future_enabled' THEN setting_value END), 'false') AS multiorder_future_enabled,
          COALESCE(MAX(CASE WHEN setting_key = 'ai_future_enabled' THEN setting_value END), 'false') AS ai_future_enabled
        FROM site_settings
      ) t;
    `);
    const lines = out.split('\n').map((x: string) => x.trim()).filter(Boolean);
    const data = lines[0]
      ? (JSON.parse(lines[0]) as {
          chef_message?: string;
          hero_image_url?: string;
          hero_image_caption?: string;
          ordering_cutoff_time?: string;
          assistance_message?: string;
          multiorder_future_enabled?: string;
          ai_future_enabled?: string;
        })
      : {};
    return {
      chef_message: data.chef_message ?? '',
      hero_image_url: data.hero_image_url ?? '/schoolcatering/assets/hero-meal.jpg',
      hero_image_caption: data.hero_image_caption ?? 'Enchanting Nourished Zesty Original Meals',
      ordering_cutoff_time: this.normalizeOrderingCutoffTime(data.ordering_cutoff_time ?? '08:00'),
      assistance_message: data.assistance_message ?? 'For Assistance Please Whatsapp +6285211710217',
      multiorder_future_enabled: String(data.multiorder_future_enabled || 'false').trim().toLowerCase() === 'true',
      ai_future_enabled: String(data.ai_future_enabled || 'false').trim().toLowerCase() === 'true',
    };
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
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const current = await this.getSiteSettings();
    const chefMessage = typeof input.chef_message === 'string' ? input.chef_message.trim() : current.chef_message;
    const heroImageUrl = typeof input.hero_image_url === 'string' ? input.hero_image_url.trim() : current.hero_image_url;
    const heroImageCaption = typeof input.hero_image_caption === 'string' ? input.hero_image_caption.trim() : current.hero_image_caption;
    const orderingCutoffTime = this.normalizeOrderingCutoffTime(input.ordering_cutoff_time ?? current.ordering_cutoff_time);
    const assistanceMessage = typeof input.assistance_message === 'string'
      ? input.assistance_message.trim()
      : current.assistance_message;
    const multiorderFutureEnabled = typeof input.multiorder_future_enabled === 'boolean'
      ? input.multiorder_future_enabled
      : Boolean(current.multiorder_future_enabled);
    const aiFutureEnabled = typeof input.ai_future_enabled === 'boolean'
      ? input.ai_future_enabled
      : Boolean(current.ai_future_enabled);
    if (chefMessage.length > 500) throw new BadRequestException('chef_message must be 500 characters or fewer');
    if (heroImageCaption.length > 200) throw new BadRequestException('hero_image_caption must be 200 characters or fewer');
    if (heroImageUrl.length > 2000) throw new BadRequestException('hero_image_url must be 2000 characters or fewer');
    if (assistanceMessage.length > 200) throw new BadRequestException('assistance_message must be 200 characters or fewer');
    await this.schema!.ensureSiteSettingsTable();
    await runSql(
      `INSERT INTO site_settings (setting_key, setting_value, updated_at)
       VALUES
         ('chef_message', $1, now()),
         ('hero_image_url', $2, now()),
         ('hero_image_caption', $3, now()),
         ('ordering_cutoff_time', $4, now()),
         ('assistance_message', $5, now()),
         ('multiorder_future_enabled', $6, now()),
         ('ai_future_enabled', $7, now())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now();`,
      [
        chefMessage,
        heroImageUrl || '/schoolcatering/assets/hero-meal.jpg',
        heroImageCaption,
        orderingCutoffTime,
        assistanceMessage,
        multiorderFutureEnabled ? 'true' : 'false',
        aiFutureEnabled ? 'true' : 'false',
      ],
    );
    return {
      chef_message: chefMessage,
      hero_image_url: heroImageUrl || '/schoolcatering/assets/hero-meal.jpg',
      hero_image_caption: heroImageCaption,
      ordering_cutoff_time: orderingCutoffTime,
      assistance_message: assistanceMessage,
      multiorder_future_enabled: multiorderFutureEnabled,
      ai_future_enabled: aiFutureEnabled,
    };
  }

  private normalizeMultiOrderRepeatDays(repeatDaysRaw: string[]) {
    const map = new Map<string, number>([
      ['MON', 1], ['MONDAY', 1], ['1', 1],
      ['TUE', 2], ['TUESDAY', 2], ['2', 2],
      ['WED', 3], ['WEDNESDAY', 3], ['3', 3],
      ['THU', 4], ['THURSDAY', 4], ['4', 4],
      ['FRI', 5], ['FRIDAY', 5], ['5', 5],
      ['SAT', 6], ['SATURDAY', 6], ['6', 6],
      ['SUN', 7], ['SUNDAY', 7], ['0', 7], ['7', 7],
    ]);
    const normalized = [...new Set((repeatDaysRaw || [])
      .map((value) => map.get(String(value || '').trim().toUpperCase()) || 0)
      .filter((value) => value > 0))].sort((a, b) => a - b);
    if (normalized.length === 0) throw new BadRequestException('repeatDays is required');
    return normalized;
  }

  private async getMultiOrderParentId(actor: AccessUser, childId: string) {
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      await this.ensureParentOwnsChild(parentId, childId);
      return parentId;
    }
    return this.getParentIdByChildId(childId);
  }

  async mergeFamily(actor: AccessUser, input: { sourceFamilyId?: string; targetFamilyId?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.ensureFamilyIdColumns();

    const sourceFamilyId = String(input.sourceFamilyId || '').trim();
    const targetFamilyId = String(input.targetFamilyId || '').trim();
    this.assertValidUuid(sourceFamilyId, 'sourceFamilyId');
    this.assertValidUuid(targetFamilyId, 'targetFamilyId');
    if (sourceFamilyId === targetFamilyId) {
      throw new BadRequestException('Source and target family must be different');
    }

    const sourceExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM parents WHERE family_id = $1::uuid AND deleted_at IS NULL
         UNION
         SELECT 1 FROM children WHERE family_id = $1::uuid AND deleted_at IS NULL
       );`,
      [sourceFamilyId],
    );
    if (sourceExists !== 't') throw new NotFoundException('Source family not found');

    const targetExists = await runSql(
      `SELECT EXISTS (
         SELECT 1 FROM parents WHERE family_id = $1::uuid AND deleted_at IS NULL
         UNION
         SELECT 1 FROM children WHERE family_id = $1::uuid AND deleted_at IS NULL
       );`,
      [targetFamilyId],
    );
    if (targetExists !== 't') throw new NotFoundException('Target family not found');

    await this.mergeFamilyIds(targetFamilyId, sourceFamilyId);

    const parentCount = Number(await runSql(
      `SELECT COUNT(*)::int
       FROM parents
       WHERE family_id = $1::uuid
         AND deleted_at IS NULL;`,
      [targetFamilyId],
    ) || 0);
    const childCount = Number(await runSql(
      `SELECT COUNT(*)::int
       FROM children
       WHERE family_id = $1::uuid
         AND deleted_at IS NULL
         AND is_active = true;`,
      [targetFamilyId],
    ) || 0);

    await this.audit!.recordAdminAudit(actor, 'FAMILY_MERGED', 'family', targetFamilyId, {
      sourceFamilyId,
      targetFamilyId,
      parentCount,
      childCount,
    });

    return {
      ok: true,
      targetFamilyId,
      sourceFamilyId,
      parentCount,
      childCount,
    };
  }

  private async getMultiOrderOwnerChildId(actor: AccessUser, childIdRaw: string) {
    const childId = String(childIdRaw || '').trim();
    this.assertValidUuid(childId, 'childId');
    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      await this.ensureParentOwnsChild(parentId, childId);
    }
    return childId;
  }

  private async getMultiOrderMenuSnapshot(session: SessionType, items: CartItemInput[]) {
    if (!Array.isArray(items) || items.length === 0) throw new BadRequestException('items is required');
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');
    const normalized = items.map((item) => ({
      menuItemId: String(item.menuItemId || '').trim(),
      quantity: Number(item.quantity || 0),
    }));
    const ids = [...new Set(normalized.map((item) => item.menuItemId))];
    if (ids.length !== normalized.length) throw new BadRequestException('Duplicate menu items are not allowed');
    for (const item of normalized) {
      if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('Invalid order item');
      }
    }
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id, mi.name, mi.price
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE mi.id IN (${placeholders})
          AND mi.is_available = true
          AND mi.deleted_at IS NULL
          AND m.is_published = true
          AND m.deleted_at IS NULL
          AND m.session = $${ids.length + 1}::session_type
      ) t;
      `,
      [...ids, session],
    );
    const rows = this.parseJsonLines<{ id: string; name: string; price: string | number }>(out);
    if (rows.length !== ids.length) throw new BadRequestException('ORDER_MENU_UNAVAILABLE');
    const byId = new Map(rows.map((row) => [row.id, row]));
    return normalized.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      itemNameSnapshot: byId.get(item.menuItemId)?.name || '',
      priceSnapshot: Number(Number(byId.get(item.menuItemId)?.price || 0).toFixed(2)),
    }));
  }

  private async getMultiOrderSkippedReason(serviceDate: string, session: SessionType, childId: string) {
    const weekday = Number(await runSql(`SELECT extract(isodow FROM $1::date)::int;`, [serviceDate]) || 0);
    if (weekday > 5) return 'WEEKEND';
    const blackout = await this.getBlackoutRuleForDate(serviceDate, session);
    if (blackout) return blackout.type === 'SERVICE_BLOCK' ? 'BLACKOUT_SERVICE' : 'BLACKOUT_ORDER';
    const overlap = await runSql(
      `SELECT EXISTS (
         SELECT 1
         FROM orders
         WHERE child_id = $1
           AND service_date = $2::date
           AND session = $3::session_type
           AND deleted_at IS NULL
           AND status <> 'CANCELLED'
       );`,
      [childId, serviceDate, session],
    );
    if (overlap === 't') return 'OVERLAP';
    return '';
  }

  private async collectMultiOrderPlan(input: {
    childId: string;
    session: SessionType;
    startDate: string;
    endDate: string;
    repeatDays: number[];
    items: CartItemInput[];
  }) {
    const menuSnapshot = await this.getMultiOrderMenuSnapshot(input.session, input.items);
    const dates: string[] = [];
    const skipped: Array<{ serviceDate: string; reason: string }> = [];
    let current = input.startDate;
    while (current <= input.endDate) {
      const weekday = Number(await runSql(`SELECT extract(isodow FROM $1::date)::int;`, [current]) || 0);
      if (input.repeatDays.includes(weekday)) {
        const reason = await this.getMultiOrderSkippedReason(current, input.session, input.childId);
        if (reason) skipped.push({ serviceDate: current, reason });
        else dates.push(current);
      }
      current = this.addDaysIsoDate(current, 1);
    }
    return { menuSnapshot, dates, skipped };
  }

  private async getMultiOrderGroupOwned(actor: AccessUser, groupId: string) {
    await this.schema!.ensureMultiOrderSchema();
    this.assertValidUuid(groupId, 'groupId');
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mog.id,
               mog.child_id,
               mog.parent_id,
               mog.created_by_user_id,
               mog.source_role,
               mog.session::text AS session,
               mog.start_date::text AS start_date,
               mog.end_date::text AS end_date,
               mog.repeat_days_json,
               mog.dish_selection_json,
               mog.status,
               mog.original_total_amount,
               mog.current_total_amount,
               mog.started_at::text AS started_at,
               mog.completed_at::text AS completed_at,
               cu.first_name || ' ' || cu.last_name AS child_name,
               COALESCE(pu.first_name || ' ' || pu.last_name, '') AS parent_name
        FROM multi_order_groups mog
        JOIN children c ON c.id = mog.child_id
        JOIN users cu ON cu.id = c.user_id
        LEFT JOIN parents p ON p.id = mog.parent_id
        LEFT JOIN users pu ON pu.id = p.user_id
        WHERE mog.id = $1
        LIMIT 1
      ) t;
      `,
      [groupId],
    );
    if (!out) throw new NotFoundException('Multi order group not found');
    const group = this.parseJsonLine<Record<string, unknown> & {
      child_id: string;
      parent_id?: string | null;
    }>(out);
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId || group.parent_id !== parentId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId || group.child_id !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }
    return group;
  }

  private async getMultiOrderOccurrences(groupId: string) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT moo.id,
               moo.service_date::text AS service_date,
               moo.session::text AS session,
               moo.order_id,
               moo.status,
               moo.price_snapshot_total,
               moo.items_snapshot_json,
               o.status::text AS order_status
        FROM multi_order_occurrences moo
        LEFT JOIN orders o ON o.id = moo.order_id
        WHERE moo.multi_order_group_id = $1
        ORDER BY moo.service_date ASC, moo.created_at ASC
      ) t;
      `,
      [groupId],
    );
    return this.parseJsonLines<Record<string, unknown> & { service_date?: string; price_snapshot_total?: string | number }>(out).map((row) => ({
      ...row,
      price_snapshot_total: Number(row.price_snapshot_total || 0),
    }));
  }

  private async canOwnerEditMultiOrder(group: Record<string, unknown> & { id?: string | null; start_date?: string | null }) {
    const occurrences = await this.getMultiOrderOccurrences(String(group.id || ''));
    const firstServiceDate = String(occurrences[0]?.service_date || group.start_date || '').trim();
    if (!firstServiceDate) return false;
    return !(await this.isAfterOrAtMakassarCutoff(firstServiceDate));
  }

  private async upsertMultiOrderBilling(groupId: string, parentId: string | null) {
    const amount = Number(await runSql(
      `SELECT COALESCE(SUM(price_snapshot_total), 0)::numeric
       FROM multi_order_occurrences
       WHERE multi_order_group_id = $1;`,
      [groupId],
    ) || 0);
    await runSql(
      `UPDATE multi_order_groups
       SET current_total_amount = $2,
           updated_at = now(),
           started_at = COALESCE(started_at, CASE WHEN start_date <= (now() AT TIME ZONE 'Asia/Makassar')::date THEN now() ELSE NULL END)
       WHERE id = $1;`,
      [groupId, amount],
    );
    await runSql(
      `INSERT INTO multi_order_billings (multi_order_group_id, parent_id, total_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (multi_order_group_id)
       DO UPDATE SET parent_id = EXCLUDED.parent_id, total_amount = EXCLUDED.total_amount, updated_at = now();`,
      [groupId, parentId, amount],
    );
    return amount;
  }

  private async createMultiOrderOrders(actor: AccessUser, input: {
    groupId: string;
    childId: string;
    session: SessionType;
    dates: string[];
    menuSnapshot: Array<{ menuItemId: string; quantity: number; itemNameSnapshot: string; priceSnapshot: number }>;
  }) {
    const created: Array<{ serviceDate: string; orderId: string; totalPrice: number }> = [];
    for (const serviceDate of input.dates) {
      const cart = await this.createCart(actor, {
        childId: input.childId,
        serviceDate,
        session: input.session,
      });
      await this.replaceCartItems(
        actor,
        cart.id,
        input.menuSnapshot.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
      );
      const order = await this.submitCart(actor, cart.id) as { id: string; total_price: number };
      await runSql(`DELETE FROM billing_records WHERE order_id = $1;`, [order.id]);
      await runSql(
        `UPDATE orders
         SET source_type = 'MULTI',
             multi_order_group_id = $2,
             updated_at = now()
         WHERE id = $1;`,
        [order.id, input.groupId],
      );
      await runSql(
        `INSERT INTO multi_order_occurrences (multi_order_group_id, service_date, session, order_id, status, price_snapshot_total, items_snapshot_json)
         VALUES ($1, $2::date, $3::session_type, $4, 'PLACED', $5, $6::jsonb);`,
        [input.groupId, serviceDate, input.session, order.id, Number(order.total_price || 0), JSON.stringify(input.menuSnapshot)],
      );
      created.push({ serviceDate, orderId: order.id, totalPrice: Number(order.total_price || 0) });
    }
    return created;
  }

  private async recalculateMultiOrderGroupStatus(groupId: string) {
    const statsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(*)::int AS total_count,
               COUNT(*) FILTER (WHERE service_date < (now() AT TIME ZONE 'Asia/Makassar')::date)::int AS past_count,
               COUNT(*) FILTER (WHERE service_date >= (now() AT TIME ZONE 'Asia/Makassar')::date)::int AS future_count
        FROM multi_order_occurrences
        WHERE multi_order_group_id = $1
      ) t;
      `,
      [groupId],
    );
    const stats = this.parseJsonLine<{ total_count: number; past_count: number; future_count: number }>(statsOut);
    let status = 'ACTIVE';
    if (stats.total_count === 0) status = 'CANCELLED';
    else if (stats.future_count === 0 && stats.past_count > 0) status = 'COMPLETED';
    else if (stats.future_count >= 0 && stats.past_count > 0) status = 'PARTIALLY_CHANGED';
    await runSql(
      `UPDATE multi_order_groups
       SET status = $2,
           completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE completed_at END,
           updated_at = now()
       WHERE id = $1;`,
      [groupId, status],
    );
    return status;
  }

  private async deleteOccurrenceOrders(orderIds: string[], actorId: string) {
    if (orderIds.length === 0) return;
    const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ');
    await runSql(`DELETE FROM billing_records WHERE order_id IN (${placeholders});`, orderIds);
    await runSql(
      `INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
       SELECT o.id, 'ORDER_CANCELLED', $${orderIds.length + 1}, jsonb_build_object('status', o.status::text), '{"status":"CANCELLED"}'::jsonb
       FROM orders o
       WHERE o.id IN (${placeholders});`,
      [...orderIds, actorId],
    );
    await runSql(
      `UPDATE orders
       SET status = 'CANCELLED',
           deleted_at = now(),
           updated_at = now()
       WHERE id IN (${placeholders});`,
      orderIds,
    );
  }

  private isImmutableMultiOrderStatus(statusRaw?: string | null) {
    const status = String(statusRaw || '').trim().toUpperCase();
    return ['KITCHEN_COMPLETED', 'IN_DELIVERY', 'DELIVERED', 'LOCKED'].includes(status);
  }

  async getMultiOrders(actor: AccessUser) {
    await this.schema!.ensureMultiOrderSchema();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (actor.role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(actor.uid);
      if (!parentId) return [];
      params.push(parentId);
      clauses.push(`mog.parent_id = $${params.length}`);
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.getChildIdByUserId(actor.uid);
      if (!childId) return [];
      params.push(childId);
      clauses.push(`mog.child_id = $${params.length}`);
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mog.id,
               mog.child_id,
               mog.parent_id,
               mog.session::text AS session,
               mog.start_date::text AS start_date,
               mog.end_date::text AS end_date,
               mog.created_at::text AS created_at,
               mog.updated_at::text AS updated_at,
               mog.repeat_days_json,
               mog.status,
               mog.original_total_amount,
               mog.current_total_amount,
               cu.first_name AS child_first_name,
               c.gender::text AS child_gender,
               NULLIF(TRIM(COALESCE(s.short_name, '')), '') AS school_short_name,
               cu.first_name || ' ' || cu.last_name AS child_name,
               COALESCE(pu.first_name || ' ' || pu.last_name, '') AS parent_name,
               mob.status AS billing_status,
               mob.total_amount,
               (SELECT COUNT(*)::int FROM multi_order_occurrences moo WHERE moo.multi_order_group_id = mog.id) AS occurrence_count,
               EXISTS (
                 SELECT 1
                 FROM multi_order_change_requests moq
                 WHERE moq.multi_order_group_id = mog.id
                   AND moq.status = 'OPEN'
               ) AS has_open_request
        FROM multi_order_groups mog
        JOIN children c ON c.id = mog.child_id
        JOIN schools s ON s.id = c.school_id
        JOIN users cu ON cu.id = c.user_id
        LEFT JOIN parents p ON p.id = mog.parent_id
        LEFT JOIN users pu ON pu.id = p.user_id
        LEFT JOIN multi_order_billings mob ON mob.multi_order_group_id = mog.id
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY mog.created_at DESC
      ) t;
      `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_amount?: string | number; current_total_amount?: string | number; original_total_amount?: string | number }>(out).map((row) => ({
      ...row,
      total_amount: Number(row.total_amount || 0),
      current_total_amount: Number(row.current_total_amount || 0),
      original_total_amount: Number(row.original_total_amount || 0),
    }));
  }

  async createMultiOrder(actor: AccessUser, input: {
    childId?: string;
    session?: string;
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    items?: CartItemInput[];
  }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureMultiOrderSchema();
    const childId = await this.getMultiOrderOwnerChildId(actor, String(input.childId || ''));
    const session = this.normalizeSession(input.session);
    const startDate = this.validateServiceDate(input.startDate);
    const endDate = this.validateServiceDate(input.endDate);
    if (endDate < startDate) throw new BadRequestException('endDate must be on or after startDate');
    const horizonDate = this.addDaysIsoDate(startDate, 92);
    if (endDate > horizonDate) throw new BadRequestException('MULTI_ORDER_RANGE_EXCEEDED');
    await this.assertSessionActiveForOrdering(session);
    await this.enforceParentYoungsterOrderingWindow(actor, startDate);
    const repeatDays = this.normalizeMultiOrderRepeatDays(input.repeatDays || []);
    const parentId = await this.getMultiOrderParentId(actor, childId);
    const plan = await this.collectMultiOrderPlan({
      childId,
      session,
      startDate,
      endDate,
      repeatDays,
      items: input.items || [],
    });
    if (plan.dates.length < 2) throw new BadRequestException('Multiorder requires at least 2 eligible dates');
    const groupOut = await runSql(
      `WITH inserted AS (
         INSERT INTO multi_order_groups (
           child_id,
           parent_id,
           created_by_user_id,
           source_role,
           session,
           start_date,
           end_date,
           repeat_days_json,
           dish_selection_json,
           status
         )
         VALUES ($1, $2, $3, $4, $5::session_type, $6::date, $7::date, $8::jsonb, $9::jsonb, 'ACTIVE')
         RETURNING id
       )
       SELECT id FROM inserted;`,
      [
        childId,
        parentId,
        actor.uid,
        actor.role,
        session,
        startDate,
        endDate,
        JSON.stringify(repeatDays),
        JSON.stringify(plan.menuSnapshot),
      ],
    );
    const groupId = String(groupOut || '').trim();
    const created = await this.createMultiOrderOrders(actor, {
      groupId,
      childId,
      session,
      dates: plan.dates,
      menuSnapshot: plan.menuSnapshot,
    });
    const totalAmount = await this.upsertMultiOrderBilling(groupId, parentId);
    await runSql(
      `UPDATE multi_order_groups
       SET original_total_amount = $2,
           current_total_amount = $2,
           updated_at = now()
       WHERE id = $1;`,
      [groupId, totalAmount],
    );
    await this.audit!.recordAdminAudit(actor, 'MULTI_ORDER_CREATED', 'multi-order-group', groupId, {
      createdCount: created.length,
      skippedCount: plan.skipped.length,
      session,
      childId,
    });
    return {
      ok: true,
      groupId,
      createdCount: created.length,
      skipped: plan.skipped,
      billingId: await runSql(`SELECT id FROM multi_order_billings WHERE multi_order_group_id = $1 LIMIT 1;`, [groupId]),
      totalAmount,
    };
  }

  async getMultiOrderDetail(actor: AccessUser, groupId: string) {
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    const occurrences = await this.getMultiOrderOccurrences(groupId);
    const canEdit = await this.canOwnerEditMultiOrder(group);
    const requestsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id,
               request_type,
               reason,
               status,
               payload_json,
               resolution_note,
               created_at::text AS created_at,
               resolved_at::text AS resolved_at
        FROM multi_order_change_requests
        WHERE multi_order_group_id = $1
        ORDER BY created_at DESC
      ) t;
      `,
      [groupId],
    );
    return {
      ...group,
      original_total_amount: Number(group.original_total_amount || 0),
      current_total_amount: Number(group.current_total_amount || 0),
      occurrences,
      requests: this.parseJsonLines(requestsOut),
      can_edit: canEdit,
      can_request_change: !canEdit,
    };
  }

  async updateMultiOrder(actor: AccessUser, groupId: string, input: {
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    items?: CartItemInput[];
  }) {
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    if (actor.role === 'ADMIN') throw new ForbiddenException('Owner update only');
    if (!(await this.canOwnerEditMultiOrder(group))) {
      throw new BadRequestException('MULTI_ORDER_CUTOFF_EXCEEDED');
    }
    const orderIds = (await this.getMultiOrderOccurrences(groupId) as Array<{ order_id?: string | null }>)
      .map((row) => String(row.order_id || '').trim())
      .filter(Boolean);
    await this.deleteOccurrenceOrders(orderIds, actor.uid);
    await runSql(`DELETE FROM multi_order_occurrences WHERE multi_order_group_id = $1;`, [groupId]);
    const session = this.normalizeSession(String(group.session || ''));
    const childId = String(group.child_id || '');
    const startDate = this.validateServiceDate(input.startDate);
    const endDate = this.validateServiceDate(input.endDate);
    if (endDate < startDate) throw new BadRequestException('endDate must be on or after startDate');
    const repeatDays = this.normalizeMultiOrderRepeatDays(input.repeatDays || []);
    const plan = await this.collectMultiOrderPlan({
      childId,
      session,
      startDate,
      endDate,
      repeatDays,
      items: input.items || [],
    });
    if (plan.dates.length < 2) throw new BadRequestException('Multiorder requires at least 2 eligible dates');
    await runSql(
      `UPDATE multi_order_groups
       SET start_date = $2::date,
           end_date = $3::date,
           repeat_days_json = $4::jsonb,
           dish_selection_json = $5::jsonb,
           status = 'ACTIVE',
           updated_at = now()
       WHERE id = $1;`,
      [groupId, startDate, endDate, JSON.stringify(repeatDays), JSON.stringify(plan.menuSnapshot)],
    );
    const created = await this.createMultiOrderOrders(actor, {
      groupId,
      childId,
      session,
      dates: plan.dates,
      menuSnapshot: plan.menuSnapshot,
    });
    const totalAmount = await this.upsertMultiOrderBilling(groupId, String(group.parent_id || '').trim() || null);
    await this.audit!.recordAdminAudit(actor, 'MULTI_ORDER_UPDATED', 'multi-order-group', groupId, {
      createdCount: created.length,
      skippedCount: plan.skipped.length,
    });
    return {
      ok: true,
      groupId,
      createdCount: created.length,
      skipped: plan.skipped,
      totalAmount,
    };
  }

  async deleteMultiOrder(actor: AccessUser, groupId: string) {
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    if (actor.role === 'ADMIN') throw new ForbiddenException('Owner delete only');
    if (!(await this.canOwnerEditMultiOrder(group))) {
      throw new BadRequestException('MULTI_ORDER_CUTOFF_EXCEEDED');
    }
    const orderIds = (await this.getMultiOrderOccurrences(groupId) as Array<{ order_id?: string | null }>)
      .map((row) => String(row.order_id || '').trim())
      .filter(Boolean);
    await this.deleteOccurrenceOrders(orderIds, actor.uid);
    await runSql(`DELETE FROM multi_order_occurrences WHERE multi_order_group_id = $1;`, [groupId]);
    await runSql(`DELETE FROM multi_order_receipts WHERE multi_order_billing_id IN (SELECT id FROM multi_order_billings WHERE multi_order_group_id = $1);`, [groupId]);
    await runSql(`DELETE FROM multi_order_billings WHERE multi_order_group_id = $1;`, [groupId]);
    await runSql(`DELETE FROM multi_order_change_requests WHERE multi_order_group_id = $1;`, [groupId]);
    await runSql(`DELETE FROM multi_order_groups WHERE id = $1;`, [groupId]);
    await this.audit!.recordAdminAudit(actor, 'MULTI_ORDER_DELETED', 'multi-order-group', groupId);
    return { ok: true };
  }

  async createMultiOrderRequest(actor: AccessUser, groupId: string, input: {
    requestType?: string;
    reason?: string;
    replacementPlan?: { startDate?: string; endDate?: string; repeatDays?: string[]; items?: CartItemInput[] };
  }) {
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    if (await this.canOwnerEditMultiOrder(group)) {
      throw new BadRequestException('MULTI_ORDER_OWNER_CAN_EDIT_DIRECTLY');
    }
    const requestType = String(input.requestType || '').trim().toUpperCase();
    if (!['CHANGE', 'DELETE'].includes(requestType)) throw new BadRequestException('Invalid requestType');
    const reason = String(input.reason || '').trim();
    if (!reason) throw new BadRequestException('reason is required');
    await runSql(
      `INSERT INTO multi_order_change_requests (
         multi_order_group_id,
         requested_by_user_id,
         request_type,
         reason,
         payload_json,
         status
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, 'OPEN');`,
      [
        groupId,
        actor.uid,
        requestType,
        reason,
        input.replacementPlan ? JSON.stringify(input.replacementPlan) : null,
      ],
    );
    return { ok: true };
  }

  async getMultiOrderBilling(actor: AccessUser, groupId: string) {
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mob.id,
               mob.multi_order_group_id,
               mob.parent_id,
               mob.status,
               mob.total_amount,
               mob.proof_image_url,
               mob.proof_uploaded_at::text AS proof_uploaded_at,
               mob.verified_at::text AS verified_at,
               mob.admin_note,
               mob.receipt_version
        FROM multi_order_billings mob
        WHERE mob.multi_order_group_id = $1
        LIMIT 1
      ) t;
      `,
      [groupId],
    );
    const billing = out
      ? this.parseJsonLine<Record<string, unknown> & { total_amount?: string | number }>(out)
      : null;
    const receipt = await this.getMultiOrderReceipt(actor, groupId).catch(() => null);
    return {
      group,
      billing: billing
        ? {
            ...billing,
            total_amount: Number(billing.total_amount || 0),
          }
        : null,
      occurrences: await this.getMultiOrderOccurrences(groupId),
      receipt,
    };
  }

  async uploadMultiOrderBillingProof(actor: AccessUser, groupId: string, proofImageData?: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    const proof = String(proofImageData || '').trim();
    if (!proof) throw new BadRequestException('proofImageData is required');
    const parsed = this.parseDataUrl(proof);
    this.assertSafeImagePayload({
      contentType: parsed.contentType,
      data: parsed.data,
      maxBytes: 10 * 1024 * 1024,
      label: 'Proof image',
    });
    const ext = parsed.contentType.includes('png') ? 'png' : parsed.contentType.includes('jpeg') ? 'jpg' : 'webp';
    const ownerFolderId = actor.role === 'PARENT' ? String(group.parent_id || actor.uid) : String(group.child_id || actor.uid);
    const objectName = `${this.getGcsCategoryFolder('payment-proofs')}/${ownerFolderId}/multi-order-${groupId}-${Date.now()}.${ext}`;
    const uploaded = await this.uploadToGcs({
      objectName,
      contentType: parsed.contentType,
      data: parsed.data,
      cacheControl: 'public, max-age=31536000, immutable',
    });
    await runSql(
      `UPDATE multi_order_billings
       SET proof_image_url = $2,
           proof_uploaded_at = now(),
           status = CASE WHEN status = 'REJECTED' THEN 'PENDING_VERIFICATION' ELSE status END,
           updated_at = now()
       WHERE multi_order_group_id = $1;`,
      [groupId, uploaded.publicUrl],
    );
    return { ok: true, proofImageUrl: uploaded.publicUrl };
  }

  async revertMultiOrderBillingProof(actor: AccessUser, groupId: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    await this.getMultiOrderGroupOwned(actor, groupId);
    await runSql(
      `UPDATE multi_order_billings
       SET proof_image_url = NULL,
           proof_uploaded_at = NULL,
           status = 'UNPAID',
           updated_at = now()
       WHERE multi_order_group_id = $1;`,
      [groupId],
    );
    return { ok: true };
  }

  async getMultiOrderProofImage(actor: AccessUser, groupId: string) {
    await this.getMultiOrderGroupOwned(actor, groupId);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COALESCE(NULLIF(TRIM(proof_image_url), ''), '') AS proof_image_url
        FROM multi_order_billings
        WHERE multi_order_group_id = $1
        LIMIT 1
      ) t;
      `,
      [groupId],
    );
    if (!out) throw new NotFoundException('Billing record not found');
    const row = this.parseJsonLine<{ proof_image_url: string }>(out);
    const proofImageUrl = String(row.proof_image_url || '').trim();
    if (!proofImageUrl) throw new BadRequestException('No uploaded proof image for this bill');

    if (proofImageUrl.startsWith('data:')) {
      const parsed = this.parseDataUrl(proofImageUrl);
      this.assertSafeImagePayload({
        contentType: parsed.contentType,
        data: parsed.data,
        maxBytes: 10 * 1024 * 1024,
        label: 'Proof image',
      });
      return { contentType: parsed.contentType, data: parsed.data };
    }

    return this.fetchProofImageBinary(proofImageUrl);
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
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureMultiOrderSchema();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.session) {
      params.push(this.normalizeSession(input.session));
      clauses.push(`mog.session = $${params.length}::session_type`);
    }
    if (input.status) {
      params.push(String(input.status).trim().toUpperCase());
      clauses.push(`upper(mog.status) = $${params.length}`);
    }
    if (input.fromDate) {
      params.push(this.validateServiceDate(input.fromDate));
      clauses.push(`mog.start_date >= $${params.length}::date`);
    }
    if (input.toDate) {
      params.push(this.validateServiceDate(input.toDate));
      clauses.push(`mog.end_date <= $${params.length}::date`);
    }
    if (input.student) {
      params.push(`%${String(input.student).trim().toLowerCase()}%`);
      clauses.push(`lower(cu.first_name || ' ' || cu.last_name) LIKE $${params.length}`);
    }
    if (input.parent) {
      params.push(`%${String(input.parent).trim().toLowerCase()}%`);
      clauses.push(`lower(COALESCE(pu.first_name || ' ' || pu.last_name, '')) LIKE $${params.length}`);
    }
    if (input.requestStatus) {
      params.push(String(input.requestStatus).trim().toUpperCase());
      clauses.push(`EXISTS (
        SELECT 1
        FROM multi_order_change_requests moqr
        WHERE moqr.multi_order_group_id = mog.id
          AND upper(moqr.status) = $${params.length}
      )`);
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mog.id,
               mog.child_id,
               mog.parent_id,
               mog.session::text AS session,
               mog.start_date::text AS start_date,
               mog.end_date::text AS end_date,
               mog.status,
               mog.original_total_amount,
               mog.current_total_amount,
               cu.first_name || ' ' || cu.last_name AS child_name,
               COALESCE(pu.first_name || ' ' || pu.last_name, '') AS parent_name,
               mob.status AS billing_status,
               mob.total_amount,
               (
                 SELECT COALESCE(json_agg(json_build_object(
                   'id', moq.id,
                   'request_type', moq.request_type,
                   'status', moq.status,
                   'reason', moq.reason,
                   'created_at', moq.created_at::text
                 ) ORDER BY moq.created_at DESC), '[]'::json)
                 FROM multi_order_change_requests moq
                 WHERE moq.multi_order_group_id = mog.id
               ) AS requests
        FROM multi_order_groups mog
        JOIN children c ON c.id = mog.child_id
        JOIN users cu ON cu.id = c.user_id
        LEFT JOIN parents p ON p.id = mog.parent_id
        LEFT JOIN users pu ON pu.id = p.user_id
        LEFT JOIN multi_order_billings mob ON mob.multi_order_group_id = mog.id
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY mog.created_at DESC
      ) t;
      `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_amount?: string | number; current_total_amount?: string | number; original_total_amount?: string | number }>(out).map((row) => ({
      ...row,
      total_amount: Number(row.total_amount || 0),
      current_total_amount: Number(row.current_total_amount || 0),
      original_total_amount: Number(row.original_total_amount || 0),
    }));
  }

  async trimMultiOrderFuture(actor: AccessUser, groupId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.getMultiOrderGroupOwned(actor, groupId);
    const occurrences = await this.getMultiOrderOccurrences(groupId);
    const futureMutable = (occurrences as unknown as Array<{ id: string; service_date: string; order_id?: string | null; order_status?: string | null; status?: string | null }>).filter((row) =>
      String(row.service_date || '') >= this.makassarTodayIsoDate()
      && !this.isImmutableMultiOrderStatus(String(row.order_status || row.status || '')),
    );
    await this.deleteOccurrenceOrders(
      futureMutable.map((row) => String(row.order_id || '').trim()).filter(Boolean),
      actor.uid,
    );
    await runSql(
      `DELETE FROM multi_order_occurrences
       WHERE id = ANY($1::uuid[]);`,
      [futureMutable.map((row) => row.id)],
    );
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    const totalAmount = await this.upsertMultiOrderBilling(groupId, String(group.parent_id || '').trim() || null);
    const status = await this.recalculateMultiOrderGroupStatus(groupId);
    await this.audit!.recordAdminAudit(actor, 'MULTI_ORDER_FUTURE_TRIMMED', 'multi-order-group', groupId, {
      trimmedCount: futureMutable.length,
      status,
      totalAmount,
    });
    return { ok: true, trimmedCount: futureMutable.length, totalAmount, status };
  }

  async createMultiOrderReplacement(actor: AccessUser, groupId: string, input: {
    childId?: string;
    session?: string;
    startDate?: string;
    endDate?: string;
    repeatDays?: string[];
    items?: CartItemInput[];
  }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const original = await this.getMultiOrderGroupOwned(actor, groupId);
    const replacement = await this.createMultiOrder(actor, {
      childId: input.childId || String(original.child_id || ''),
      session: input.session || String(original.session || ''),
      startDate: input.startDate,
      endDate: input.endDate,
      repeatDays: input.repeatDays,
      items: input.items,
    });
    await runSql(
      `UPDATE multi_order_groups
       SET status = 'PARTIALLY_CHANGED',
           updated_at = now()
       WHERE id = $1;`,
      [groupId],
    );
    await this.audit!.recordAdminAudit(actor, 'MULTI_ORDER_REPLACEMENT_CREATED', 'multi-order-group', groupId, {
      replacementGroupId: replacement.groupId,
    });
    return replacement;
  }

  async deleteMultiOrderOccurrence(actor: AccessUser, groupId: string, occurrenceId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.getMultiOrderGroupOwned(actor, groupId);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT moo.id,
               moo.order_id,
               moo.service_date::text AS service_date,
               COALESCE(o.status::text, moo.status) AS status
        FROM multi_order_occurrences moo
        LEFT JOIN orders o ON o.id = moo.order_id
        WHERE moo.id = $1
          AND moo.multi_order_group_id = $2
        LIMIT 1
      ) t;
      `,
      [occurrenceId, groupId],
    );
    if (!out) throw new NotFoundException('Occurrence not found');
    const occurrence = this.parseJsonLine<{ id: string; order_id?: string | null; service_date: string; status: string }>(out);
    if (occurrence.service_date < this.makassarTodayIsoDate() || this.isImmutableMultiOrderStatus(occurrence.status)) {
      throw new BadRequestException('MULTI_ORDER_OCCURRENCE_IMMUTABLE');
    }
    const orderIds = occurrence.order_id ? [occurrence.order_id] : [];
    await this.deleteOccurrenceOrders(orderIds, actor.uid);
    await runSql(`DELETE FROM multi_order_occurrences WHERE id = $1;`, [occurrenceId]);
    const group = await this.getMultiOrderGroupOwned(actor, groupId);
    const totalAmount = await this.upsertMultiOrderBilling(groupId, String(group.parent_id || '').trim() || null);
    const status = await this.recalculateMultiOrderGroupStatus(groupId);
    return { ok: true, totalAmount, status };
  }

  async resolveMultiOrderRequest(actor: AccessUser, groupId: string, input: { decision?: string; note?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.getMultiOrderGroupOwned(actor, groupId);
    const requestOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, request_type, payload_json
        FROM multi_order_change_requests
        WHERE multi_order_group_id = $1
          AND status = 'OPEN'
        ORDER BY created_at ASC
        LIMIT 1
      ) t;
      `,
      [groupId],
    );
    if (!requestOut) throw new NotFoundException('Open request not found');
    const request = this.parseJsonLine<{ id: string; request_type: string; payload_json?: { startDate?: string; endDate?: string; repeatDays?: string[]; items?: CartItemInput[] } }>(requestOut);
    const decision = String(input.decision || '').trim().toUpperCase();
    if (decision === 'REJECT') {
      await runSql(
        `UPDATE multi_order_change_requests
         SET status = 'REJECTED',
             resolution_note = $2,
             resolved_by_user_id = $3::uuid,
             resolved_at = now(),
             updated_at = now()
         WHERE id = $1;`,
        [request.id, String(input.note || '').trim() || null, actor.uid],
      );
      await runSql(
        `UPDATE multi_order_change_requests
         SET status = 'CLOSED',
             updated_at = now()
         WHERE id = $1;`,
        [request.id],
      );
      return { ok: true, decision };
    }
    if (decision === 'APPROVE_DELETE') {
      const result = await this.trimMultiOrderFuture(actor, groupId);
      await runSql(
        `UPDATE multi_order_change_requests
         SET status = 'CLOSED',
             resolution_note = $2,
             resolved_by_user_id = $3::uuid,
             resolved_at = now(),
             updated_at = now()
         WHERE id = $1;`,
        [request.id, String(input.note || '').trim() || null, actor.uid],
      );
      return { decision, ...result };
    }
    if (decision !== 'APPROVE_CHANGE') throw new BadRequestException('Invalid decision');
    const payload = request.payload_json || {};
    const result = await this.createMultiOrderReplacement(actor, groupId, {
      childId: undefined,
      session: undefined,
      startDate: payload.startDate,
      endDate: payload.endDate,
      repeatDays: payload.repeatDays,
      items: payload.items,
    });
    await this.trimMultiOrderFuture(actor, groupId);
    await runSql(
      `UPDATE multi_order_change_requests
       SET status = 'CLOSED',
           resolution_note = $2,
           resolved_by_user_id = $3::uuid,
           resolved_at = now(),
           updated_at = now()
       WHERE id = $1;`,
      [request.id, String(input.note || '').trim() || null, actor.uid],
    );
    return { ok: true, decision, replacement: result };
  }

  async verifyMultiOrderBilling(actor: AccessUser, groupId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.getMultiOrderGroupOwned(actor, groupId);
    const billingOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, COALESCE(NULLIF(TRIM(proof_image_url), ''), '') AS proof_image_url
         FROM multi_order_billings
         WHERE multi_order_group_id = $1
         LIMIT 1
       ) t;`,
      [groupId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    const billing = this.parseJsonLine<{ id: string; proof_image_url: string }>(billingOut);
    if (decision === 'VERIFIED' && !billing.proof_image_url) throw new BadRequestException('BILLING_PROOF_IMAGE_REQUIRED');
    const nextStatus = decision === 'VERIFIED' ? 'VERIFIED' : 'REJECTED';
    await runSql(
      `UPDATE multi_order_billings
       SET status = $2,
           verified_at = CASE WHEN $2 = 'VERIFIED' THEN now() ELSE NULL END,
           verified_by = CASE WHEN $2 = 'VERIFIED' THEN $3::uuid ELSE NULL END,
           admin_note = $4,
           updated_at = now()
       WHERE multi_order_group_id = $1;`,
      [groupId, nextStatus, actor.uid, String(note || '').trim() || null],
    );
    if (decision === 'REJECTED') {
      await runSql(
        `UPDATE multi_order_billings
         SET proof_image_url = NULL,
             proof_uploaded_at = NULL,
             updated_at = now()
         WHERE multi_order_group_id = $1;`,
        [groupId],
      );
    }
    return { ok: true, status: nextStatus };
  }

  async generateMultiOrderReceipt(actor: AccessUser, groupId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const detail = await this.getMultiOrderBilling(actor, groupId);
    const billing = detail.billing as Record<string, unknown> | null;
    if (!billing) throw new NotFoundException('Billing record not found');
    if (String(billing.status || '') !== 'VERIFIED') throw new BadRequestException('RECEIPT_PAYMENT_NOT_VERIFIED');
    const billingId = String(billing.id || '');
    const seq = Number(await runSql(`SELECT nextval('receipt_number_seq');`) || 0);
    const nowYear = new Date().getUTCFullYear();
    const receiptNumber = `MOB-${nowYear}-${String(seq).padStart(5, '0')}`;
    const existingVersion = Number(await runSql(
      `SELECT COALESCE(MAX(version), 0)::int
       FROM multi_order_receipts
       WHERE multi_order_billing_id = $1;`,
      [billingId],
    ) || 0);
    if (existingVersion > 0) {
      await runSql(
        `UPDATE multi_order_receipts
         SET status = 'VOID',
             voided_at = now()
         WHERE multi_order_billing_id = $1
           AND status = 'ACTIVE';`,
        [billingId],
      );
    }
    const version = existingVersion + 1;
    const lines = [
      'Blossom School Catering Multi Order Receipt',
      `Receipt Number: ${receiptNumber}`,
      `Receipt Version: ${version}`,
      `Group ID: ${groupId}`,
      `Parent: ${String(detail.group.parent_name || '-')}`,
      `Student: ${String(detail.group.child_name || '-')}`,
      `Session: ${String(detail.group.session || '-')}`,
      `Date Range: ${String(detail.group.start_date || '')} to ${String(detail.group.end_date || '')}`,
      `Total: Rp ${Number((billing as { total_amount?: number }).total_amount || 0).toLocaleString('id-ID')}`,
      '',
      'Occurrences:',
      ...(detail.occurrences || []).map((row: Record<string, unknown>) => `${String(row.service_date || '')} | ${Number(row.price_snapshot_total || 0).toLocaleString('id-ID')} | ${String(row.status || '')}`),
    ];
    const buffer = this.buildSimplePdf(lines);
    const objectName = `${this.getGcsCategoryFolder('receipts')}/${receiptNumber}.pdf`;
    const uploaded = await this.uploadToGcs({
      objectName,
      contentType: 'application/pdf',
      data: buffer,
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const receiptOut = await runSql(
      `WITH inserted AS (
         INSERT INTO multi_order_receipts (
           multi_order_billing_id,
           receipt_number,
           status,
           version,
           pdf_path,
           breakdown_json
         )
         VALUES ($1, $2, 'ACTIVE', $3, $4, $5::jsonb)
         RETURNING id
       )
       SELECT id FROM inserted;`,
      [billingId, receiptNumber, version, uploaded.publicUrl, JSON.stringify(detail)],
    );
    const receiptId = String(receiptOut || '').trim();
    await runSql(
      `UPDATE multi_order_billings
       SET receipt_id = $2,
           receipt_version = $3,
           updated_at = now()
       WHERE id = $1;`,
      [billingId, receiptId, version],
    );
    return { ok: true, receiptNumber, pdf_url: uploaded.publicUrl, version };
  }

  async getMultiOrderReceipt(actor: AccessUser, groupId: string) {
    await this.getMultiOrderGroupOwned(actor, groupId);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mor.id,
               mor.receipt_number,
               mor.status,
               mor.version,
               mor.pdf_path AS pdf_url,
               mor.created_at::text AS created_at
        FROM multi_order_receipts mor
        JOIN multi_order_billings mob ON mob.id = mor.multi_order_billing_id
        WHERE mob.multi_order_group_id = $1
          AND mor.status = 'ACTIVE'
        ORDER BY mor.version DESC
        LIMIT 1
      ) t;
      `,
      [groupId],
    );
    if (!out) throw new NotFoundException('Receipt is not generated yet.');
    return this.parseJsonLine(out);
  }

  async getMultiOrderReceiptFile(actor: AccessUser, groupId: string) {
    const row = await this.getMultiOrderReceipt(actor, groupId) as Record<string, unknown>;
    const pdfUrl = String(row.pdf_url || '').trim();
    if (!pdfUrl) throw new NotFoundException('Receipt PDF not found');
    const file = await this.fetchReceiptPdfBinary(pdfUrl);
    return {
      ...file,
      fileName: `${String(row.receipt_number || '').trim() || 'receipt'}.pdf`,
    };
  }

  async getParentConsolidatedBilling(actor: AccessUser, sessionFilter?: string) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureBillingReviewColumns();
    await this.schema!.ensureMultiOrderSchema();
    const parentId = await this.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    const session = sessionFilter ? this.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [familyId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               'SINGLE' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE c.family_id = $1::uuid
          AND COALESCE(o.source_type, 'SINGLE') = 'SINGLE'
        ${sessionClause}
        UNION ALL
        SELECT mob.id,
               NULL AS order_id,
               mog.id AS group_id,
               mog.child_id,
               mob.status,
               'PENDING' AS delivery_status,
               mob.proof_image_url,
               mob.proof_uploaded_at::text AS proof_uploaded_at,
               NULL AS delivered_at,
               mob.created_at::text AS created_at,
               mob.admin_note,
               mog.start_date::text AS service_date,
               mog.session::text AS session,
               mob.total_amount AS total_price,
               'MULTI' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               mor.receipt_number,
               mor.pdf_path AS pdf_url,
               mor.created_at::text AS generated_at
        FROM multi_order_billings mob
        JOIN multi_order_groups mog ON mog.id = mob.multi_order_group_id
        JOIN children c ON c.id = mog.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN multi_order_receipts mor ON mor.id = mob.receipt_id AND mor.status = 'ACTIVE'
        WHERE c.family_id = $1::uuid
          ${session ? `AND mog.session = $${params.length}::session_type` : ''}
        ORDER BY created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async getYoungsterConsolidatedBilling(actor: AccessUser, sessionFilter?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    await this.schema!.ensureBillingReviewColumns();
    await this.schema!.ensureMultiOrderSchema();
    const childId = await this.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const session = sessionFilter ? this.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [childId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               'SINGLE' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE o.child_id = $1
          AND COALESCE(o.source_type, 'SINGLE') = 'SINGLE'
        ${sessionClause}
        UNION ALL
        SELECT mob.id,
               NULL AS order_id,
               mog.id AS group_id,
               mog.child_id,
               mob.status,
               'PENDING' AS delivery_status,
               mob.proof_image_url,
               mob.proof_uploaded_at::text AS proof_uploaded_at,
               NULL AS delivered_at,
               mob.created_at::text AS created_at,
               mob.admin_note,
               mog.start_date::text AS service_date,
               mog.session::text AS session,
               mob.total_amount AS total_price,
               'MULTI' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               mor.receipt_number,
               mor.pdf_path AS pdf_url,
               mor.created_at::text AS generated_at
        FROM multi_order_billings mob
        JOIN multi_order_groups mog ON mog.id = mob.multi_order_group_id
        JOIN children c ON c.id = mog.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN multi_order_receipts mor ON mor.id = mob.receipt_id AND mor.status = 'ACTIVE'
        WHERE mog.child_id = $1
          ${session ? `AND mog.session = $${params.length}::session_type` : ''}
        ORDER BY created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async getAdminBilling(status?: string, sessionRaw?: string) {
    await this.schema!.ensureBillingReviewColumns();
    await this.schema!.ensureMultiOrderSchema();
    const statusFilter = (status || '').toUpperCase();
    const session = sessionRaw && sessionRaw !== 'ALL' ? this.normalizeSession(sessionRaw) : null;
    const params: unknown[] = [];
    const clausesSingle: string[] = [];
    const clausesMulti: string[] = [];
    if (['UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(statusFilter)) {
      params.push(statusFilter);
      clausesSingle.push(`AND br.status = $${params.length}::payment_status`);
      clausesMulti.push(`AND upper(mob.status) = $${params.length}`);
    }
    if (session) {
      params.push(session);
      clausesSingle.push(`AND o.session = $${params.length}::session_type`);
      clausesMulti.push(`AND mog.session = $${params.length}::session_type`);
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.created_at::text AS created_at,
               br.verified_at::text AS verified_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               'SINGLE' AS source_type,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               p.id AS parent_id,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               s.name AS school_name,
               dr.receipt_number,
               dr.pdf_url
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE COALESCE(o.source_type, 'SINGLE') = 'SINGLE'
          ${clausesSingle.join('\n          ')}
        UNION ALL
        SELECT mob.id,
               NULL AS order_id,
               mog.id AS group_id,
               mob.status AS status,
               'PENDING' AS delivery_status,
               mob.proof_image_url,
               mob.proof_uploaded_at::text AS proof_uploaded_at,
               mob.created_at::text AS created_at,
               mob.verified_at::text AS verified_at,
               mob.admin_note,
               mog.start_date::text AS service_date,
               mog.session::text AS session,
               mob.total_amount AS total_price,
               'MULTI' AS source_type,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               p.id AS parent_id,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               s.name AS school_name,
               mor.receipt_number,
               mor.pdf_path AS pdf_url
        FROM multi_order_billings mob
        JOIN multi_order_groups mog ON mog.id = mob.multi_order_group_id
        JOIN children c ON c.id = mog.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN parents p ON p.id = mog.parent_id
        LEFT JOIN users up ON up.id = p.user_id
        LEFT JOIN multi_order_receipts mor ON mor.id = mob.receipt_id AND mor.status = 'ACTIVE'
        WHERE 1=1
          ${clausesMulti.join('\n          ')}
        ORDER BY created_at DESC
      ) t;
    `,
      params,
    );
    return this.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
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
