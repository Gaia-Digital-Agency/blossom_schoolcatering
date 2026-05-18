# Billing and Payment Guide

Last updated: 2026-03-20

## Family and Student Side
- Billing is available from the Family and Student modules.
- Users can review unpaid and paid billing items.
- Payment proof can be uploaded for unpaid bills.
- Uploaded proof stays in review until Admin verifies or rejects it.

## Billing Status Flow
1. `UNPAID`
2. `PENDING_VERIFICATION`
3. `VERIFIED` or `REJECTED`

## What Users Should Do
- Review the billing rows carefully before payment.
- Upload a clear payment proof image.
- Wait for Admin verification.
- Open the receipt when the bill is verified and the receipt is available.

## Admin Side
- Route: `/schoolcatering/admin/billing`
- View proof
- Verify payment
- Reject payment
- Generate or regenerate receipt

## Useful Note
- If proof upload succeeds but receipt is missing, the bill usually still needs verification or receipt generation.
