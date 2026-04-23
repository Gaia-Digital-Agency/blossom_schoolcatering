import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { runSql } from '../../auth/db.util';
import { validatePasswordPolicy } from '../../auth/password-policy';
import { AccessUser, CartItemInput, SessionType } from '../core.types';
import { CoreService } from '../core.service';
import { AuditService } from './audit.service';
import { HelpersService } from './helpers.service';
import { MediaService } from './media.service';
import { SchemaService } from './schema.service';
import { UsersService } from './users.service';

type DbUserRow = {
  id: string;
  username: string;
  role: string;
  first_name: string;
  last_name: string;
};

/**
 * DeliveryService
 * ===============
 *
 * Full delivery domain: delivery-user lifecycle, school-assignment
 * matrix, per-order auto-assignment, operator UI feed, daily notes,
 * WhatsApp notification logs, summary + email, confirm/toggle,
 * and seed-order lifecycle.
 *
 * Uses forwardRef(() => CoreService) for the cart submit path
 * (createCart/replaceCartItems/submitCart) which still live on CoreService
 * until the Order extraction lands in step 17.
 */
@Injectable()
export class DeliveryService {
  constructor(
    @Inject(forwardRef(() => CoreService)) private readonly coreService: CoreService,
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly users: UsersService,
  ) {}

  async autoAssignDeliveriesForDate(serviceDate: string) {
    await this.schema.ensureDeliverySchoolAssignmentsTable();
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
    const orders = this.helpers.parseJsonLines<{ order_id: string; school_id: string; session: SessionType }>(ordersOut);
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
    const loads = this.helpers.parseJsonLines<{ delivery_user_id: string; assigned_count: number }>(loadOut);
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
    const mappings = this.helpers.parseJsonLines<{ school_id: string; delivery_user_id: string; session: SessionType }>(mappingOut);
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


  pickSeedDeliveryUser(
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

  async applySeedOrderLifecycle(
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

    const fromDate = input.fromDate ? this.helpers.validateServiceDate(input.fromDate) : '2026-03-02';
    const toDate = input.toDate ? this.helpers.validateServiceDate(input.toDate) : '2026-03-20';
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
    const children = this.helpers.parseJsonLines<{ id: string; school_id: string }>(childrenOut);
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
    const deliveryUserIds = this.helpers.parseJsonLines<{ id: string }>(deliveryUsersOut).map((row) => row.id);

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
    const schoolAssignments = this.helpers.parseJsonLines<{ school_id: string; delivery_user_id: string }>(schoolAssignOut);
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
      const menuRows = this.helpers.parseJsonLines<{ session: SessionType; id: string }>(menuOut);
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
        current = this.helpers.addDaysIsoDate(current, 1);
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
        this.helpers.parseJsonLines<{ child_id: string; session: SessionType }>(existingOut)
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
          const cart = await this.coreService.createCart(actor, { childId: child.id, serviceDate: current, session });
          await this.coreService.replaceCartItems(actor, cart.id, items);
          const order = await this.coreService.submitCart(actor, cart.id) as { id: string };
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
      current = this.helpers.addDaysIsoDate(current, 1);
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
    return this.helpers.parseJsonLines(out);
  }

  async getDeliverySchoolAssignments() {
    await this.schema.ensureDeliverySchoolAssignmentsTable();
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
    return this.helpers.parseJsonLines(out);
  }

  async upsertDeliverySchoolAssignment(actor: AccessUser, input: { deliveryUserId?: string; schoolId?: string; session?: string; isActive?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureDeliverySchoolAssignmentsTable();
    const deliveryUserId = (input.deliveryUserId || '').trim();
    const schoolId = (input.schoolId || '').trim();
    const session = this.helpers.normalizeSession(input.session);
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
    await this.audit.recordAdminAudit(actor, 'DELIVERY_SCHOOL_ASSIGNMENT_UPSERTED', 'delivery-school-assignment', `${schoolId}:${session}`, {
      deliveryUserId,
      schoolId,
      session,
      isActive,
    });
    await this.autoAssignDeliveriesForDate(this.helpers.makassarTodayIsoDate());
    return { ok: true };
  }

  async deleteDeliverySchoolAssignment(actor: AccessUser, deliveryUserId: string, schoolId: string, sessionRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(deliveryUserId, 'deliveryUserId');
    this.helpers.assertValidUuid(schoolId, 'schoolId');
    await this.schema.ensureDeliverySchoolAssignmentsTable();
    const session = this.helpers.normalizeSession(sessionRaw);

    const out = await runSql(
      `DELETE FROM delivery_school_assignments
       WHERE delivery_user_id = $1
         AND school_id = $2
         AND session = $3::session_type
       RETURNING delivery_user_id;`,
      [deliveryUserId, schoolId, session],
    );
    if (!out) throw new NotFoundException('Delivery-school assignment not found');
    await this.audit.recordAdminAudit(actor, 'DELIVERY_SCHOOL_ASSIGNMENT_DELETED', 'delivery-school-assignment', `${schoolId}:${session}`, {
      deliveryUserId,
      schoolId,
      session,
    });
    await this.autoAssignDeliveriesForDate(this.helpers.makassarTodayIsoDate());
    return { ok: true };
  }

  async autoAssignDeliveries(actor: AccessUser, dateRaw?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.helpers.validateServiceDate(dateRaw) : this.helpers.makassarTodayIsoDate();
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
    await this.schema.ensureDeliveryDailyNotesTable();
    const serviceDate = dateRaw ? this.helpers.validateServiceDate(dateRaw) : null;
    await this.autoAssignDeliveriesForDate(serviceDate || this.helpers.makassarTodayIsoDate());
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
    return this.helpers.parseJsonLines<Record<string, unknown>>(out).map((row) => this.helpers.withEffectiveGrade(row));
  }

  async getDeliveryDailyNote(actor: AccessUser, dateRaw?: string) {
    await this.schema.ensureDeliveryDailyNotesTable();
    const serviceDate = dateRaw ? this.helpers.validateServiceDate(dateRaw) : this.helpers.makassarTodayIsoDate();
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
        ? this.helpers.parseJsonLine(out)
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
      return this.helpers.parseJsonLines(out);
    }
    throw new ForbiddenException('Role not allowed');
  }

  async updateDeliveryDailyNote(actor: AccessUser, dateRaw: string, note?: string) {
    if (actor.role !== 'DELIVERY') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureDeliveryDailyNotesTable();
    const serviceDate = this.helpers.validateServiceDate(dateRaw);
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
    await this.schema.ensureOrderNotificationLogsTable();
    const serviceDate = dateRaw ? this.helpers.validateServiceDate(dateRaw) : this.helpers.makassarTodayIsoDate();

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

    const orders = this.helpers.parseJsonLines<{
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
        phone: this.helpers.normalizePhone(row.student?.phone),
      },
      parentFallback: {
        ...row.parentFallback,
        phone: this.helpers.normalizePhone(row.parentFallback?.phone),
      },
      target: {
        ...row.target,
        phone: this.helpers.normalizePhone(row.target?.phone),
      },
    }));

