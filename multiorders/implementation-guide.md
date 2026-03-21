# Multi Order Implementation Guide, Sequence And Details

## Implementation Strategy

Implement Multi Order as a grouped layer above existing order creation, not as a replacement for the current single-order engine.

This keeps:

- single-order flow stable
- kitchen flow stable
- delivery flow stable
- reporting stable
- existing order validations reusable

## Phase Sequence

### Phase 1: Database Foundations

1. Add `multi_order_groups`
2. Add `multi_order_occurrences`
3. Add `multi_order_billings`
4. Add `multi_order_receipts`
5. Add `multi_order_change_requests`
6. Add `source_type` and `multi_order_group_id` to `orders`
7. Confirm unique active order rule for `child_id + service_date + session`
8. Add indexes for admin filters and billing lookup

## Phase 2: Backend Services

Implement service methods in the API service layer.

### Create Group

Flow:

1. validate actor ownership
2. validate session active
3. validate range within 3 months
4. generate dates from recurrence
5. remove weekends
6. remove blackout dates
7. check overlaps against existing active orders
8. fetch current active session menu items
9. snapshot selected dishes and prices
10. create group row
11. create occurrence rows
12. create linked normal orders using existing order creation logic
13. create grouped billing row
14. generate receipt if required by current billing process
15. return success and skipped summaries

### Owner Edit Before Start

Flow:

1. validate owner
2. validate group not started
3. validate new recurrence and dishes
4. recompute eligible future dates
5. compare old future dates vs new future dates
6. hard delete removed future mutable occurrences and linked orders
7. update retained future mutable occurrences
8. create missing future occurrences
9. recalculate grouped billing
10. void and regenerate receipt if needed
11. mark group `ACTIVE` or `PARTIALLY_CHANGED` based on actual changes

### Owner Delete Before Start

Flow:

1. validate owner
2. validate group not started
3. hard delete all occurrences and linked future orders
4. hard delete grouped billing and active receipt rows if no historical data exists
5. remove group or mark cancelled based on remaining records

### Post-Start Request Submission

Flow:

1. validate owner read-only eligibility
2. create request row
3. store requested new recurrence and dish payload
4. surface request to admin list

### Admin Request Resolution

Approved change flow:

1. load original group
2. identify mutable future occurrences only
3. delete requested future occurrences from original group
4. recalculate old group billing
5. void and regenerate old group receipt
6. mark original group `PARTIALLY_CHANGED`
7. create new replacement multi order group from approved payload
8. create new grouped billing and receipt for new group
9. mark request `APPROVED`
10. mark request `CLOSED`

Approved delete flow:

1. delete mutable future occurrences only
2. recalculate billing
3. void and regenerate receipt
4. mark original group `PARTIALLY_CHANGED`
5. close request

Rejected flow:

1. mark request `REJECTED`
2. add resolution note
3. close request

## Backend Structural Detail

### Reuse Existing Order Engine

Do not duplicate current single-order validations.

Reuse existing logic for:

- cutoff enforcement
- blackout enforcement
- session activation enforcement
- menu item validity
- order item limits
- ownership enforcement

### New Service Modules Recommended

- `multi-order.service.ts`
- `multi-order-billing.service.ts`
- `multi-order-request.service.ts`
- `multi-order-receipt.service.ts`

or equivalent sections inside current core service if preferred by codebase style.

## API Contract Detail

### `POST /multi-orders`

Payload:

- `childId`
- `session`
- `startDate`
- `endDate`
- `repeatDays`
- `items`

Response:

- `groupId`
- `createdCount`
- `skipped`
- `billingId`
- `totalAmount`

### `PATCH /multi-orders/:groupId`

Pre-start owner edit only.

Payload:

- `startDate`
- `endDate`
- `repeatDays`
- `items`

### `POST /multi-orders/:groupId/requests`

Payload:

- `requestType`
- `reason`
- `replacementPlan`

### `GET /admin/multi-orders`

Filters:

- student
- parent
- session
- status
- request status
- start/end date

### `POST /admin/multi-orders/:groupId/replacement`

Payload:

- approved replacement plan

## Frontend Sequence

### Family/Student

1. add new `Multi Order` button to module hub
2. build session-based multi-order page
3. implement 3-step mobile flow:
   - setup
   - dishes
   - review
4. build detail page or popup for grouped billing
5. add request submission panel for started groups

### Admin

1. create `/admin/multiorders`
2. add filters and list cards
3. build detail popup with occurrence breakdown
4. build request resolution popup
5. build replacement group create popup

## Billing Detail

Grouped bill popup should show:

- billing id
- receipt number
- receipt version
- parent
- student
- session
- group status
- total amount
- occurrence list with date, dishes, amount, status

## Receipt Detail

Receipt document should include:

- receipt header
- group identifier
- student and parent details
- session
- repeat pattern
- date range
- occurrence table
- total
- version number
- void note for prior receipt versions

## QA Sequence

1. create family multi order
2. create student multi order
3. verify overlap skip behavior
4. verify weekend exclusion
5. verify blackout exclusion
6. verify pre-start owner edit
7. verify pre-start owner delete
8. verify post-start owner request
9. verify admin partial delete
10. verify admin replacement creation
11. verify grouped billing row
12. verify grouped billing popup
13. verify receipt void and regeneration
14. verify single-order flows remain unchanged
15. verify kitchen and delivery views still operate from occurrence orders

## Delivery Note

No delivery UI changes should be required beyond existing occurrence order visibility because delivery must continue reading normal orders.

## Kitchen Note

No kitchen flow change should be required beyond showing occurrence orders as normal orders.
