import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID, scryptSync } from "crypto";
import { runSql } from '../../auth/db.util';
import { AccessUser, SessionType } from '../core.types';
import { normalizeGradeLabel, resolveEffectiveGrade } from '../../shared/grade.util';
import { SchemaService } from './schema.service';

const SESSIONS: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST'];

/**
 * HelpersService
 * ==============
 *
 * Scope:
 *   - Pure utility functions shared across every other sub-service:
 *       phone, date, hash, slug, uuid, text normalization, Makassar
 *       timezone math, ordering cutoff computation, family-id lookups.
 *   - Family-id schema migration (ensureFamilyIdColumns) lives here
 *     because it triggers a domain backfill (backfillFamilyIds) that
 *     reads parents/children tables — not pure DDL.
 *   - Holds no business logic specific to any single domain; a change
 *     here must be proven safe for every caller.
 *
 * Moved from CoreService in this extraction (44 methods):
 *   Text / crypto:
 *     clipText, slugify, sanitizeUsernamePart, hashPassword,
 *     buildGeneratedPasswordFromPhone
 *   Phone:
 *     normalizePhone, phoneCompareKey, findActiveUserByEmail,
 *     findActiveUserByPhone
 *   Date / time / session:
 *     nextWeekdayIsoDate, makassarTodayIsoDate, getMakassarNowContext,
 *     addDaysIsoDate, getIsoWeek, validateServiceDate, normalizeSession
 *   Ordering window:
 *     normalizeOrderingCutoffTime, formatOrderingCutoffTimeLabel,
 *     getOrderingCutoffTime, isAfterOrAtMakassarCutoff,
 *     lockOrdersForServiceDateIfCutoffPassed,
 *     enforceParentYoungsterOrderingWindow
 *   Family / ownership:
 *     getParentIdByUserId, getChildIdByUserId, getParentFamilyId,
 *     getChildFamilyId, getFamilyIdByUserId, ensureParentOwnsChild,
 *     getParentIdByChildId, syncParentChildrenByLastName,
 *     syncFamilyParentChildren
 *   Family ID schema + backfill:
 *     ensureFamilyIdColumns, assignFamilyIdToParents,
 *     assignFamilyIdToChildren, backfillFamilyIds, mergeFamilyIds,
 *     alignFamilyIdsForLink
 *   Pricing / UUID / family-name:
 *     assertValidUuid, calculateTotalPrice,
 *     calculateMaxConsecutiveOrderDays, calculateMonthOrderStats,
 *     resolveBadgeLevel, deriveFamilyName
 *   Shared parse utilities (used by many services via the facade):
 *     parseJsonLine, parseJsonLines
 *
 * Dependencies:
 *   - runSql (db.util), crypto
 *   - SchemaService (for ensureSiteSettingsTable inside getOrderingCutoffTime)
 *
 * Consumers:
 *   - CoreService facade (keeps thin delegation stubs so existing
 *     internal callsites — ~290 of them — continue to work via
 *     this.xxx(), and so unit tests spying on (service as any).xxx
 *     remain valid).
 *   - Future sub-services can call HelpersService directly through DI.
 */
@Injectable()
export class HelpersService {
  private familyIdsReady = false;

  constructor(private readonly schema: SchemaService) {}

