# Staging Test Sweep

Date: 2026-02-26
Target: `http://34.124.244.233/schoolcatering`
Runner: via SSH on staging VM (`127.0.0.1`) after deploy

## Scope
- Deploy verification (API + Web build + PM2 restart)
- Page availability sweep for requested module pages
- API route sweep across auth + core routes

## Deploy Result
- `git pull origin main` on server: success
- `npm run build:api`: success
- `npm run build:web`: success
- `pm2 restart schoolcatering-api`: success
- `pm2 restart schoolcatering-web`: success

## Page Sweep Results
- PASS `200`: `/home`, `/parent`, `/youngster`, `/delivery`, `/kitchen`, `/admin`, `/admin/menu`, `/admin/parents`, `/admin/youngsters`, `/admin/schools`, `/admin/blackout-dates`, `/admin/billing`, `/admin/delivery`, `/admin/kitchen`
- Redirect expected: `/` -> `308` canonical path, `/login` -> `307` when already authenticated

## API Sweep Results
Method-level sweep executed for all controller routes in:
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/core/core.controller.ts`

Result summary:
- PASS (2xx): all health/read flows and valid admin/session/blackout/menu/report/delivery/list routes
- Expected 4xx on dummy IDs / missing domain records: validation and not-found routes (`400`/`404`)
- FAIL (5xx): `0`

Sample critical checks:
- `GET /api/v1/auth/me` -> `200`
- `GET /api/v1/admin/dashboard?date=2026-02-26` -> `200`
- `GET /api/v1/admin/session-settings` -> `200`
- `PATCH /api/v1/admin/session-settings/SNACK` -> `200`
- `GET /api/v1/menus?service_date=2026-02-26&session=LUNCH` -> `200`
- `GET /api/v1/kitchen/daily-summary?date=2026-02-26` -> `200`
- `POST /api/v1/blackout-days` -> `201`

## Notes
- This sweep validates route availability, auth, and non-5xx behavior.
- Some business endpoints require real linked data (parent-child/order/billing IDs), so dummy-ID calls are expected to return `400`/`404`.
