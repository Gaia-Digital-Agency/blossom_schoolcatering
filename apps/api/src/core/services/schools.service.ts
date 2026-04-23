import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser, SessionType } from '../core.types';
import { AuditService } from './audit.service';
import { HelpersService } from './helpers.service';
import { SchemaService } from './schema.service';

type BlackoutType = 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';

type BlackoutRule = {
  blackout_date: string;
  type: BlackoutType;
  reason: string | null;
  session?: SessionType | null;
};

/**
 * SchoolsService
 * ==============
 *
 * Scope:
 *   - Schools CRUD (create/update/delete + list) with admin audit.
 *   - Session settings table (BREAKFAST / SNACK / LUNCH on/off).
 *     isSessionActive / assertSessionActiveForOrdering gate every
 *     order-creation path.
 *   - Blackout days management: holidays, kitchen closures, single-
 *     session or all-session blocks. validateOrderDayRules and
 *     getBlackoutRuleForDate are called by OrderService / MultiOrder
 *     at ordering time.
 *
 * Owned methods (moved from CoreService in this extraction):
 *   Schools:       getSchools, createSchool, updateSchool, deleteSchool
 *   Sessions:      getSessionSettings, isSessionActive,
 *                  assertSessionActiveForOrdering
 *   Blackouts:     getBlackoutDays, createBlackoutDay, deleteBlackoutDay,
 *                  getBlackoutRuleForDate, validateOrderDayRules
 *
 * NOT moved here: updateSessionSetting — it calls the public menu
 * in-memory cache clearer (clearPublicMenuCache), which still lives on
 * CoreService pending the MenuService extraction. updateSessionSetting
 * will move here once MenuService owns the cache.
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - HelpersService (parseJsonLine, parseJsonLines, normalizeSession,
 *                     validateServiceDate, assertValidUuid)
 *   - SchemaService  (ensureBlackoutDaysSessionColumn,
 *                     ensureSchoolShortNameColumn)
 *   - AuditService   (recordAdminAudit)
 *
 * Consumers:
 *   - CoreService facade (~12 endpoints: /schools*, /sessions*, /blackout-days*)
 *   - OrderService / MultiOrderService (blackout + session gating)
 */
@Injectable()
export class SchoolsService {
  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
    private readonly audit: AuditService,
  ) {}

  async getSchools(active = true) {
    await this.schema.ensureSchoolShortNameColumn();
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
    return this.helpers.parseJsonLines<{ id: string; name: string; short_name: string | null; city: string | null; address: string | null; contact_phone: string | null; is_active: boolean }>(out);
  }

  async updateSchool(actor: AccessUser, schoolId: string, input: { isActive?: boolean; name?: string; shortName?: string; city?: string; address?: string; contactPhone?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureSchoolShortNameColumn();
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
    const updated = this.helpers.parseJsonLine<{ id: string; name: string; is_active: boolean }>(out);
    await this.audit.recordAdminAudit(actor, 'SCHOOL_UPDATED', 'school', updated.id, { name: updated.name, isActive: updated.is_active });
    return updated;
  }

  async createSchool(actor: AccessUser, input: { name?: string; shortName?: string; address?: string; city?: string; contactPhone?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureSchoolShortNameColumn();
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
    const school = this.helpers.parseJsonLine<{ id: string; name: string }>(out);
    await this.audit.recordAdminAudit(actor, 'SCHOOL_CREATED', 'school', school.id, { name: school.name });
    return school;
  }

  async deleteSchool(actor: AccessUser, schoolId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(schoolId, 'schoolId');
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
    await this.audit.recordAdminAudit(actor, 'SCHOOL_DELETED', 'school', schoolId);
    return { ok: true };
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
    return this.helpers.parseJsonLines<{ session: SessionType; is_active: boolean }>(out);
  }

  async isSessionActive(session: SessionType) {
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

  async assertSessionActiveForOrdering(session: SessionType) {
    const active = await this.isSessionActive(session);
    if (!active) throw new BadRequestException('ORDER_SESSION_DISABLED');
  }

  async getBlackoutDays(query: { fromDate?: string; toDate?: string; session?: string }) {
    await this.schema.ensureBlackoutDaysSessionColumn();
    const params: string[] = [];
    const conditions: string[] = [];
    if (query.fromDate) {
      params.push(this.helpers.validateServiceDate(query.fromDate));
      conditions.push(`b.blackout_date >= $${params.length}::date`);
    }
    if (query.toDate) {
      params.push(this.helpers.validateServiceDate(query.toDate));
      conditions.push(`b.blackout_date <= $${params.length}::date`);
    }
    if (query.session) {
      params.push(this.helpers.normalizeSession(query.session));
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
    return this.helpers.parseJsonLines(out);
  }

  async createBlackoutDay(actor: AccessUser, input: { blackoutDate?: string; type?: string; reason?: string; session?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureBlackoutDaysSessionColumn();
    const blackoutDate = this.helpers.validateServiceDate(input.blackoutDate);
    const type = (input.type || '').toUpperCase();
    const reason = (input.reason || '').trim().slice(0, 500);
    const session = input.session ? this.helpers.normalizeSession(input.session) : null;
    if (!['ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH'].includes(type)) {
      throw new BadRequestException('Invalid blackout type');
    }

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
    const entry = this.helpers.parseJsonLine<{ id: string; blackout_date: string; type: string; session?: SessionType | null }>(out);
    await this.audit.recordAdminAudit(actor, 'BLACKOUT_DAY_UPSERTED', 'blackout-day', entry.id, {
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
    await this.audit.recordAdminAudit(actor, 'BLACKOUT_DAY_DELETED', 'blackout-day', id);
    return { ok: true };
  }

  async getBlackoutRuleForDate(serviceDate: string, session?: SessionType): Promise<BlackoutRule | null> {
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
    return this.helpers.parseJsonLine<BlackoutRule>(out);
  }

  async validateOrderDayRules(serviceDate: string, session?: SessionType) {
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
}
