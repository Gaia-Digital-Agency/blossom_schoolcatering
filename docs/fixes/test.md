# Staging Test Sweep

Date: 2026-02-26  
Target: `http://34.124.244.233/schoolcatering`  
Runner: API/scripted validation on staging

## Scope
- Deploy verification (API + Web build + PM2 restart)
- Auth and role-path access checks
- Grouped functional checks: Admin, Kitchen, Delivery, Parent, Youngster, Menu, Billing
- Blackout-date enforcement
- Allergen and badge visibility propagation

## Deployment Status
- `git pull origin main`: success
- `npm run build:api`: success
- `npm run build:web`: success
- `pm2 restart schoolcatering-api`: success
- `pm2 restart schoolcatering-web`: success

## Runtime/API Stability
- Health and dashboard endpoints return success (`2xx`) for valid requests.
- Expected `4xx` returned for invalid/missing domain references.
- Critical previous SQL wrapper issues in auth/core registration/order flows were fixed and redeployed.
- No blocker `5xx` observed in standard read/list validation paths after fixes.

## Consolidated Scenario Outcome
- Total scenarios: `39`
- Passed: `27`
- Failed: `12`
- Detailed grouped results:
  - `docs/testting/consolidated_test_report.md`

## Key Functional Verifications
- Parent and youngster orders are blocked on blackout date (`2026-03-19`) with `ORDER_BLACKOUT_BLOCKED`.
- Kitchen can see allergen data in incoming order views.
- Admin can see dietary/allergen snapshot and badge tiers in management flows.
- Duplicate-order collision pressure reduced by expanding seeded menu/service-date coverage.

## Known Open Gaps
- Missing CRUD endpoints for some entities (parent, youngster, school create/delete, ingredient CRUD, menu delete, delivery deactivate/delete).
- Receipt generation requires Google credential env in runtime (`GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`).