  clipText(value: string, max = 72) {
    const trimmed = String(value || '').trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, Math.max(0, max - 3))}...`;
  }

  buildGeneratedPasswordFromPhone(phoneLike?: string | null) {
    const digits = String(phoneLike || '').replace(/\D/g, '');
    if (digits.length >= 6) return digits;
    if (!digits) return '';
    return `${digits}123456`.slice(0, 6);
  }

  normalizePhone(raw?: string | null) {
    return String(raw || '').trim();
  }

  phoneCompareKey(raw?: string | null) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits || String(raw || '').trim().toLowerCase();
  }

  async findActiveUserByEmail(email?: string | null, excludeUserId?: string) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    const params: unknown[] = [normalized];
    const exclusion = excludeUserId ? ` AND id <> $2` : '';
    if (excludeUserId) params.push(excludeUserId);
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, role::text AS role, username
         FROM users
         WHERE is_active = true
           AND deleted_at IS NULL
           AND lower(email) = $1
           ${exclusion}
         LIMIT 1
       ) t;`,
      params,
    );
    return out ? this.parseJsonLine<{ id: string; role: string; username: string }>(out) : null;
  }

  async findActiveUserByPhone(phoneNumber?: string | null, excludeUserId?: string) {
    const normalized = this.phoneCompareKey(phoneNumber);
    if (!normalized) return null;
    const params: unknown[] = [normalized];
    const exclusion = excludeUserId ? ` AND id <> $2` : '';
    if (excludeUserId) params.push(excludeUserId);
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, role::text AS role, username
         FROM users
         WHERE is_active = true
           AND deleted_at IS NULL
           AND regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') = $1
           ${exclusion}
         LIMIT 1
       ) t;`,
      params,
    );
    return out ? this.parseJsonLine<{ id: string; role: string; username: string }>(out) : null;
  }

  slugify(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file';
  }

  normalizeSession(session?: string): SessionType {
    const normalized = (session || '').toUpperCase();
    if (!SESSIONS.includes(normalized as SessionType)) {
      throw new BadRequestException('Invalid session');
    }
    return normalized as SessionType;
  }

  validateServiceDate(serviceDate?: string) {
    if (!serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      throw new BadRequestException('service_date must be YYYY-MM-DD');
    }
    return serviceDate;
  }

  nextWeekdayIsoDate() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d.toISOString().slice(0, 10);
  }

  makassarTodayIsoDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const yyyy = Number(parts.find((p) => p.type === 'year')?.value || '1970');
    const mm = Number(parts.find((p) => p.type === 'month')?.value || '01');
    const dd = Number(parts.find((p) => p.type === 'day')?.value || '01');
    return new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10);
  }

  getMakassarNowContext() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const yyyy = Number(parts.find((p) => p.type === 'year')?.value || '1970');
    const mm = Number(parts.find((p) => p.type === 'month')?.value || '01');
    const dd = Number(parts.find((p) => p.type === 'day')?.value || '01');
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '00');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '00');
    const dateIso = new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10);
    return { dateIso, hour, minute };
  }

  normalizeOrderingCutoffTime(raw?: string | null) {
    const value = String(raw || '').trim() || '08:00';
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new BadRequestException('ordering_cutoff_time must be in HH:MM format');
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const totalMinutes = (hour * 60) + minute;
    const minMinutes = 4 * 60;
    const maxMinutes = (11 * 60) + 59;
    if (totalMinutes < minMinutes || totalMinutes > maxMinutes) {
      throw new BadRequestException('ordering_cutoff_time must be between 04:00 and 11:59');
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  formatOrderingCutoffTimeLabel(cutoffTime: string) {
    return `${cutoffTime} Asia/Makassar`;
  }

  async getOrderingCutoffTime() {
    await this.schema.ensureSiteSettingsTable();
    const raw = await runSql(
      `
      SELECT setting_value
      FROM site_settings
      WHERE setting_key = 'ordering_cutoff_time'
      LIMIT 1;
      `,
    );
    return this.normalizeOrderingCutoffTime(raw || '08:00');
  }

  async enforceParentYoungsterOrderingWindow(actor: AccessUser, serviceDate: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) return;
    const now = this.getMakassarNowContext();
    const cutoffTime = await this.getOrderingCutoffTime();
    const [cutoffHour, cutoffMinute] = cutoffTime.split(':').map((part) => Number(part));
    const nowMinutes = (now.hour * 60) + now.minute;
    const cutoffMinutes = (cutoffHour * 60) + cutoffMinute;
    if (nowMinutes < cutoffMinutes) {
      throw new BadRequestException(`ORDERING_AVAILABLE_FROM_${cutoffTime.replace(':', '')}_WITA`);
    }
    if (serviceDate <= now.dateIso) {
      throw new BadRequestException('ORDER_TOMORROW_ONWARDS_ONLY');
    }
  }

  addDaysIsoDate(dateIso: string, days: number) {
    const d = new Date(`${dateIso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  calculateTotalPrice(items: Array<{ price: string | number; quantity: number }>) {
    const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    return Number(total.toFixed(2));
  }

  calculateMaxConsecutiveOrderDays(orderDates: string[]) {
    let maxStreak = 0;
    let currentStreak = 0;
    let prev: Date | null = null;
    for (const raw of orderDates) {
      const dateIso = String(raw).slice(0, 10);
      const now = new Date(`${dateIso}T00:00:00.000Z`);
      if (!prev) currentStreak = 1;
      else {
        const diff = Math.round((now.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
        currentStreak = diff === 1 ? currentStreak + 1 : 1;
      }
      if (currentStreak > maxStreak) maxStreak = currentStreak;
      prev = now;
    }
    return maxStreak;
  }

  getIsoWeek(dateIso: string) {
    const dt = new Date(`${dateIso}T00:00:00.000Z`);
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  calculateMonthOrderStats(monthDates: string[], month: string) {
    const inMonth = monthDates.filter((d) => d.startsWith(month));
    const weeks = [...new Set(inMonth.map((d) => this.getIsoWeek(String(d).slice(0, 10))))].sort((a, b) => a - b);
    let longest = 0;
    let current = 0;
    let prevWeek: number | null = null;
    for (const wk of weeks) {
      current = prevWeek !== null && wk === prevWeek + 1 ? current + 1 : 1;
      if (current > longest) longest = current;
      prevWeek = wk;
    }
    return { orders: inMonth.length, consecutiveWeeks: longest };
  }

  resolveBadgeLevel(input: {
    maxConsecutiveOrderDays: number;
    currentMonthOrders: number;
    currentMonthConsecutiveWeeks: number;
    previousMonthOrders: number;
    previousMonthConsecutiveWeeks: number;
  }) {
    const isSilver = input.currentMonthOrders >= 10 && input.currentMonthConsecutiveWeeks >= 2;
    const isGold = input.currentMonthOrders >= 20 && input.currentMonthConsecutiveWeeks >= 2;
    const prevIsSilverOrGold =
      (input.previousMonthOrders >= 10 && input.previousMonthConsecutiveWeeks >= 2)
      || (input.previousMonthOrders >= 20 && input.previousMonthConsecutiveWeeks >= 2);
    const isPlatinum = prevIsSilverOrGold && (isSilver || isGold);
    const isBronze = input.maxConsecutiveOrderDays >= 5;
    const level = isPlatinum ? 'PLATINUM' : isGold ? 'GOLD' : isSilver ? 'SILVER' : isBronze ? 'BRONZE' : 'NONE';
    return { level, isBronze, isSilver, isGold, isPlatinum };
  }

  async isAfterOrAtMakassarCutoff(serviceDate: string) {
    const cutoffTime = await this.getOrderingCutoffTime();
    const cutoffUtc = new Date(`${serviceDate}T${cutoffTime}:00+08:00`).getTime();
    return Date.now() >= cutoffUtc;
  }

  async lockOrdersForServiceDateIfCutoffPassed(serviceDate: string) {
    if (!(await this.isAfterOrAtMakassarCutoff(serviceDate))) return { lockedCount: 0 };
    const lockedCount = Number(await runSql(
      `WITH locked AS (
         UPDATE orders
         SET status = 'LOCKED',
             locked_at = COALESCE(locked_at, now()),
             updated_at = now()
         WHERE service_date = $1::date
           AND status = 'PLACED'
           AND deleted_at IS NULL
         RETURNING id
       )
       SELECT count(*)::int FROM locked;`,
      [serviceDate],
    ) || 0);
    return { lockedCount };
  }

  hashPassword(raw: string) {
    const salt = randomUUID().replace(/-/g, '');
    const derived = scryptSync(raw, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  }

  sanitizeUsernamePart(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'user';
  }

  async getParentIdByUserId(userId: string) {
    await this.ensureFamilyIdColumns();
    const out = await runSql(
      `SELECT id
       FROM parents
       WHERE user_id = $1
         AND deleted_at IS NULL
       LIMIT 1;`,
      [userId],
    );
    return out || null;
  }

  async getParentFamilyId(parentId: string) {
    await this.ensureFamilyIdColumns();
    return await runSql(
      `SELECT family_id::text
       FROM parents
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1;`,
      [parentId],
    ) || null;
  }

  async getChildFamilyId(childId: string) {
    await this.ensureFamilyIdColumns();
    return await runSql(
      `SELECT family_id::text
       FROM children
       WHERE id = $1
         AND deleted_at IS NULL
         AND is_active = true
       LIMIT 1;`,
      [childId],
    ) || null;
  }

  async getFamilyIdByUserId(userId: string, role: 'PARENT' | 'YOUNGSTER') {
    if (role === 'PARENT') {
      const parentId = await this.getParentIdByUserId(userId);
      return parentId ? await this.getParentFamilyId(parentId) : null;
    }
    const childId = await this.getChildIdByUserId(userId);
    return childId ? await this.getChildFamilyId(childId) : null;
  }

  async syncParentChildrenByLastName(parentId: string) {
    await this.ensureFamilyIdColumns();
    const familyId = await this.getParentFamilyId(parentId);
    if (!familyId) return 0;
    const linkedCount = Number(await runSql(
      `WITH target_children AS (
         SELECT id
         FROM children
         WHERE family_id = $1::uuid
           AND deleted_at IS NULL
           AND is_active = true
       ),
       inserted AS (
         INSERT INTO parent_children (parent_id, child_id)
         SELECT $2, tc.id
         FROM target_children tc
         ON CONFLICT (parent_id, child_id) DO NOTHING
         RETURNING 1
       )
       SELECT count(*)::int FROM inserted;`,
      [familyId, parentId],
    ) || 0);
    return linkedCount;
  }

  async getChildIdByUserId(userId: string) {
    await this.ensureFamilyIdColumns();
    const out = await runSql(
      `SELECT id
       FROM children
       WHERE user_id = $1
         AND is_active = true
         AND deleted_at IS NULL
       LIMIT 1;`,
      [userId],
    );
    return out || null;
  }

  async ensureParentOwnsChild(parentId: string, childId: string) {
    await this.ensureFamilyIdColumns();
    const parentFamilyId = await this.getParentFamilyId(parentId);
    const childFamilyId = await this.getChildFamilyId(childId);
    const allowed = parentFamilyId && childFamilyId && parentFamilyId === childFamilyId ? 't' : 'f';
    if (allowed !== 't') {
      throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }
  }

  async getParentIdByChildId(childId: string) {
    await this.ensureFamilyIdColumns();
    const familyId = await this.getChildFamilyId(childId);
    if (familyId) {
      const familyParentId = await runSql(
        `SELECT p.id
         FROM parents p
         WHERE p.family_id = $1::uuid
           AND p.deleted_at IS NULL
         ORDER BY p.created_at ASC
         LIMIT 1;`,
        [familyId],
      );
      if (familyParentId) return familyParentId;
    }

    const linkedParentId = await runSql(
      `SELECT parent_id
       FROM parent_children
       WHERE child_id = $1
       ORDER BY created_at ASC
       LIMIT 1;`,
      [childId],
    );
    return linkedParentId || null;
  }

  async syncFamilyParentChildren(familyId: string) {
    await this.ensureFamilyIdColumns();
    if (!familyId) return 0;
    const insertedCount = Number(await runSql(
      `WITH family_parents AS (
         SELECT id
         FROM parents
         WHERE family_id = $1::uuid
           AND deleted_at IS NULL
       ),
       family_children AS (
         SELECT id
         FROM children
         WHERE family_id = $1::uuid
           AND deleted_at IS NULL
           AND is_active = true
       ),
       inserted AS (
         INSERT INTO parent_children (parent_id, child_id)
         SELECT fp.id, fc.id
         FROM family_parents fp
         CROSS JOIN family_children fc
         ON CONFLICT (parent_id, child_id) DO NOTHING
         RETURNING 1
       )
       SELECT count(*)::int FROM inserted;`,
      [familyId],
    ) || 0);
    return insertedCount;
  }

  deriveFamilyName(children: { first_name: string; last_name: string }[]): string {
    const lastNames = [...new Set(children.map((c) => c.last_name).filter(Boolean))];
    return lastNames.length > 0 ? lastNames.join(' / ') : 'Unknown';
  }

  assertValidUuid(value: string | undefined, label: string) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!value || !UUID_RE.test(value)) {
      throw new BadRequestException(`Invalid ${label}: must be a valid UUID`);
    }
  }

  async ensureFamilyIdColumns() {
    if (this.familyIdsReady) return;
    await runSql(`
      ALTER TABLE parents
      ADD COLUMN IF NOT EXISTS family_id uuid;

      ALTER TABLE children
      ADD COLUMN IF NOT EXISTS family_id uuid;
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS idx_parents_family_id
      ON parents (family_id)
      WHERE deleted_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_children_family_id
      ON children (family_id)
      WHERE deleted_at IS NULL AND is_active = true;
    `);
    await this.backfillFamilyIds();
    this.familyIdsReady = true;
  }

  async assignFamilyIdToParents(parentIds: string[], familyId: string) {
    if (parentIds.length === 0) return;
    await runSql(
      `UPDATE parents
       SET family_id = $2::uuid
       WHERE id = ANY($1::uuid[]);`,
      [parentIds, familyId],
    );
  }

  async assignFamilyIdToChildren(childIds: string[], familyId: string) {
    if (childIds.length === 0) return;
    await runSql(
      `UPDATE children
       SET family_id = $2::uuid
       WHERE id = ANY($1::uuid[]);`,
      [childIds, familyId],
    );
  }

  async backfillFamilyIds() {
    const linksOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT p.id AS parent_id,
               c.id AS child_id,
               p.family_id::text AS parent_family_id,
               c.family_id::text AS child_family_id
        FROM parent_children pc
        JOIN parents p ON p.id = pc.parent_id
        JOIN children c ON c.id = pc.child_id
        WHERE p.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND c.is_active = true
      ) t;
    `,
    );
    const links = this.parseJsonLines<{
      parent_id: string;
      child_id: string;
      parent_family_id?: string | null;
      child_family_id?: string | null;
    }>(linksOut);

    const adjacency = new Map<string, Set<string>>();
    const nodeFamilyIds = new Map<string, string>();
    const ensureNode = (node: string) => {
      if (!adjacency.has(node)) adjacency.set(node, new Set());
    };
    const connect = (left: string, right: string) => {
      ensureNode(left);
      ensureNode(right);
      adjacency.get(left)?.add(right);
      adjacency.get(right)?.add(left);
    };

    for (const link of links) {
      const parentNode = `parent:${link.parent_id}`;
      const childNode = `child:${link.child_id}`;
      connect(parentNode, childNode);
      if (link.parent_family_id) nodeFamilyIds.set(parentNode, link.parent_family_id);
      if (link.child_family_id) nodeFamilyIds.set(childNode, link.child_family_id);
    }

    const visited = new Set<string>();
    for (const start of adjacency.keys()) {
      if (visited.has(start)) continue;
      const queue = [start];
      const parentIds: string[] = [];
      const childIds: string[] = [];
      let familyId = '';
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        familyId ||= nodeFamilyIds.get(current) || '';
        const [kind, id] = current.split(':');
        if (kind === 'parent') parentIds.push(id);
        if (kind === 'child') childIds.push(id);
        for (const next of adjacency.get(current) || []) {
          if (!visited.has(next)) queue.push(next);
        }
      }
      const resolvedFamilyId = familyId || randomUUID();
      await this.assignFamilyIdToParents(parentIds, resolvedFamilyId);
      await this.assignFamilyIdToChildren(childIds, resolvedFamilyId);
    }

    const orphanParents = this.parseJsonLines<{ id: string }>(await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id
        FROM parents
        WHERE deleted_at IS NULL
          AND family_id IS NULL
      ) t;
    `,
    ));
    for (const parent of orphanParents) {
      await this.assignFamilyIdToParents([parent.id], randomUUID());
    }

    const orphanChildren = this.parseJsonLines<{ id: string }>(await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id
        FROM children
        WHERE deleted_at IS NULL
          AND is_active = true
          AND family_id IS NULL
      ) t;
    `,
    ));
    for (const child of orphanChildren) {
      await this.assignFamilyIdToChildren([child.id], randomUUID());
    }
  }

  async mergeFamilyIds(targetFamilyId: string, sourceFamilyId: string) {
    if (!targetFamilyId || !sourceFamilyId || targetFamilyId === sourceFamilyId) return;
    await runSql(
      `UPDATE parents
       SET family_id = $1::uuid
       WHERE family_id = $2::uuid;`,
      [targetFamilyId, sourceFamilyId],
    );
    await runSql(
      `UPDATE children
       SET family_id = $1::uuid
       WHERE family_id = $2::uuid;`,
      [targetFamilyId, sourceFamilyId],
    );
    await this.syncFamilyParentChildren(targetFamilyId);
  }

  async alignFamilyIdsForLink(actor: AccessUser, parentId: string, childId: string) {
    await this.ensureFamilyIdColumns();
    const parentFamilyId = await this.getParentFamilyId(parentId);
    const childFamilyId = await this.getChildFamilyId(childId);
    if (parentFamilyId && childFamilyId && parentFamilyId !== childFamilyId) {
      if (actor.role !== 'ADMIN') {
        throw new ForbiddenException('FAMILY_MERGE_REQUIRES_ADMIN');
      }
      await this.mergeFamilyIds(parentFamilyId, childFamilyId);
      return parentFamilyId;
    }
    const resolvedFamilyId = parentFamilyId || childFamilyId || randomUUID();
    await this.assignFamilyIdToParents([parentId], resolvedFamilyId);
    await this.assignFamilyIdToChildren([childId], resolvedFamilyId);
    return resolvedFamilyId;
  }

  withEffectiveGrade<T extends Record<string, unknown>>(row: T) {
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

  parseJsonLine<T>(line: string): T {
    if (!line) throw new BadRequestException('No data');
    return JSON.parse(line) as T;
  }

  parseJsonLines<T>(raw: string): T[] {
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

}
