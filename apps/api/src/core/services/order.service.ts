import { Injectable } from '@nestjs/common';

/**
 * OrderService
 * ============
 *
 * Scope:
 *   - Order carts lifecycle: createCart, getCarts, getCartById,
 *     replaceCartItems, discardCart, submitCart. Enforces 08:00
 *     Makassar ordering window, youngster tomorrow-onwards rule,
 *     session-active gate, blackout rules, and cutoff lock.
 *   - Submitted orders: detail view, parent/youngster consolidated
 *     order lists, admin orders list with filtering.
 *   - Update / delete order: enforces PLACED status, parent family
 *     ownership, cutoff check; re-runs all blackout/menu validations.
 *   - Favourites + quick-reorder + meal-plan wizard + apply-favourite:
 *     convenience flows that build new carts from stored items.
 *   - Dietary snapshot capture at order creation.
 *
 * Methods that will move here from CoreService:
 *   Cart:
 *     - ensureCartIsOpenAndOwned (private)
 *     - createCart
 *     - getCarts
 *     - getCartById
 *     - replaceCartItems
 *     - discardCart
 *     - submitCart
 *   Order:
 *     - getOrderDetail
 *     - getParentConsolidatedOrders
 *     - getYoungsterConsolidatedOrders
 *     - getAdminOrders
 *     - updateOrder
 *     - deleteOrder
 *   Favourites / reorder:
 *     - getFavourites
 *     - createFavourite
 *     - deleteFavourite
 *     - quickReorder
 *     - mealPlanWizard
 *     - applyFavouriteToCart
 *   Dietary snapshot:
 *     - getOrderDietarySnapshot (private)
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - HelpersService (cutoff, ordering window, family ownership, UUID,
 *                     pricing math, validateServiceDate, normalizeSession)
 *   - SchoolsService (validateOrderDayRules, isSessionActive,
 *                     assertSessionActiveForOrdering)
 *   - MenuService (ensureMenuForDateSession, menu lookup on submit)
 *   - BillingService (billing row creation on order submit)
 *   - DeliveryService (auto-assignment trigger after placement)
 *   - AuditService (recordAdminAudit on admin mutations)
 *
 * Consumers:
 *   - CoreService facade (huge surface — ~25 endpoints)
 *   - GaiaService (quickOrder flow)
 *   - MultiOrderService (occurrence orders created via this service)
 */
@Injectable()
export class OrderService {}
