import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { runSql } from '../../auth/db.util';
import { AccessUser, CartItemInput, SessionType } from '../core.types';
import { CoreService } from '../core.service';
import { AuditService } from './audit.service';
import { HelpersService } from './helpers.service';
import { MediaService } from './media.service';
import { MenuService } from './menu.service';
import { SchemaService } from './schema.service';
import { SchoolsService } from './schools.service';

/**
 * MultiOrderService
 * =================
 *
 * Repeat / series order groups: one parent record with start/end dates
 * and repeat-weekdays, expanded into occurrence rows that each create
 * individual orders via OrderService (createCart/replaceCartItems/
 * submitCart — still on CoreService via forwardRef until the Order
 * extraction lands in step 17).
 *
 * Owns: group CRUD, occurrence management, parent request flow, per-group
 * billing (proofs + receipts), admin review.
 *
 * Dependencies:
 *   - runSql, crypto(randomUUID)
 *   - HelpersService, AuditService, SchemaService, MediaService,
 *     MenuService, SchoolsService, CoreService (forwardRef for
 *     cart/order submit flow)
 */
@Injectable()
export class MultiOrderService {
  constructor(
    @Inject(forwardRef(() => CoreService)) private readonly coreService: CoreService,
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly menu: MenuService,
    private readonly schools: SchoolsService,
  ) {}

  normalizeMultiOrderRepeatDays(repeatDaysRaw: string[]) {
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

  async getMultiOrderParentId(actor: AccessUser, childId: string) {
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      await this.helpers.ensureParentOwnsChild(parentId, childId);
      return parentId;
    }
    return this.helpers.getParentIdByChildId(childId);
  }

