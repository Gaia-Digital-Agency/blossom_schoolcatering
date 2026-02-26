# Blossom School Catering Plan (Now -> Go-Live)

Last updated: 2026-02-26
Target go-live: 2026-04-01

## Execution Note (Next Session: 2026-02-26)
- Steps 1-5 are completed for current scope.
- Tomorrow focus: Steps 6-10 only.
- For Steps 6-10, implementation must align with:
  - `docs/specifications/*` (API/RBAC/order/data contracts)
  - `docs/strategy/*` (approved scope and intake assumptions)
  - `docs/master_data/*` (master data shape and sample references)
  - `docs/app_run/*` (runtime/deploy/access constraints on VM)

## 1) Create Basline & Plan
- [x] VM staging path prepared at `/var/www/schoolcatering`
- [x] Nginx route serving app at `http://34.124.244.233/schoolcatering/`
- [x] PostgreSQL database created and migrations applied on VM
- [x] Shared `.env` symlinked into app, including GCS bucket/folder values
- [x] Base homepage deployed (mobile-first, hero image, logo, favicon)
- [x] `robots.txt`, `sitemap.xml`, and `sitemap.url` added

## 2) Repo and Delivery Workflow Hardening
- [ ] Enforce branch protection on GitHub (`main` via PR only, no force-push)
- [x] Add `docs/versioning/CONTRIBUTING.md` with deploy steps and rollback steps
- [x] Add release tag convention (`vYYYY.MM.DD-N`)
- [x] Add simple change log (`docs/versioning/CHANGELOG.md`)
- [x] Add standard commit scopes (`web`, `api`, `db`, `infra`, `docs`)
- [x] Add PR template and PR build workflow (`.github/`)
- [x] Add branch protection setup instructions (`docs/versioning/branch-protection.md`)

## 3) Monorepo Structure Completion
- [x] Initialize `apps/api` (NestJS)
- [x] Convert `apps/web` from static starter to Next.js app scaffold
- [ ] Create shared packages:
  - [x] `packages/types`
  - [x] `packages/config`
  - [ ] `packages/ui` (optional early)
- [ ] Set root scripts:
  - [x] `dev:web`
  - [x] `dev:api`
  - [x] `build:web`
  - [x] `build:api`
  - [x] `build`

## 4) Authentication and Identity
- [x] Implement login (Parent, Youngsters, Admin, Kitchen, Delivery)
- [x] Implement JWT + refresh token rotation
- [x] Implement Google OAuth login (Parent + Youngsters)
- [x] Implement username generation + collision suffix logic
- [x] Implement role-based route guards
- [x] Implement first-login onboarding state in preferences

## 5) Core Master Data Modules
- [x] Schools master data template completed
- [x] Dish master data template completed
- [x] Ingredient master data template completed
- [x] Blackout master data template completed
- [x] Menu master data template completed
- [x] Parents details master data template completed
- [x] Kids details master data template completed
- [x] Delivery details master data template completed

## 6) Parent, Youngsters, and Menu Core Pages
- [x] Module coverage: Parent + Youngsters + Menu
- [x] DB interlinks (phase 1): wire Parent/Youngsters/Menu/Ordering/Billing relations (FKs + constraints + indexes) for order placement flow
- [x] Parent registration page (public)
- [x] Youngsters profile registration by parent/admin
- [x] Parent-child linking (max 10 youngsters per parent)
- [x] Session menu pages (Lunch/Snack/Breakfast order and styling)
- [x] Cart draft flow per youngster/date/session
- [x] Cart expiry at 08:00 Asia/Makassar
- [x] Place order and create billing record
- [x] Parent edit/delete before cutoff
- [x] Youngsters cannot edit/delete after place
- [x] Item limits (max 5 items/cart, max 5 items/order)

## 7) Ordering Module Pages (Advanced)
- [x] Module coverage: Ordering
- [x] Quick reorder from historical orders
- [x] Meal Plan Wizard (weekly/monthly/custom range)
- [x] Smart cutoff countdown timer
- [x] Search/filter by keyword, session, price, allergens, favourites
- [x] Favourite meal combos (max 20/user)
- [x] Dietary restriction snapshot into order
- [x] Parent consolidated orders page

## 8) Billing Module Pages (Receipt + Payment)
- [x] Module coverage: Billing
- [x] Billing history and summaries
- [x] Proof-of-payment upload (validation + size limits)
- [x] Admin verify/reject payment flow
- [x] Receipt number generation sequence
- [x] PDF receipt generation and GCS storage
- [x] Parent receipt download
- [x] Parent consolidated billing page

