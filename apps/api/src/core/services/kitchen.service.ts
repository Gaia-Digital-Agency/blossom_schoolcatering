import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser } from '../core.types';
import { DeliveryService } from './delivery.service';
import { HelpersService } from './helpers.service';
import { SchoolsService } from './schools.service';

/**
 * KitchenService
 * ==============
 *
 * Scope:
 *   - /kitchen/daily-summary read: aggregated orders, dish totals,
 *     dietary alerts for a service date. Used by kitchen staff UI to
 *     prep meals. Calls HelpersService.lockOrdersForServiceDateIfCutoffPassed
 *     so the view is consistent with cutoff.
 *   - /kitchen/orders/:id/complete: toggles delivery_status between
 *     OUT_FOR_DELIVERY and PENDING with idempotent writes; after a
 *     completion, runs DeliveryService.autoAssignDeliveriesForDate so
 *     freshly-ready orders get a delivery user.
 *
 * Owned methods (moved from CoreService in this extraction):
 *   - getKitchenDailySummary
 *   - markKitchenOrderComplete
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - HelpersService (parseJsonLine, parseJsonLines, validateServiceDate,
 *                     makassarTodayIsoDate, lockOrdersForServiceDateIfCutoffPassed,
 *                     withEffectiveGrade)
 *   - SchoolsService (getBlackoutRuleForDate)
 *   - DeliveryService (autoAssignDeliveriesForDate)
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly helpers: HelpersService,
    private readonly schools: SchoolsService,
    private readonly delivery: DeliveryService,
  ) {}

  async getKitchenDailySummary(actor: AccessUser, dateRaw?: string) {
    if (!['KITCHEN', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const serviceDate = dateRaw ? this.helpers.validateServiceDate(dateRaw) : this.helpers.makassarTodayIsoDate();
    await this.helpers.lockOrdersForServiceDateIfCutoffPassed(serviceDate);
    const blackout = await this.schools.getBlackoutRuleForDate(serviceDate);
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
    const totals = this.helpers.parseJsonLine<{
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
    const orders = this.helpers.parseJsonLines<{
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
    }>(ordersOut).map((row) => this.helpers.withEffectiveGrade(row));

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
    const dishSummary = this.helpers.parseJsonLines<{ name: string; quantity: number }>(dishSummaryOut);

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
    const order = this.helpers.parseJsonLine<{ id: string; service_date: string; status: string; delivery_status: string }>(out);
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
      await this.delivery.autoAssignDeliveriesForDate(order.service_date);
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
}
