import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser } from '../core.types';
import { HelpersService } from './helpers.service';
import { UsersService } from './users.service';

type BlackoutType = 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';

/**
 * AdminReportsService
 * ===================
 *
 * Read-only cross-domain aggregations for the admin surface:
 *   - getAdminDashboard (/admin/dashboard)
 *   - getAdminRevenueDashboard (/admin/revenue)
 *   - getAdminPrintReport (/admin/print-report)
 *   - getParentSpendingDashboard (/parent/spending)
 *   - getYoungsterSpendingDashboard (/youngster/spending)
 *   - getYoungsterInsights (/youngster/insights)
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - HelpersService (date/family/month/badge math, parse helpers, withEffectiveGrade)
 *   - UsersService (getYoungsterMe — used by getYoungsterInsights)
 */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly helpers: HelpersService,
    private readonly users: UsersService,
  ) {}

  async getAdminDashboard(dateRaw?: string) {
    const date = dateRaw ? this.helpers.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const yesterday = await runSql(`SELECT ($1::date - INTERVAL '1 day')::date::text;`, [date]);
    const tomorrow = await runSql(`SELECT ($1::date + INTERVAL '1 day')::date::text;`, [date]);
    const pastWeekStart = await runSql(`SELECT ($1::date - INTERVAL '6 day')::date::text;`, [date]);
    const pastMonthStart = await runSql(`SELECT ($1::date - INTERVAL '29 day')::date::text;`, [date]);

    const getOrdersAndDishes = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS total_orders,
                 COALESCE(SUM(oi.quantity), 0)::int AS total_dishes
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
        ) t;
      `,
        [from, to],
      );
      const row = this.helpers.parseJsonLine<{ total_orders: number; total_dishes: number }>(out || '{"total_orders":0,"total_dishes":0}');
      return { totalOrders: Number(row.total_orders || 0), totalDishes: Number(row.total_dishes || 0) };
    };

    const getKitchenUnfulfilled = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS orders_not_fulfilled,
                 COALESCE(SUM(oi.quantity), 0)::int AS dishes_not_fulfilled
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status = 'PLACED'
        ) t;
      `,
        [from, to],
      );
      const row = this.helpers.parseJsonLine<{ orders_not_fulfilled: number; dishes_not_fulfilled: number }>(
        out || '{"orders_not_fulfilled":0,"dishes_not_fulfilled":0}',
      );
      return {
        ordersNotFulfilled: Number(row.orders_not_fulfilled || 0),
        dishesNotFulfilled: Number(row.dishes_not_fulfilled || 0),
      };
    };

    const getBillingPeriodMetrics = async (from: string, to: string) => {
      const out = await runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(br.id)::int AS total_number_billing,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_value_billing,
                 COUNT(br.id) FILTER (
                   WHERE br.status = 'UNPAID'
                     AND COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') = ''
                 )::int AS total_number_unpaid_no_proof,
                 COALESCE(SUM(o.total_price) FILTER (
                   WHERE br.status = 'UNPAID'
                     AND COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') = ''
                 ), 0)::numeric AS total_value_unpaid_no_proof
          FROM billing_records br
          JOIN orders o ON o.id = br.order_id
          WHERE o.service_date BETWEEN $1::date AND $2::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
        ) t;
      `,
        [from, to],
      );
      const row = this.helpers.parseJsonLine<{
        total_number_billing: number;
        total_value_billing: string | number;
        total_number_unpaid_no_proof: number;
        total_value_unpaid_no_proof: string | number;
      }>(
        out ||
          '{"total_number_billing":0,"total_value_billing":0,"total_number_unpaid_no_proof":0,"total_value_unpaid_no_proof":0}',
      );
      return {
        totalNumberBilling: Number(row.total_number_billing || 0),
        totalValueBilling: Number(row.total_value_billing || 0),
        totalNumberUnpaidNoProof: Number(row.total_number_unpaid_no_proof || 0),
        totalValueUnpaidNoProof: Number(row.total_value_unpaid_no_proof || 0),
      };
    };

    const [
      parentsCountRaw,
      youngstersCountRaw,
      schoolsCountRaw,
      deliveryPersonnelCountRaw,
      todayDelivery,
      yesterdayDelivery,
      tomorrowDelivery,
      pastWeekDelivery,
      pastMonthDelivery,
      totalSalesRaw,
      yesterdayFailedOrUncheckedDeliveryRaw,
      failedDeliveryByPersonOut,
      menuTotalsOut,
      upcomingBlackoutsOut,
      kitchenYesterday,
      kitchenPastWeek,
      billingYesterday,
      billingPastWeek,
      billingPastMonth,
      pendingBillingCountRaw,
      birthdaysOut,
    ] = await Promise.all([
      runSql(`
        SELECT count(*)::int
        FROM parents p
        JOIN users u ON u.id = p.user_id
        WHERE p.deleted_at IS NULL
          AND u.is_active = true;
      `),
      runSql(`
        SELECT count(*)::int
        FROM children c
        JOIN users u ON u.id = c.user_id
        WHERE c.is_active = true
          AND c.deleted_at IS NULL
          AND u.is_active = true;
      `),
      runSql(`
        SELECT count(*)::int
        FROM schools
        WHERE is_active = true
          AND deleted_at IS NULL;
      `),
      runSql(`
        SELECT count(*)::int
        FROM users
        WHERE role = 'DELIVERY'
          AND is_active = true
          AND deleted_at IS NULL;
      `),
      getOrdersAndDishes(date, date),
      getOrdersAndDishes(yesterday, yesterday),
      getOrdersAndDishes(tomorrow, tomorrow),
      getOrdersAndDishes(pastWeekStart, date),
      getOrdersAndDishes(pastMonthStart, date),
      runSql(`
        SELECT coalesce(sum(total_price), 0)::numeric
        FROM orders
        WHERE deleted_at IS NULL
          AND status <> 'CANCELLED';
      `),
      runSql(
        `SELECT count(*)::int
         FROM orders
         WHERE service_date = $1::date
           AND deleted_at IS NULL
           AND status <> 'CANCELLED'
           AND delivery_status <> 'DELIVERED';`,
        [yesterday],
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COALESCE(da.delivery_user_id::text, 'UNASSIGNED') AS delivery_user_id,
                 COALESCE((u.first_name || ' ' || u.last_name), 'Unassigned') AS delivery_person_name,
                 COUNT(DISTINCT o.id)::int AS orders_count
          FROM orders o
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN users u ON u.id = da.delivery_user_id
          WHERE o.service_date = $1::date
            AND o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
            AND (
              o.delivery_status <> 'DELIVERED'
              OR da.confirmed_at IS NULL
            )
          GROUP BY da.delivery_user_id, u.first_name, u.last_name
          ORDER BY orders_count DESC, delivery_person_name ASC
        ) t;
      `,
        [yesterday],
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(*)::int AS dishes_total_created,
                 COUNT(*) FILTER (WHERE is_available = true)::int AS dishes_total_active
          FROM menu_items
          WHERE deleted_at IS NULL
        ) t;
      `,
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT b.blackout_date::text AS blackout_date,
                 b.type::text AS type,
                 b.reason,
                 (
                   SELECT COUNT(*)::int
                   FROM orders o
                   WHERE o.service_date = b.blackout_date
                     AND o.deleted_at IS NULL
                     AND o.status <> 'CANCELLED'
                 )::int AS affected_orders
          FROM blackout_days b
          WHERE b.blackout_date >= $1::date
          ORDER BY b.blackout_date ASC
          LIMIT 10
        ) t;
      `,
        [date],
      ),
      getKitchenUnfulfilled(yesterday, yesterday),
      getKitchenUnfulfilled(pastWeekStart, date),
      getBillingPeriodMetrics(yesterday, yesterday),
      getBillingPeriodMetrics(pastWeekStart, date),
      getBillingPeriodMetrics(pastMonthStart, date),
      runSql(`
        SELECT count(*)::int
        FROM billing_records
        WHERE status IN ('UNPAID', 'PENDING_VERIFICATION');
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT c.id AS child_id,
                 (u.first_name || ' ' || u.last_name) AS child_name,
                 c.date_of_birth::text AS date_of_birth
          FROM children c
          JOIN users u ON u.id = c.user_id
          WHERE c.is_active = true
            AND c.deleted_at IS NULL
        ) t;
      `),
    ]);

    const parentsCount = Number(parentsCountRaw || 0);
    const youngstersCount = Number(youngstersCountRaw || 0);
    const schoolsCount = Number(schoolsCountRaw || 0);
    const deliveryPersonnelCount = Number(deliveryPersonnelCountRaw || 0);
    const totalSales = Number(totalSalesRaw || 0);
    const yesterdayFailedOrUncheckedDelivery = Number(yesterdayFailedOrUncheckedDeliveryRaw || 0);
    const pendingBillingCount = Number(pendingBillingCountRaw || 0);
    const todayOrdersCount = todayDelivery.totalOrders;
    const todayTotalDishes = todayDelivery.totalDishes;

    const failedDeliveryByPerson = this.helpers.parseJsonLines<{
      delivery_user_id: string;
      delivery_person_name: string;
      orders_count: number;
    }>(failedDeliveryByPersonOut);
    const menuTotals = this.helpers.parseJsonLine<{ dishes_total_created: number; dishes_total_active: number }>(
      menuTotalsOut || '{"dishes_total_created":0,"dishes_total_active":0}',
    );
    const upcomingBlackouts = this.helpers.parseJsonLines<{
      blackout_date: string;
      type: BlackoutType;
      reason: string | null;
      affected_orders: number;
    }>(upcomingBlackoutsOut);
    const nextBlackout = upcomingBlackouts[0] || null;
    const serviceBlockedDatesWithOrders = upcomingBlackouts
      .filter((row) => ['SERVICE_BLOCK', 'BOTH'].includes(row.type))
      .filter((row) => Number(row.affected_orders || 0) > 0);

    const today = new Date(date);
    const birthdayToday = this.helpers.parseJsonLines<{ child_id: string; child_name: string; date_of_birth: string }>(birthdaysOut)
      .map((row) => {
        const dob = new Date(row.date_of_birth);
        const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        return { ...row, days_until: daysUntil };
      })
      .filter((row) => row.days_until === 0)
      .sort((a, b) => a.days_until - b.days_until)
      .slice(0, 30);

    return {
      date,
      parentsCount,
      youngstersCount,
      schoolsCount,
      deliveryPersonnelCount,
      todayOrdersCount,
      todayTotalDishes,
      totalSales,
      yesterdayFailedOrUncheckedDelivery,
      failedDeliveryByPerson,
      menu: {
        dishesTotalCreated: Number(menuTotals.dishes_total_created || 0),
        dishesTotalActive: Number(menuTotals.dishes_total_active || 0),
      },
      delivery: {
        today: todayDelivery,
        yesterday: yesterdayDelivery,
        tomorrow: tomorrowDelivery,
        pastWeek: pastWeekDelivery,
        pastMonth: pastMonthDelivery,
      },
      kitchen: {
        nextBlackoutDay: nextBlackout?.blackout_date || null,
        nextBlackoutType: nextBlackout?.type || null,
        nextBlackoutReason: nextBlackout?.reason || null,
        upcomingBlackouts: upcomingBlackouts.map((row) => ({
          blackoutDate: row.blackout_date,
          type: row.type,
          reason: row.reason,
          affectedOrders: Number(row.affected_orders || 0),
        })),
        serviceBlockedDatesWithOrders: serviceBlockedDatesWithOrders.map((row) => ({
          blackoutDate: row.blackout_date,
          type: row.type,
          reason: row.reason,
          affectedOrders: Number(row.affected_orders || 0),
        })),
        yesterday: kitchenYesterday,
        pastWeek: kitchenPastWeek,
      },
      billing: {
        yesterday: billingYesterday,
        pastWeek: billingPastWeek,
        pastMonth: billingPastMonth,
      },
      pendingBillingCount,
      birthdayHighlights: birthdayToday,
    };
  }

  async getAdminRevenueDashboard(input: {
    fromDateRaw?: string;
    toDateRaw?: string;
    day?: string;
    month?: string;
    year?: string;
    schoolId?: string;
    deliveryUserId?: string;
    parentId?: string;
    session?: string;
    dish?: string;
    orderStatus?: string;
    billingStatus?: string;
  }) {
    const toDate = input.toDateRaw ? this.helpers.validateServiceDate(input.toDateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const fromDate = input.fromDateRaw ? this.helpers.validateServiceDate(input.fromDateRaw) : await runSql(`SELECT ($1::date - INTERVAL '30 day')::date::text;`, [toDate]);

    const day = (input.day || 'ALL').toUpperCase() === 'ALL' ? '' : (input.day || '').trim();
    const month = (input.month || 'ALL').toUpperCase() === 'ALL' ? '' : (input.month || '').trim();
    const year = (input.year || 'ALL').toUpperCase() === 'ALL' ? '' : (input.year || '').trim();
    const schoolId = (input.schoolId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.schoolId || '').trim();
    const deliveryUserId = (input.deliveryUserId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.deliveryUserId || '').trim();
    const parentId = (input.parentId || 'ALL').toUpperCase() === 'ALL' ? '' : (input.parentId || '').trim();
    const session = (input.session || 'ALL').toUpperCase() === 'ALL' ? '' : this.helpers.normalizeSession(input.session);
    const dish = (input.dish || 'ALL').toUpperCase() === 'ALL' ? '' : (input.dish || '').trim();
    const orderStatus = (input.orderStatus || 'ALL').toUpperCase() === 'ALL' ? '' : (input.orderStatus || '').trim().toUpperCase();
    const billingStatus = (input.billingStatus || 'ALL').toUpperCase() === 'ALL' ? '' : (input.billingStatus || '').trim().toUpperCase();

    const params: unknown[] = [fromDate, toDate];
    const where: string[] = [
      `o.service_date BETWEEN $1::date AND $2::date`,
      `o.deleted_at IS NULL`,
      `o.status <> 'CANCELLED'`,
    ];
    if (day) {
      params.push(Number(day));
      where.push(`EXTRACT(DAY FROM o.service_date)::int = $${params.length}`);
    }
    if (month) {
      params.push(Number(month));
      where.push(`EXTRACT(MONTH FROM o.service_date)::int = $${params.length}`);
    }
    if (year) {
      params.push(Number(year));
      where.push(`EXTRACT(YEAR FROM o.service_date)::int = $${params.length}`);
    }
    if (schoolId) {
      this.helpers.assertValidUuid(schoolId, 'schoolId');
      params.push(schoolId);
      where.push(`s.id = $${params.length}`);
    }
    if (deliveryUserId) {
      this.helpers.assertValidUuid(deliveryUserId, 'deliveryUserId');
      params.push(deliveryUserId);
      where.push(`da.delivery_user_id = $${params.length}`);
    }
    if (parentId) {
      this.helpers.assertValidUuid(parentId, 'parentId');
      params.push(parentId);
      where.push(`p.id = $${params.length}`);
    }
    if (session) {
      params.push(session);
      where.push(`o.session = $${params.length}::session_type`);
    }
    if (dish) {
      params.push(`%${dish}%`);
      where.push(`EXISTS (
        SELECT 1
        FROM order_items oi2
        WHERE oi2.order_id = o.id
          AND oi2.item_name_snapshot ILIKE $${params.length}
      )`);
    }
    if (orderStatus) {
      params.push(orderStatus);
      where.push(`o.status::text = $${params.length}`);
    }
    if (billingStatus) {
      params.push(billingStatus);
      where.push(`COALESCE(br.status::text, 'UNPAID') = $${params.length}`);
    }
    const whereSql = where.join(' AND ');

    const [
      totalsOut,
      bySchoolOut,
      bySessionOut,
      filterSchoolsOut,
      filterDeliveryOut,
      filterParentsOut,
      filterDishesOut,
    ] = await Promise.all([
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT COUNT(DISTINCT o.id)::int AS total_orders,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
          FROM orders o
          JOIN children c ON c.id = o.child_id
          JOIN schools s ON s.id = c.school_id
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN parent_children pc ON pc.child_id = c.id
          LEFT JOIN parents p ON p.id = pc.parent_id
          LEFT JOIN billing_records br ON br.order_id = o.id
          WHERE ${whereSql}
        ) t;
      `,
        params,
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT s.id AS school_id,
                 s.name AS school_name,
                 COUNT(DISTINCT o.id)::int AS orders_count,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
          FROM orders o
          JOIN children c ON c.id = o.child_id
          JOIN schools s ON s.id = c.school_id
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN parent_children pc ON pc.child_id = c.id
          LEFT JOIN parents p ON p.id = pc.parent_id
          LEFT JOIN billing_records br ON br.order_id = o.id
          WHERE ${whereSql}
          GROUP BY s.id, s.name
          ORDER BY total_revenue DESC, school_name ASC
        ) t;
      `,
        params,
      ),
      runSql(
        `
        SELECT row_to_json(t)::text
        FROM (
          SELECT o.session::text AS session,
                 COUNT(DISTINCT o.id)::int AS orders_count,
                 COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue
          FROM orders o
          JOIN children c ON c.id = o.child_id
          JOIN schools s ON s.id = c.school_id
          LEFT JOIN delivery_assignments da ON da.order_id = o.id
          LEFT JOIN parent_children pc ON pc.child_id = c.id
          LEFT JOIN parents p ON p.id = pc.parent_id
          LEFT JOIN billing_records br ON br.order_id = o.id
          WHERE ${whereSql}
          GROUP BY o.session
          ORDER BY o.session ASC
        ) t;
      `,
        params,
      ),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT id, name
          FROM schools
          WHERE deleted_at IS NULL
          ORDER BY name ASC
        ) t;
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT id AS user_id, (first_name || ' ' || last_name) AS name
          FROM users
          WHERE role = 'DELIVERY'
            AND deleted_at IS NULL
          ORDER BY first_name ASC, last_name ASC
        ) t;
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT p.id AS parent_id, (u.first_name || ' ' || u.last_name) AS name
          FROM parents p
          JOIN users u ON u.id = p.user_id
          WHERE p.deleted_at IS NULL
            AND u.deleted_at IS NULL
          ORDER BY u.first_name ASC, u.last_name ASC
        ) t;
      `),
      runSql(`
        SELECT row_to_json(t)::text
        FROM (
          SELECT DISTINCT oi.item_name_snapshot AS dish_name
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.deleted_at IS NULL
            AND o.status <> 'CANCELLED'
          ORDER BY oi.item_name_snapshot ASC
        ) t;
      `),
    ]);
    const totals = this.helpers.parseJsonLine<{ total_orders: number; total_revenue: string | number }>(
      totalsOut || '{"total_orders":0,"total_revenue":0}',
    );

    return {
      fromDate,
      toDate,
      totalOrders: Number(totals.total_orders || 0),
      totalRevenue: Number(totals.total_revenue || 0),
      bySchool: this.helpers.parseJsonLines<Record<string, unknown> & { total_revenue?: number | string }>(bySchoolOut).map((r) => ({
        ...r,
        total_revenue: Number(r.total_revenue || 0),
      })),
      bySession: this.helpers.parseJsonLines<Record<string, unknown> & { total_revenue?: number | string }>(bySessionOut).map((r) => ({
        ...r,
        total_revenue: Number(r.total_revenue || 0),
      })),
      filters: {
        schools: this.helpers.parseJsonLines(filterSchoolsOut),
        deliveryUsers: this.helpers.parseJsonLines(filterDeliveryOut),
        parents: this.helpers.parseJsonLines(filterParentsOut),
        sessions: ['ALL', 'BREAKFAST', 'SNACK', 'LUNCH'],
        orderStatuses: ['ALL', 'PLACED', 'LOCKED', 'CANCELLED'],
        billingStatuses: ['ALL', 'UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'],
        dishes: this.helpers.parseJsonLines(filterDishesOut),
      },
    };
  }

  async getAdminPrintReport(dateRaw?: string) {
    const date = dateRaw ? this.helpers.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.id AS order_id,
               o.session::text AS session,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               COALESCE((up.first_name || ' ' || up.last_name), '-') AS parent_name,
               s.name AS school_name,
               o.total_price,
               o.status::text AS order_status,
               o.delivery_status::text AS delivery_status,
               br.status::text AS billing_status
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN parent_children pc ON pc.child_id = c.id
        LEFT JOIN parents p ON p.id = pc.parent_id
        LEFT JOIN users up ON up.id = p.user_id
        LEFT JOIN billing_records br ON br.order_id = o.id
        WHERE o.service_date = $1::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        ORDER BY o.session ASC, school_name ASC, child_name ASC
      ) t;
    `,
      [date],
    );
    const rows = this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((r) => ({
      ...r,
      total_price: Number(r.total_price || 0),
    }));
    const totals = {
      date,
      orders: rows.length,
      revenue: rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    };
    return { totals, rows };
  }

  async getParentSpendingDashboard(actor: AccessUser, monthRaw?: string) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    const parentId = await this.helpers.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.helpers.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : await runSql(`SELECT to_char((now() AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM');`);
    const monthStart = `${month}-01`;
    const monthEnd = await runSql(`SELECT ($1::date + INTERVAL '1 month - 1 day')::date::text;`, [monthStart]);

    const byChildOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               o.session::text AS session,
               COUNT(DISTINCT o.id)::int AS orders_count,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_spend
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        WHERE c.family_id = $1::uuid
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY c.id, u.first_name, u.last_name, o.session
        ORDER BY child_name ASC,
                 CASE o.session
                   WHEN 'BREAKFAST' THEN 1
                   WHEN 'SNACK' THEN 2
                   ELSE 3
                 END ASC
      ) t;
    `,
      [familyId, monthStart, monthEnd],
    );
    const totalMonthSpend = Number(await runSql(
      `
      SELECT COALESCE(SUM(o.total_price), 0)::numeric
      FROM orders o
      JOIN children c ON c.id = o.child_id
      WHERE c.family_id = $1::uuid
        AND o.service_date BETWEEN $2::date AND $3::date
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL;
    `,
      [familyId, monthStart, monthEnd],
    ) || 0);

    const birthdayOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               c.date_of_birth::text AS date_of_birth
        FROM children c
        JOIN users u ON u.id = c.user_id
        WHERE c.family_id = $1::uuid
          AND c.is_active = true
          AND c.deleted_at IS NULL
        ORDER BY u.first_name, u.last_name
      ) t;
    `,
      [familyId],
    );
    const today = new Date();
    const birthdayHighlights = this.helpers.parseJsonLines<{ child_id: string; child_name: string; date_of_birth: string }>(birthdayOut).map((row) => {
      const dob = new Date(row.date_of_birth);
      const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      return { ...row, days_until: daysUntil };
    }).filter((x) => x.days_until <= 30).sort((a, b) => a.days_until - b.days_until);

    return {
      month,
      totalMonthSpend,
      byChild: this.helpers.parseJsonLines<Record<string, unknown> & { total_spend?: string | number }>(byChildOut).map((r) => ({
        ...r,
        total_spend: Number(r.total_spend || 0),
      })),
      birthdayHighlights,
    };
  }

  async getYoungsterSpendingDashboard(actor: AccessUser, monthRaw?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const childId = await this.helpers.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : await runSql(`SELECT to_char((now() AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM');`);
    const monthStart = `${month}-01`;
    const monthEnd = await runSql(`SELECT ($1::date + INTERVAL '1 month - 1 day')::date::text;`, [monthStart]);

    const me = await this.users.getYoungsterMe(actor);
    const childName = `${me.first_name} ${me.last_name}`.trim();
    const byChildOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT c.id AS child_id,
               (u.first_name || ' ' || u.last_name) AS child_name,
               o.session::text AS session,
               COUNT(DISTINCT o.id)::int AS orders_count,
               COALESCE(SUM(o.total_price), 0)::numeric AS total_spend
        FROM orders o
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY c.id, u.first_name, u.last_name, o.session
        ORDER BY CASE o.session
                 WHEN 'BREAKFAST' THEN 1
                 WHEN 'SNACK' THEN 2
                 ELSE 3
               END ASC
      ) t;
    `,
      [childId, monthStart, monthEnd],
    );
    const totalMonthSpend = Number(await runSql(
      `
      SELECT COALESCE(SUM(o.total_price), 0)::numeric
      FROM orders o
      WHERE o.child_id = $1
        AND o.service_date BETWEEN $2::date AND $3::date
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL;
    `,
      [childId, monthStart, monthEnd],
    ) || 0);

    const today = new Date();
    const dob = new Date(String(me.date_of_birth));
    const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    return {
      month,
      totalMonthSpend,
      byChild: this.helpers.parseJsonLines<Record<string, unknown> & { total_spend?: string | number }>(byChildOut).map((r) => ({
        ...r,
        total_spend: Number(r.total_spend || 0),
      })),
      birthdayHighlights: daysUntil <= 30 ? [{ child_id: childId, child_name: childName, days_until: daysUntil }] : [],
    };
  }

  async getYoungsterInsights(actor: AccessUser, dateRaw?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    const childId = await this.helpers.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const refDate = dateRaw ? this.helpers.validateServiceDate(dateRaw) : await runSql(`SELECT (now() AT TIME ZONE 'Asia/Makassar')::date::text;`);
    const weekStart = await runSql(
      `SELECT ($1::date - ((extract(isodow FROM $1::date)::int - 1) * INTERVAL '1 day'))::date::text;`,
      [refDate],
    );
    const weekEnd = await runSql(`SELECT ($1::date + INTERVAL '6 day')::date::text;`, [weekStart]);

    const nutritionOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT o.service_date::text AS service_date,
               o.session::text AS session,
               COALESCE(SUM(oi.quantity * COALESCE(mi.calories_kcal, 0)), 0)::int AS calories_total,
               COUNT(*) FILTER (WHERE mi.calories_kcal IS NULL)::int AS tba_items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.child_id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
        GROUP BY o.service_date, o.session
        ORDER BY o.service_date ASC,
                 CASE o.session
                   WHEN 'BREAKFAST' THEN 1
                   WHEN 'SNACK' THEN 2
                   ELSE 3
                 END ASC
      ) t;
    `,
      [childId, weekStart, weekEnd],
    );
    const nutritionRows = this.helpers.parseJsonLines<{ service_date: string; session: string; calories_total: number; tba_items: number }>(nutritionOut);
    const days = nutritionRows.map((row) => ({
      service_date: row.service_date,
      session: row.session,
      calories_display: `${Number(row.calories_total || 0)} kcal`,
      tba_items: Number(row.tba_items || 0),
    }));
    const weekCalories = nutritionRows.reduce((sum, r) => sum + Number(r.calories_total || 0), 0);

    const orderDatesOut = await runSql(
      `
      SELECT (to_char(o.service_date, 'YYYY-MM-DD') || '|' || o.session::text)
      FROM orders o
      WHERE o.child_id = $1
        AND o.service_date >= ($2::date - INTERVAL '70 day')
        AND o.status <> 'CANCELLED'
        AND o.deleted_at IS NULL
      GROUP BY o.service_date, o.session
      ORDER BY o.service_date ASC,
               CASE o.session
                 WHEN 'BREAKFAST' THEN 1
                 WHEN 'SNACK' THEN 2
                 ELSE 3
               END ASC;
    `,
      [childId, refDate],
    );
    const orderDates = orderDatesOut ? orderDatesOut.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    const streakDates = [...new Set(orderDates.map((x) => x.slice(0, 10)))];
    const maxStreak = this.helpers.calculateMaxConsecutiveOrderDays(streakDates);
    const currentMonth = refDate.slice(0, 7);
    const refDateObj = new Date(`${refDate}T00:00:00.000Z`);
    const currentMonthStartDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth(), 1));
    const currentMonthEndDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth() + 1, 0));
    const previousMonthStartDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth() - 1, 1));
    const previousMonthEndDate = new Date(Date.UTC(refDateObj.getUTCFullYear(), refDateObj.getUTCMonth(), 0));
    const previousMonth = previousMonthStartDate.toISOString().slice(0, 7);
    const currentMonthStart = currentMonthStartDate.toISOString().slice(0, 10);
    const currentMonthEnd = currentMonthEndDate.toISOString().slice(0, 10);
    const previousMonthStart = previousMonthStartDate.toISOString().slice(0, 10);
    const previousMonthEnd = previousMonthEndDate.toISOString().slice(0, 10);
    const monthRowsOut = await runSql(
      `
      SELECT (to_char(service_date, 'YYYY-MM-DD') || '|' || session::text)
      FROM orders
      WHERE child_id = $1
        AND (
          service_date BETWEEN $2::date AND $3::date
          OR service_date BETWEEN $4::date AND $5::date
        )
        AND status <> 'CANCELLED'
        AND deleted_at IS NULL
      GROUP BY service_date, session
      ORDER BY service_date ASC,
               CASE session
                 WHEN 'BREAKFAST' THEN 1
                 WHEN 'SNACK' THEN 2
                 ELSE 3
               END ASC;
    `,
      [childId, currentMonthStart, currentMonthEnd, previousMonthStart, previousMonthEnd],
    );
    const monthDates = monthRowsOut ? monthRowsOut.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    const cm = this.helpers.calculateMonthOrderStats(monthDates, currentMonth);
    const pm = this.helpers.calculateMonthOrderStats(monthDates, previousMonth);
    const badgeCalc = this.helpers.resolveBadgeLevel({
      maxConsecutiveOrderDays: maxStreak,
      currentMonthOrders: cm.orders,
      currentMonthConsecutiveWeeks: cm.consecutiveWeeks,
      previousMonthOrders: pm.orders,
      previousMonthConsecutiveWeeks: pm.consecutiveWeeks,
    });

    const me = await this.users.getYoungsterMe(actor);
    const dob = new Date(me.date_of_birth);
    const today = new Date(refDate);
    const next = new Date(today.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate());
    if (next < today) next.setUTCFullYear(today.getUTCFullYear() + 1);
    const birthdayDaysUntil = Math.ceil((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    const weekOrderSummaryOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT COUNT(DISTINCT o.id)::int AS total_orders,
               COALESCE(SUM(oi.quantity), 0)::int AS total_dishes
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.child_id = $1
          AND o.service_date BETWEEN $2::date AND $3::date
          AND o.status <> 'CANCELLED'
          AND o.deleted_at IS NULL
      ) t;
    `,
      [childId, weekStart, weekEnd],
    );
    const weekOrderSummary = this.helpers.parseJsonLine<{ total_orders: number; total_dishes: number }>(
      weekOrderSummaryOut || '{"total_orders":0,"total_dishes":0}',
    );

    return {
      week: {
        start: weekStart,
        end: weekEnd,
        totalCalories: weekCalories,
        totalOrders: Number(weekOrderSummary.total_orders || 0),
        totalDishes: Number(weekOrderSummary.total_dishes || 0),
        days,
      },
      badge: {
        level: badgeCalc.level,
        maxConsecutiveOrderDays: maxStreak,
        maxConsecutiveOrderWeeks: Math.max(Number(cm.consecutiveWeeks || 0), Number(pm.consecutiveWeeks || 0)),
        currentMonthOrders: cm.orders,
      },
      birthdayHighlight: { date_of_birth: me.date_of_birth, days_until: birthdayDaysUntil },
    };
  }

}
