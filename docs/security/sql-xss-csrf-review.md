# Security Review: SQL Injection, XSS, CSRF

Date: 2026-03-02
Scope: `apps/api`, `apps/web`

## Summary
- SQL injection risk: mitigated by parameterized SQL usage (`runSql(sql, params)`).
- XSS risk: mitigated by React escaping and stricter image upload validation.
- CSRF risk: reduced with `SameSite=Strict` refresh cookie and origin checks on sensitive auth routes.

## SQL Injection Review
- Verified API service queries predominantly use placeholder parameters (`$1`, `$2`, ...).
- Added/maintained UUID validation on critical path params and strict role checks.
- Action: continue avoiding string interpolation for user-controlled values.

## XSS Review
- No use of `dangerouslySetInnerHTML` in app pages rendering user-provided data.
- Added stricter upload MIME/signature validation:
  - Allowed formats: PNG/JPEG/WEBP.
  - Magic-byte signature checks.
  - File size limits enforced.
- Action: keep rendering user text as plain text; avoid raw HTML render patterns.

## CSRF Review
- Refresh token cookie already uses `httpOnly` + `sameSite: 'strict'`.
- Added server-side origin/referrer checks for:
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `POST /api/v1/auth/password/reset`
- Added default security headers middleware (`nosniff`, frame deny, referrer policy, permissions policy).

## Residual Risks / Follow-up
- Add full helmet policy set and CSP tuning once web/API deployment topology is finalized.
- Add automated security tests for CSRF-origin rejection cases.
