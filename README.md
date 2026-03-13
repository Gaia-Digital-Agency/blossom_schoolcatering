# Blossom School Catering

Creation date: 2026-02-24  
Last updated: 2026-03-10  
Developed by Gaiada.com (C) 2026  
Repository: `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

## Overview
Blossom School Catering is a role-based school meal ordering platform for Bali operations.

- Roles: `PARENT`, `YOUNGSTER`, `ADMIN`, `KITCHEN`, `DELIVERY`
- Sessions: `LUNCH`, `SNACK`, `BREAKFAST`
- Core ordering rule: one active order per youngster/session/service date
- Runtime stack: Next.js + NestJS + PostgreSQL + PM2 + Nginx + GCS

## Current Runtime
- Staging URL: `http://34.124.244.233/schoolcatering`
- Frontend process: `schoolcatering-web`
- API process: `schoolcatering-api`
- API base: `/schoolcatering/api/v1`
- Current deployed branch (staging): `codex/phase1-stack-upgrade`

## Latest Verified State (2026-03-10)
- Request validation enforced via DTO + global `ValidationPipe`.
- Global API throttling enabled (`ThrottlerModule` + guard).
- Health endpoints live:
  - `GET /api/v1/health`
  - `GET /api/v1/ready`
- Billing proof image viewing uses authenticated stream endpoints (parent/admin) for private GCS objects.
- Kitchen flow:
  - marks order complete via `POST /kitchen/orders/:orderId/complete`
  - kitchen and admin-kitchen overview include `Total Orders Complete`
- Delivery flow:
  - auto-assignment by school mapping
  - assignment toggle complete/undo
  - delivery page supports manual service-date picker (`Show Service Date`) in addition to Yesterday/Today/Tomorrow
- Admin delivery flow:
  - `Auto Assignment` kept as single source of truth (duplicate assigned-orders section removed)
  - per-delivery detailed order list shown in auto-assignment table
  - `Show Password` action for delivery users (resets password and shows new value)
- Admin parent flow:
  - `Delete` action available
  - deletion blocked when parent still has active linked youngster(s)
- UI error standard:
  - inline `.auth-error` remains high-contrast red
  - disabled/unallowed actions visibly marked

## Monorepo Structure
- `apps/web`: Next.js frontend
- `apps/api`: NestJS backend
- `packages/types`: shared TypeScript types
- `packages/config`: shared config placeholder
- `docs/*`: architecture, feature, runbook, and guide docs

## Local Build and Run
```bash
npm install
npm run build
npm run dev:web
npm run dev:api
```

Local URLs:
- Web: `http://127.0.0.1:5173/schoolcatering`
- API: `http://127.0.0.1:3000/api/v1`

## Typical Server Deploy
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
cd /var/www/schoolcatering
git pull origin codex/phase1-stack-upgrade
npm run build:api
npm run build:web
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```

## Environment Notes
Expected core variables include:
- `DATABASE_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- GCS variables (`GCS_BUCKET`, folder vars, and credentials)

## Key Documentation
- `progress.md`: dated implementation/deploy log
- `docs/improvements/plan.md`: implementation checklist
- `docs/specifications/*`: API/rules/data contracts
- `docs/Features/feature_matrix.md`: current feature surface
- `docs/Features/buttons_api.md`: UI action to API mapping
- `docs/Features/map.md`: unified page/API/DB map
- `docs/guides/*.md`: role and functional guides

## API Notes
- API path: `apps/api`
- Framework: NestJS
- Build command:

```bash
npm -C apps/api run build
```

## DB Migration Guide
Historical SQL migrations live under `docs/db`.

Fresh-install consolidated path:
1. `docs/db/100_baseline_schema_v2.sql`
2. `docs/db/003_views_and_reports.sql`
3. `docs/db/005_auth_runtime_sessions.sql`
4. `docs/db/101_perf_indexes.sql`

Production DB execution runbook:
- `docs/db/production-runbook.md`

## Packages
- `packages/types`: shared TypeScript types
- `packages/config`: shared configuration package placeholder