  async getMultiOrderOwnerChildId(actor: AccessUser, childIdRaw: string) {
    const childId = String(childIdRaw || '').trim();
    this.helpers.assertValidUuid(childId, 'childId');
    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      await this.helpers.ensureParentOwnsChild(parentId, childId);
    }
    return childId;
  }

  async getMultiOrderMenuSnapshot(session: SessionType, items: CartItemInput[]) {
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
    const rows = this.helpers.parseJsonLines<{ id: string; name: string; price: string | number }>(out);
    if (rows.length !== ids.length) throw new BadRequestException('ORDER_MENU_UNAVAILABLE');
    const byId = new Map(rows.map((row) => [row.id, row]));
    return normalized.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      itemNameSnapshot: byId.get(item.menuItemId)?.name || '',
      priceSnapshot: Number(Number(byId.get(item.menuItemId)?.price || 0).toFixed(2)),
    }));
  }

  async getMultiOrderSkippedReason(serviceDate: string, session: SessionType, childId: string) {
    const weekday = Number(await runSql(`SELECT extract(isodow FROM $1::date)::int;`, [serviceDate]) || 0);
    if (weekday > 5) return 'WEEKEND';
    const blackout = await this.schools.getBlackoutRuleForDate(serviceDate, session);
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

  async collectMultiOrderPlan(input: {
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
      current = this.helpers.addDaysIsoDate(current, 1);
    }
    return { menuSnapshot, dates, skipped };
  }

  async getMultiOrderGroupOwned(actor: AccessUser, groupId: string) {
    await this.schema.ensureMultiOrderSchema();
    this.helpers.assertValidUuid(groupId, 'groupId');
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
    const group = this.helpers.parseJsonLine<Record<string, unknown> & {
      child_id: string;
      parent_id?: string | null;
    }>(out);
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId || group.parent_id !== parentId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId || group.child_id !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }
    return group;
  }

  async getMultiOrderOccurrences(groupId: string) {
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
    return this.helpers.parseJsonLines<Record<string, unknown> & { service_date?: string; price_snapshot_total?: string | number }>(out).map((row) => ({
      ...row,
      price_snapshot_total: Number(row.price_snapshot_total || 0),
    }));
  }

  async canOwnerEditMultiOrder(group: Record<string, unknown> & { id?: string | null; start_date?: string | null }) {
    const occurrences = await this.getMultiOrderOccurrences(String(group.id || ''));
    const firstServiceDate = String(occurrences[0]?.service_date || group.start_date || '').trim();
    if (!firstServiceDate) return false;
    return !(await this.helpers.isAfterOrAtMakassarCutoff(firstServiceDate));
  }

  async upsertMultiOrderBilling(groupId: string, parentId: string | null) {
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

  async createMultiOrderOrders(actor: AccessUser, input: {
    groupId: string;
    childId: string;
    session: SessionType;
    dates: string[];
    menuSnapshot: Array<{ menuItemId: string; quantity: number; itemNameSnapshot: string; priceSnapshot: number }>;
  }) {
    const created: Array<{ serviceDate: string; orderId: string; totalPrice: number }> = [];
    for (const serviceDate of input.dates) {
      const cart = await this.coreService.createCart(actor, {
        childId: input.childId,
        serviceDate,
        session: input.session,
      });
      await this.coreService.replaceCartItems(
        actor,
        cart.id,
        input.menuSnapshot.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
      );
      const order = await this.coreService.submitCart(actor, cart.id) as { id: string; total_price: number };
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

  async recalculateMultiOrderGroupStatus(groupId: string) {
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
    const stats = this.helpers.parseJsonLine<{ total_count: number; past_count: number; future_count: number }>(statsOut);
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

  async deleteOccurrenceOrders(orderIds: string[], actorId: string) {
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

  isImmutableMultiOrderStatus(statusRaw?: string | null) {
    const status = String(statusRaw || '').trim().toUpperCase();
    return ['KITCHEN_COMPLETED', 'IN_DELIVERY', 'DELIVERED', 'LOCKED'].includes(status);
  }

  async getMultiOrders(actor: AccessUser) {
    await this.schema.ensureMultiOrderSchema();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) return [];
      params.push(parentId);
      clauses.push(`mog.parent_id = $${params.length}`);
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
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
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_amount?: string | number; current_total_amount?: string | number; original_total_amount?: string | number }>(out).map((row) => ({
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
    await this.schema.ensureMultiOrderSchema();
    const childId = await this.getMultiOrderOwnerChildId(actor, String(input.childId || ''));
    const session = this.helpers.normalizeSession(input.session);
    const startDate = this.helpers.validateServiceDate(input.startDate);
    const endDate = this.helpers.validateServiceDate(input.endDate);
    if (endDate < startDate) throw new BadRequestException('endDate must be on or after startDate');
    const horizonDate = this.helpers.addDaysIsoDate(startDate, 92);
    if (endDate > horizonDate) throw new BadRequestException('MULTI_ORDER_RANGE_EXCEEDED');
    await this.schools.assertSessionActiveForOrdering(session);
    await this.helpers.enforceParentYoungsterOrderingWindow(actor, startDate);
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
    await this.audit.recordAdminAudit(actor, 'MULTI_ORDER_CREATED', 'multi-order-group', groupId, {
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
      requests: this.helpers.parseJsonLines(requestsOut),
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
    const session = this.helpers.normalizeSession(String(group.session || ''));
    const childId = String(group.child_id || '');
    const startDate = this.helpers.validateServiceDate(input.startDate);
    const endDate = this.helpers.validateServiceDate(input.endDate);
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
    await this.audit.recordAdminAudit(actor, 'MULTI_ORDER_UPDATED', 'multi-order-group', groupId, {
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
    await this.audit.recordAdminAudit(actor, 'MULTI_ORDER_DELETED', 'multi-order-group', groupId);
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
      ? this.helpers.parseJsonLine<Record<string, unknown> & { total_amount?: string | number }>(out)
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
    const parsed = this.media.parseDataUrl(proof);
    this.media.assertSafeImagePayload({
      contentType: parsed.contentType,
      data: parsed.data,
      maxBytes: 10 * 1024 * 1024,
      label: 'Proof image',
    });
    const ext = parsed.contentType.includes('png') ? 'png' : parsed.contentType.includes('jpeg') ? 'jpg' : 'webp';
    const ownerFolderId = actor.role === 'PARENT' ? String(group.parent_id || actor.uid) : String(group.child_id || actor.uid);
    const objectName = `${this.media.getGcsCategoryFolder('payment-proofs')}/${ownerFolderId}/multi-order-${groupId}-${Date.now()}.${ext}`;
    const uploaded = await this.media.uploadToGcs({
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
    const row = this.helpers.parseJsonLine<{ proof_image_url: string }>(out);
    const proofImageUrl = String(row.proof_image_url || '').trim();
    if (!proofImageUrl) throw new BadRequestException('No uploaded proof image for this bill');

    if (proofImageUrl.startsWith('data:')) {
      const parsed = this.media.parseDataUrl(proofImageUrl);
      this.media.assertSafeImagePayload({
        contentType: parsed.contentType,
        data: parsed.data,
        maxBytes: 10 * 1024 * 1024,
        label: 'Proof image',
      });
      return { contentType: parsed.contentType, data: parsed.data };
    }

    return this.media.fetchProofImageBinary(proofImageUrl);
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
    await this.schema.ensureMultiOrderSchema();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.session) {
      params.push(this.helpers.normalizeSession(input.session));
      clauses.push(`mog.session = $${params.length}::session_type`);
    }
    if (input.status) {
      params.push(String(input.status).trim().toUpperCase());
      clauses.push(`upper(mog.status) = $${params.length}`);
    }
    if (input.fromDate) {
      params.push(this.helpers.validateServiceDate(input.fromDate));
      clauses.push(`mog.start_date >= $${params.length}::date`);
    }
    if (input.toDate) {
      params.push(this.helpers.validateServiceDate(input.toDate));
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
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_amount?: string | number; current_total_amount?: string | number; original_total_amount?: string | number }>(out).map((row) => ({
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
      String(row.service_date || '') >= this.helpers.makassarTodayIsoDate()
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
    await this.audit.recordAdminAudit(actor, 'MULTI_ORDER_FUTURE_TRIMMED', 'multi-order-group', groupId, {
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
    await this.audit.recordAdminAudit(actor, 'MULTI_ORDER_REPLACEMENT_CREATED', 'multi-order-group', groupId, {
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
    const occurrence = this.helpers.parseJsonLine<{ id: string; order_id?: string | null; service_date: string; status: string }>(out);
    if (occurrence.service_date < this.helpers.makassarTodayIsoDate() || this.isImmutableMultiOrderStatus(occurrence.status)) {
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
    const request = this.helpers.parseJsonLine<{ id: string; request_type: string; payload_json?: { startDate?: string; endDate?: string; repeatDays?: string[]; items?: CartItemInput[] } }>(requestOut);
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
    const billing = this.helpers.parseJsonLine<{ id: string; proof_image_url: string }>(billingOut);
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
    const buffer = this.media.buildSimplePdf(lines);
    const objectName = `${this.media.getGcsCategoryFolder('receipts')}/${receiptNumber}.pdf`;
    const uploaded = await this.media.uploadToGcs({
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
    return this.helpers.parseJsonLine(out);
  }

  async getMultiOrderReceiptFile(actor: AccessUser, groupId: string) {
    const row = await this.getMultiOrderReceipt(actor, groupId) as Record<string, unknown>;
    const pdfUrl = String(row.pdf_url || '').trim();
    if (!pdfUrl) throw new NotFoundException('Receipt PDF not found');
    const file = await this.media.fetchReceiptPdfBinary(pdfUrl);
    return {
      ...file,
      fileName: `${String(row.receipt_number || '').trim() || 'receipt'}.pdf`,
    };
  }

}
