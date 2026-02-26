# Authentication and Identity Completion Details

Last updated: 2026-02-26

## Scope
Completed the 6 remaining items under Section 4 (Authentication and Identity):
1. Real Google OAuth login path
2. Production-style JWT flow
3. Persistent refresh/session handling
4. Formal role guards
5. DB-backed user auth and username generation
6. DB-backed onboarding state

## 1) Real Google OAuth Login Path
- Added endpoint: `POST /schoolcatering/api/v1/auth/google/verify`
- Behavior:
  - Accepts `idToken` and `role`
  - Verifies token with Google `tokeninfo` API:
    - `https://oauth2.googleapis.com/tokeninfo?id_token=...`
  - Validates `email_verified == true`
  - Validates `aud` when `GOOGLE_CLIENT_ID` env is set
  - Issues app access + refresh tokens on success
- Dev fallback remains:
  - `POST /schoolcatering/api/v1/auth/google/dev`

## 2) JWT + Refresh Rotation
- Implemented signed access/refresh tokens (HS256-like HMAC using Node `crypto`).
- Access token:
  - Includes `sub`, `uid`, `role`, `type=access`, `exp`
- Refresh token:
  - Includes `sub`, `uid`, `role`, `jti`, `type=refresh`, `exp`
- Rotation:
  - `POST /auth/refresh` revokes old refresh session and issues a new pair.

## 3) Persistent Session Storage
- Added migration:
  - `db/migrations/005_auth_runtime_sessions.sql`
- New table:
  - `auth_refresh_sessions (jti, user_id, app_role, issued_at, expires_at, revoked_at)`
- Login inserts refresh session row.
- Refresh validates DB session and revokes old `jti`.
- Logout revokes refresh session by `jti`.

## 4) Formal Role Guards
- Added Nest guard/decorator files:
  - `apps/api/src/auth/jwt-auth.guard.ts`
  - `apps/api/src/auth/roles.guard.ts`
  - `apps/api/src/auth/roles.decorator.ts`
- Applied guards on protected auth endpoints.
- Added RBAC test endpoint:
  - `GET /schoolcatering/api/v1/auth/admin-ping`
  - Requires `ADMIN` role via `@Roles('ADMIN')`

## 5) DB-backed User Auth + Username Collision Logic
- Auth now uses `users` table instead of in-memory credentials.
- Dev account bootstrap:
  - Ensures required test/runtime role users can be created with hashed passwords.
- Password hashing:
  - `scrypt` (Node built-in `crypto`)
- Username generation:
  - `POST /schoolcatering/api/v1/auth/username/generate`
  - Uses DB function `generate_unique_username(base)` for suffixing (`-1`, `-2`, ...)

## 6) DB-backed Onboarding State
- Uses `user_preferences.onboarding_completed`.
- Endpoints:
  - `GET /schoolcatering/api/v1/auth/onboarding`
  - `POST /schoolcatering/api/v1/auth/onboarding`
- Persists per user in DB.

## Environment Notes
- `.env.example` contains required auth + DB keys.
- API auto-loads `.env` from project root and `/var/www/schoolcatering/.env`.
- Recommended auth env keys:
  - `AUTH_JWT_SECRET`
  - `AUTH_JWT_REFRESH_SECRET`
  - `GOOGLE_CLIENT_ID` (for strict Google audience validation)
- Receipt generation and storage-related flows additionally require:
  - `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or
  - `GOOGLE_APPLICATION_CREDENTIALS`

## Web App Integration
- Protected routing middleware keeps homepage public and redirects other pages to login when unauthenticated.
- Login page supports:
  - Username/password login
  - Google dev login
- Dashboard supports:
  - Profile fetch
  - Refresh-on-401 retry
  - Logout with refresh-token revocation

## Operational Notes
- Runtime model on server:
  - `schoolcatering-api` (PM2)
  - `schoolcatering-web` (PM2)
  - Nginx reverse proxy:
    - `/schoolcatering/api/v1/*` -> API
    - `/schoolcatering/*` -> Next web
- Latest production hotfix status:
  - SQL wrapper issues in auth/core create/register paths were fixed and redeployed on 2026-02-26.
