import { Injectable } from '@nestjs/common';

/**
 * HelpersService
 * ==============
 *
 * Scope:
 *   - Pure utility functions shared across every other sub-service:
 *       phone, date, hash, slug, uuid, text normalization, Makassar
 *       timezone math, ordering cutoff computation, family-id lookups.
 *   - Holds no business logic specific to any single domain; a change
 *     here must be proven safe for every caller.
 *   - Some methods in this group ARE async because they hit the DB
 *     (family lookups) but never mutate state themselves.
 *
 * Methods that will move here from CoreService:
 *   Text / crypto:
 *     - clipText
 *     - slugify
 *     - sanitizeUsernamePart
 *     - hashPassword
 *     - buildGeneratedPasswordFromPhone
 *   Phone:
 *     - normalizePhone
 *     - phoneCompareKey
 *     - findActiveUserByEmail
 *     - findActiveUserByPhone
 *   Date / time:
 *     - nextWeekdayIsoDate
 *     - makassarTodayIsoDate
 *     - getMakassarNowContext
 *     - addDaysIsoDate
 *     - getIsoWeek
 *     - validateServiceDate
 *     - normalizeSession
 *   Ordering window:
 *     - normalizeOrderingCutoffTime
 *     - formatOrderingCutoffTimeLabel
 *     - getOrderingCutoffTime
 *     - isAfterOrAtMakassarCutoff
 *     - lockOrdersForServiceDateIfCutoffPassed
 *     - enforceParentYoungsterOrderingWindow
 *   Family / ownership:
 *     - getParentIdByUserId
 *     - getChildIdByUserId
 *     - getParentFamilyId
 *     - getChildFamilyId
 *     - getFamilyIdByUserId
 *     - ensureParentOwnsChild
 *     - getParentIdByChildId
 *     - syncParentChildrenByLastName
 *     - syncFamilyParentChildren
 *   UUID / pricing:
 *     - assertValidUuid
 *     - calculateTotalPrice
 *     - calculateMaxConsecutiveOrderDays
 *     - calculateMonthOrderStats
 *     - resolveBadgeLevel
 *     - deriveFamilyName
 *
 * Dependencies:
 *   - runSql (db.util), crypto, SchemaService (for family_id columns)
 *
 * Consumers:
 *   - Every other sub-service.
 */
@Injectable()
export class HelpersService {}
