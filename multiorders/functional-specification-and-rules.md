# Multi Order Functional Specification And Rule Set

## Overview

Multi Order allows a Family or Student user to place repeated orders for one student and one session across multiple future dates in a single action.

The feature is designed to reduce repetitive daily ordering while keeping billing, kitchen, delivery, and reporting consistent with current order operations.

## Core Functional Definition

- One multi order group is for one student only.
- One multi order group is for one session only.
- A group uses one repeat pattern and one dish selection set.
- The system generates normal future orders as occurrences under the group.
- Billing is grouped at the multi-order level.

## User Roles

### Family

- Can create multi orders for linked students.
- Can edit or delete only before the group starts.
- Can view groups and billing after start.
- Can submit admin requests after start.

### Student

- Can create multi orders only for self.
- Can edit or delete only before the group starts.
- Can view groups and billing after start.
- Can submit admin requests after start.

### Admin

- Can view all groups, billings, receipts, occurrences, and requests.
- Can resolve post-start change/delete requests.
- Can delete future mutable occurrences.
- Can create replacement multi order groups.
- Can close completed request threads.

## Session Rules

- Multi order is session-specific.
- Allowed sessions: `BREAKFAST`, `SNACK`, `LUNCH`.
- A session must be active for new group creation.
- If a session is later deactivated, existing booked groups remain valid history and future operational commitments unless admin changes them.

## Date Rules

- Maximum future range is 3 calendar months from group start date.
- Only valid future dates are generated.
- Weekends are automatically excluded.
- Blackout dates are automatically excluded.
- Out-of-range dates are rejected.

## Menu Rules

- Menu selection is session-based.
- Dish selection comes from the currently active session menu.
- Price is hidden during dish selection.
- Only dish names are shown during selection.
- Price is shown only during review and after placement.
- Item prices are snapshotted at placement.
- Later menu changes do not mutate existing snapshots.

## Overlap Rule

- No student may have the same active order on the same date and session.
- This rule applies across:
  - single orders
  - multi-order occurrences
  - admin-created replacements
- Conflict handling is partial-skip, not whole-batch failure.

## Group Start Rule

- A group is considered started when the first occurrence date is today or earlier in Asia/Makassar.
- Before start:
  - owner may edit
  - owner may delete
- After start:
  - owner is read-only
  - owner may only submit admin requests
  - admin handles changes through partial deletion and replacement workflow

## Mutability Rule

An occurrence is mutable only if all conditions are true:

- it is in the future
- current time is before cutoff
- it is not `KITCHEN_COMPLETED`
- it is not `IN_DELIVERY`
- it is not `DELIVERED`

Otherwise it is immutable.

## Delete Rule

- Hard delete is allowed only for future mutable occurrences.
- Historical started or fulfilled occurrences remain immutable history.
- If the whole group is deleted before start, the group may be fully removed.
- If historical occurrences remain and all future ones are removed, the group status becomes `PARTIALLY_CHANGED`.

## Edit Rule

### Before Group Start

- owner may edit recurrence pattern and dishes
- system recalculates future dates
- removed future dates are hard deleted
- retained future dates are updated
- new future dates are created
- overlaps and invalid dates are skipped with explanation

### After Group Start

- owner cannot edit directly
- owner submits admin request
- admin does not rewrite the started group in place
- admin keeps history intact
- admin deletes future mutable occurrences from original group as needed
- admin creates a new replacement group if a new plan is required

## Billing Rules

- Billing is generated immediately when the multi order is placed.
- Billing page shows one billing row per multi-order group.
- Billing detail is shown in popup.
- Billing amount equals the sum of active occurrences in the group.
- If admin deletes future occurrences later, billing is recalculated immediately.
- If receipt exists, old receipt is voided and a new receipt is generated automatically.
- Replacement groups receive separate billing and separate receipt history.

## Receipt Rules

- Receipt is group-level only.
- Receipt includes occurrence breakdown.
- Popup and downloadable receipt must show:
  - student
  - session
  - start date
  - end date
  - repeat days
  - occurrence dates
  - dish snapshots
  - pricing breakdown
- Older recalculated receipt versions remain in history as `VOID`.

## Request Workflow Rules

After start, parent/student changes are request-based only.

Allowed request types:

- change recurring pattern
- change dishes
- delete remaining future plan

Request lifecycle:

- user submits request
- admin reviews request
- admin approves or rejects
- if approved, admin executes trim/replacement flow
- admin closes request

## Group Status Rules

- `ACTIVE`: group is live with future occurrences intact
- `PARTIALLY_CHANGED`: future plan was changed after start or not all original future occurrences remain
- `COMPLETED`: no future occurrences remain and history is complete
- `CANCELLED`: only valid when whole pre-start group is removed

## UI Rules

- Mobile-first layout required
- Dish selection page shows names only
- No dish description
- No dish price during setup
- Review page shows full cost
- Billing popup shows occurrence-level details
- Admin edit uses popup so it does not mix with single-order edit flow

## Error Handling Rules

The system must return explicit reasons for skipped or failed dates:

- `OVERLAP`
- `BLACKOUT`
- `WEEKEND`
- `OUT_OF_RANGE`
- `AFTER_CUTOFF`
- `IMMUTABLE`
- `SESSION_INACTIVE`
- `MENU_ITEM_UNAVAILABLE`

## Single Source Of Truth Principle

- Occurrence orders are the operational truth.
- Group billing is the financial truth.
- Group definition plus linked occurrences is the planning truth.
- No additional overlapping truth model is allowed.
