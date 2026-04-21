# Blossom School Catering

Creation date: 2026-02-24  
Last updated: 2026-04-21  
Developed by Gaiada.com (C) 2026  
Repository: `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

## Overview
Blossom School Catering is a role-based school meal ordering platform for Bali operations.

- Roles: `PARENT`, `YOUNGSTER`, `ADMIN`, `KITCHEN`, `DELIVERY`
- Sessions: `LUNCH`, `SNACK`, `BREAKFAST`
- Runtime stack: Next.js + NestJS + PostgreSQL + PM2 + Nginx + GCS

## Current Runtime
- Public URL: `https://blossomcatering.online/` (→ `https://schoolcatering.gaiada1.online`)
- API base: `https://schoolcatering.gaiada1.online/api/v1`
- Server: `gda-ce01` (34.158.47.112)
- Path: `/var/www/schoolcatering`
- Frontend process: `schoolcatering-web` (pm2)
- API process: `schoolcatering-api` (pm2)
- Active branch: `main`

## Current State
- Family membership is modeled with `family_id` on `parents` and `children`.
- Parent, secondary parent, and youngster family support flows resolve against server-side `family_id`, not surname matching.
- Brian/OpenClaw support uses:
  - `GET /admin/family-context?phone=PHONE`
  - `GET /admin/family-orders?phone=PHONE&date=YYYY-MM-DD`
- Admin family repair supports:
  - `POST /admin/families/merge`
- **WhatsApp registration (via Brian)** — parents can register their family entirely through WhatsApp without the web UI:
  - `POST /auth/register/youngsters` — called by Brian on user confirmation
  - `GET /auth/register/schools` — live school list (no hardcoded IDs in Brian)
  - See `docs/short_guide.md` for the welcome message Brian sends on registration intent
  - Seed schools: only `Bali Island School` and `Sanur Independent School` are active
- **Dev-only test endpoints** (ADMIN role required):
  - `POST /auth/dev/test-registration` — creates a synthetic registration with phone `+620000099991`, email `regtest@blossom.invalid`
  - `DELETE /auth/dev/test-registration` — hard-deletes that synthetic data

## Repository Structure
- `apps/web`: Next.js frontend
- `apps/api`: NestJS backend
- `packages/types`: shared TypeScript types
- `packages/config`: shared config placeholder
- `docs`: architecture, runbooks, guides, and feature docs

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
ssh 34.158.47.112
cd /var/www/schoolcatering
git pull --ff-only origin main
npm -C apps/api run build
npm -C apps/web run build
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```

For API-only changes:

```bash
ssh 34.158.47.112
cd /var/www/schoolcatering
git pull --ff-only origin main
npm -C apps/api run build
pm2 restart schoolcatering-api
```

## Environment Notes
Expected core variables include:
- `DATABASE_URL`
- `AUTH_JWT_SECRET`
- `AUTH_JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- GCS variables (`GCS_BUCKET`, folder vars, and credentials)

## Feature Documentation
Feature behavior, UI actions, routes, and API/data mapping are maintained in `docs/features`:

- [inventory.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/inventory.md): source inventory and file growth map
- [feature_matrix.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/feature_matrix.md): current feature surface by module
- [button_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/button_api.md): button-triggered actions and endpoint mapping
- [links_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/links_api.md): public links, routes, aliases, and redirects
- [map_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/map_api.md): non-button API map, backend connections, and data relationships
- [architecture.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/architecture.md): architecture notes
- [auto_refresh.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/auto_refresh.md): refresh behavior
- [files_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/files_api.md): file/image handling notes
- [points_calcs.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/points_calcs.md): points and calculation rules

Project planning and broader notes remain outside `docs/features`:
- `progress.md`
- `docs/improvements/plan.md`
- `docs/specifications/*`
- `docs/guides/*.md`
- `docs/db/*`

## API Build
```bash
npm -C apps/api run build
```

## Family Support Notes
- `family_id` is the canonical family grouping key.
- `parent_children` is still present for compatibility, but family-scoped support and Brian-facing reads should use `family_id`.
- `parent2_*` fields are metadata only; they are not the primary authorization model.
- Do not use surnames to infer family membership.

## DB Migration Guide
Historical SQL migrations live under `docs/db`.

Fresh-install consolidated path:
1. `docs/db/100_baseline_schema_v2.sql`
2. `docs/db/003_views_and_reports.sql`
3. `docs/db/005_auth_runtime_sessions.sql`
4. `docs/db/101_perf_indexes.sql`

Production DB execution runbook:
- `docs/db/production-runbook.md`
