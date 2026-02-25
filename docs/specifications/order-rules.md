# Order Rules Specification

## Purpose
Single source of truth for order validation, cart lifecycle, badge logic, and mutation behaviour across API, UI, and tests.

## Time and Calendar Standard
- Local business timezone: `Asia/Makassar` (UTC+8).
- All cutoff, cart expiry, and service-date checks must be evaluated in local business time.

## Identity and Username Rules
- Default generated usernames:
  - Parent: `lastname_parent`
  - Child: `lastname_firstname`
- Username must be globally unique.
- If base username already exists, append numeric suffix in sequence:
  - `base`, `base-1`, `base-2`, ...
- Username generation is deterministic and checked inside a DB transaction to avoid race-condition duplicates.
- Google OAuth sign-in is supported; OAuth identity links to existing or newly created local user record.

## Session Rules
- Valid sessions: `LUNCH`, `SNACK`, `BREAKFAST`
- Display order in UI: Lunch, Snack, Breakfast

## Ingredient Selection Rules
- Ingredients are maintained by admin in a master list.
- Each menu item selects ingredients from the master list (dropdown/multi-select), not free-typed per item.
- Inactive ingredients cannot be newly assigned to menu items.
- Ingredient master names must be unique (case-insensitive).
- Meal names must be unique (case-insensitive), even when admin edits existing meals.

## Cart Lifecycle Rules

### Cart Creation
- A cart is created for a specific `child_id`, `session`, and `service_date`.
- Only one OPEN cart may exist per `(child_id, session, service_date)`.
- `expires_at` is set to 08:00 AM Asia/Makassar on the `service_date` at creation time.
- Max 5 distinct items per cart (enforced at service layer).
- Cart creation validates weekday and blackout rules on the target `service_date`.

### Cart Editing
- Items can be added, updated, or removed from an OPEN cart before submission.
- Parent can edit a cart for a linked child; child can edit their own cart.
- Editing is blocked if the cart status is SUBMITTED or EXPIRED.

### Cart Submission
- Submitting an OPEN cart:
  1. Validates cart is still OPEN and not past `expires_at`.
  2. Validates all items are still available in the menu.
  3. Runs full order validation pipeline (weekday, blackout, uniqueness, item count).
  4. Creates an `orders` record, copies items to `order_items`, creates `billing_records` draft.
  5. Sets `order_carts.status = SUBMITTED` and links `orders.cart_id`.
  6. Emits `CartSubmitted` / `OrderPlaced` domain event.
- If validation fails, cart remains OPEN and errors are returned.

### Cart Expiry
- Carts with `status = OPEN` and `expires_at <= now()` are considered EXPIRED.
- Lazy expiry: checked at submission time and on cart view request.
- Batch expiry: scheduled job (or pg_cron) transitions all stale OPEN carts to EXPIRED.
- EXPIRED carts cannot be submitted.

## Quick Reorder Rules
- Source order must be in PLACED or LOCKED status; CANCELLED orders cannot be quick-reordered.
- Quick reorder creates a new OPEN cart with the source order's items pre-loaded.
- Items from the source order that are `is_available = false` are flagged and excluded.
- The new cart targets a new `service_date` and the same `session` as the source.
- Standard cart validation applies (weekday, blackout, uniqueness).

## Meal Plan Wizard Rules
- Wizard creates multiple carts (one per child × session × service_date combination).
- Each target date must independently pass weekday, blackout, and uniqueness rules.
- Partial success: valid dates proceed, invalid dates are returned with per-date failure reasons.
- User reviews all planned orders in a summary step before final submission.
- Each cart is submitted independently; failure of one does not block others.

## Core Placement Rules
1. Order can be placed by: Parent (for linked child) or Child (for self).
2. One meal set per child per session per day: unique active order key = (`child_id`, `service_date`, `session`).
3. Max 3 orders per child per day (one per session).
4. Max 5 distinct menu items per order.
5. Service date must be weekday (Mon-Fri).
6. Blackout rules apply per `blackout_type` (`ORDER_BLOCK`, `SERVICE_BLOCK`, `BOTH`).

