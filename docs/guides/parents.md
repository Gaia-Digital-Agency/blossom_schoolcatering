# Parent User Guide

Last updated: 2026-03-09

## Access
- Login: `/schoolcatering/parent/login`
- Main page: `/schoolcatering/parents`

## Core Modules
- Linked youngster selector.
- Menu and draft cart.
- Confirmed order of the day.
- Consolidated order history.
- Consolidated billing (proof upload and receipts).
- Spending dashboard.

## Ordering Flow
1. Select youngster.
2. Choose service date and session.
3. Add menu items to draft (max 5 distinct items).
4. Adjust quantities and place order.

## Order Management
- `Edit Before Cutoff` reopens selected order as draft.
- `Delete Before Cutoff` removes editable order.
- `Quick Reorder` clones historical order to target date.

## Billing Flow
- Select unpaid billing rows.
- Upload one proof image for selected bills.
- Monitor verification status.
- Use `View Proof Image` in Paid Bills (Past 30 Days) to confirm uploaded proof.
- If needed, use `Redo (Move to Unpaid)` while status is pending verification.
- Open receipt for paid rows (when generated).

## Important Rules
- Cutoff, blackout, and session enablement are enforced by API.
- Duplicate active order for same child/date/session is blocked.
- If any action fails, error is shown inline in bold red at the current page location.
