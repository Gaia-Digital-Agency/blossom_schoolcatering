import { Injectable } from '@nestjs/common';

/**
 * SchoolsService
 * ==============
 *
 * Scope:
 *   - Schools CRUD (create/update/delete, active flag, name, short
 *     name, city, address, contact phone) and read list for admin and
 *     public surfaces.
 *   - Session-settings table: per-session (BREAKFAST / SNACK / LUNCH)
 *     is_active flag that gates ordering.
 *   - Blackout-days management: holidays, kitchen closures, single-
 *     session or all-session blocks; resolved by OrderService at
 *     ordering time via getBlackoutRuleForDate.
 *
 * Methods that will move here from CoreService:
 *   Schools:
 *     - getSchools
 *     - createSchool
 *     - updateSchool
 *     - deleteSchool
 *   Session settings:
 *     - getSessionSettings
 *     - updateSessionSetting
 *     - isSessionActive
 *     - assertSessionActiveForOrdering
 *   Blackout days:
 *     - getBlackoutDays
 *     - createBlackoutDay
 *     - deleteBlackoutDay
 *     - getBlackoutRuleForDate (private helper, called by OrderService)
 *     - validateOrderDayRules  (private helper, called by OrderService)
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService (ensureBlackoutDaysSessionColumn, ensureSchoolShortNameColumn,
 *                    ensureSessionSettingsTable)
 *   - AuditService (recordAdminAudit on mutations)
 *
 * Consumers:
 *   - OrderService, MultiOrderService (blackout + session checks)
 *   - CoreService facade (admin + public endpoints)
 */
@Injectable()
export class SchoolsService {}
