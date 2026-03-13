# Progress Update

## 2026-03-13 (App Beta Version checkpoint)
- Marked this state as the App Beta Version.
- Synced local workspace, GitHub branch, and staging deploy target to the same release line.
- Included latest admin-facing fixes:
  - `/admin/delivery`
    - selected service-date assignment loading corrected
    - heading renamed to `Delivery Assignments`
  - `/admin/menu`
    - removed date-specific helper text
    - removed `Service Date` control
    - kept menu management scoped by session only
- Beta checkpoint release identifier:
  - changelog version `v2026.03.13-beta`

## 2026-03-10 (Admin delivery and delivery-date operations rollout)
- Added `Total Orders Complete` metric into Kitchen overview surfaces:
  - `/kitchen` (`apps/web/app/kitchen/_components/kitchen-dashboard.tsx`)
  - `/admin/kitchen` (`apps/web/app/admin/kitchen/page.tsx`)
  - backend support in `GET /kitchen/daily-summary` (`apps/api/src/core/core.service.ts`)
- Admin Delivery cleanup and clarity improvements:
  - removed duplicate `Assigned Orders` section from `/admin/delivery`
  - retained `Auto Assignment` as single assignment truth surface
  - expanded `Auto Assignment` with full per-order detail lines
  - renamed `Refresh` button to `Show Service Date`
  - `Show Service Date` now explicitly loads all assigned delivery orders for selected date
- Delivery account credential support:
  - added `Show Password` action to Delivery User list on `/admin/delivery`
  - action uses admin reset-password API and displays new credentials in modal
  - backend reset policy expanded to allow admin reset for `DELIVERY` role
- Admin Parents operational safeguard:
  - added `Delete` button on `/admin/parents`
  - UI prevents deletion if linked youngsters exist
  - backend `DELETE /admin/parents/:parentId` now blocks deletion when active linked youngster exists
- Delivery execution UX improvement:
  - `/delivery` now supports manual service-date picker + `Show Service Date`
  - allows immediate viewing of assignments for dates outside only Yesterday/Today/Tomorrow window

### Deployment and verification (2026-03-10)
- Multiple incremental commits pushed to `codex/phase1-stack-upgrade` and deployed to staging VM.
- Standard deploy cycle executed repeatedly for each change set:
  - `git pull`
  - `npm run build:api` and/or `npm run build:web`
  - `pm2 restart schoolcatering-api`
  - `pm2 restart schoolcatering-web`
- Health and readiness checks passed after deploys:
  - `GET /api/v1/health`
  - `GET /api/v1/ready`
- Route checks validated expected auth redirects for protected pages when unauthenticated.

## 2026-02-28 (Documentation sync to latest runtime state)
- Updated core runtime documentation to match current implemented behavior:
  - `README.md`
  - `docs/Features/feature_matrix.md`
  - `docs/Features/buttons_api.md`
  - `docs/Features/inventory.md`
- Merged maps with deduplication:
  - merged `docs/complementary/map.md` coverage into `docs/Features/map.md`
  - `docs/Features/map.md` is now the unified page/API/DB map source
- Updated all guide markdown files under `docs/guides` for latest route/action/rule behavior.

## 2026-02-28 (Teacher-assisted youngster registration + deploy)
- Updated youngster registration flow to support teacher-assisted registration:
  - required registrant selector at top of `/register/youngsters`: `Youngster | Parent | Teacher`
  - when `Teacher` is selected, `Teacher Name` input is required and capped at 50 chars
  - removed `Parent Allergies (Required)` field from youngster registration UI
- Updated backend auth registration contract:
  - `POST /api/v1/auth/register/youngsters` accepts `registrantType` + conditional `teacherName`
  - parent allergies removed from required payload
  - server writes registration source metadata to `children`:
    - `registration_actor_type`
    - `registration_actor_teacher_name`

## 2026-02-28 (Production deploy completion + validation pass)
- Completed commit/push/deploy cycle and resolved deploy blockers.
- Fixed runtime defects found during validation:
  - billing verify path handling
  - kitchen daily summary SQL grouping
- Final script and endpoint validation reported green status at checkpoint.

## 2026-02-27 (Validation rollout + guides finalization + UAT expansion)
- Completed API request validation migration with DTO coverage and global `ValidationPipe`.
- Updated role guides and guide-page markdown loading behavior.
- Expanded UAT scenarios and completed local build verification.

## 2026-02-26 (Production fixes + seed/testing + docs sync)
- Applied production SQL/runtime fixes in auth/core services.
- Expanded seed/menu coverage for repeated test runs.
- Added and executed grouped test scripts with consolidated reporting.
- Updated runtime/testing docs to reflect validated state.

## 2026-02-26 (Step 6-9 completion hardening + deploy + QA sweep)
- Implemented admin school/session activation controls and enforcement in ordering paths.
- Added `/schoolcatering/home` route.
- Fixed API SQL issues discovered during staging sweep.
- Deployed to staging VM and restarted PM2 services.

## 2026-02-25 (Checkpoints)
- Completed initial checkpoints for setup, UI baseline, and documentation scaffolding.
- Prepared sample master-data assets and planning docs for subsequent implementation phases.