## 9) Delivery, Kitchen, and Admin Module Pages
- [x] Module coverage: Delivery + Kitchen + Admin
- [x] DB interlinks (phase 2): finalize end-to-end links across all 7 modules (Parent, Youngsters, Menu, Ordering, Billing, Delivery, Admin/Kitchen) including status transition integrity
- [x] Admin menu management page (create/edit dish, ingredient selection, image upload field, price, cutlery, packing requirement, sample seed for testing)
- [x] Delivery assignment page
- [x] Delivery confirmation updates billing status
- [x] Kitchen daily summary view (polling)
- [x] Kitchen allergen alert dashboard
- [x] Print order tags with QR (dropped)
- [x] Print reports
- [x] Revenue dashboard (admin)
- [x] Spending dashboard (parent)
- [x] Nutrition summary (youngster weekly)
- [x] Birthday highlight indicators
- [x] Clean Plate Club badge engine + display

## 10) CSV Import and Data Operations
- [ ] Define CSV template (parents + youngsters)
- [ ] Build CSV import endpoint + validation
- [ ] Import result report (success/fail + reasons)
- [ ] Add admin UI for CSV upload and review
- [ ] Add seed scripts for demo/test datasets

## 11) API and Contract Completion
- [ ] Implement endpoints from `docs/specifications/api-contract.md`
- [ ] Request validation (DTO/class-validator)
- [ ] OpenAPI docs generation at `/api/v1/docs`
- [ ] Error response standardization
- [ ] Correlation ID middleware
- [ ] Rate limiting on sensitive endpoints

## 12) Security and Compliance
- [ ] Password policy and secure reset flow
- [ ] Strict RBAC test matrix
- [ ] Upload scanning/validation hardening
- [ ] SQL injection/XSS/CSRF review
- [ ] Secrets handling audit (`.env`, server file permissions)
- [ ] Privacy and Confidentiality page (public)
- [ ] Basic audit trail for admin-critical actions

## 13) Observability and Reliability
- [ ] Structured logs (JSON)
- [ ] Request/exception monitoring setup
- [ ] DB backup and restore runbook + dry run
- [ ] Healthcheck endpoints (`/health`, `/ready`)
- [ ] PM2 ecosystem config and startup persistence
- [ ] Nginx cache/compression/security headers review
- [ ] Optional CDN hostname switch for asset delivery

## 14) Testing and Quality Gates
- [ ] Unit tests (validators, rules, pricing, badge logic)
- [ ] Integration tests (API + DB flows)
- [ ] E2E system tests per role
- [ ] UAT scenarios with school operations
- [ ] Regression suite for cutoff/weekdays/blackouts
- [ ] Security testing pass
- [ ] Performance testing under peak ordering load

## 15) Release Preparation
- [ ] Create production `.env` template and final values checklist
- [ ] Final migration plan for production DB
- [ ] Go-live runbook with hour-by-hour steps
- [ ] Rollback plan (app + DB)
- [ ] Final SEO check (title/meta/robots/sitemap canonical)
- [ ] Stakeholder sign-off from product + ops + QA

## 16) Go-Live Day
- [ ] Freeze non-critical changes
- [ ] Deploy tagged release
- [ ] Run smoke tests (all roles + key flows)
- [ ] Verify billing and receipt generation live
- [ ] Verify logs/alerts and backup jobs
- [ ] Announce go-live and monitor first-day incidents

## 17) Post Go-Live (Week 1-2)
- [ ] Bug triage daily and hotfix SLA
- [ ] Monitor conversion/drop-off in order funnel
- [ ] Monitor performance and DB query hotspots
- [ ] Prioritize v1.1 backlog from real usage

## 18) Suggested Execution Order (Critical Path)
This list maps directly to Sections **2-17** above for easy cross-reference.

1 Create Baseline & Plan - Complete
2 (Repo and Delivery Workflow Hardening) - Complete
3 (Monorepo Structure Completion) - Complete
4 (Authentication and Identity) - Complete
5 (Core Master Data Modules) - Complete
6 (Parent + Youngsters + Menu Core Pages) - 
7 (Ordering Module Pages - Advanced) -  
8 (Billing Module Pages - Receipt + Payment) - 
9 (Delivery + Kitchen + Admin Module Pages) - 
10 (CSV Import and Data Operations) -   
11 (API and Contract Completion) - 
12 (Security and Compliance) - 
13 (Observability and Reliability) -   
14 (Testing and Quality Gates) - 
15 (Release Preparation) - 
16 (Go-Live Day) - 
17 (Post Go-Live Week 1-2) - 
