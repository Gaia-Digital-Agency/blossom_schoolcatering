# SAT - Staging Acceptance Testing Login Sheet

Date: 2026-02-26
Environment: `http://34.124.244.233/schoolcatering`
Seed source: `docs/db/006_runtime_manual_test_seed.sql`

## 1) Test Login Credentials

### Admin
- Username: `admin`
- Password: `admin123`
- Login URL: `/schoolcatering/admin/login`
- Main pages:
  - `/schoolcatering/admin`
  - `/schoolcatering/admin/menu`
  - `/schoolcatering/admin/parents`
  - `/schoolcatering/admin/youngsters`
  - `/schoolcatering/admin/schools`
  - `/schoolcatering/admin/blackout-dates`
  - `/schoolcatering/admin/billing`
  - `/schoolcatering/admin/delivery`
  - `/schoolcatering/admin/reports`
  - `/schoolcatering/admin/kitchen`

### Parent
- Username: `parent`
- Password: `parent123`
- Login URL: `/schoolcatering/parent/login` (or `/schoolcatering/login` with role `PARENT`)
- Main page: `/schoolcatering/parents`

### Youngster
- Username: `youngster`
- Password: `youngster123`
- Login URL: `/schoolcatering/youngster/login` (or `/schoolcatering/login` with role `YOUNGSTER`)
- Main page: `/schoolcatering/youngsters`

### Delivery
- Username: `delivery`
- Password: `delivery123`
- Login URL: `/schoolcatering/delivery/login`
- Main page: `/schoolcatering/delivery`

### Kitchen
- Username: `kitchen`
- Password: `kitchen123`
- Login URL: `/schoolcatering/kitchen/login`
- Main pages:
  - `/schoolcatering/kitchen`
  - `/schoolcatering/kitchen/yesterday`
  - `/schoolcatering/kitchen/today`
  - `/schoolcatering/kitchen/tomorrow`

## 2) Seeded Test Data (for manual E2E)

- School: `Blossom Test School`
- Service date used in seed: `2026-03-02`
- Seeded menu items:
  - `QA Youngster Lunch Bowl` (IDR 32,000)
  - `QA Youngster Snack Pack` (IDR 18,000)
  - `QA Youngster Breakfast Plate` (IDR 25,000)
- Parent <-> Youngster link created
- Allergy profile seeded with fallback: `No Allergies`
- Billing record created for seeded order
- Delivery school mapping created (delivery user assigned to school)
- Delivery assignment created for seeded order
- Session settings ensured active for all sessions

### Seed IDs captured during run
- Parent profile ID: `8221b1f0-6f81-4100-bb86-4f5bd65c6670`
- Youngster profile ID: `711d8c4a-8965-4185-89cc-586ec21074ab`
- School ID: `f02be904-9d4d-46b7-8616-bc6aaaf35347`
- Order ID: `bb5e901e-c135-48cf-8e5c-5b5a8f689cde`
- Billing ID: `efe73b3d-f256-431e-b17c-801e31d29e65`

## 3) Verified API checks after seed (200)

- `GET /api/v1/children/me` (youngster)
- `GET /api/v1/youngsters/me/insights?date=2026-03-02` (youngster)
- `GET /api/v1/parents/me/children/pages` (parent)
- `GET /api/v1/billing/parent/consolidated` (parent)
- `GET /api/v1/parents/me/orders/consolidated` (parent)
- `GET /api/v1/parents/me/spending-dashboard?month=2026-03` (parent)
- `GET /api/v1/menus?service_date=2026-03-02&session=LUNCH` (parent)
- `GET /api/v1/delivery/assignments?date=2026-03-02` (delivery)
- `GET /api/v1/admin/billing` (admin)

## 4) Quick Manual E2E Script

1. Login as Parent -> `/parents`:
- confirm linked youngster visible
- load menu for `2026-03-02`
- place/update/delete order before cutoff
- upload payment proof

2. Login as Admin -> `/admin/billing`:
- verify payment
- generate receipt

3. Login as Admin -> `/admin/delivery`:
- confirm school mapping exists
- run auto-assign if needed

4. Login as Delivery -> `/delivery`:
- confirm assignment visible for date
- mark complete

5. Login as Kitchen -> `/kitchen/today`:
- verify totals/allergen/order list reflect seeded + test orders
