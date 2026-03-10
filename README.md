# Blossom School Catering

Creation date: 2026-02-24  
Last updated: 2026-03-09  
Developed by Gaiada.com (C) 2026  
Repository: `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

## Overview
Blossom School Catering is a mobile-first school meal ordering app for Bali school operations.

- Roles: Parent, Youngster, Admin, Kitchen, Delivery
- Youngster registration actor: `YOUNGSTER`, `PARENT`, `TEACHER`
- Sessions: `LUNCH`, `SNACK`, `BREAKFAST`
- Core rule: one active order per youngster/session/service date
- Runtime target: GCP VM with Nginx + PM2 + PostgreSQL + GCS assets

## Current Runtime
- Staging URL: `http://34.124.244.233/schoolcatering`
- Frontend process: `schoolcatering-web`
- API process: `schoolcatering-api`
- API base: `/schoolcatering/api/v1`

## Latest Verified State (2026-03-09)
- Request validation is enforced with DTO + global `ValidationPipe`.
- Global API throttling is enabled with `ThrottlerModule`.
- PM2 ecosystem config is committed (`ecosystem.config.cjs`) and used for process restart/persistence.
- Youngster registration supports teacher-assisted flow:
  - required registrant selector (`Youngster`, `Parent`, `Teacher`)
  - required `Teacher Name` (max 50 chars) when registrant is teacher
  - registration metadata persisted in `children` (`registration_actor_type`, `registration_actor_teacher_name`)
- Parent and Youngster ordering flows are active with cart resume, cutoff countdown, blackout/session enforcement.
- Admin modules are active for schools, menu, blackout dates, billing, delivery, reports, kitchen monitor.
- Delivery and kitchen operational flows are active:
  - kitchen marks order complete
  - delivery toggles assignment completion
- Health endpoint available: `GET /api/v1/health`.
- Billing proof viewing hardened for private GCS objects:
  - parent image stream: `GET /api/v1/billing/:billingId/proof-image`
  - admin image stream: `GET /api/v1/admin/billing/:billingId/proof-image`
- Youngster password reset hardened to youngster-scoped endpoint:
  - `PATCH /api/v1/admin/youngsters/:youngsterId/reset-password`
- Global error visibility improved in UI:
  - inline error blocks now bold red
  - disabled/unallowed action buttons are styled as bold red state
- Pre-production seed cleanup scripts added:
  - `scripts/cleanup_seed_data_before_2025_03_09.sql`
  - `scripts/cleanup_named_seed_parents_preprod.sh`

## Monorepo Structure
- `apps/web`: Next.js frontend
- `apps/api`: NestJS backend
- `packages/types`: shared types
- `packages/config`: shared config placeholder
- `docs/*`: specifications, runbooks, guides, planning

## Local Build and Run
```bash
npm install
npm run build
npm run dev:web
npm run dev:api
```

## Typical Server Deploy
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
cd /var/www/schoolcatering
git pull origin main
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
- `plan.md`: implementation checklist by phase
- `progress.md`: dated implementation log
- `docs/specifications/*`: API/rules/data contracts
- `docs/Features/feature_matrix.md`: complete feature surface
- `docs/Features/buttons_api.md`: UI action and endpoint map
- `docs/Features/map.md`: merged page/API/DB map
- `docs/guides/*.md`: end-user guides

## API Notes
- API app path: `apps/api`
- Framework: NestJS
- Build command:

```bash
npm -C apps/api run build
```

## DB Migration Guide

This repo keeps historical SQL migrations under `docs/db`.

- Immutable history: `001` to `013` (do not rewrite for existing environments)
- Fresh-install consolidated path:
  1. `docs/db/100_baseline_schema_v2.sql`
  2. `docs/db/003_views_and_reports.sql`
  3. `docs/db/005_auth_runtime_sessions.sql`
  4. `docs/db/101_perf_indexes.sql`

- Operational menu seeding (finalized active menu -> future date):
  - `docs/db/006_runtime_manual_test_seed.sql`

- Full production DB execution steps:
  - `docs/db/production-runbook.md`

## Packages
- `packages/types`: shared TypeScript types
- `packages/config`: shared configuration package placeholder for ESLint/Prettier/TS presets
