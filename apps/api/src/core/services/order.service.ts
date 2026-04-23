import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser, CartItemInput, SessionType } from '../core.types';
import { AuditService } from './audit.service';
import { DeliveryService } from './delivery.service';
import { HelpersService } from './helpers.service';
import { MenuService } from './menu.service';
import { SchemaService } from './schema.service';
import { SchoolsService } from './schools.service';

type CartRow = {
  id: string;
  child_id: string;
  created_by_user_id: string;
  session: SessionType;
  service_date: string;
  status: 'OPEN' | 'SUBMITTED' | 'EXPIRED';
  expires_at: string;
};

/**
 * OrderService
 * ============
 *
 * All order-creation + management logic: carts, submitted orders,
 * favourites, quick-reorder, meal-plan wizard, update/delete orders,
 * and admin orders list. Enforces Makassar ordering window, session
 * activation, blackout rules, cutoff lock, and dietary-snapshot
 * capture at submit time.
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - HelpersService, SchemaService, AuditService
 *   - SchoolsService (validateOrderDayRules, assertSessionActiveForOrdering,
 *                     isSessionActive, getBlackoutRuleForDate)
 *   - MenuService (ensureMenuForDateSession, normalizeAllergies)
 *   - DeliveryService (autoAssignDeliveriesForDate)
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
    private readonly audit: AuditService,
    private readonly schools: SchoolsService,
    private readonly menu: MenuService,
    private readonly delivery: DeliveryService,
  ) {}

  async ensureCartIsOpenAndOwned(cartId: string, actor: AccessUser): Promise<CartRow> {
    this.helpers.assertValidUuid(cartId, 'cartId');
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
    const cart = this.helpers.parseJsonLine<CartRow>(out);

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId || childId !== cart.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, cart.child_id);
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

  async getOrderDietarySnapshot(childId: string) {
    await this.schema.ensureParentDietaryRestrictionsTable();
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

    const childAllergies = this.menu.normalizeAllergies(childAllergiesRaw || '');
    const parentAllergies = this.menu.normalizeAllergies(parentAllergiesRaw || '');
    const hasChild = childAllergies.toLowerCase() !== 'no allergies';
    const hasParent = parentAllergies.toLowerCase() !== 'no allergies';
    if (!hasChild && !hasParent) return 'No Allergies';
    if (hasChild && hasParent) return `Youngster Allergies: ${childAllergies}; Parent Allergies: ${parentAllergies}`;
    if (hasChild) return `Youngster Allergies: ${childAllergies}`;
    return `Parent Allergies: ${parentAllergies}`;
  }

  async getAdminOrders(
    actor: AccessUser,
    input?: { dateRaw?: string; schoolId?: string; deliveryUserId?: string; session?: string },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const serviceDate = input?.dateRaw ? this.helpers.validateServiceDate(input.dateRaw) : '';
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
      params.push(this.helpers.normalizeSession(input.session));
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

    const rows = this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number; delivery_status?: string }>(rowsOut)
      .map((row) => ({
        ...this.helpers.withEffectiveGrade(row),
        total_price: Number(row.total_price || 0),
        is_completed: String(row.delivery_status || '').toUpperCase() === 'DELIVERED',
      }));

    return {
      filters: {
        schools: this.helpers.parseJsonLines(schoolsOut),
        deliveryUsers: [
          { user_id: 'UNASSIGNED', name: 'Unassigned' },
          ...this.helpers.parseJsonLines(deliveryUsersOut),
        ],
      },
      outstanding: rows.filter((row) => !row.is_completed),
      completed: rows.filter((row) => row.is_completed),
    };
  }

  async createCart(actor: AccessUser, input: { childId?: string; serviceDate?: string; session?: string }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const serviceDate = this.helpers.validateServiceDate(input.serviceDate);
    const session = this.helpers.normalizeSession(input.session);
    const childId = (input.childId || '').trim();

    await this.helpers.enforceParentYoungsterOrderingWindow(actor, serviceDate);
    await this.schools.validateOrderDayRules(serviceDate, session);
    await this.schools.assertSessionActiveForOrdering(session);

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    }
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      await this.helpers.ensureParentOwnsChild(parentId, childId);
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
      return this.helpers.parseJsonLine<CartRow>(existingOut);
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
    return this.helpers.parseJsonLine<CartRow>(createdOut);
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
      params.push(this.helpers.validateServiceDate(query.serviceDate));
      conditions.push(`oc.service_date = $${params.length}::date`);
    }
    if (query.session) {
      params.push(this.helpers.normalizeSession(query.session));
      conditions.push(`oc.session = $${params.length}::session_type`);
    }

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId) return [];
      params.push(childId);
      conditions.push(`oc.child_id = $${params.length}`);
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) return [];
      const familyId = await this.helpers.getParentFamilyId(parentId);
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
    return this.helpers.parseJsonLines(out);
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
      return this.helpers.parseJsonLine<CartRow>(out);
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
      items: this.helpers.parseJsonLines(itemsOut),
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
    const items = this.helpers.parseJsonLines<{ menu_item_id: string; quantity: number; name: string; price: string }>(itemsOut);
    if (items.length === 0) throw new BadRequestException('Cart is empty');
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    await this.schools.validateOrderDayRules(cart.service_date, cart.session);
    await this.helpers.enforceParentYoungsterOrderingWindow(actor, cart.service_date);
    await this.schools.assertSessionActiveForOrdering(cart.session);

    const dietarySnapshot = await this.getOrderDietarySnapshot(cart.child_id);
    const totalPrice = this.helpers.calculateTotalPrice(items);

    let billingParentId: string | null = null;
    if (actor.role === 'PARENT') {
      billingParentId = await this.helpers.getParentIdByUserId(actor.uid);
    } else {
      billingParentId = await this.helpers.getParentIdByChildId(cart.child_id);
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
    const order = this.helpers.parseJsonLine<{
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
    const order = this.helpers.parseJsonLine<{
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
    await this.helpers.lockOrdersForServiceDateIfCutoffPassed(order.service_date);

    if (actor.role === 'YOUNGSTER') {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId || childId !== order.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, order.child_id);
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
    const items = this.helpers.parseJsonLines(itemsOut);

    return {
      ...order,
      total_price: Number(order.total_price),
      can_edit: order.status === 'PLACED' && !(await this.helpers.isAfterOrAtMakassarCutoff(order.service_date)),
      items,
    };
  }

  async getParentConsolidatedOrders(actor: AccessUser) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.helpers.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.helpers.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    await this.helpers.lockOrdersForServiceDateIfCutoffPassed(this.helpers.makassarTodayIsoDate());

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

    const orders = this.helpers.parseJsonLines<{
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
      const allItems = this.helpers.parseJsonLines<{
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
      can_edit: order.status === 'PLACED' && !(await this.helpers.isAfterOrAtMakassarCutoff(order.service_date)),
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
    const childId = await this.helpers.getChildIdByUserId(actor.uid);
    if (!childId) throw new BadRequestException('Youngster profile not found');
    await this.helpers.lockOrdersForServiceDateIfCutoffPassed(this.helpers.makassarTodayIsoDate());

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

    const orders = this.helpers.parseJsonLines<{
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
      const allItems = this.helpers.parseJsonLines<{
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
      params.push(this.helpers.normalizeSession(query.session));
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
    return this.helpers.parseJsonLines(out);
  }

  async createFavourite(actor: AccessUser, input: {
    childId?: string;
    label?: string;
    session?: string;
    items?: CartItemInput[];
  }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const label = (input.label || '').trim();
    const session = this.helpers.normalizeSession(input.session);
    const childId = (input.childId || '').trim() || null;
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length > 5) throw new BadRequestException('ORDER_ITEM_LIMIT_EXCEEDED');

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!ownChildId || (childId && childId !== ownChildId)) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else if (actor.role === 'PARENT' && childId) {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, childId);
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
    const fav = this.helpers.parseJsonLine<{ id: string; label: string }>(favOut);
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
    const fav = this.helpers.parseJsonLine<{ id: string; created_by_user_id: string; is_active: boolean; deleted_at?: string | null }>(out);
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
    const serviceDate = this.helpers.validateServiceDate(input.serviceDate);

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
    const source = this.helpers.parseJsonLine<{ id: string; child_id: string; session: SessionType; status: string }>(srcOut);
    if (!['PLACED', 'LOCKED'].includes(source.status)) {
      throw new BadRequestException('Only PLACED/LOCKED source orders can be reordered');
    }

    if (actor.role === 'YOUNGSTER') {
      const ownChildId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== source.child_id) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, source.child_id);
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
    const srcItems = this.helpers.parseJsonLines<{ menu_item_id: string; quantity: number }>(srcItemsOut);
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
      for (const row of this.helpers.parseJsonLines<{ id: string }>(validOut)) validIds.add(row.id);
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
      const ownChildId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!ownChildId || ownChildId !== childId) throw new ForbiddenException('ORDER_OWNERSHIP_FORBIDDEN');
    } else {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, childId);
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
    const source = this.helpers.parseJsonLine<{ id: string; child_id: string; session: SessionType }>(sourceOut);
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
    const srcItems = this.helpers.parseJsonLines<{ menu_item_id: string; quantity: number }>(srcItemsOut);
    const itemsPayload = srcItems.map((x) => ({ menuItemId: x.menu_item_id, quantity: Number(x.quantity) }));

    const success: Array<{ date: string; orderId: string; cartId: string }> = [];
    const failures: Array<{ date: string; reason: string }> = [];
    for (const d of rawDates) {
      let date = '';
      try {
        date = this.helpers.validateServiceDate(d);
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
    const serviceDate = this.helpers.validateServiceDate(input.serviceDate);

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
    const fav = this.helpers.parseJsonLine<{ id: string; child_id: string | null; session: SessionType }>(favOut);
    const childId = fav.child_id || (await this.helpers.getChildIdByUserId(actor.uid));
    if (!childId) throw new BadRequestException('Favourite is not linked to a child');
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, childId);
    } else {
      const ownChildId = await this.helpers.getChildIdByUserId(actor.uid);
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
    const favItems = this.helpers.parseJsonLines<{ menu_item_id: string; quantity: number }>(favItemsOut);
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
      for (const row of this.helpers.parseJsonLines<{ id: string }>(validOut)) validIds.add(row.id);
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
    const order = this.helpers.parseJsonLine<{
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
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, order.child_id);
      if (await this.helpers.isAfterOrAtMakassarCutoff(order.service_date)) {
        throw new BadRequestException('ORDER_CUTOFF_EXCEEDED');
      }
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    if (order.status !== 'PLACED') {
      throw new BadRequestException('Only PLACED orders can be updated');
    }

    const targetServiceDate = input.serviceDate ? this.helpers.validateServiceDate(input.serviceDate) : order.service_date;
    const targetSession = input.session ? this.helpers.normalizeSession(input.session) : order.session;
    if (actor.role === 'PARENT' && await this.helpers.isAfterOrAtMakassarCutoff(targetServiceDate)) {
      throw new BadRequestException('ORDER_CUTOFF_EXCEEDED');
    }
    await this.helpers.enforceParentYoungsterOrderingWindow(actor, targetServiceDate);
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

    await this.schools.validateOrderDayRules(targetServiceDate, targetSession);
    await this.schools.assertSessionActiveForOrdering(targetSession);

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
    const validRows = this.helpers.parseJsonLines<{ id: string; name: string; price: string | number }>(validOut);
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
    const order = this.helpers.parseJsonLine<{ id: string; child_id: string; service_date: string; status: string }>(out);

    if (actor.role === 'YOUNGSTER') {
      throw new ForbiddenException('ORDER_CHILD_UPDATE_FORBIDDEN');
    }

    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new ForbiddenException('Parent profile missing');
      await this.helpers.ensureParentOwnsChild(parentId, order.child_id);
      if (await this.helpers.isAfterOrAtMakassarCutoff(order.service_date)) {
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

}
