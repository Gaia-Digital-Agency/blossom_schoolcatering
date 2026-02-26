# Blossom School Catering — Full App Review

**Date:** 26 Feb 2026 | **Server:** `34.124.244.233` | **Git:** `b41f75b` (in sync)
**Status:** IN PROGRESS — fixes being applied

---

## App Status (at review time)

| Component | Status | Detail |
|-----------|--------|--------|
| `schoolcatering-api` (NestJS) | **Online** | Port 3006, 17 restarts |
| `schoolcatering-web` (Next.js) | **Online** | Port 4173, 17 restarts |
| Nginx reverse proxy | **OK** | `/schoolcatering/*` routing correct |
| PostgreSQL database | **OK** | 30 tables, 123 users, 120 orders, 299 menus, 6 schools |
| Git sync | **OK** | Server == `main` branch, clean tree |

The app was **reachable and serving requests** but had active bugs hitting production logs.

---

## 1. CONFIRMED BUGS

### BUG-01 — `cartId = undefined` being sent to API (CRITICAL)
- **Status:** [ ] FIXED
- **Files:** `apps/web/app/parents/page.tsx:307-309`, `apps/web/app/youngsters/page.tsx:215-227`, `apps/api/src/core/core.controller.ts`, `apps/api/src/core/core.service.ts:365-372`
- **Root cause:** Frontend casts API response `as { id: string }` with no runtime validation. If `cart.id` is undefined, subsequent calls become `/carts/undefined/items`.
- **Fix:** Add runtime validation in frontend; add `ParseUUIDPipe` + guard in backend.

### BUG-02 — Duplicate order constraint not handled gracefully (HIGH)
- **Status:** [ ] FIXED
- **File:** `apps/api/src/core/core.service.ts` (submitCart)
- **Root cause:** PostgreSQL `23505` unique constraint violation from `orders_child_session_date_active_uq` propagates as unhandled 500.
- **Fix:** Catch `23505` error code and return `ConflictException('ORDER_ALREADY_EXISTS_FOR_DATE')`.

### BUG-03 — JWT secrets missing from production `.env` (CRITICAL SECURITY)
- **Status:** [ ] FIXED
- **File:** `/var/www/_env/schoolcatering.env` (server)
- **Root cause:** `AUTH_JWT_SECRET` and `AUTH_JWT_REFRESH_SECRET` absent; app falls back to `'dev-access-secret'` — anyone can forge tokens.
- **Fix:** Generate strong secrets, add to production `.env`, restart API.

### BUG-04 — GCS storage env vars missing from production (HIGH)
- **Status:** [ ] FIXED
- **File:** `/var/www/_env/schoolcatering.env` (server)
- **Root cause:** `GCS_MENU_IMAGES_FOLDER`, `GCS_RECEIPTS_FOLDER`, `GCS_PAYMENT_PROOFS_FOLDER` absent; receipt/image uploads will use wrong paths.
- **Fix:** Add missing GCS folder vars to production `.env`.

### BUG-05 — No `ecosystem.config.js` — PM2 config is ephemeral (MEDIUM)
- **Status:** [ ] FIXED
- **Fix:** Create `ecosystem.config.cjs` with PORT overrides and restart policies.

---

## 2. POTENTIAL ISSUES

### PI-01 — SQL injection risk via `sqlLiteral()` string interpolation (HIGH)
- **Status:** [ ] ADDRESSED
- **Fix:** Add `ParseUUIDPipe` to all `:id` params; add UUID guard in service layer.

### PI-02 — Refresh token stored in `localStorage` (XSS risk) (MEDIUM)
- **Status:** [ ] FIXED
- **Fix:** Move refresh token to `HttpOnly` cookie.

### PI-03 — No startup env var validation (MEDIUM)
- **Status:** [ ] FIXED
- **Fix:** Add required-var check in `apps/api/src/main.ts`.

### PI-04 — `apiFetch` doesn't validate response structure (MEDIUM)
- **Status:** [ ] FIXED
- **Fix:** Validate API responses before using fields.

### PI-05 — Cart expiry not enforced at query time (LOW)
- **Status:** [ ] FIXED
- **Fix:** Add `expires_at > NOW()` check in `ensureCartIsOpenAndOwned`.

### PI-06 — No CORS configuration (LOW)
- **Status:** [ ] FIXED
- **Fix:** Add explicit CORS config in NestJS `main.ts`.

### PI-07 — Frequent process restarts (17 restarts) (MEDIUM)
- **Status:** [ ] FIXED (resolved by BUG-03 + ecosystem config)

---

## 3. MISSING FEATURES

| Feature | Status |
|---------|--------|
| School Create | [ ] ADDED |
| School Delete | [ ] ADDED |
| Parent profile update | [ ] ADDED |
| Parent delete | [ ] ADDED |
| Youngster profile update | [ ] ADDED |
| Youngster delete | [ ] ADDED |
| Ingredient Create | [ ] ADDED |
| Ingredient Update | [ ] ADDED |
| Ingredient Delete | [ ] ADDED |
| Menu Item Delete | [ ] ADDED |
| Delivery user deactivate | [ ] ADDED |
| Receipt PDF generation | [ ] CONFIGURED (GCS credentials) |

---

## 4. SUGGESTED IMPROVEMENTS

| # | Improvement | Status |
|---|-------------|--------|
| IMP-01 | `ParseUUIDPipe` on all `:id` params | [ ] DONE |
| IMP-02 | `class-validator` DTOs | [ ] DONE |
| IMP-03 | Parameterized queries (critical paths) | [ ] DONE |
| IMP-04 | `apiFetch` response validation | [ ] DONE |
| IMP-05 | Startup env var validation | [ ] DONE |
| IMP-06 | `ecosystem.config.cjs` | [ ] DONE |
| IMP-07 | Refresh token to HttpOnly cookie | [ ] DONE |
| IMP-08 | Global NestJS exception filter | [ ] DONE |

---

## 5. SUGGESTED ENHANCEMENTS

| # | Enhancement | Status |
|---|-------------|--------|
| ENH-01 | Missing CRUD endpoints | [ ] DONE |
| ENH-02 | GCS receipt PDF generation | [ ] CONFIGURED |
| ENH-03 | Rate limiting on auth endpoints | [ ] DONE |
| ENH-04 | Admin resend receipt flow | [ ] DONE |
| ENH-05 | Order edit confirmation UI | [ ] DONE |
| ENH-06 | Delivery bulk-confirm screen | [ ] DONE |
| ENH-07 | Kitchen print report PDF/CSV export | [ ] DONE |
| ENH-08 | Notification on payment proof upload | [ ] DONE |
| ENH-09 | Nginx access_log for API | [ ] DONE |
| ENH-10 | Health check endpoint `/api/v1/health` | [ ] DONE |

---

## Database State (Production at review time)

| Metric | Count |
|--------|-------|
| Users | 123 |
| Orders | 120 |
| Active open carts | 10 |
| Menus | 299 |
| Blackout days | 3 |
| Schools (all active) | 6 |

---

## Final Test Results

| Test | Result |
|------|--------|
| API health endpoint | [ ] PENDING |
| Web frontend 200 OK | [ ] PENDING |
| Login flow | [ ] PENDING |
| Cart flow | [ ] PENDING |

_Updated after all fixes applied._
