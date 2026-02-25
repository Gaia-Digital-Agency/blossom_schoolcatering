# Project Plan (Detailed Tracker)

Last updated: 2026-02-25

## 1) Current Baseline
- Status: Completed
- VM, Nginx, PM2 runtime configured for multi-site hosting.
- PostgreSQL running on VM and wired to app.
- Base web app deployed at `/schoolcatering`.

## 2) Repo and Delivery Workflow Hardening
- Status: Completed
- Server-first workflow established, then GitHub sync, then local sync.
- Standard deploy flow documented in `start.md`.
- Git pull/push and redeploy loop validated.

## 3) Monorepo Structure Completion
- Status: Completed
- Monorepo app structure stabilized for:
  - `apps/web`
  - `apps/api`
  - `db/migrations`
- Build and run commands validated for both web and api apps.

## 4) Authentication and Identity
- Status: Completed
- Scope completed:
  1. Real Google OAuth verify flow
  2. JWT + refresh token rotation
  3. Persistent refresh-session storage
  4. Formal route role guards
  5. DB-backed user auth and username generation
  6. DB-backed onboarding state
- Dev credential active for shared testing:
  - Username: `teameditor`
  - Password: `admin123`
- Access policy:
  - Homepage is public.
  - All non-home routes require login state.
- Full implementation notes: `auth_info.md`

## 5) Core Master Data Modules
- Status: Pending
- Parent, Youngsters, Kitchen, Delivery, Menu, Session master data pages.
- API CRUD endpoints and DB models.

## 6) Parent and Youngsters Core Ordering Flows
- Status: Pending
- Session-based ordering journey (Breakfast, Lunch, Snack).
- Order validation rules and limits.

## 7) Billing and Receipt Flows
- Status: Pending
- Billing calculations, receipts, and status updates.

## 8) Delivery and Kitchen Execution Flows
- Status: Pending
- Kitchen preparation queue and delivery handoff states.

## 9) Admin Operations
- Status: Pending
- User/role management and operational controls.

## 10) QA and UAT
- Status: Pending
- End-to-end test matrix for all roles and critical flows.

## 11) Observability and Ops
- Status: Pending
- Runtime logs, error triage flow, and health checks.

## 12) Security Hardening
- Status: Pending
- Secrets hygiene, auth edge-case handling, and access reviews.

## 13) Data Integrity and Backup
- Status: Pending
- Backup and restore verification, migration safety checks.

## 14) Performance and Stability
- Status: Pending
- Baseline performance checks for web and api.

## 15) Documentation Completion
- Status: In Progress
- Keep `.env.example`, `db_infor.md`, `start.md`, and this plan updated.

## 16) Production Readiness Checklist
- Status: Pending
- Release gate checklist before broader use.

## 17) Suggested Execution Order (Critical Path)
- a. Finalize auth/runtime stability checks on server.
- b. Complete master data modules.
- c. Complete order, billing, kitchen, and delivery flows.
- d. Run full QA/UAT and fix gaps.
- e. Finalize docs and production readiness checklist.

## 18) Release and Handover
- Status: Pending
- Final deployment validation and operating handover notes.
