# Billing & Payment User Guide

Last updated: 2026-02-28

## Parent Side
- Route: `/schoolcatering/parents`
- View consolidated billing by youngster.
- Select unpaid bills and upload one proof image for batch processing.
- Status lifecycle:
  - `UNPAID`
  - `PENDING_VERIFICATION`
  - `VERIFIED`
  - `REJECTED`
- Open receipt once generated and available.

## Admin Side
- Route: `/schoolcatering/admin/billing`
- Review billing rows and proof status.
- Use actions:
  - `Verify`
  - `Reject`
  - `Generate Receipt`
  - `Regenerate Receipt`
- Billing status and delivery status are shown together for operational checks.

## Guidance
- If proof upload appears successful but receipt is missing, verify billing is `VERIFIED` and receipt has been generated.
- Receipt/PDF generation depends on storage credential setup in runtime environment.
