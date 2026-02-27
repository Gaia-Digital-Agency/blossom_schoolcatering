# Blossom School Catering

Creation date: 2026-02-24  
Last updated: 2026-02-27  
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

## Latest Verified State (2026-02-26)
- Production SQL runtime fixes applied and deployed for:
  - registration path SQL wrapper issue in auth service
  - core service insert-returning query wrappers
- Duplicate-order collision pressure reduced for repeated tests by expanding menu seed horizon (next 120 weekdays).
- Consolidated QA (39 scenarios):
  - Passed: 27
  - Failed: 12
- Blackout date rule validated:
  - Admin can set blackout
  - parent/youngster order attempt on blackout date returns blocked (`ORDER_BLACKOUT_BLOCKED`)
- Allergen + badge visibility validated:
  - kitchen order view sees allergens
  - admin order/detail views include dietary snapshots
  - parent/youngster badge matrix data visible in admin lists
- Known production gaps still open:
  - missing CRUD endpoints for some admin entities (parent, youngster, ingredient, school create/delete, delivery deactivate/delete, menu delete)
  - receipt generation requires Google credential env to be set on runtime host

## Latest Verified State (2026-02-27)
- API request validation hardening completed:
  - DTO-based body validation added across auth/core controllers
  - global `ValidationPipe` enabled (`whitelist`, `transform`, implicit conversion)
  - request-shape guards reduced in services to keep business-rule checks focused
- Guide system finalized:
  - role guides updated for Admin, Billing, Report, Kitchen, Delivery, Parent, Youngster, Menu
  - `/guide` page now reads markdown from `docs/guides/*` dynamically
  - each guide section shows `Last updated` based on markdown file timestamp
- UAT plan extended and aligned to runtime modules:
  - `UAT-18` to `UAT-30` now cover admin, reports, billing, menu, kitchen, delivery, parent, and youngster critical flows
  - execution template expanded with matching rows through `UAT-30`

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

### 5) Core Module Delivery (Steps 6-9)
- Parent + Youngster + Menu pages are implemented.
- Ordering module implemented (cart, quick reorder, meal plan wizard, favourites, consolidated views).
- Billing module implemented (proof upload, verify/reject, receipt generation, receipt download).
- Delivery module implemented (school mapping, auto-assign, delivery confirmation).
- Kitchen module implemented (`/kitchen/yesterday`, `/kitchen/today`, `/kitchen/tomorrow` with hourly refresh window).
- Admin CMS split into pages:
  - `/admin` dashboard
  - `/admin/menu`
  - `/admin/parents`
  - `/admin/youngsters`
  - `/admin/schools`
  - `/admin/blackout-dates`
  - `/admin/billing`
  - `/admin/delivery`
  - `/admin/kitchen`
  - `/admin/reports`
- Admin school/session controls:
  - Activate/deactivate school
  - Activate/deactivate session (Snack/Breakfast)
  - Lunch forced active by rule

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
- `docs/complementary/test.md`: latest staging deploy + sweep result
- `docs/app_run/start.md`: operational run/start guidance
- `docs/app_run/access.md`: access rules and role paths
- `docs/app_run/auth_info.md`: auth implementation details
- `docs/app_run/db_infor.md`: database/environment records
- `docs/versioning/CHANGELOG.md`: release changes
- `docs/versioning/CONTRIBUTING.md`: contribution and deployment process
- `docs/guides/parents.md`, `docs/guides/youngsters.md`, `docs/guides/delivery.md`, `docs/guides/kitchen.md`: role user guides
- `docs/testting/consolidated_test_report.md`: grouped pass/fail QA status
- `docs/testting/test_login_matrix.md`: seeded-role login matrix for test runs
