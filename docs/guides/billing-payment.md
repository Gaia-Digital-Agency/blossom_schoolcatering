# Billing & Payment User Guide

Last updated: 2026-03-09

## Parent Side
- Route: `/schoolcatering/parents/billing`
- View consolidated billing by youngster.
- Select unpaid bills and upload one proof image for batch processing.
- `View Proof Image` now uses authenticated in-app endpoint to support private storage objects.
- Status lifecycle:
  - `UNPAID`
  - `PENDING_VERIFICATION`
  - `VERIFIED`
  - `REJECTED`
- Open receipt once generated and available.

## Admin Side
- Route: `/schoolcatering/admin/billing`
- Review billing rows and proof status.
- `View Proof` uses authenticated proof stream endpoint.
- Use actions:
  - `Verify`
  - `Reject`
  - `Generate Receipt`
  - `Regenerate Receipt`
- Billing status and delivery status are shown together for operational checks.

## Guidance
- If proof upload appears successful but receipt is missing, verify billing is `VERIFIED` and receipt has been generated.
- Receipt/PDF generation depends on storage credential setup in runtime environment.
- Action errors and rejected/unallowed operations are shown inline in bold red for visibility.