## Edit/Delete Rules

### Child
- Cannot edit or delete any order after placement.

### Parent
- Can edit/delete linked-child orders only before 08:00 on the same `service_date` (local time).
- At or after 08:00: update/delete denied with `ORDER_CUTOFF_EXCEEDED`.

### Admin
- Cannot modify order content (items/session/date).
- Can delete orders for operational management (action is audited).

## Duplication Rules (Parent)
- Parent can duplicate meal sets for a linked child: Daily or Weekly pattern.
- Every target date must pass: weekday rule, blackout rule, uniqueness rule, item count rule.
- Partial success: valid dates process; failures returned per-date with reason.

## Ingredient Restriction Rules
- Active child dietary restrictions are snapshotted into `orders.dietary_snapshot` at order creation.
- Snapshot is immutable on historical records.
- Kitchen views and order tags must always include the dietary snapshot from the order.

## Smart Cutoff Countdown Rules
- Countdown displayed on all cart and order pages for the selected service date.
- Countdown = `expires_at` − `now()` in local time.
- Warning threshold: fewer than 30 minutes remaining (timer turns red).
- At zero: order/edit/submit buttons disabled; cart status transitions to EXPIRED on next action.

## Academic Year Soft Validation
- When a user selects a service date, the API checks if the date falls within any active term for the child's school.
- If the date is outside all active terms for the school, the API response includes a `soft_warning: true` flag and a message.
- This is informational only; the order is not blocked.

## Billing Link Rules
- Each active order has exactly one billing record (created on OrderPlaced event).
- Status flow: `UNPAID` → `PENDING_VERIFICATION` → (`VERIFIED` or `REJECTED`).
- Parent uploads proof image to trigger `PENDING_VERIFICATION`.
- Delivery confirmation updates billing delivery fields.

## Digital Receipt Rules
- Receipt generation is triggered by admin on billing verification page.
- Receipt is generated only when `billing_records.status = VERIFIED`.
- `receipt_number` is a sequential unique identifier (e.g., BLC-2026-00001) using a DB sequence.
- PDF is stored in GCS and linked to `digital_receipts.pdf_url`.
- Parent can view and download receipt from their billing page.

## Gamification: Badge Award Rules
- Badge check is triggered server-side on every successful `OrderPlaced` event.
- For each badge type, evaluation logic:
  - `STREAK_7`: count consecutive weekdays (backwards from today) with ≥1 order for this child. If count ≥ 7, award/upsert STREAK_7.
  - `STREAK_14`: same logic, threshold = 14.
  - `STREAK_30`: same logic, threshold = 30.
  - `WEEK_COMPLETE`: count distinct weekdays with ≥1 order in the current calendar week (Mon-Fri). If = 5, award WEEK_COMPLETE.
  - `MONTH_COMPLETE`: count distinct weekdays with ≥1 order in the current calendar month. If = total weekdays in month, award MONTH_COMPLETE.
- Badge records are upserted (updated `earned_at` and `streak_count` if re-earned).
- `BadgeAwarded` domain event emitted when a new badge is earned.

## Favourite Meals Rules
- Favourites are saved by the user (parent or child) from any order or cart.
- Max 20 active favourites per user; creation beyond this limit returns `FAVOURITES_LIMIT_EXCEEDED`.
- Applying a favourite pre-fills a new OPEN cart with the favourite's items for the chosen session and service date.
- Items in the favourite that are no longer available (`is_available = false`) are excluded and flagged on pre-fill.
- Favourites linked to a deleted child are deactivated (soft delete cascade at service layer).

## Delivery Rules
- Delivery user sees assigned meals/orders for the selected day.
- Delivery can confirm only own assignments.
- Confirm action updates:
  - `orders.delivery_status = DELIVERED`, `orders.delivered_at`, `orders.delivered_by_user_id`
  - `billing_records.delivery_status = DELIVERED`, `billing_records.delivered_at`
- Delivery confirmation is idempotent: repeated confirm returns success without duplicating side effects.

