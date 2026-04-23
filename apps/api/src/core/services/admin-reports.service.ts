import { Injectable } from '@nestjs/common';

/**
 * AdminReportsService
 * ===================
 *
 * Scope:
 *   - Read-only cross-domain aggregations for the admin surface. No
 *     writes — every method here composes data from OrderService,
 *     BillingService, MultiOrderService, DeliveryService, MenuService,
 *     and UsersService into a single response shape.
 *   - Admin home dashboard: today counts, weekly stats, quick links.
 *   - Revenue dashboard: per-day / month / year totals with optional
 *     filters by school, delivery user, parent, or session; used for
 *     financial reporting.
 *   - Print report: printable daily summary sent to kitchen/delivery
 *     staff; consolidates orders + dietary alerts + dish totals.
 *   - Parent and youngster spending dashboards (monthly totals, trend).
 *   - Youngster insights: personal stats, streak, top dishes, badges.
 *
 * Methods that will move here from CoreService:
 *   - getAdminDashboard
 *   - getAdminRevenueDashboard
 *   - getAdminPrintReport
 *   - getParentSpendingDashboard
 *   - getYoungsterSpendingDashboard
 *   - getYoungsterInsights
 *
 * Dependencies:
 *   - runSql (db.util) — mostly for aggregate queries
 *   - HelpersService (date math, ISO week, month stats, badge level)
 *   - Read-only references to:
 *       OrderService, BillingService, MultiOrderService,
 *       DeliveryService, UsersService, MenuService
 *
 * Consumers:
 *   - CoreService facade:
 *       /admin/dashboard, /admin/revenue, /admin/print-report,
 *       /parent/spending, /youngster/spending, /youngster/insights
 */
@Injectable()
export class AdminReportsService {}
