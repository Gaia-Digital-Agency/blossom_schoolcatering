import { Injectable } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { SessionType } from '../core.types';
import { HelpersService } from './helpers.service';
import { SchemaService } from './schema.service';

/**
 * DeliveryService (in progress — see Step 13 for full extraction)
 * ===============================================================
 *
 * Scope (eventual):
 *   - Delivery-user lifecycle, school-assignment matrix, per-order
 *     auto-assignment, operator UI feed, daily notes, WhatsApp
 *     notification logs, summary + email, confirm/toggle, seed flows.
 *
 * Currently owned (bootstrapped here so Step 9 (KitchenService) can
 * inject DeliveryService without a circular reference back into
 * CoreService):
 *   - autoAssignDeliveriesForDate (per-date re-assignment)
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService (ensureDeliverySchoolAssignmentsTable)
 *   - HelpersService (parseJsonLines)
 *
 * Consumers so far:
 *   - KitchenService.markKitchenOrderComplete
 *   - CoreService delegation stub (for call-sites in autoAssignDeliveries,
 *     assignDelivery, seed flows, etc. that are still on CoreService).
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
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
}
