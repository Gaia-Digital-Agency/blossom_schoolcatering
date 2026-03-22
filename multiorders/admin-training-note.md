# Multi Order Admin Training Note

## What Changed

- Family and Student users can now create grouped recurring meal orders.
- Kitchen and Delivery still work from normal occurrence orders.
- Billing is grouped at the multi-order level instead of showing one bill per occurrence.

## New Admin Surfaces

- `Admin Module > Multi Orders`
- `Admin Module > Billing` now includes grouped multi-order billing rows

## Admin Workflow

1. Open `Admin Multi Orders`.
2. Review the selected group details and future occurrences.
3. If the owner submitted a request:
   - `Approve Delete` trims mutable future occurrences.
   - `Approve Change` trims the old future plan and creates a replacement group.
   - `Reject` closes the request without changes.
4. Verify grouped billing once proof is uploaded.
5. Generate grouped receipt after verification.

## Important Rules

- Started groups are not rewritten in place.
- Delivered, in-delivery, kitchen-completed, and locked occurrences are treated as immutable.
- When future occurrences change, grouped billing total is recalculated.
- New receipts supersede old ones by versioning the grouped receipt record.

## Support Notes

- If grouped proof is missing, do not verify the grouped bill.
- If a parent asks to change a started plan, use the request flow or create a replacement group.
- If future dates need to be removed only, use `Trim Future`.
