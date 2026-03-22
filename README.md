# Blossom School Catering

Creation date: 2026-02-24  
Last updated: 2026-03-15  
Developed by Gaiada.com (C) 2026  
Repository: `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

## Overview
Blossom School Catering is a role-based school meal ordering platform for Bali operations.

- Roles: `PARENT`, `YOUNGSTER`, `ADMIN`, `KITCHEN`, `DELIVERY`
- Sessions: `LUNCH`, `SNACK`, `BREAKFAST`
- Runtime stack: Next.js + NestJS + PostgreSQL + PM2 + Nginx + GCS

## Current Runtime
- Staging URL: `http://34.158.47.112/schoolcatering`
- Frontend process: `schoolcatering-web`
- API process: `schoolcatering-api`
- API base: `/schoolcatering/api/v1`
- Current deployed branch (staging): `codex/phase1-stack-upgrade`

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
ssh -i ~/.ssh/gda-ce01 azlan@34.158.47.112
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

## DB Migration Guide
Historical SQL migrations live under `docs/db`.

Fresh-install consolidated path:
1. `docs/db/100_baseline_schema_v2.sql`
2. `docs/db/003_views_and_reports.sql`
3. `docs/db/005_auth_runtime_sessions.sql`
4. `docs/db/101_perf_indexes.sql`

Production DB execution runbook:
- `docs/db/production-runbook.md`
