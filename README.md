# Blossom School Catering

Creation date: 2026-02-24  
Developed by Gaiada.com (C) 2026  
Repository: `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

## App Overview
Blossom School Catering is a mobile-first school meal ordering web app for Bali-based school operations.  
Primary roles: Parent, Youngster, Admin, Kitchen, Delivery.

Core sessions:
- Lunch
- Snack
- Breakfast

## Current Runtime (Staging VM)
- URL: `http://34.124.244.233/schoolcatering`
- Runtime: Nginx + PM2 multi-site
- Frontend: Next.js (`apps/web`)
- API: NestJS (`apps/api`)
- DB: PostgreSQL on VM

## Implemented Status (Current)
### 1) Baseline + Infra
- VM deployment completed
- Nginx routing completed for `/schoolcatering`
- PM2 app processes active (`schoolcatering-web`, `schoolcatering-api`)
- PostgreSQL connected and migrations applied

### 2) Monorepo + Delivery Flow
- Monorepo structure active (`apps/web`, `apps/api`, `packages/*`)
- Root build/dev scripts available
- Server-first deployment flow validated (local -> GitHub -> server pull/rebuild/restart)

### 3) Authentication + Identity
- JWT access + refresh rotation
- DB-backed refresh sessions
- Role-gated route access with role-specific login pages:
  - `/admin/login`
  - `/kitchen/login`
  - `/delivery/login`
  - `/parent/login`
  - `/youngster/login`
- Active credential set:
  - `admin/admin123`
  - `kitchen/kitchen123`
  - `delivery/delivery123`
  - `parent/parent123`
  - `youngster/youngster123`
- `teameditor` revoked
- Google OAuth (id token verify flow) implemented in code
  - Requires env setup: `GOOGLE_CLIENT_ID` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

### 4) Section 5 Master Data (Template Layer Complete)
Prepared master-data templates for:
- Schools
- Dish
- Ingredient
- Blackout
- Menu
- Parents details
- Kids details
- Delivery details

Files in `docs/templates/master-data`:
- `schools.json`
- `dish.json`
- `ingredient.json` (with category field for dropdown filtering)
- `blackout.json`
- `menu.json`
- `parents.json`
- `kids.json`
- `delivery.json`
- `maste_list_note.md`

## Notes
- This repository currently includes both implemented runtime features and template/data specification files for subsequent module build phases.
- For detailed execution order and section tracking, use `plan.md`.
