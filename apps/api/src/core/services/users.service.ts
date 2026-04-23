import { Injectable } from '@nestjs/common';

/**
 * UsersService
 * ============
 *
 * Scope:
 *   - Parents and youngsters read/write/delete lifecycle, including
 *     soft-delete rules, delete-blocker detection (active orders,
 *     pending billings), and hard-delete safety path.
 *   - Youngster registration flow invoked by parent-led signup and
 *     admin-led creation (used by WhatsApp onboarding).
 *   - Family model: family_id assignment, backfill, merge of two
 *     families, alignment on parent↔child link, and last-name-based
 *     parent-child sync.
 *   - Admin-visible passwords: generate/reset endpoints that also
 *     record the password for admin view (admin_visible_passwords
 *     table). Applies to both parent users and youngster users.
 *   - Record pages: the /record read endpoint used by parent and
 *     youngster record view.
 *
 * Methods that will move here from CoreService:
 *   Registration:
 *     - registerYoungster
 *   Admin CRUD:
 *     - getAdminParents
 *     - getAdminChildren
 *     - updateParentProfile
 *     - deleteParent
 *     - updateYoungsterProfile
 *     - deleteYoungster
 *     - getYoungsterMe
 *   Passwords (admin):
 *     - adminResetUserPassword
 *     - adminGetUserPassword
 *     - adminResetYoungsterPassword
 *     - adminGetYoungsterPassword
 *     - setAdminVisiblePassword (private)
 *     - getAdminVisiblePasswordRow (private)
 *   Delete safety:
 *     - getParentDeleteBlockers (private)
 *     - softDeleteParent (private)
 *     - getYoungsterDeleteBlockers (private)
 *     - softDeleteYoungster (private)
 *     - hardDeleteYoungsterIfSafe (private)
 *   Family model:
 *     - linkParentChild
 *     - mergeFamily
 *     - mergeFamilyIds (private)
 *     - alignFamilyIdsForLink (private)
 *     - backfillFamilyIds (private)
 *     - assignFamilyIdToParents (private)
 *     - assignFamilyIdToChildren (private)
 *   Record pages:
 *     - getParentChildrenPages
 *     - getYoungsterChildrenPages
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService (ensureChildRegistrationSourceColumns,
 *                    ensureFamilyIdColumns, ensureAdminVisiblePasswordsTable,
 *                    ensureChildCurrentGradeColumn, parent2 columns)
 *   - HelpersService (phone, hashPassword, username sanitize,
 *                     syncFamilyParentChildren, family lookups)
 *   - AuthService (via AuthModule) for password policy validation
 *   - AuditService (recordAdminAudit on writes)
 *
 * Consumers:
 *   - CoreService facade (~18 endpoints)
 *   - GaiaService (user context in prompts)
 *   - OrderService, MultiOrderService (ownership checks)
 */
@Injectable()
export class UsersService {}
