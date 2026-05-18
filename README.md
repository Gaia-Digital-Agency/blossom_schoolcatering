# Blossom School Catering

Role-based school meal ordering platform for Bali schools — parents/students order on the web, admin manages menus and billing, kitchen prepares, delivery dispatches. Parents can also register, order, cancel, and check orders via WhatsApp through Brian (OpenClaw bot).

Live on:

- **https://schoolcatering.gaiada2.online** (primary)
- **https://blossomcatering.online** (apex)
- **https://www.blossomcatering.online** (www)

All three resolve to `34.2.143.47` (gda-pn01) and share the same nginx vhost + Let's Encrypt cert.

---

## Overview

- **Roles:** `PARENT`, `YOUNGSTER` (student), `ADMIN`, `KITCHEN`, `DELIVERY`
- **Sessions:** `LUNCH`, `SNACK`, `BREAKFAST` (current operational session is `LUNCH`)
- **Stack:** Next.js 14 (App Router) · NestJS 11 · PostgreSQL 18.3 · PM2 · nginx · GCS · Vertex Gemini
- **Hosting:** GCP `gda-pn01.asia-southeast1-b` (`34.2.143.47`)
- **Repo:** `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

---

## Features

### Parent / Student
- Web ordering for lunch/snack/breakfast with cart, edit, cancel, quick-reorder, favourites
- Family-grouped accounts (`family_id` as canonical key) — secondary parent and youngster all resolve against server-side `family_id`, never surname matching
- Consolidated order views, billing views, receipt download, payment-proof upload
- Multi-order (bulk/recurring) flows
- WhatsApp registration + ordering via Brian (see [AI Agents](#ai-agents))

### Admin
- Dashboards (orders, revenue, parent/student spending, print reports)
- Schools CRUD, menu CRUD (items + ingredients + dietary flags), blackout days
- Parents/Youngsters management — view, edit, reset password, soft delete
- Family repair (`POST /admin/families/merge`, reassign student to different parent group)
- Site settings (hero image, session toggles, tagline) + audit log
- Billing review — verify proofs, generate receipts, revert
- Login lockout toggle (zero-downtime maintenance, see [Operations](#operations))

### Kitchen
- Yesterday / Today / Tomorrow / Select-Date order cards with student grade visible
- CSV + PDF daily order export
- One-click completion toggle per order

### Delivery
- Per-school assignment + auto-assign
- Delivery completion toggle
- Daily notes

---

## Architecture

```
                       ┌────────────────────────┐
                       │  Browser / WhatsApp    │
                       └───────────┬────────────┘
                                   │ HTTPS
                                   ▼
              ┌────────────────────────────────────┐
              │  nginx @ gda-pn01 (:443)           │
              │  TLS · path-aware routing          │
              │  + sc-login-state.conf (toggle)    │
              └─────┬───────────────────┬──────────┘
                    │ /api/v1/*         │ /*
                    ▼                   ▼
        ┌──────────────────────┐   ┌──────────────────────┐
        │ NestJS API @ :3000   │   │ Next.js 14 @ :4173   │
        │ • auth / JWT         │   │ App Router           │
        │ • core facade        │   │ • parent / student   │
        │   + 15 sub-services  │   │ • admin / kitchen    │
        │ • Brian/Gaia bridge  │   │ • delivery / guide   │
        │ • Vertex Gemini      │   └──────────────────────┘
        └──────┬───────────────┘
               │
               ▼
   ┌──────────────────┐   ┌──────────────────────────────┐
   │ PostgreSQL 5432  │   │ Google Cloud Storage         │
   │ schoolcatering_db│   │ bucket: gda-c1e1-bucket      │
   │ 44 tables · 12MB │   │ menu-images / receipts /     │
   └──────────────────┘   │ payment-proofs               │
                          └──────────────────────────────┘
```

**Stack:** Next.js 14 · React 18 · NestJS 11 · TypeScript 5.7 · PostgreSQL 18.3 · pnpm 9.15 · turbo · Tailwind CSS · pg (no ORM)

---

## File structure

```
schoolcatering/
├── README.md                  ← you are here
├── ecosystem.config.cjs       pm2 entry for both apps
├── turbo.json                 turborepo pipeline
├── pnpm-workspace.yaml        workspaces: apps/api, apps/web, packages/*
├── .env                       single-source env (read by both apps)
├── apps/
│   ├── api/                   NestJS + pg (port 3000, package `api`)
│   │   └── src/
│   │       ├── main.ts        bootstrap (helmet, throttler, swagger, csrf)
│   │       ├── app.module.ts
│   │       ├── auth/          AuthController @ /api/v1/auth/*
│   │       │   ├── auth.service.ts      JWT login/refresh/google verify
│   │       │   ├── jwt-auth.guard.ts
│   │       │   ├── roles.guard.ts + roles.decorator.ts
│   │       │   ├── password-policy.ts
│   │       │   ├── db.util.ts           runSql() shared by all services
│   │       │   └── dto/                 zod-style DTOs
│   │       ├── core/          CoreController + PublicController + ArchivedController
│   │       │   ├── core.service.ts                facade (~250 delegating stubs)
│   │       │   ├── core.service.public-surface.spec.ts   locked public API
│   │       │   ├── services/  15 sub-services (see below)
│   │       │   ├── dto/
│   │       │   └── core.types.ts
│   │       └── shared/        middleware: correlation-id, csrf-origin,
│   │                            request-logging, security-headers,
│   │                            standard-http-exception filter,
│   │                            json.logger, grade.util, monitoring
│   └── web/                   Next.js 14 App Router (port 4173, package `@blossom/web`)
│       ├── next.config.mjs    image remotePatterns, cache headers
│       └── app/
│           ├── page.tsx                 /
│           ├── login/                   /login
│           ├── register/                /register
│           ├── admin/                   admin shell (login + 20+ sub-routes)
│           │   ├── dashboard/  reports/  billing/  rating/
│           │   ├── parents/    parent/   youngsters/  youngster/
│           │   ├── schools/    menu/     create-order/  quick-order/
│           │   ├── kitchen/    delivery/ multiorders/   family/
│           │   ├── blackout-dates/  backout-dates/
│           │   └── oders/  orders/      (legacy + current aliases)
│           ├── parents/                 parent portal (orders, billing, gaia, multiorder)
│           ├── family/                  family portal (same shape as parents)
│           ├── student/                 student portal
│           ├── kitchen/                 kitchen portal (today/tomorrow/yesterday/select-date)
│           ├── delivery/                delivery portal (today/tomorrow/yesterday/select-date)
│           ├── menu/                    public menu browser
│           ├── rating/                  menu rating
│           ├── dashboard/  home/        marketing/landing surfaces
│           ├── guide/  userguide/       user-facing guides
│           ├── privacy-and-confidentiality/   T&Cs + privacy
│           ├── tools/                   internal tooling
│           └── _components/             shared client components
├── packages/
│   ├── types/                 shared TypeScript types (@blossom/types)
│   └── config/                shared config validator (@blossom/config)
├── docs/                      operator docs (see [Repo Notes](#repo-notes))
├── scripts/                   ops scripts + db cleanup SQL
│   ├── ops/login-toggle/      sc-login installer + nginx snippets
│   ├── qa/                    test runners (unit/integration/e2e/security/perf)
│   └── *.sql, *.sh            historical data cleanups
└── secure/
    └── gda-viceroy-…json      GCP service account key (mode 600)
```

---

## Data layer

PostgreSQL 18.3 on `localhost:5432`, database **`schoolcatering_db`** (owner `schoolcatering`), 12 MB, 44 tables. No ORM — the API uses `pg` directly via `runSql()` in [apps/api/src/auth/db.util.ts](apps/api/src/auth/db.util.ts). Idempotent schema migrations run on API boot via [schema.service.ts](apps/api/src/core/services/schema.service.ts).

**Key tables**

| Domain | Tables |
|---|---|
| Identity | `users`, `user_identities`, `user_preferences`, `parents`, `children`, `parent_children`, `auth_refresh_sessions`, `admin_visible_passwords` |
| Schools | `schools`, `academic_years`, `academic_terms`, `session_settings`, `site_settings`, `site_counters` |
| Menu | `menus`, `menu_items`, `menu_item_ingredients`, `ingredients`, `menu_item_ratings`, `favourite_meals`, `favourite_meal_items` |
| Orders | `orders`, `order_items`, `order_carts`, `cart_items`, `order_mutations`, `order_notification_logs` |
| Multi-order | `multi_order_groups`, `multi_order_occurrences`, `multi_order_billings`, `multi_order_change_requests`, `multi_order_receipts` |
| Billing | `billing_records`, `digital_receipts` |
| Kitchen / Delivery | `delivery_school_assignments`, `delivery_assignments`, `delivery_daily_notes`, `blackout_days` |
| Dietary | `child_dietary_restrictions`, `parent_dietary_restrictions`, `child_badges` |
| Audit / AI | `admin_audit_logs`, `ai_usage_logs`, `analytics_daily_agg` |

**Family model** — `family_id` is the canonical family grouping key on `parents` and `children`. `parent_children` remains for compatibility; family-scoped support and Brian-facing reads use `family_id`. `parent2_*` fields are metadata only, not the primary authorization model.

**Migration path (fresh install)**

1. [docs/db/100_baseline_schema_v2.sql](docs/db/100_baseline_schema_v2.sql)
2. [docs/db/003_views_and_reports.sql](docs/db/003_views_and_reports.sql)
3. [docs/db/005_auth_runtime_sessions.sql](docs/db/005_auth_runtime_sessions.sql)
4. [docs/db/101_perf_indexes.sql](docs/db/101_perf_indexes.sql)

Production DB runbook: [docs/db/production-runbook.md](docs/db/production-runbook.md). Historical incremental migrations 001–016 are retained under [docs/db/](docs/db/) for reference; the boot-time [schema.service.ts](apps/api/src/core/services/schema.service.ts) handles ongoing schema drift idempotently.

---

## Public site layout

### Home `/`
- Hero + CTAs (Log In, Register, Guide link in footer)
- Editable tagline + hero image from `site_settings`

### Login & registration
- `/login`, `/register` — role auto-detected (Parent/Guardian, Student, Staff)
- Google OAuth (`POST /auth/google/verify`) + password (`POST /auth/login`)
- Optional Student Last Name on youngster registration
- Forgot password flow with reset-token email

### Parent portal `/parents/*`
- `overview`, `order` (browse + cart), `consolorder` (consolidated view),
  `multiorder` (recurring), `billing` (proof upload + receipt), `gaia` (in-app Brian chat)

### Student/Youngster portal `/student/*`
- Same shape as parent (Family alias `/family/*`)

### Kitchen `/kitchen/*`
- `today`, `tomorrow`, `yesterday`, `select-date` — order cards include student grade
- CSV + PDF export per day
- "Return" link at top of every sub-page

### Delivery `/delivery/*`
- Same four-tab pattern as kitchen, scoped to delivery assignments

### Public surfaces
- `/menu` — public menu browser (no auth)
- `/rating` — menu rating
- `/guide`, `/userguide` — user guides
- `/privacy-and-confidentiality` — T&Cs + privacy

### Recent UX changes
- Grades: added `Preschool Stars (PS)` and `Preschool Rainbows (PR)`
- Registration labels: `Parent/Guardian` / `Student` / `Staff`; "Family Group Name" → "Parent Last Name"
- Admin orders + kitchen cards show student grade prominently
- Home: Guide button moved from hero to footer; Log In + Register centered

---

## URL routing

nginx vhost `/etc/nginx/sites-enabled/schoolcatering` — path-aware, identical for all 3 domains:

| Path | Backend |
|---|---|
| `/api/v1/*` | NestJS API (`127.0.0.1:3000`) |
| Everything else (`/`, `/admin`, `/parents/...`, `/menu`, etc.) | Next.js (`127.0.0.1:4173`) |

Login lockout: `include /etc/nginx/snippets/sc-login-state.conf` — when ON, returns 503 on auth-mutating endpoints only. See [Operations](#operations).

---

## CMS & Admin features

`/admin/*` — admin-only Next.js shell. All sub-routes require an ADMIN-role JWT.

| Sub-route | Purpose |
|---|---|
| `/admin/dashboard` | KPI tiles + recent orders + revenue today |
| `/admin/reports` | Print-ready daily/weekly reports |
| `/admin/parents` · `/admin/parent` | List + edit parents; reset password |
| `/admin/youngsters` · `/admin/youngster` | List + edit youngsters; reset password |
| `/admin/family` | Family merge + student reassignment |
| `/admin/schools` | Schools CRUD |
| `/admin/menu` | Menu items + ingredients + dietary flags + image upload |
| `/admin/billing` | Verify proofs, generate receipts, revert |
| `/admin/create-order` · `/admin/quick-order` | Admin-placed orders for a parent |
| `/admin/multiorders` | Recurring order groups |
| `/admin/kitchen` | Read-only kitchen view |
| `/admin/delivery` | Driver assignments |
| `/admin/blackout-dates` · `/admin/backout-dates` | Closed-day calendar (both aliases live) |
| `/admin/rating` | Menu ratings dashboard |
| `/admin/orders` · `/admin/oders` | Outstanding + completed orders (both aliases live) |

Audit trail: every privileged admin action writes to `admin_audit_logs` via [audit.service.ts](apps/api/src/core/services/audit.service.ts).

**Dev-only test endpoints (ADMIN role required)**
- `POST /auth/dev/test-registration` — creates a synthetic registration with phone `+620000099991`, email `regtest@blossom.invalid`
- `DELETE /auth/dev/test-registration` — hard-deletes that synthetic data

---

## AI Agents

### Brian (WhatsApp bot via OpenClaw)

Parents can register, order, cancel, and check orders entirely through WhatsApp via Brian. Brian calls the API with the parent's phone number; the server resolves identity and family scope and returns structured data.

| Endpoint | Purpose |
|---|---|
| `POST /auth/register/youngsters` | Registration on user confirmation |
| `GET /auth/register/schools` | Live school list (no hardcoded IDs) |
| `GET /admin/family-context?phone=PHONE` | Family lookup by phone |
| `GET /admin/family-orders?phone=PHONE&date=YYYY-MM-DD` | Order lookup by phone + date |
| `POST /admin/families/merge` | Admin-side family-record repair |

Active seed schools: `Bali Island School`, `Sanur Independent School`.

WhatsApp greeting / onboarding copy: [docs/guides/guide_short.md](docs/guides/guide_short.md).
Notification runbook: [docs/brian/brian_whatsapp_notification_runbook.md](docs/brian/brian_whatsapp_notification_runbook.md).
Method-by-method reference: [docs/openclaw_features/methods_info.md](docs/openclaw_features/methods_info.md).

### In-app AI assistant (Gaia)

`POST /api/v1/ai/future/query` — Vertex Gemini 2.5-flash assistant surfaced inside the parent portal at `/parents/gaia`. Rate-limited per env: `AI_FUTURE_MAX_PROMPT_CHARS=2000`, `AI_FUTURE_MAX_REQUESTS_PER_DAY=100`. Usage logged to `ai_usage_logs`. Implementation in [gaia.service.ts](apps/api/src/core/services/gaia.service.ts).

---

## Operations

```bash
# Status
pm2 list | grep schoolcatering

# Live logs
pm2 logs schoolcatering-api --lines 50
pm2 logs schoolcatering-web --lines 50

# Full deploy (api + web)
ssh gda-pn01 'cd /var/www/schoolcatering \
  && git pull --ff-only origin main \
  && pnpm install \
  && pnpm -r build \
  && pm2 restart schoolcatering-api schoolcatering-web --update-env'

# API-only deploy
ssh gda-pn01 'cd /var/www/schoolcatering \
  && git pull --ff-only origin main \
  && pnpm --filter api build \
  && pm2 restart schoolcatering-api'

# Smoke
curl -sI https://schoolcatering.gaiada2.online/                     # 200 (redirects to /login)
curl -sI https://blossomcatering.online/                            # 200
curl -s  https://schoolcatering.gaiada2.online/api/v1/auth/admin-ping  # 401 (auth gate working)
```

### Login lockout (zero-downtime maintenance)

`sc-login` toggles a nginx include — when OFF, only auth-mutating endpoints return 503; all other routes (admin pages, registration, billing, orders, etc.) stay live. Already-issued JWTs remain valid until natural expiry.

```bash
sudo sc-login off       # block all login attempts (HTTP 503)
sudo sc-login on        # restore normal login
sudo sc-login status    # show current state

# One-liner from a workstation
ssh gda-pn01 "sudo sc-login on"
```

Blocked when OFF:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/google/verify`
- `POST /api/v1/auth/google/dev`

Source: [scripts/ops/login-toggle/](scripts/ops/login-toggle/). Reinstall on a server with `sudo bash scripts/ops/login-toggle/install.sh` (idempotent).

---

## Credentials & access

| What | Where | Purpose |
|---|---|---|
| Postgres password | `/var/www/schoolcatering/.env` (`DB_PASSWORD`, `DATABASE_URL`) | DB user `schoolcatering` |
| JWT secrets | `.env` (`AUTH_JWT_SECRET`, `AUTH_JWT_REFRESH_SECRET`) | access (15m) + refresh (7d) tokens |
| Google OAuth client | `.env` (`GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) | login via Google |
| GCS service account | [secure/gda-viceroy-17373de6d690.json](secure/) (mode 600) | menu images, receipts, payment proofs uploads |
| GCS bucket | `.env` (`GCS_BUCKET`, `GCS_FOLDER`) | media storage |
| Vertex AI | same SA key + `.env` (`GCP_PROJECT_ID=gda-viceroy`, `GCP_VERTEX_LOCATION=asia-southeast1`, `GCP_VERTEX_MODEL=gemini-2.5-flash`) | Brian + in-app AI |
| Gmail delegated user | `.env` (`GOOGLE_GMAIL_DELEGATED_USER=azlan@gaida.com`) | notification emails from `azlan@gaida.com` |
| Login lockout | `sudo sc-login on/off` | maintenance gate, see [Operations](#operations) |

The `/var/www/schoolcatering/.env` file is mode `600`, owner `azlan:azlan`. Both apps read it on start (api via NestJS ConfigModule, web via Next.js env). Template: [.env.example](.env.example).

---

## API Endpoints

All endpoints are under `/api/v1/`. JWT bearer token required unless marked Public.

### Auth — [apps/api/src/auth/auth.controller.ts](apps/api/src/auth/auth.controller.ts)
- `POST /auth/login` — password login, returns access + refresh
- `POST /auth/register` — parent registration
- `POST /auth/register/youngsters` — youngster registration (used by Brian)
- `POST /auth/register/youngster` — alias
- `GET  /auth/register/schools` — public school list
- `POST /auth/google/verify` — Google OAuth verification
- `POST /auth/google/dev` — dev-only Google bypass
- `GET  /auth/me` — current user
- `POST /auth/refresh` — rotate access token (refresh cookie)
- `POST /auth/logout` — invalidate session
- `POST /auth/change-password`
- `POST /auth/password/forgot` · `POST /auth/password/reset`
- `POST /auth/username/generate`
- `GET  /auth/onboarding` · `POST /auth/onboarding`
- `POST /auth/role-check`
- `GET  /auth/admin-ping` — admin-only healthcheck
- `POST /auth/dev/test-registration` · `DELETE /auth/dev/test-registration` — admin-only test data

### Public — [apps/api/src/core/public.controller.ts](apps/api/src/core/public.controller.ts)
- `GET /menu` — public menu
- `GET /site-settings` — public site settings
- `GET /lookup-name` — phone → name lookup (Brian)

### Core (authed) — [apps/api/src/core/core.controller.ts](apps/api/src/core/core.controller.ts)
- **Schools:** `GET /schools` · `POST/PATCH/DELETE /admin/schools[/:id]`
- **Site settings:** `GET/PATCH /admin/site-settings` · `POST /admin/site-settings/hero-image-upload`
- **Session settings:** `GET /session-settings` · `GET /admin/session-settings` · `PATCH /admin/session-settings/:session`
- **AI:** `POST /ai/future/query`
- **Orders:** `POST /order/quick` · `GET /orders/daily`
- **Brian bridge:** `GET /admin/family-context` · `GET /admin/family-orders` · `POST /admin/families/merge`
- **Children/youngsters registration:** `POST /children/register` · `POST /child/register`
- **Parents admin:** `GET /admin/parents` · `GET /admin/parent` · `PATCH/DELETE /admin/parents/:id` (+ singular alias)
- **Youngsters admin:** `GET /admin/children` · `GET /admin/youngster` · `PATCH/DELETE /admin/youngsters/:id` (+ singular alias)
- **Password reset (admin):** `PATCH /admin/users/:id/reset-password` · `GET /admin/users/:id/password` · `PATCH /admin/youngsters/:id/reset-password` · `GET /admin/youngsters/:id/password` (+ singular aliases)
- **Reports:** `GET /admin/dashboard` · `GET /admin/orders` · `GET /admin/revenue`
- **Blackout days:** `GET/POST /blackout-days` · `DELETE /blackout-days/:id`
- **Ingredients:** `GET/POST /admin/ingredients` · `PATCH/DELETE /admin/ingredients/:id`
- **Menu:** `GET /admin/menus` · `GET /admin/menu-ratings` · `POST /admin/menus/sample-seed` · `POST /admin/orders/sample-seed` · `POST /admin/menu-items` · `PATCH /admin/menu-items/:id` · `POST /admin/menu-images/upload`
- **Ratings (public-ish):** `POST /ratings`
- **Children/parent pages (authed):** `GET /children/me` · `GET /youngsters/me/insights` · `GET /youngsters/me/orders/consolidated` · `GET /parents/me/children/pages` · `POST /parents/:parentId/children/:childId/link` (+ singular aliases)
- **Menu (authed):** `GET /menus`
- **Favourites:** `GET/POST /favourites` · `DELETE /favourites/:id` · `POST /favourites/:id/apply`
- **Carts:** `POST /carts/quick-reorder`
- **Billing:** `GET /billing/parent/consolidated` · `GET /billing/youngster/consolidated` · `POST /billing/proof-upload-batch` · `GET /billing/:id/proof-image` · `GET /billing/:id/receipt` · `POST /billing/:id/revert-proof` · `GET /admin/billing` · `GET /admin/billing/:id/proof-image`

Full surface (and ~250 service methods) referenced in [docs/openclaw_features/methods_info.md](docs/openclaw_features/methods_info.md). Public method list of `CoreService` is locked by [core.service.public-surface.spec.ts](apps/api/src/core/core.service.public-surface.spec.ts).

---

## Repo Notes

- Production host: `gda-pn01` (GCE) — external `34.2.143.47`, internal `10.148.0.9`
- Path: `/var/www/schoolcatering` (deploy target)
- File ownership: `azlan:azlan`; PM2 runs as user `azlan`
- Package manager: **pnpm 9.15.4** (single workspace glob: `apps/api`, `apps/web`, `packages/*`)
- Build tool: **turbo 2.3** (`turbo run dev|build`)
- API runtime: NestJS 11 / TypeScript 5.7 / Node 20
- Web runtime: Next.js 14.2 / React 18 / TypeScript 5.7
- Co-tenants on this VM: `essentialbali`, `essentialbali-cms`, `essentialbali-daily-feed`, `baligirls-api`, `baligirls-web-vite`
- Internal package names: API package is `api`, web is `@blossom/web`, shared types is `@blossom/types`, shared config is `@blossom/config`
- HTTPS: nginx vhost `/etc/nginx/sites-enabled/schoolcatering`, Let's Encrypt cert at `/etc/letsencrypt/live/schoolcatering.gaiada2.online/` (Certbot-managed auto-renew)

### Documentation map

- User guides — [docs/guides/](docs/guides/): `guide_summary.md`, `guide_short.md`, `guide_features.md`, per-role (`admin.md`, `parents.md`, `family.md`, `students.md`, `kitchen.md`, `delivery.md`, `report.md`), `register.md`, `menu.md`, `billing-payment.md`, `contact-us.md`, `guide_tNc.md`
- Feature reference — [docs/Features/](docs/Features/): `BSC_APP_BRIEF.md`, `inventory.md`, `button_api.md`, `links_api.md`, `map_api.md`, `architecture.md`, `auto_refresh.md`, `files_api.md`, `points_calcs.md`
- Brian / OpenClaw — [docs/openclaw_features/](docs/openclaw_features/): `methods_info.md`, `openclaw_ref_change_feature.md`
- DB — [docs/db/](docs/db/) + [docs/db/production-runbook.md](docs/db/production-runbook.md)
- Ops — [docs/ops/](docs/ops/): `db-backup-restore-runbook.md`, `nginx-cache-compression-security-review.md`, `observability-monitoring.md`, `testing-quality-gates.md`

---

## GCP

- **Project:** `gda-viceroy`
- **Region:** `asia-southeast1` (Vertex), `asia-southeast1-b` (compute)
- **Compute:** `gda-pn01` GCE instance (external `34.2.143.47`)
- **Storage bucket:** `gda-c1e1-bucket`
  - `blossom-schoolcatering/menu-images/`
  - `blossom-schoolcatering/receipts/`
  - `blossom-schoolcatering/payment-proofs/`
  - CDN base: `https://storage.googleapis.com/gda-c1e1-bucket/blossom-schoolcatering/`
- **Vertex AI:** Gemini 2.5-flash (`GCP_VERTEX_MODEL`) for Brian + in-app AI
- **Service account:** [secure/gda-viceroy-17373de6d690.json](secure/) (mode 600, owner `azlan`) — `storage.objectAdmin` on bucket + Vertex predict role. Wired via `GOOGLE_APPLICATION_CREDENTIALS`.
- **Gmail:** delegated user `azlan@gaida.com` for notification emails

---

## PM2 Processes

| Process | Description | Port | Mode | Memory cap | Status |
|---|---|---|---|---|---|
| `schoolcatering-api` | NestJS API | 3000 | fork | 600 MB (auto-restart) | online |
| `schoolcatering-web` | Next.js (`next start`) | 4173 | fork | 400 MB (auto-restart) | online |

Both processes are defined in [ecosystem.config.cjs](ecosystem.config.cjs) with `max_restarts: 10`, `restart_delay: 3000`, `exp_backoff_restart_delay: 1000`, JSON logs. PM2 is managed via systemd unit `pm2-azlan.service`, resurrect file `/home/azlan/.pm2/dump.pm2`.

```bash
sudo -u azlan pm2 restart schoolcatering-api schoolcatering-web --update-env
sudo -u azlan pm2 save
```

---

## Production Health Audit

### Service Status — ✅ All Healthy (2026-05-18)

| Endpoint | Status |
|---|---|
| `https://schoolcatering.gaiada2.online/` | 200 (→ `/login`) |
| `https://blossomcatering.online/` | 200 |
| `https://schoolcatering.gaiada2.online/api/v1/auth/admin-ping` | 401 (auth gate live) |

### Host Metrics

| Metric | Value |
|---|---|
| Disk (`/`) | 20 GB used / 48 GB (41%) |
| Memory | 3.2 GB used / 7.8 GB (4.5 GB available) |
| Swap | 1.0 GB used / 4.0 GB |
| Uptime | 12 days |
| Postgres version | 18.3 |

### Disk Footprint

| Path | Size |
|---|---|
| `/var/www/schoolcatering/` (total) | 813 MB |
| `node_modules/` (pnpm root) | 695 MB |
| `apps/` (api + web source + .next) | 105 MB |
| `docs/` | 4.8 MB |
| `scripts/` | 204 KB |
| PostgreSQL `schoolcatering_db` | 12 MB |

### Process Uptime

Both `schoolcatering-api` and `schoolcatering-web` have been online 11 days with 0 restarts as of the audit. API runs `npm --prefix apps/api run start:prod` (single fork worker); web runs `npm --prefix apps/web run start` (`next start -p 4173`).

### Recovery / Restart

```bash
# Restart everything
sudo -u azlan pm2 restart schoolcatering-api schoolcatering-web --update-env
sudo -u azlan pm2 save

# Reload nginx after config change
sudo nginx -t && sudo nginx -s reload

# View live logs
sudo -u azlan pm2 logs schoolcatering-api --lines 100
sudo -u azlan pm2 logs schoolcatering-web --lines 100

# DB connect
sudo -u postgres psql -d schoolcatering_db
```
