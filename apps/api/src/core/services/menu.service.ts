import { Injectable } from '@nestjs/common';

/**
 * MenuService
 * ===========
 *
 * Scope:
 *   - Menu items lifecycle: create/update/delete, image upload,
 *     publish/unpublish, category/ingredient associations, allergens,
 *     packing requirements, text normalization.
 *   - Ingredients master list: create/update/delete + the TBA marker.
 *   - Menu ratings: upsert per youngster, admin listing by date/session.
 *   - Public read surface: /public/menu with per-session filtering and
 *     an in-memory 60-second cache (shared Map owned here).
 *   - Admin read surface: /admin/menus with session filter.
 *
 * Methods that will move here from CoreService:
 *   Items:
 *     - createAdminMenuItem
 *     - updateAdminMenuItem
 *     - deleteMenuItem
 *     - seedAdminMenuSample
 *     - uploadMenuImage
 *     - getMenus (parent/youngster read of published menus)
 *     - getPublicActiveMenu
 *     - getAdminMenus
 *   Ingredients:
 *     - getAdminIngredients
 *     - createIngredient
 *     - updateIngredient
 *     - deleteIngredient
 *   Ratings:
 *     - getAdminMenuRatings
 *     - createOrUpdateMenuRating
 *   Internals:
 *     - getPublicMenuCacheKey
 *     - clearPublicMenuCache
 *     - resolveCreateMenuServiceDate
 *     - normalizeDishCategory
 *     - normalizeAllergies
 *     - normalizeMenuText
 *     - sanitizePackingRequirement
 *     - ensureMenuForDateSession (private helper, called by OrderService)
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService (ensureMenuItemExtendedColumns, ensureMenuRatingsTable,
 *                    ensureMenuItemNameUniquenessScope, ensureTbaIngredientId,
 *                    ensureMenuItemTextDefaults)
 *   - MediaService (image upload, resolveMenuImageUrl)
 *   - HelpersService (date/session normalization, slugify)
 *   - AuditService (recordAdminAudit on writes)
 *
 * Consumers:
 *   - OrderService, MultiOrderService (menu availability check on cart submit)
 *   - GaiaService (menu context for AI prompt)
 *   - KitchenService (menu snapshot on daily summary)
 *   - CoreService facade (public + admin endpoints)
 */
@Injectable()
export class MenuService {}
