# Multi Order Additional Build


This additional build introduces a structured Multi Order feature for Family and Student users so they can schedule repeated meal orders for one session across multiple future dates in one action.

The feature is designed to make recurring school meal planning easier for users while preserving the reliability of billing, kitchen preparation, delivery routing, and reporting.

## What Is Being Added AS NEW FUNCTIONALITY

- `Multi Order` entry point on Family hub
- `Multi Order` entry point on Student hub
- Family multi-order page
- Student multi-order page
- Admin multi-order management page
- grouped multi-order billing with popup detail
- grouped receipt with occurrence breakdown
- request workflow for post-start parent/student changes

Repeated ordering requires many separate manual submissions. Multi Order reduces friction for families and students who often repeat the same weekly pattern.

This is especially useful when:
- a student has a stable weekly meal plan
- a family wants to repeat the same lunch every Tuesday
- a user wants to set the same session plan for weeks ahead

## The Safe Build

The implementation is intentionally designed not to disrupt current single-order operations.

Instead of inventing a completely separate meal pipeline, the new feature creates normal occurrence orders under a multi-order group. This means:

- kitchen still sees normal orders
- delivery still sees normal orders
- reporting still reads normal order activity
- existing order rules remain reusable

This reduces risk and helps the new feature fit cleanly into the current platform.

## Key Rules To Be Locked

- one group is for one student only
- one group is for one session only
- menu choice is session-based, not date-based
- future range is limited to 3 months
- weekends are excluded
- blackout dates are excluded
- no overlap is allowed for the same student, date, and session
- billing is generated immediately
- billing page shows one grouped bill for the multi order
- receipt is group-level with occurrence breakdown
- prices are locked at placement time

## Grouped Billing

Without grouped billing, a single multi order could flood the billing page with many separate lines. Grouped billing keeps the billing interface much cleaner.

Users will see one bill for the multi order and can click into it to review the occurrence details.

This gives a better financial experience while still keeping occurrence-level operational detail available.

## Started Order Groups Are Not Rewritten In Place

Once a multi order has started, some occurrences may already be completed, prepared, or delivered. Rewriting a started group in place would create confusion in kitchen, delivery, billing, and receipt history.

For this reason:

- completed history is preserved
- future mutable occurrences can be removed
- a new replacement multi order is created when the future plan changes

This is much cleaner for audit, reporting, and billing.

## Versioned Receipts

If future occurrences are removed after billing has already been generated, the amount changes. The system therefore:

- marks the old receipt as `VOID`
- generates a new corrected receipt automatically

This ensures the client has reliable financial records and avoids mismatch between active billing and old paperwork.
P
## Scope

Changes in schema, API, family/student UI, admin UI, billing/receipt, rules, concurrency, histprical immutability, billing adjustments, algorithm adjustment (to exsiting single order), regression and testing. Estimated build time 6 days. Working on Forked Project Mode, so current single order mode which is operational is not disturbed, will port over after forked site is fully functional.

## Documentation For Build And Plan ning

The `multiorders` folder includes:

- build specification
- functional specification and rule set
- implementation guide, sequence, and details
- to do list
- user guide

## Summary

This build improves convenience for parents and students, reduces repetitive work, keeps billing cleaner, and preserves operational reliability. It also gives Admin a structured way to manage post-start changes without damaging completed order history. The result is a stronger recurring-order capability with clear rules, less confusion, and better long-term maintainability.
