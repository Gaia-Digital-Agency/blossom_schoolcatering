# Blossom School Catering

Creation date: 2026-02-24  
Last updated: 2026-02-28  
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

## Latest Verified State (2026-02-28)
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
- `docs/Features/full_feature_matrix.md`: complete feature surface
- `docs/Features/buttons.md`: UI action and endpoint map
- `docs/Features/map.md`: merged page/API/DB map
- `docs/guides/*.md`: end-user guides
