# Order Rules Specification

## Purpose
Single source of truth for order validation and mutation behavior across API, UI, and tests.

## Time and Calendar Standard
- Local business timezone: `Asia/Makassar` (UTC+8).
- All cutoff and service-date checks must be evaluated in local business time.

## Session Rules
- Valid sessions:
  - `LUNCH`
  - `SNACK`
  - `BREAKFAST`
- Display order in UI:
  - Lunch, Snack, Breakfast

## Ingredient Selection Rules
- Ingredients are maintained by admin in a master list.
- Each menu item must select ingredients from master list (dropdown/multi-select), not free-typed per menu item.
- Inactive ingredients cannot be newly assigned to menu items.
- Ingredient master names must be unique (case-insensitive).
- Meal names must be unique (case-insensitive), even when admin edits existing meals.

## Core Placement Rules
1. Order can be placed by:
- Parent for linked child
- Child for self

2. One meal set per child per session per day:
- Unique active order key = (`child_id`, `service_date`, `session`)

3. Max session count per child/day:
- Up to 3 orders/day (one per session)

4. Max items per meal:
- At most 5 distinct menu items per order

5. Service-date validity:
- Meal service date must be weekday (Mon-Fri)
- If date is in admin blackout list:
  - block according to blackout type (`ORDER_BLOCK`, `SERVICE_BLOCK`, `BOTH`)

## Edit/Delete Rules

### Child
- Cannot edit/delete after placing any order.

### Parent
- Can edit/delete linked-child orders only if:
  - current local datetime is before `08:00` on same service date
- At or after `08:00`:
  - update/delete denied with cutoff error

### Admin
- Cannot modify order content (items/session/date).
- Can delete orders for operational management (audited).

## Duplication Rules (Parent)
- Parent can duplicate meal sets for linked child:
  - Daily pattern
  - Weekly pattern
- Every duplicated target date must pass:
  - weekday rule
  - blackout rule
  - uniqueness rule (no existing active order same child/session/date)
  - item count rule
- Partial success strategy:
  - process valid dates
  - return per-date failures with reason

## Ingredient Restriction Rules
- Parent-managed child dietary restrictions are auto-attached as snapshot when order is created.
- Snapshot remains immutable on historical order records for audit/printing.
- Kitchen views/order tags must include exclusion notes from snapshot.

## Billing Link Rules
- Each active order has one billing record.
- Parent must upload payment proof image to confirm payment submission.
- Status flow:
  - `UNPAID` -> `PENDING_VERIFICATION` -> (`VERIFIED` or `REJECTED`)
- Delivery confirmation also updates billing delivery fields.

## Delivery Rules
- Delivery user sees assigned meals/orders for selected day.
- Delivery can confirm delivery only for own assignments.
- Confirm action updates:
  - `orders.delivery_status = DELIVERED`
  - `orders.delivered_at`
  - `orders.delivered_by_user_id`
  - `billing_records.delivery_status = DELIVERED`
  - `billing_records.delivered_at`
- Delivery confirmation is idempotent:
  - repeated confirm returns success without duplicating side effects.

## Validation Pipeline (Server-side Order Create)
1. Authenticate and resolve role
2. Validate ownership (parent-child or self)
3. Validate request schema and item count <= 5
4. Validate menu/session availability for service date
5. Validate weekday service rule
6. Validate blackout rule
7. Validate uniqueness (`child + date + session`)
8. Compute total and dietary snapshot
9. Write order + order items + billing draft + audit mutation

## Validation Pipeline (Parent Update/Delete)
1. Authenticate and role check (`PARENT`)
2. Validate linked-child ownership
3. Validate same-day cutoff (before 08:00 local)
4. Apply mutation or delete
5. Write audit mutation

## Kitchen Polling Rules (v1)
- Kitchen UI reads summary endpoint every 30-60 seconds.
- Manual refresh must trigger immediate read.
- Summary must reflect current committed order state.
- No WebSocket required for v1.

## Admin Analytics Rules
- Admin analytics must support slicing by:
  - parent
  - child
  - meal item
  - session
  - order count
  - delivery status
  - payment status
  - date/day/week/month

## Error Codes (Recommended)
- `ORDER_DUPLICATE_SESSION`
- `ORDER_ITEM_LIMIT_EXCEEDED`
- `ORDER_WEEKEND_SERVICE_BLOCKED`
- `ORDER_BLACKOUT_BLOCKED`
- `ORDER_CUTOFF_EXCEEDED`
- `ORDER_CHILD_UPDATE_FORBIDDEN`
- `ORDER_OWNERSHIP_FORBIDDEN`
- `ORDER_MENU_UNAVAILABLE`
- `DELIVERY_ASSIGNMENT_FORBIDDEN`
- `DELIVERY_ALREADY_CONFIRMED`
- `INGREDIENT_NOT_IN_MASTER_LIST`
- `MEAL_NAME_ALREADY_EXISTS`
- `INGREDIENT_NAME_ALREADY_EXISTS`

## QA Acceptance Scenarios
1. Child places lunch; child cannot edit/delete afterward.
2. Parent places lunch+snack+breakfast for same child same date; fourth attempt blocked.
3. Parent update before 08:00 succeeds; at 08:00 or later fails.
4. Saturday/Sunday service date order is blocked.
5. Blackout date order is blocked with explicit reason.
6. Duplicate weekly plan skips invalid dates and reports failures.
7. Kitchen summary updates on next poll cycle after order changes.
8. Order tag includes UUID, parent/child/school/session/date, ingredient exclusions.
9. Delivery confirms assigned order; billing delivery status updates immediately.
10. Admin can filter analytics by delivery status and session in the same query.
