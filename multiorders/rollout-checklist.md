# Multi Order Rollout Checklist

## Pre-Deploy

- Confirm `apps/api` build passes.
- Confirm `apps/web` build passes.
- Confirm targeted multi-order unit tests pass.
- Confirm Google Cloud Storage credentials exist for grouped receipt and proof uploads.
- Confirm `receipt_number_seq` exists in the target database.
- Confirm Family, Student, and Admin roles can access the new multi-order routes.

## Database Readiness

- Restart API once in staging so runtime schema guards create the multi-order tables and columns.
- Verify `multi_order_groups` exists.
- Verify `multi_order_occurrences` exists.
- Verify `multi_order_billings` exists.
- Verify `multi_order_receipts` exists.
- Verify `multi_order_change_requests` exists.
- Verify `orders.source_type` exists and defaults to `SINGLE`.
- Verify `orders.multi_order_group_id` exists.

## Functional Verification

- Create one Family multi order.
- Create one Student multi order.
- Verify grouped billing row appears in Family billing.
- Upload grouped proof from Family or Student billing.
- Verify grouped billing from Admin billing.
- Generate grouped receipt from Admin billing or Admin multiorders.
- Submit one post-start owner request.
- Resolve one request from Admin multiorders.
- Confirm kitchen and delivery still read occurrence orders normally.

## Go Live

- Announce feature availability to Family, Student, and Admin users.
- Share admin training note with operations staff.
- Run the client demo script once against staging or production-like data.
- Monitor API logs for `MULTI_ORDER_*` actions and failed grouped receipt uploads.
