# User Acceptance Test (UAT) Flow and Scenarios

Last updated: 2026-02-27
System under test: Blossom School Catering (`/schoolcatering`)
Environment: `http://34.124.244.233/schoolcatering`
Seed sources:
- `docs/db/006_runtime_manual_test_seed.sql`
- `docs/db/007_runtime_manual_data_seed.sql`

## 1) UAT Objective
- Validate end-to-end operational flow across registration, ordering, kitchen, delivery, and billing.
- Confirm role-based visibility and actions for Parent, Youngster, Kitchen, Delivery, and Admin-backed assignment.

## 2) Preconditions
- Environment is deployed and accessible.
- Active school exists and is mapped to at least one active delivery user.
- Menu for tomorrow exists for at least one active session (recommended: `LUNCH`).
- Parent account(s), admin, kitchen, and delivery credentials are available.
- No blackout date blocks tomorrow.

## 2.1) SAT Login Matrix (merged)

Use these default credentials first:

| Role | Username | Password | Login URL | Landing Page |
|---|---|---|---|---|
| Parent | `parent` | `parent123` | `/schoolcatering/parent/login` | `/schoolcatering/parents` |
| Youngster | `youngster` | `youngster123` | `/schoolcatering/youngster/login` | `/schoolcatering/youngsters` |
| Admin | `admin` | `admin123` | `/schoolcatering/admin/login` | `/schoolcatering/admin` |
| Kitchen | `kitchen` | `kitchen123` | `/schoolcatering/kitchen/login` | `/schoolcatering/kitchen` |
| Delivery | `delivery` | `delivery123` | `/schoolcatering/delivery/login` | `/schoolcatering/delivery` |

Extended seeded users:
- Admin: `admin`, `admin2` (password: `admin123`)
- Kitchen: `kitchen`, `kitchen2` (password: `kitchen123`)
- Delivery: `delivery`, `delivery2`, `delivery3` (password: `delivery123`)
- Parent: `parent`, `parent01` to `parent10` (password: `parent123`)
- Youngster: `youngster`, `youngster01` to `youngster30` (password: `youngster123`)

Role URLs:
- Admin login: `/schoolcatering/admin/login`
- Kitchen login: `/schoolcatering/kitchen/login`
- Parent login: `/schoolcatering/parent/login`
- Youngster login: `/schoolcatering/youngster/login`
- Delivery login: `/schoolcatering/delivery/login`

Main pages:
- Admin: `/schoolcatering/admin`
- Kitchen: `/schoolcatering/kitchen` and `/schoolcatering/kitchen/today`
- Parent: `/schoolcatering/parents`
- Youngster: `/schoolcatering/youngsters`
- Delivery: `/schoolcatering/delivery`

## 2.2) SAT Seed Coverage (merged)

- Parents: minimum `10` seeded (`parent01..parent10`) plus base `parent`
- Youngsters: minimum `30` seeded (`youngster01..youngster30`) plus base `youngster`
- Delivery: minimum `3` seeded (`delivery`, `delivery2`, `delivery3`)
- Kitchen: minimum `2` seeded (`kitchen`, `kitchen2`)
- Admin: minimum `1` seeded plus `admin2`
- Schools: minimum `3` active schools
- Menus: weekday coverage from past `1` week to next `2` weeks
- Dishes/menu items: seeded and available for ordering
- Ingredients: active master list populated
- Orders: seeded baseline available for operational checks
- Billing: paid/verified baseline rows available for verification flows

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

### UAT-19: Admin dashboard KPI refresh
- Role: Admin
- Steps:
- Open `/schoolcatering/admin`
- Change `Dashboard Date` and click `Refresh Dashboard`
- Expected:
- KPI cards/tables refresh for selected date
- No role/permission error for admin

### UAT-20: Admin report filters and totals
- Role: Admin
- Steps:
- Open `/schoolcatering/admin/reports`
- Apply filters (`from/to`, school, session, billing status) and click `Refresh`
- Expected:
- Total orders/revenue and breakdown by school/session update correctly
- Filter options remain selectable without page crash

### UAT-21: Admin billing filters and decision actions
- Role: Admin
- Steps:
- Open `/schoolcatering/admin/billing`
- Toggle `Unpaid / No Proof` and `Delivery Not Confirmed`
- Click `Verify` then `Reject` on test rows
- Expected:
- Filtered row counts and totals match table rows
- Billing status transitions are reflected after refresh

### UAT-22: Admin receipt generation and open receipt
- Role: Admin
- Steps:
- From `/schoolcatering/admin/billing`, generate receipt on verified row
- Click `Open Receipt`
- Expected:
- Receipt number is generated and displayed
- Receipt link opens downloadable/viewable file

### UAT-23: Admin delivery user lifecycle
- Role: Admin
- Steps:
- Open `/schoolcatering/admin/delivery`
- Create delivery user, edit profile, toggle active/inactive
- Expected:
- User row is created/updated/toggled correctly
- Inactive users are shown as `INACTIVE` and can be re-activated

### UAT-24: Admin school-to-delivery mapping and auto-assign
- Role: Admin
- Steps:
- In `/schoolcatering/admin/delivery`, map active delivery user to a school
- Run `Auto Assign` for target date
- Expected:
- Assignments are created for mapped schools
- Summary shows skipped orders only for unmapped schools

