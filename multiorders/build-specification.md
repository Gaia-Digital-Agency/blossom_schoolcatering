# Multi Order Build Specification

## Purpose

Build a session-based multi order system for Family and Student users so they can place repeated Breakfast, Snack, or Lunch orders for up to 3 months in one action while preserving existing single-order, billing, kitchen, delivery, and reporting behavior.

## Build Scope

- New Family page: `/family/multiorder`
- New Student page: `/student/multiorder`
- New Family hub button: `Multi Order`
- New Student hub button: `Multi Order`
- New Admin page: `/admin/multiorders`
- New admin popup flows for read, resolve request, delete future occurrences, and create replacement group
- New grouped billing behavior for multi orders
- New receipt versioning for grouped billing
- New request workflow for parent/student post-start changes

## Core Product Model

- One multi order group belongs to exactly one student.
- One multi order group belongs to exactly one session.
- One multi order group contains one recurrence rule and one dish set.
- One group creates many future occurrence orders.
- Kitchen and Delivery operate on occurrence orders only.
- Billing shows one grouped bill for the multi order.
- Historical occurrences remain immutable operational history.

## Locked Business Rules

- Menu selection is session-based, not date-based.
- A multi order is isolated by session: Breakfast, Snack, or Lunch.
- Multi order can only be created when the selected session is active.
- Maximum future horizon is 3 calendar months from start date.
- Weekends are excluded automatically.
- Blackout dates are excluded automatically.
- No student may have more than one active order on the same `service_date + session`.
- Billing is generated immediately once the multi order is placed.
- Billing page shows one multi-order billing row per group.
- Billing detail is shown in popup and receipt breakdown.
- Price snapshots are locked at placement time.
- Parent/student can edit or delete only before group start.
- After group start, parent/student have read-only visibility and may submit admin requests.
- After group start, admin resolves changes by partially deleting future mutable occurrences from the original group and creating a new replacement group when required.
- Original started group is never rewritten in place.
- Delivered occurrences are immutable.
- `KITCHEN_COMPLETED` and `IN_DELIVERY` occurrences are immutable.
- Immutability is also locked at `after cutoff`.
- Hard delete is allowed only for future, unfulfilled, mutable data.
- If all future occurrences are deleted and historical ones remain, group becomes `PARTIALLY_CHANGED`.
- If grouped billing receipt already exists and billing changes, old receipt becomes `VOID` and a new receipt is generated automatically.

## Data Model

### New Tables

#### `multi_order_groups`

- `id`
- `child_id`
- `created_by_user_id`
- `source_role`
- `session`
- `start_date`
- `end_date`
- `repeat_days_json`
- `dish_selection_json`
- `status`
- `original_total_amount`
- `current_total_amount`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

#### `multi_order_occurrences`

- `id`
- `multi_order_group_id`
- `service_date`
- `session`
- `order_id`
- `status`
- `price_snapshot_total`
- `items_snapshot_json`
- `created_at`
- `updated_at`

#### `multi_order_billings`

- `id`
- `multi_order_group_id`
- `parent_id`
- `status`
- `total_amount`
- `receipt_id`
- `receipt_version`
- `created_at`
- `updated_at`

#### `multi_order_change_requests`

- `id`
- `multi_order_group_id`
- `requested_by_user_id`
- `request_type`
- `reason`
- `payload_json`
- `status`
- `resolved_by_user_id`
- `resolved_at`
- `resolution_note`
- `created_at`
- `updated_at`

#### `multi_order_receipts`

- `id`
- `multi_order_billing_id`
- `receipt_number`
- `status`
- `version`
- `pdf_path`
- `breakdown_json`
- `voided_at`
- `created_at`

## Existing Table Adjustments

### `orders`

Add:

- `source_type` with values `SINGLE | MULTI`
- `multi_order_group_id` nullable

Keep active uniqueness rule on:

- `child_id`
- `service_date`
- `session`

for active non-deleted orders.

## Status Definitions

### Group Status

- `ACTIVE`
- `PARTIALLY_CHANGED`
- `COMPLETED`
- `CANCELLED`

### Occurrence Status

- `PLACED`
- `KITCHEN_COMPLETED`
- `IN_DELIVERY`
- `DELIVERED`
- `CANCELLED`

### Request Status

- `OPEN`
- `APPROVED`
- `REJECTED`
- `CLOSED`

### Receipt Status

- `ACTIVE`
- `VOID`

## API Surface

### Family/Student

- `GET /multi-orders`
- `GET /multi-orders/:groupId`
- `POST /multi-orders`
- `PATCH /multi-orders/:groupId` for pre-start owner edits only
- `DELETE /multi-orders/:groupId` for pre-start owner deletes only
- `POST /multi-orders/:groupId/requests`
- `GET /multi-orders/:groupId/billing`

### Admin

- `GET /admin/multi-orders`
- `GET /admin/multi-orders/:groupId`
- `POST /admin/multi-orders/:groupId/resolve-request`
- `PATCH /admin/multi-orders/:groupId/future-trim`
- `POST /admin/multi-orders/:groupId/replacement`
- `DELETE /admin/multi-orders/:groupId/future-occurrences/:occurrenceId`
- `GET /admin/multi-orders/:groupId/billing`
- `GET /admin/multi-orders/:groupId/receipt`

## UI Pages

### Family and Student

#### Step 1: Setup

- choose student if family user
- choose session
- choose start date and end date
- choose repeat weekdays

#### Step 2: Dishes

- show active session menu only
- show dish names only
- no description
- no price
- allow selection up to existing order item rules

#### Step 3: Review

- show generated eligible dates
- show skipped weekends
- show skipped blackout dates
- show skipped overlaps
- show total price only here

#### Step 4: Submit Result

- show created occurrence count
- show skipped dates with reason
- link to grouped bill detail

### Admin

- list groups
- filter by student, family, session, status, request status, date range
- popup detail view with occurrence breakdown
- popup request resolution view
- action buttons:
  - approve request
  - reject request
  - delete future mutable occurrences
  - create replacement group
  - close request

## Concurrency

- First confirmed write wins.
- DB unique rule prevents overlap by `student + date + session`.
- Conflicting operations return explicit conflict response.
- UI must flash conflict and instruct user to refresh.

## Billing Behavior

- Single orders keep current billing flow.
- Multi orders create one grouped billing row.
- Billing total equals sum of current active occurrences in the group.
- Billing popup shows occurrence list and amount breakdown.
- Receipt is group-level only with occurrence breakdown.
- Receipt versioning is mandatory after billing adjustment.

## Audit Requirements

Record:

- group created
- group edited
- owner deleted before start
- request submitted
- request approved
- request rejected
- future occurrences deleted
- replacement group created
- billing recalculated
- receipt voided
- receipt regenerated

## Non-Goals

- Mixed-session multi orders in one group
- Silent retroactive menu re-pricing
- Rewriting started groups in place
- Deleting historical operational records
