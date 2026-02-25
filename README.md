# Blossom School Catering

Creation date: 2026-02-24  
Developed by Gaiada.com (C) 2026  
Repository: `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

## Overview
Blossom School Catering is a mobile-first school meal ordering app for Bali school operations.

- Roles: Parent, Youngster, Admin, Kitchen, Delivery
- Sessions: Lunch, Snack, Breakfast
- Core rule: one meal set per youngster, per session, per day
- Runtime target: GCP VM with Nginx + PM2 + PostgreSQL + GCS assets

## Business Goals
- Fast meal ordering for families.
- Multi-school operations support.
- Parent-to-multiple-youngster management.
- Reliable kitchen and delivery operations.
- Billing visibility and digital receipt readiness.

## Monorepo Structure
- `apps/web`: Next.js frontend
- `apps/api`: NestJS backend
- `packages/types`: shared type package
- `packages/config`: shared baseline config package (placeholder for eslint/prettier/tsconfig presets)
- `docs/*`: planning/spec/runbook/versioning/master-data docs (not runtime code)
- `scripts/create-release-tag.sh`: release tag helper

## Runtime Boundary
- Runtime code: `apps/web`, `apps/api`, `packages/*`
- Documentation/reference: `docs/**`
- Exception: `docs/db/*.sql` are applied manually by operators during DB setup/migration

## Current Runtime (Staging VM)
- URL: `http://34.124.244.233/schoolcatering`
- Frontend process: `schoolcatering-web`
- API process: `schoolcatering-api`
- Database: PostgreSQL on same VM

## Implemented Status (Current)
### 1) Baseline + Infra
- VM path prepared at `/var/www/schoolcatering`
- Nginx route for `/schoolcatering` active
- PM2 processes configured and running
- PostgreSQL connected with schema + auth/session migrations applied
- Shared `.env` and GCS bucket/folder variables integrated
- `robots.txt`, `sitemap.xml`, `sitemap.url` included

### 2) Monorepo + Delivery Workflow
- Root workspace scripts in place:
  - `dev:web`, `dev:api`, `build:web`, `build:api`, `build`
- Local -> GitHub -> Server pull/rebuild/restart workflow validated

### 3) Authentication + Identity
- Role login flows implemented
- JWT + refresh rotation implemented
- Refresh sessions persisted in DB
- Role guard route protection implemented
- Active dev credentials:
  - `admin/admin123`
  - `kitchen/kitchen123`
  - `delivery/delivery123`
  - `parent/parent123`
  - `youngster/youngster123`
- `teameditor` revoked
- Google OAuth flow implemented in code (requires env keys):
  - `GOOGLE_CLIENT_ID`
  - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

### 4) Master Data Templates (Section 5)
Located in `docs/master_data`:
- `schools.json`
- `dish.json`
- `ingredient.json`
- `blackout.json`
- `menu.json`
- `parents.json`
- `kids.json`
- `delivery.json`
- `sample_dataset_v1.json`
- `maste_list_note.md`

## Docs Folder Guide
### `docs/app_run`
- What: runbooks and operational notes
- Why: deployment/access/database procedures
- When: deploy, troubleshoot, credential/access checks
- How: follow before changing VM runtime config

### `docs/db`
- What: SQL migration scripts (`001` to `005`)
- Why: schema and seed consistency
- When: new environment setup or schema updates
- How: apply sequentially on PostgreSQL with rollback discipline

### `docs/master_data`
- What: JSON templates and sample data
- Why: standardized master-data shapes
- When: admin CRUD planning, imports, seed preparation
- How: treat as canonical data templates

### `docs/specifications`
- What: API contract, RBAC matrix, order rules, data model
- Why: implementation contract
- When: building endpoints/pages/tests
- How: code must align to these contracts

### `docs/strategy`
- What: requirements/schema/intake planning artifacts
- Why: planning traceability
- When: product/design review and scope updates
- How: convert approved strategy changes into specs and code

### `docs/versioning`
- What: changelog, contributing, branch protection, commit scopes
- Why: controlled delivery/release workflow
- When: release and governance tasks
- How: follow these docs for process compliance

## Environment Variables (Production/Staging)
Expected core variables:

```env
NODE_ENV=production
DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/<database>
GCS_BUCKET=gda-c1e1-bucket
GCS_FOLDER=blossom-schoolcatering
GCS_PREFIX=gs://gda-c1e1-bucket/blossom-schoolcatering/
CDN_BASE_URL=https://storage.googleapis.com/gda-c1e1-bucket/blossom-schoolcatering/
GOOGLE_CLIENT_ID=<google-oauth-web-client-id>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-web-client-id>
```

## Local Build and Run
```bash
npm install
npm run build
npm run dev:web
npm run dev:api
```

## Server Deploy (Typical)
```bash
ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233
cd /var/www/schoolcatering
git pull origin main
npm run build:api
npm run build:web
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```

## Key Project Files
- `plan.md`: section-by-section implementation checklist
- `progress.md`: dated implementation log
- `docs/app_run/start.md`: operational run/start guidance
- `docs/app_run/access.md`: access rules and role paths
- `docs/app_run/auth_info.md`: auth implementation details
- `docs/app_run/db_infor.md`: database/environment records
- `docs/versioning/CHANGELOG.md`: release changes
- `docs/versioning/CONTRIBUTING.md`: contribution and deployment process
