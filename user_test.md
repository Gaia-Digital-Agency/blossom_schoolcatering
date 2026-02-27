# User Acceptance Test (UAT) Flow and Scenarios

Last updated: 2026-02-27
System under test: Blossom School Catering (`/schoolcatering`)

## 1) UAT Objective
- Validate end-to-end operational flow across registration, ordering, kitchen, delivery, and billing.
- Confirm role-based visibility and actions for Parent, Youngster, Kitchen, Delivery, and Admin-backed assignment.

## 2) Preconditions
- Environment is deployed and accessible.
- Active school exists and is mapped to at least one active delivery user.
- Menu for tomorrow exists for at least one active session (recommended: `LUNCH`).
- Parent account(s), admin, kitchen, and delivery credentials are available.
- No blackout date blocks tomorrow.

## 3) Core UAT Flow (Requested)

### UAT-01: Register one youngster to one parent
- Role: Parent/Registration flow
- Steps:
- Open `/schoolcatering/register/youngsters`
- Fill required youngster + parent fields
- Submit registration
- Expected:
- Registration succeeds
- Youngster is linked to one parent
- Login credentials are returned/generated per flow

### UAT-02: Register one youngster to two parents
- Role: Registration + admin/data setup path
- Steps:
- Register youngster with Parent A
- Link same youngster to Parent B through supported linkage flow/data setup
- Login as Parent A and Parent B
- Expected:
- Same youngster appears under both linked parents
- Both parents can view youngster-scoped orders/billing data according to permissions

### UAT-03: Make 1 order with 1 dish for tomorrow
- Role: Parent or Youngster
- Steps:
- Open Parent/Youngster order page
- Set service date = tomorrow, choose session
- Add 1 dish, place order
- Expected:
- Order created successfully
- Order shows 1 dish and correct total

### UAT-04: Make 1 order with 2 dishes for tomorrow
- Role: Parent or Youngster
- Steps:
- Create order for tomorrow/session with 2 dishes
- Submit
- Expected:
- Order created successfully
- Quantity/price totals are correct

### UAT-05: Make 1 order with 5 dishes for tomorrow
- Role: Parent or Youngster
- Steps:
- Create order for tomorrow/session with 5 dishes
- Submit
- Expected:
- Order created successfully
- Limit of 5 dishes is accepted

### UAT-06: Delivery is assigned based on school
- Role: Admin/assignment rule
- Steps:
- Confirm delivery-school mapping for youngster’s school
- Trigger assignment flow for tomorrow orders
- Expected:
- Orders from that school are assigned to mapped delivery user
- Unmapped school orders are not shown to unrelated delivery users

### UAT-07: Delivery completes order
- Role: Delivery
- Steps:
- Login `/schoolcatering/delivery/login`
- Open assigned order and click `Mark Complete`
- Expected:
- Assignment status updates to delivered/completed
- Delivery status on related order/billing reflects completion

### UAT-08: Kitchen sees the 3 orders
- Role: Kitchen
- Steps:
- Login `/schoolcatering/kitchen/login`
- Open `/schoolcatering/kitchen/tomorrow`
- Expected:
- Overview totals include all created tomorrow orders
- Summary table shows dish aggregates from those orders

### UAT-09: Delivery sees assigned orders
- Role: Delivery
- Steps:
- Open delivery page for tomorrow
- Expected:
- Delivery user sees only assigned orders for mapped schools
- Orders are grouped correctly by school

### UAT-10: Parent sees billing
- Role: Parent
- Steps:
- Open `/schoolcatering/parents`
- Check consolidated billing section for the youngster
- Expected:
- Billing rows exist for placed orders
- Status is visible (e.g., unpaid/pending verification/verified)

### UAT-11: Parent uploads proof of payment
- Role: Parent
- Steps:
- Select a billing row
- Upload/submit payment proof
- Expected:
- Upload succeeds
- Billing status changes to pending verification
- Admin billing page shows the proof for review

## 4) Additional Useful Scenarios

### UAT-12: Max dish constraint enforcement
- Try adding 6th dish in a single cart/order.
- Expected: system blocks the 6th item and keeps max at 5.

### UAT-13: Blackout date enforcement
- Set blackout date for tomorrow and attempt new order.
- Expected: order is blocked with blackout rule message.

### UAT-14: Session activation enforcement
- Disable `SNACK` or `BREAKFAST` in admin settings and attempt order for disabled session.
- Expected: order is blocked for disabled session.

### UAT-15: Kitchen board behavior (Today)
- Open `/schoolcatering/kitchen/today` and move order from Pending to Completed.
- Expected: order card moves between columns correctly.

### UAT-16: Kitchen view behavior (Yesterday/Tomorrow)
- Open `/kitchen/yesterday` and `/kitchen/tomorrow`.
- Expected: page shows top actions + Overview + Summary only (no Allergen Alerts, no Orders board).

### UAT-17: Billing verify and receipt generation
- Admin verifies pending proof, then generates receipt.
- Expected: billing status updates to verified; receipt record/link is returned.

### UAT-18: Role protection and redirects
- Access role-restricted route without proper role/auth.
- Expected: redirected/blocked according to auth rules.

## 5) Execution Template

Use this table during UAT run:

| ID | Scenario | Tester | Date | Result (PASS/FAIL) | Evidence (screenshot/link) | Notes |
|---|---|---|---|---|---|---|
| UAT-01 | Register one youngster to one parent |  |  |  |  |  |
| UAT-02 | Register one youngster to two parents |  |  |  |  |  |
| UAT-03 | Order 1 dish for tomorrow |  |  |  |  |  |
| UAT-04 | Order 2 dishes for tomorrow |  |  |  |  |  |
| UAT-05 | Order 5 dishes for tomorrow |  |  |  |  |  |
| UAT-06 | School-based delivery assignment |  |  |  |  |  |
| UAT-07 | Delivery completes order |  |  |  |  |  |
| UAT-08 | Kitchen sees the 3 orders |  |  |  |  |  |
| UAT-09 | Delivery sees assigned orders |  |  |  |  |  |
| UAT-10 | Parent sees billing |  |  |  |  |  |
| UAT-11 | Parent uploads proof |  |  |  |  |  |
| UAT-12 | Max dish constraint |  |  |  |  |  |
| UAT-13 | Blackout enforcement |  |  |  |  |  |
| UAT-14 | Session activation enforcement |  |  |  |  |  |
| UAT-15 | Kitchen board move (today) |  |  |  |  |  |
| UAT-16 | Kitchen yesterday/tomorrow layout |  |  |  |  |  |
| UAT-17 | Billing verify + receipt |  |  |  |  |  |
| UAT-18 | Role protection/redirect |  |  |  |  |  |

## 6) Sign-off Guide
- UAT is accepted when all critical paths (UAT-01 to UAT-11) pass.
- Non-critical failures from UAT-12+ are logged with severity and fix target date.
- Include evidence links and final sign-off owner.
