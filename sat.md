# SAT - Staging Acceptance Testing Login Sheet

Date: 2026-02-26  
Environment: `http://34.124.244.233/schoolcatering`  
Seed sources:
- `docs/db/006_runtime_manual_test_seed.sql`
- `docs/db/007_runtime_manual_data_seed.sql`

## 1) Core Login (quick access)

Use these first:

| Role | Username | Password | Login URL | Landing Page |
|---|---|---|---|---|
| Parent | `parent` | `parent123` | `/schoolcatering/parent/login` | `/schoolcatering/parents` |
| Youngster | `youngster` | `youngster123` | `/schoolcatering/youngster/login` | `/schoolcatering/youngsters` |
| Admin | `admin` | `admin123` | `/schoolcatering/admin/login` | `/schoolcatering/admin` |
| Kitchen | `kitchen` | `kitchen123` | `/schoolcatering/kitchen/login` | `/schoolcatering/kitchen` |
| Delivery | `delivery` | `delivery123` | `/schoolcatering/delivery/login` | `/schoolcatering/delivery` |

## 2) Full Seeded Login Set (many users)

The 007 seed reuses base password hashes from default runtime users.

### Admin users
- `admin` / `admin123`
- `admin2` / `admin123`

### Kitchen users
- `kitchen` / `kitchen123`
- `kitchen2` / `kitchen123`

### Delivery users
- `delivery` / `delivery123`
- `delivery2` / `delivery123`
- `delivery3` / `delivery123`

### Parent users
- `parent` / `parent123`
- `parent01` to `parent10` / `parent123`

### Youngster users
- `youngster` / `youngster123`
- `youngster01` to `youngster30` / `youngster123`

## 3) Role URLs

- Admin login: `/schoolcatering/admin/login`
- Kitchen login: `/schoolcatering/kitchen/login`
- Parent login: `/schoolcatering/parent/login`
- Youngster login: `/schoolcatering/youngster/login`
- Delivery login: `/schoolcatering/delivery/login`

## 4) Main pages to check after login

- Admin: `/schoolcatering/admin`
- Kitchen: `/schoolcatering/kitchen` and `/schoolcatering/kitchen/today`
- Parent: `/schoolcatering/parents`
- Youngster: `/schoolcatering/youngsters`
- Delivery: `/schoolcatering/delivery`

## 5) Seed data coverage (for testing)

- Parents: minimum `10` seeded (`parent01..parent10`) plus base `parent`.
- Youngsters: minimum `30` seeded (`youngster01..youngster30`) plus base `youngster`.
- Delivery: minimum `3` seeded (`delivery`, `delivery2`, `delivery3`).
- Kitchen: minimum `2` seeded (`kitchen`, `kitchen2`).
- Admin: minimum `1` seeded, plus extra `admin2`.
- Schools: minimum `3` active schools.
- Menus: weekday coverage from past `1` week to next `2` weeks, all sessions active.
- Dishes/menu items: seeded and available for ordering.
- Ingredients: master list populated to at least `201` active rows.
- Orders: minimum `50` total.
- Delivered: minimum `25`.
- Paid/verified billing records: minimum `10`.

## 6) Notes

- If a specific user was used for previous tests and has changed password, use another seeded user from the same role list above.
- Receipt generation requires Google credential env on server:
  - `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or
  - `GOOGLE_APPLICATION_CREDENTIALS`