## Validation Pipeline (Server-side Order Create / Cart Submit)
1. Authenticate and resolve role.
2. Validate ownership (parent-child link or self).
3. Validate request schema and item count ≤ 5.
4. Validate menu/session availability for service date.
5. Validate weekday service rule.
6. Validate blackout rule.
7. Validate uniqueness (`child_id + service_date + session`).
8. Check academic term soft warning (non-blocking).
9. Compute total and dietary snapshot.
10. Write order + order items + billing draft + audit mutation.
11. Emit `OrderPlaced` event → triggers badge check.

## Validation Pipeline (Parent Update/Delete)
1. Authenticate and role check (`PARENT`).
2. Validate linked-child ownership.
3. Validate same-day cutoff (before 08:00 local).
4. Apply mutation or delete.
5. Write audit mutation.
6. Emit `OrderUpdated` or `OrderCancelled` event.

## Kitchen Polling Rules (v1)
- Kitchen UI reads summary endpoint every 30–60 seconds.
- Manual Refresh button triggers immediate refetch.
- Summary reflects current committed order state.
- No WebSocket in v1.

## Admin Analytics Rules
- Admin analytics support slicing by: parent, child, meal item, session, school, order count, delivery status, payment status, date/day/week/month.

## Error Codes
- `ORDER_DUPLICATE_SESSION`
- `ORDER_ITEM_LIMIT_EXCEEDED`
- `ORDER_WEEKEND_SERVICE_BLOCKED`
- `ORDER_BLACKOUT_BLOCKED`
- `ORDER_CUTOFF_EXCEEDED`
- `ORDER_CHILD_UPDATE_FORBIDDEN`
- `ORDER_OWNERSHIP_FORBIDDEN`
- `ORDER_MENU_UNAVAILABLE`
- `CART_EXPIRED`
- `CART_ALREADY_SUBMITTED`
- `CART_ITEM_LIMIT_EXCEEDED`
- `CART_MENU_ITEM_UNAVAILABLE`
- `FAVOURITES_LIMIT_EXCEEDED`
- `DELIVERY_ASSIGNMENT_FORBIDDEN`
- `DELIVERY_ALREADY_CONFIRMED`
- `INGREDIENT_NOT_IN_MASTER_LIST`
- `MEAL_NAME_ALREADY_EXISTS`
- `INGREDIENT_NAME_ALREADY_EXISTS`
- `RECEIPT_PAYMENT_NOT_VERIFIED`
- `CSV_IMPORT_SCHOOL_NOT_FOUND`
- `CSV_IMPORT_DUPLICATE_USERNAME`
- `USERNAME_SUFFIX_GENERATION_FAILED`
- `GOOGLE_OAUTH_IDENTITY_CONFLICT`

## QA Acceptance Scenarios
1. Child places lunch; child cannot edit/delete afterward.
2. Parent places lunch+snack+breakfast for same child same date; fourth attempt blocked.
3. Parent update before 08:00 succeeds; at 08:00 or later fails.
4. Saturday/Sunday service date order is blocked.
5. Blackout date order is blocked with explicit reason.
6. Cart expires at 08:00; submit after expiry returns CART_EXPIRED.
7. Quick reorder excludes unavailable items and pre-fills cart.
8. Meal plan wizard partial success: valid dates create orders, invalid dates return per-date errors.
9. Duplicate weekly plan skips invalid dates and reports failures.
10. Kitchen summary updates on next poll cycle after order changes.
11. Order tag includes UUID, parent/child/school/session/date, ingredient exclusions, birthday + badge indicators.
12. Delivery confirms assigned order; billing delivery status updates immediately.
13. Admin can filter analytics by delivery status and session in the same query.
14. After 7 consecutive weekday orders, child earns STREAK_7 badge.
15. Applying a favourite pre-fills cart; unavailable items excluded.
16. Digital receipt generated and linked after admin verifies payment.
17. Service date outside active academic term returns soft_warning flag (order still proceeds).
18. CSV import with a missing school_id returns row-level failure; valid rows proceed.
19. Second registration with same generated username gets suffix `-1`, third gets `-2`.
20. Parent sees one consolidated orders/billing view across all linked children.