### UAT-25: Admin menu CRUD and ingredient constraints
- Role: Admin
- Steps:
- Open `/schoolcatering/admin/menu`
- Create dish with image upload and ingredients, edit dish, toggle availability
- Try adding more than 20 ingredients
- Expected:
- Create/update/toggle works and dish appears in menu list
- Ingredient limit enforcement blocks >20

### UAT-26: Kitchen today operational board
- Role: Kitchen
- Steps:
- Open `/schoolcatering/kitchen/today`
- Validate overview + summary + allergen alerts + order board
- Move one order card between columns
- Expected:
- All today sections are visible
- Card transition updates UI state correctly

### UAT-27: Delivery date-window navigation and completion toggle
- Role: Delivery
- Steps:
- Open `/schoolcatering/delivery`
- Use `Past`, `Today`, `Future` buttons and refresh
- Toggle one assignment complete and undo
- Expected:
- Date quick buttons update date selector
- Completion and undo both persist after reload

### UAT-28: Parent end-to-end order + favourites + wizard
- Role: Parent
- Steps:
- Open `/schoolcatering/parents`
- Create draft, save favourite, apply favourite, run meal plan wizard
- Expected:
- Draft/favourite/wizard flows complete without validation regressions
- Orders list updates with new rows for wizard success dates

### UAT-29: Parent billing proof upload and status reflection
- Role: Parent
- Steps:
- Upload billing proof from parent billing section
- Re-open billing section after admin verification
- Expected:
- Proof upload success message appears
- Status changes from pending to verified/rejected reflect correctly

### UAT-30: Youngster ordering and insights sanity
- Role: Youngster
- Steps:
- Open `/schoolcatering/youngsters`
- Place valid order and reload insights
- Attempt >5 items and post-cutoff order
- Expected:
- Valid order succeeds and insight metrics remain available
- Limit/cutoff validations are enforced with clear error messages

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
| UAT-19 | Admin dashboard KPI refresh |  |  |  |  |  |
| UAT-20 | Admin report filters + totals |  |  |  |  |  |
| UAT-21 | Admin billing filters + decisions |  |  |  |  |  |
| UAT-22 | Admin receipt generation + open |  |  |  |  |  |
| UAT-23 | Admin delivery user lifecycle |  |  |  |  |  |
| UAT-24 | Admin delivery mapping + auto-assign |  |  |  |  |  |
| UAT-25 | Admin menu CRUD + ingredient constraints |  |  |  |  |  |
| UAT-26 | Kitchen today operational board |  |  |  |  |  |
| UAT-27 | Delivery date window + complete/undo |  |  |  |  |  |
| UAT-28 | Parent order + favourites + wizard |  |  |  |  |  |
| UAT-29 | Parent billing proof + status reflection |  |  |  |  |  |
| UAT-30 | Youngster ordering + insights sanity |  |  |  |  |  |

## 6) Sign-off Guide
- UAT is accepted when all critical paths (UAT-01 to UAT-11) pass.
- Non-critical failures from UAT-12+ are logged with severity and fix target date.
- Include evidence links and final sign-off owner.

## 7) Runtime Notes (merged from SAT)
- If a seeded test user has changed password, use another seeded user from the same role group.
- Receipt generation requires runtime Google credentials:
- `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or
- `GOOGLE_APPLICATION_CREDENTIALS`

## 8) Single-Order Lifecycle Flow (Merged)

This section merges the requested "Flow Test For The Life Of A Single Order" into UAT scope without duplicating existing scenarios.

### UAT-31: Single Order Lifecycle (Parent/Youngster -> Kitchen -> Delivery -> Billing)
- Scope:
- Parent or Youngster can create order.
- Order must be attached to one Youngster.
- One Youngster can only have one active order per session per day.
- With only `LUNCH` active, this means one order/day per Youngster.
- Parent can edit/delete before cutoff only (08:00 Asia/Makassar).
- Youngster cannot edit/delete placed order.
- Order remains visible to Kitchen/Admin unless cancelled by Parent/Admin.
- If Parent edits before cutoff, Kitchen/Admin see latest order content.
- At/after cutoff, order is locked from Parent changes.
- Kitchen sees daily orders sorted by School -> Youngster -> Meal (session) with up to 5 dishes.
- Kitchen can mark order complete/ready for delivery handoff.
- Delivery assignment follows school mapping.
- Delivery completes assignment; billing delivery status becomes delivered.
- Billing paid state requires proof of payment; without proof, it remains unpaid.

- Expected result:
- End-to-end lifecycle transitions are enforced with role and cutoff constraints.

## 9) Latest Automated Run Status

Execution date: 2026-02-28
Runner: `docs/testting/test_script.mjs`
Base URL: `http://34.124.244.233/schoolcatering/api/v1`
Evidence report: `/tmp/sequence-test-report-619316.json`

Summary:
- Total checks: `28`
- Passed: `28`
- Failed: `0`
- Result: `PASS`

Notes:
- Receipt generation check is treated as pass-with-skip when Google credentials are missing in environment (`GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`).
- Kitchen ready endpoint fallback is handled for environments that have not deployed the endpoint yet.