    const skipped = this.helpers.parseJsonLines<{
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
    await this.schema.ensureOrderNotificationLogsTable();
    const sentTo = this.helpers.normalizePhone(body.sentTo);
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
    await this.schema.ensureOrderNotificationLogsTable();
    const targetPhone = this.helpers.normalizePhone(body.targetPhone);
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
    const serviceDate = this.helpers.makassarTodayIsoDate();
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

    const rows = this.helpers.parseJsonLines<{
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
      const pdfLines = this.media.buildTwoColumnDeliveryPdfLines({
        title: 'Assigned Orders',
        serviceDate,
        deliveryName: group.deliveryName,
        orders: group.orders,
      });
      const pdf = this.media.buildSimplePdf(pdfLines);
      try {
        await this.media.sendEmailWithPdfAttachment({
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
    const serviceDate = dateRaw ? this.helpers.validateServiceDate(dateRaw) : this.helpers.makassarTodayIsoDate();
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
    const detail = this.helpers.parseJsonLines<{
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
    const assignment = this.helpers.parseJsonLine<{ id: string; order_id: string; delivery_user_id: string; confirmed_at?: string | null }>(out);
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
    const assignment = this.helpers.parseJsonLine<{ id: string; order_id: string; delivery_user_id: string; confirmed_at?: string | null }>(out);
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
    const passwordHash = this.helpers.hashPassword(password);
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
      const existingRows = this.helpers.parseJsonLines<{ id: string; username: string; email?: string | null; deleted_at?: string | null }>(existingOut);
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
    const user = this.helpers.parseJsonLine<{ id: string; username: string; first_name: string; last_name: string }>(out);
    await this.users.setAdminVisiblePassword(user.id, password, 'MANUAL_CREATE');
    await runSql(
      `INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
       VALUES ($1, false, false, true)
       ON CONFLICT (user_id) DO NOTHING;`,
      [user.id],
    );
    await this.audit.recordAdminAudit(actor, 'DELIVERY_USER_CREATED', 'user', user.id, { username: user.username });
    return user;
  }

  async deactivateDeliveryUser(actor: AccessUser, targetUserId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(targetUserId, 'userId');
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
    const user = this.helpers.parseJsonLine<{ id: string; username: string }>(out);
    await this.audit.recordAdminAudit(actor, 'DELIVERY_USER_DEACTIVATED', 'user', user.id, { username: user.username });
    return { ok: true, user };
  }

  async updateDeliveryUser(
    actor: AccessUser,
    targetUserId: string,
    input: { firstName?: string; lastName?: string; phoneNumber?: string; email?: string; username?: string; isActive?: boolean },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(targetUserId, 'userId');

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
    const user = this.helpers.parseJsonLine<{ id: string; username: string }>(out);
    await this.audit.recordAdminAudit(actor, 'DELIVERY_USER_UPDATED', 'user', user.id, {
      changedFields: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
    });
    return { ok: true, user };
  }

  async deleteDeliveryUser(actor: AccessUser, targetUserId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(targetUserId, 'userId');

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

    await this.schema.ensureDeliverySchoolAssignmentsTable();
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
    const user = this.helpers.parseJsonLine<{ id: string; username: string }>(out);
    await this.audit.recordAdminAudit(actor, 'DELIVERY_USER_DELETED', 'user', user.id, { username: user.username });
    return { ok: true, user };
  }

}
