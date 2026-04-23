import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { runSql } from '../../auth/db.util';
import { validatePasswordPolicy } from '../../auth/password-policy';
import { normalizeGradeLabel } from '../../shared/grade.util';
import { AccessUser } from '../core.types';
import { AuditService } from './audit.service';
import { HelpersService } from './helpers.service';
import { MenuService } from './menu.service';
import { SchemaService } from './schema.service';

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

/**
 * UsersService
 * ============
 *
 * Parents + youngsters CRUD, password admin, family linking/merging,
 * youngster registration.
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService, HelpersService, AuditService, MenuService
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
    private readonly audit: AuditService,
    private readonly menu: MenuService,
  ) {}

  async getYoungsterMe(actor: AccessUser) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureSchoolShortNameColumn();
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
    return this.helpers.withEffectiveGrade(this.helpers.parseJsonLine<ChildRow>(out));
  }

  async setAdminVisiblePassword(userId: string, password: string, source: 'REGISTRATION' | 'RESET' | 'MANUAL_CREATE') {
    await this.schema.ensureAdminVisiblePasswordsTable();
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

  async getAdminVisiblePasswordRow(userId: string) {
    await this.schema.ensureAdminVisiblePasswordsTable();
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
      ? this.helpers.parseJsonLine<{ password_plaintext: string; source: string; updated_at: string }>(out)
      : null;
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
    const phoneNumber = this.helpers.normalizePhone(input.phoneNumber);
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
    const allergies = this.menu.normalizeAllergies(input.allergies);

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
      parentId = await this.helpers.getParentIdByUserId(actor.uid);
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
        ? this.helpers.parseJsonLine<{ id: string; last_name: string; phone_number?: string | null; email?: string | null }>(parentOut)
        : null;
      if (!parent) throw new BadRequestException('Parent profile not found');
      parentLastNameForUsername = String(parent.last_name || '').trim() || lastName;
      if (email === String(parent.email || '').trim().toLowerCase()) {
        throw new BadRequestException('Student email cannot be the same as parent email');
      }
      if (this.helpers.phoneCompareKey(phoneNumber) === this.helpers.phoneCompareKey(parent.phone_number)) {
        throw new BadRequestException('Student phone number cannot be the same as parent phone number');
      }
    }
    if (await this.helpers.findActiveUserByEmail(email)) throw new ConflictException('That email is already taken');
    if (await this.helpers.findActiveUserByPhone(phoneNumber)) throw new ConflictException('That phone number is already taken');
    await this.schema.ensureChildCurrentGradeColumn();
    await this.helpers.ensureFamilyIdColumns();
    let familyId: string | null = parentId ? await this.helpers.getParentFamilyId(parentId) : null;
    familyId ||= randomUUID();

    const usernameBase = this.helpers.sanitizeUsernamePart(`${parentLastNameForUsername}_${firstName}`);
    const username = await runSql(`SELECT generate_unique_username($1);`, [usernameBase]);
    const passwordSeed = phoneNumber.replace(/\D/g, '') || randomUUID().slice(0, 10);
    const passwordHash = this.helpers.hashPassword(passwordSeed);

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
    const created = this.helpers.parseJsonLine<DbUserRow>(createdOut);

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
    const child = this.helpers.parseJsonLine<{ id: string; user_id: string }>(childOut);

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
    await this.schema.ensureParent2Columns();
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
    return this.helpers.parseJsonLines(out);
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
    return this.helpers.parseJsonLines<Record<string, unknown>>(out).map((row) => this.helpers.withEffectiveGrade(row));
  }

  async getParentChildrenPages(actor: AccessUser) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.helpers.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.helpers.getParentFamilyId(parentId);
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
      children: this.helpers.parseJsonLines<ChildRow>(out).map((row) => this.helpers.withEffectiveGrade(row)),
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

  async linkParentChild(actor: AccessUser, parentId: string, childId: string) {
    if (!['PARENT', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    if (actor.role === 'PARENT') {
      const myParentId = await this.helpers.getParentIdByUserId(actor.uid);
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
    await this.helpers.alignFamilyIdsForLink(actor, parentId, childId);

    return { ok: true };
  }

  async updateParentProfile(actor: AccessUser, targetParentId: string, input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; address?: string; parent2FirstName?: string; parent2Phone?: string; parent2Email?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(targetParentId, 'parentId');
    await this.schema.ensureParent2Columns();
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT p.id, p.user_id FROM parents p
         WHERE p.id = $1 AND p.deleted_at IS NULL
       ) t;`,
      [targetParentId],
    );
    if (!out) throw new NotFoundException('Parent not found');
    const parent = this.helpers.parseJsonLine<{ id: string; user_id: string }>(out);
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.firstName) { params.push(input.firstName.trim()); updates.push(`first_name = $${params.length}`); }
    if (input.lastName) { params.push(input.lastName.trim()); updates.push(`last_name = $${params.length}`); }
    if (input.phoneNumber !== undefined) {
      const phoneNumber = this.helpers.normalizePhone(input.phoneNumber);
      if (!phoneNumber) throw new BadRequestException('phoneNumber cannot be empty');
      if (await this.helpers.findActiveUserByPhone(phoneNumber, parent.user_id)) {
        throw new ConflictException('That phone number is already taken');
      }
      params.push(phoneNumber);
      updates.push(`phone_number = $${params.length}`);
    }
    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      if (!email) throw new BadRequestException('email cannot be empty');
      if (await this.helpers.findActiveUserByEmail(email, parent.user_id)) {
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
      if (input.parent2Phone !== undefined) { p2Params.push(this.helpers.normalizePhone(input.parent2Phone) || null); p2Updates.push(`parent2_phone = $${p2Params.length}`); }
      if (input.parent2Email !== undefined) { p2Params.push(input.parent2Email.trim().toLowerCase() || null); p2Updates.push(`parent2_email = $${p2Params.length}`); }
      if (p2Updates.length > 0) {
        p2Updates.push('updated_at = now()');
        p2Params.push(targetParentId);
        await runSql(`UPDATE parents SET ${p2Updates.join(', ')} WHERE id = $${p2Params.length};`, p2Params);
      }
    }
    await this.audit.recordAdminAudit(actor, 'PARENT_PROFILE_UPDATED', 'parent', targetParentId, {
      changedFields: Object.keys(input).filter((k) => Boolean((input as Record<string, unknown>)[k])),
    });
    return { ok: true };
  }

  async deleteParent(actor: AccessUser, targetParentId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(targetParentId, 'parentId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT p.id, p.user_id FROM parents p
         WHERE p.id = $1 AND p.deleted_at IS NULL
       ) t;`,
      [targetParentId],
    );
    if (!out) throw new NotFoundException('Parent not found');
    const parent = this.helpers.parseJsonLine<{ id: string; user_id: string }>(out);
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
    const linkedYoungsters = this.helpers.parseJsonLines<{ id: string; user_id: string; deleted_at?: string | null }>(linkedYoungstersRaw);
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
      await this.audit.recordAdminAudit(actor, 'PARENT_DELETED', 'parent', targetParentId);
      return { ok: true };
    }
    await runSql(`DELETE FROM parent_children WHERE parent_id = $1;`, [targetParentId]);
    await runSql(`DELETE FROM user_preferences WHERE user_id = $1;`, [parent.user_id]);
    await runSql(`DELETE FROM parents WHERE id = $1;`, [targetParentId]);
    await runSql(`DELETE FROM users WHERE id = $1;`, [parent.user_id]);
    await this.audit.recordAdminAudit(actor, 'PARENT_DELETED', 'parent', targetParentId);
    return { ok: true };
  }

  async getParentDeleteBlockers(parentId: string, userId: string) {
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
    const blockingHistory = this.helpers.parseJsonLine<{
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

  async softDeleteParent(parentId: string, userId: string) {
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

  async getYoungsterDeleteBlockers(youngsterId: string, userId: string) {
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
    const blocker = this.helpers.parseJsonLine<{
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

  async softDeleteYoungster(youngsterId: string, userId: string) {
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
    const cartIds = this.helpers.parseJsonLines<{ id: string }>(cartIdsOut).map((row) => row.id);
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
    const favouriteIds = this.helpers.parseJsonLines<{ id: string }>(favouriteIdsOut).map((row) => row.id);
    if (favouriteIds.length > 0) {
      const favouriteIdPlaceholders = favouriteIds.map((_, index) => `$${index + 1}`).join(', ');
      await runSql(`DELETE FROM favourite_meal_items WHERE favourite_meal_id IN (${favouriteIdPlaceholders});`, favouriteIds);
      await runSql(`DELETE FROM favourite_meals WHERE id IN (${favouriteIdPlaceholders});`, favouriteIds);
    }
    await runSql(`DELETE FROM auth_refresh_sessions WHERE user_id = $1;`, [userId]);
  }

  async hardDeleteYoungsterIfSafe(youngsterId: string, userId: string) {
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
    this.helpers.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT c.id, c.user_id FROM children c
         WHERE c.id = $1 AND c.deleted_at IS NULL
       ) t;`,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const child = this.helpers.parseJsonLine<{ id: string; user_id: string }>(out);
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
      ? this.helpers.parseJsonLine<{ phone_number?: string | null; email?: string | null }>(currentUserOut)
      : { phone_number: null, email: null };
    let nextPhone = String(currentUser.phone_number || '');
    let nextEmail = String(currentUser.email || '').trim().toLowerCase();
    if (input.phoneNumber !== undefined) {
      nextPhone = this.helpers.normalizePhone(input.phoneNumber);
      if (!nextPhone) throw new BadRequestException('phoneNumber cannot be empty');
      if (await this.helpers.findActiveUserByPhone(nextPhone, child.user_id)) {
        throw new ConflictException('That phone number is already taken');
      }
      userParams.push(nextPhone);
      userUpdates.push(`phone_number = $${userParams.length}`);
    }
    if (input.email !== undefined) {
      nextEmail = input.email.trim().toLowerCase();
      if (!nextEmail) throw new BadRequestException('email cannot be empty');
      if (await this.helpers.findActiveUserByEmail(nextEmail, child.user_id)) {
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
    await this.schema.ensureChildCurrentGradeColumn();
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
    if (input.schoolId) { this.helpers.assertValidUuid(input.schoolId, 'schoolId'); childParams.push(input.schoolId); childUpdates.push(`school_id = $${childParams.length}`); }
    if (input.gender) { childParams.push(input.gender.toUpperCase()); childUpdates.push(`gender = $${childParams.length}::gender_type`); }
    if (input.dateOfBirth) { childParams.push(this.helpers.validateServiceDate(input.dateOfBirth)); childUpdates.push(`date_of_birth = $${childParams.length}::date`); }
    if (childUpdates.length > 0) {
      childUpdates.push('updated_at = now()');
      childParams.push(youngsterId);
      await runSql(`UPDATE children SET ${childUpdates.join(', ')} WHERE id = $${childParams.length};`, childParams);
    }
    if (input.parentId) {
      this.helpers.assertValidUuid(input.parentId, 'parentId');
      const currentLinkOut = await runSql(
        `SELECT parent_id FROM parent_children WHERE child_id = $1 LIMIT 1;`,
        [youngsterId],
      );
      const currentParentId = String(currentLinkOut || '').trim();
      const isReassignment = currentParentId && currentParentId !== input.parentId;
      if (isReassignment) {
        const hasStudentLastName = typeof input.lastName === 'string' && input.lastName.trim().length > 0;
        const existingLastNameOut = await runSql(
          `SELECT last_name FROM users WHERE id = $1 LIMIT 1;`,
          [child.user_id],
        );
        const existingLastName = String(existingLastNameOut || '').trim();
        if (!hasStudentLastName && !existingLastName) {
          throw new BadRequestException('Student last name is required when reassigning to a different parent.');
        }
      }
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
        ? this.helpers.parseJsonLine<{ phone_number?: string | null; email?: string | null }>(parentOut)
        : null;
      if (!parent) throw new BadRequestException('Parent not found');
      if (nextEmail && nextEmail === String(parent.email || '').trim().toLowerCase()) {
        throw new BadRequestException('Student email cannot be the same as parent email');
      }
      if (this.helpers.phoneCompareKey(nextPhone) === this.helpers.phoneCompareKey(parent.phone_number)) {
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
    await this.audit.recordAdminAudit(actor, 'YOUNGSTER_PROFILE_UPDATED', 'youngster', youngsterId, {
      changedFields: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
    });
    return { ok: true };
  }

  async deleteYoungster(actor: AccessUser, youngsterId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(youngsterId, 'youngsterId');
    const out = await runSql(
      `SELECT row_to_json(t)::text FROM (
         SELECT c.id, c.user_id FROM children c
         WHERE c.id = $1 AND c.deleted_at IS NULL
       ) t;`,
      [youngsterId],
    );
    if (!out) throw new NotFoundException('Youngster not found');
    const child = this.helpers.parseJsonLine<{ id: string; user_id: string }>(out);
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
    await this.audit.recordAdminAudit(actor, 'YOUNGSTER_DELETED', 'youngster', youngsterId);
    return { ok: true };
  }

  async adminResetUserPassword(actor: AccessUser, userId: string, newPasswordRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(userId, 'userId');
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
    const target = this.helpers.parseJsonLine<{ id: string; username: string; role: string }>(out);
    if (!['PARENT', 'CHILD', 'DELIVERY'].includes(target.role)) {
      throw new BadRequestException('Only PARENT, CHILD, and DELIVERY password reset is allowed here');
    }
    const generatedPassword = `Tmp#${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const newPassword = (newPasswordRaw || '').trim() || generatedPassword;
    validatePasswordPolicy(newPassword, 'newPassword');
    const passwordHash = this.helpers.hashPassword(newPassword);
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
    await this.audit.recordAdminAudit(actor, 'USER_PASSWORD_RESET', 'user', userId, {
      role: target.role,
      username: target.username,
      generated: !newPasswordRaw,
    });
    return { ok: true, userId, username: target.username, role: target.role, newPassword };
  }

  async adminGetUserPassword(actor: AccessUser, userId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(userId, 'userId');
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
    const target = this.helpers.parseJsonLine<{ id: string; username: string; role: string; phone_number?: string | null }>(out);
    if (!['PARENT', 'CHILD', 'DELIVERY'].includes(target.role)) {
      throw new BadRequestException('Only PARENT, CHILD, and DELIVERY password view is allowed here');
    }
    const stored = await this.getAdminVisiblePasswordRow(userId);
    const fallbackPassword = this.helpers.buildGeneratedPasswordFromPhone(target.phone_number);
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
    this.helpers.assertValidUuid(youngsterId, 'youngsterId');
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
    const target = this.helpers.parseJsonLine<{ user_id: string }>(out);
    return this.adminResetUserPassword(actor, target.user_id, newPasswordRaw);
  }

  async adminGetYoungsterPassword(actor: AccessUser, youngsterId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(youngsterId, 'youngsterId');
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
    const target = this.helpers.parseJsonLine<{ user_id: string }>(out);
    return this.adminGetUserPassword(actor, target.user_id);
  }

  async mergeFamily(actor: AccessUser, input: { sourceFamilyId?: string; targetFamilyId?: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.helpers.ensureFamilyIdColumns();

    const sourceFamilyId = String(input.sourceFamilyId || '').trim();
    const targetFamilyId = String(input.targetFamilyId || '').trim();
    this.helpers.assertValidUuid(sourceFamilyId, 'sourceFamilyId');
    this.helpers.assertValidUuid(targetFamilyId, 'targetFamilyId');
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

    await this.helpers.mergeFamilyIds(targetFamilyId, sourceFamilyId);

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

    await this.audit.recordAdminAudit(actor, 'FAMILY_MERGED', 'family', targetFamilyId, {
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

}
