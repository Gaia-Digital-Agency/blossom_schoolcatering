# Parent User Guide

Last updated: 2026-02-28

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
- Open receipt for paid rows (when generated).

## Important Rules
- Cutoff, blackout, and session enablement are enforced by API.
- Duplicate active order for same child/date/session is blocked.
