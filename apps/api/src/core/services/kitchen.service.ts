import { Injectable } from '@nestjs/common';

/**
 * KitchenService
 * ==============
 *
 * Scope:
 *   - Kitchen daily summary view: aggregated orders/dishes/alerts for
 *     a given service date, filtered and grouped by session. Powers
 *     the /kitchen dashboard UI used by kitchen staff to prep meals.
 *   - Mark-order-complete action: toggles an order's delivery_status
 *     between PREPARED and the earlier state, with idempotent writes
 *     and a follow-up delivery auto-assignment hook.
 *
 * Methods that will move here from CoreService:
 *   - getKitchenDailySummary
 *   - markKitchenOrderComplete
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - HelpersService (makassarTodayIsoDate)
 *   - DeliveryService (auto-assignment trigger after mark-complete)
 *   - AuditService (recordAdminAudit on mark-complete)
 *
 * Consumers:
 *   - CoreService facade → /kitchen/daily-summary, /kitchen/orders/:id/complete
 *   - Web: apps/web/app/kitchen/* dashboards
 */
@Injectable()
export class KitchenService {}
