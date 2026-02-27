# Apps Inventory

Generated: 2026-02-26

Scope: `apps/` excluding `node_modules`, `.venv`, `*.md`, and `package-lock.json`.

## Summary

- Total files: 77
- Total text/code lines: 9737

### Files by category

| Category | Files | Text/Code Lines |
|---|---:|---:|
| Backend Config | 5 | 146 |
| Backend Source | 15 | 5176 |
| Backend Test | 4 | 147 |
| Database | 1 | 34 |
| Frontend Config | 4 | 53 |
| Frontend Source | 43 | 4132 |
| Frontend Static Asset | 5 | 49 |

## File inventory

| File | Location (from root) | Category | Lines |
|---|---|---|---:|
| eslint.config.mjs | apps/api/eslint.config.mjs | Backend Config | 35 |
| nest-cli.json | apps/api/nest-cli.json | Backend Config | 8 |
| package.json | apps/api/package.json | Backend Config | 74 |
| tsconfig.build.json | apps/api/tsconfig.build.json | Backend Config | 4 |
| tsconfig.json | apps/api/tsconfig.json | Backend Config | 25 |
| app.controller.ts | apps/api/src/app.controller.ts | Backend Source | 24 |
| app.module.ts | apps/api/src/app.module.ts | Backend Source | 22 |
| app.service.ts | apps/api/src/app.service.ts | Backend Source | 8 |
| auth.controller.ts | apps/api/src/auth/auth.controller.ts | Backend Source | 181 |
| auth.module.ts | apps/api/src/auth/auth.module.ts | Backend Source | 10 |
| auth.service.ts | apps/api/src/auth/auth.service.ts | Backend Source | 641 |
| auth.types.ts | apps/api/src/auth/auth.types.ts | Backend Source | 9 |
| jwt-auth.guard.ts | apps/api/src/auth/jwt-auth.guard.ts | Backend Source | 18 |
| roles.decorator.ts | apps/api/src/auth/roles.decorator.ts | Backend Source | 5 |
| roles.guard.ts | apps/api/src/auth/roles.guard.ts | Backend Source | 24 |
| core.controller.ts | apps/api/src/core/core.controller.ts | Backend Source | 535 |
| core.module.ts | apps/api/src/core/core.module.ts | Backend Source | 11 |
| core.service.ts | apps/api/src/core/core.service.ts | Backend Source | 3632 |
| core.types.ts | apps/api/src/core/core.types.ts | Backend Source | 12 |
| main.ts | apps/api/src/main.ts | Backend Source | 44 |
| app.controller.spec.ts | apps/api/src/app.controller.spec.ts | Backend Test | 22 |
| core.service.spec.ts | apps/api/src/core/core.service.spec.ts | Backend Test | 91 |
| app.e2e-spec.ts | apps/api/test/app.e2e-spec.ts | Backend Test | 25 |
| jest-e2e.json | apps/api/test/jest-e2e.json | Backend Test | 9 |
| db.util.ts | apps/api/src/auth/db.util.ts | Database | 34 |
| next-env.d.ts | apps/web/next-env.d.ts | Frontend Config | 5 |
| next.config.mjs | apps/web/next.config.mjs | Frontend Config | 7 |
| package.json | apps/web/package.json | Frontend Config | 21 |
| tsconfig.json | apps/web/tsconfig.json | Frontend Config | 20 |
| dev-page.tsx | apps/web/app/_components/dev-page.tsx | Frontend Source | 96 |
| google-oauth-button.tsx | apps/web/app/_components/google-oauth-button.tsx | Frontend Source | 95 |
| role-login-form.tsx | apps/web/app/_components/role-login-form.tsx | Frontend Source | 72 |
| admin-nav.tsx | apps/web/app/admin/_components/admin-nav.tsx | Frontend Source | 30 |
| page.tsx | apps/web/app/admin/backout-dates/page.tsx | Frontend Source | 15 |
| page.tsx | apps/web/app/admin/billing/page.tsx | Frontend Source | 128 |
| page.tsx | apps/web/app/admin/blackout-dates/page.tsx | Frontend Source | 173 |
| page.tsx | apps/web/app/admin/delivery/page.tsx | Frontend Source | 194 |
| page.tsx | apps/web/app/admin/kitchen/page.tsx | Frontend Source | 15 |
| page.tsx | apps/web/app/admin/login/page.tsx | Frontend Source | 13 |
| page.tsx | apps/web/app/admin/menu/page.tsx | Frontend Source | 234 |
| page.tsx | apps/web/app/admin/page.tsx | Frontend Source | 118 |
| page.tsx | apps/web/app/admin/parents/page.tsx | Frontend Source | 97 |
| page.tsx | apps/web/app/admin/reports/page.tsx | Frontend Source | 114 |
| page.tsx | apps/web/app/admin/schools/page.tsx | Frontend Source | 164 |
| page.tsx | apps/web/app/admin/youngsters/page.tsx | Frontend Source | 153 |
| page.tsx | apps/web/app/dashboard/page.tsx | Frontend Source | 76 |
| page.tsx | apps/web/app/delivery/login/page.tsx | Frontend Source | 13 |
| page.tsx | apps/web/app/delivery/page.tsx | Frontend Source | 120 |
| globals.css | apps/web/app/globals.css | Frontend Source | 518 |
| page.tsx | apps/web/app/home/page.tsx | Frontend Source | 3 |
| kitchen-dashboard.tsx | apps/web/app/kitchen/_components/kitchen-dashboard.tsx | Frontend Source | 167 |
| page.tsx | apps/web/app/kitchen/login/page.tsx | Frontend Source | 13 |
| page.tsx | apps/web/app/kitchen/page.tsx | Frontend Source | 5 |
| page.tsx | apps/web/app/kitchen/today/page.tsx | Frontend Source | 5 |
| page.tsx | apps/web/app/kitchen/tomorrow/page.tsx | Frontend Source | 5 |
| page.tsx | apps/web/app/kitchen/yesterday/page.tsx | Frontend Source | 5 |
| layout.tsx | apps/web/app/layout.tsx | Frontend Source | 18 |
| page.tsx | apps/web/app/login/page.tsx | Frontend Source | 78 |
| page.tsx | apps/web/app/page.tsx | Frontend Source | 80 |
| page.tsx | apps/web/app/parent/login/page.tsx | Frontend Source | 13 |
| page.tsx | apps/web/app/parent/page.tsx | Frontend Source | 1 |
| page.tsx | apps/web/app/parents/page.tsx | Frontend Source | 609 |
| register-form.tsx | apps/web/app/register/_components/register-form.tsx | Frontend Source | 110 |
| page.tsx | apps/web/app/register/delivery/page.tsx | Frontend Source | 11 |
| page.tsx | apps/web/app/register/page.tsx | Frontend Source | 18 |
| page.tsx | apps/web/app/register/parent/page.tsx | Frontend Source | 11 |
| page.tsx | apps/web/app/register/youngsters/page.tsx | Frontend Source | 11 |
| page.tsx | apps/web/app/youngster/login/page.tsx | Frontend Source | 13 |
| page.tsx | apps/web/app/youngster/page.tsx | Frontend Source | 1 |
| page.tsx | apps/web/app/youngsters/page.tsx | Frontend Source | 387 |
| auth.ts | apps/web/lib/auth.ts | Frontend Source | 45 |
| middleware.ts | apps/web/middleware.ts | Frontend Source | 85 |
| hero-meal.jpg | apps/web/public/assets/hero-meal.jpg | Frontend Static Asset | N/A |
| logo.svg | apps/web/public/assets/logo.svg | Frontend Static Asset | 24 |
| robots.txt | apps/web/public/robots.txt | Frontend Static Asset | 5 |
| sitemap.url | apps/web/public/sitemap.url | Frontend Static Asset | 12 |
| sitemap.xml | apps/web/public/sitemap.xml | Frontend Static Asset | 8 |
