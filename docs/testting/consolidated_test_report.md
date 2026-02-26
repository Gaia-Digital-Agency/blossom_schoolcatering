# Consolidated Test Report

Generated: 2026-02-26  
Scope: grouped functional + CRUD + billing + blackout + allergen/badge coverage

## Summary
- Total scenarios executed: `39`
- Passed: `27`
- Failed: `12`
- Areas covered: `Admin`, `Kitchen`, `Delivery`, `Parent`, `Youngster`, `Menu`, `Billing`

## Admin
- `PASS` Order Create
- `PASS` Order Read
- `PASS` Order Update
- `PASS` Order Delete (soft delete)
- `PASS` Blackout Date Create
- `PASS` Blackout Date Read
- `PASS` Blackout Date Update
- `PASS` Blackout Date Delete
- `PASS` School Read
- `PASS` School Update (active/inactive toggle)
- `PASS` Admin sees allergen snapshot in order checks
- `PASS` Admin sees badge tiers in parent/youngster listing context (`NONE`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`)
- `FAIL` School Create (endpoint missing)
- `FAIL` School Delete (endpoint missing)

## Kitchen
- `PASS` Kitchen daily summary load (`200`)
- `PASS` Kitchen sees newly created orders
- `PASS` Kitchen sees allergen fields in order view
- `PASS` Kitchen session breakdown available (Lunch/Snack/Breakfast)
- `FAIL` Kitchen explicit `mark ready` endpoint not available in tested API set
- `FAIL` Kitchen order-tag PDF generation endpoint not available in tested API set

## Delivery
- `PASS` Delivery Create
- `PASS` Delivery Read/list
- `PASS` Delivery Update (school assignment)
- `PASS` Delivery flow receives kitchen-ready orders in assignment queries
- `FAIL` Delivery deactivate/delete endpoint missing

## Parent
- `PASS` Parent register/create
- `PASS` Parent login/logout/login sequence
- `PASS` Parent can place order (single child)
- `PASS` Parent can place order (multi-child)
- `PASS` Parent invoice and billing summary visible
- `PASS` Parent bill paid/unpaid split visible
- `FAIL` Parent profile update endpoint missing
- `FAIL` Parent delete endpoint missing
- `PASS` Parent order on blackout date is blocked (`ORDER_BLACKOUT_BLOCKED`)
- `PASS` Parent allergen input is reflected in kitchen/admin downstream views

## Youngster
- `PASS` Youngster register/create
- `PASS` Youngster self-order creation
- `PASS` Youngster bill visibility
- `PASS` Youngster allergen input is reflected in kitchen/admin downstream views
- `FAIL` Youngster profile update endpoint missing
- `FAIL` Youngster delete endpoint missing
- `PASS` Youngster order on blackout date is blocked (`ORDER_BLACKOUT_BLOCKED`)

## Menu
- `PASS` Dish/Menu Create
- `PASS` Dish/Menu Read
- `PASS` Dish/Menu Update
- `PASS` Ingredient Read (master list populated)
- `PASS` Seeded menu horizon expanded to support repeated test runs
- `FAIL` Dish/Menu Delete endpoint missing
- `FAIL` Ingredient Create endpoint missing
- `FAIL` Ingredient Update endpoint missing
- `FAIL` Ingredient Delete endpoint missing

## Billing
- `PASS` Parent billing contains tested orders
- `PASS` Admin billing contains same tested orders
- `PASS` Admin verify billing (`201`)
- `PASS` Parent receipt/invoice visibility flow is available
- `FAIL` Receipt generation/download requires missing Google credential env on server runtime

## Failure Classification
- `10` failures are missing API CRUD/feature endpoints.
- `1` failure is environment configuration (`GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`).
- `1` failure is missing kitchen operational endpoint coverage (ready/PDF operation endpoint).

## Evidence Scripts
- `docs/testting/test_script.mjs`
- `docs/testting/admin_crud_test.mjs`
- `docs/testting/extra_kitchen_billing_test.mjs`
- `docs/testting/allergen_badge_test.mjs`
- `docs/testting/consolidated_runner.mjs`
