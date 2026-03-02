# Secrets Handling Audit

Date: 2026-03-02
Scope: runtime `.env` and server filesystem controls

## Required Secret Rules
- Do not commit `.env` files or credential artifacts.
- Keep production secrets outside repo and inject via server-managed `.env`.
- Restrict secret file permissions to owner-readable/writeable only.

## Local/Repo Checks
- `.gitignore` includes secret-related patterns and `.env` handling.
- No plaintext secrets were added in application source during this change set.

## VM/Server Checklist (Run on target host)
1. Validate env file ownership and permissions:
```bash
ls -l /var/www/schoolcatering/.env
stat -c "%a %U %G %n" /var/www/schoolcatering/.env
```
Expected: owned by deploy user, permission `600` or `640`.

2. Enforce strict permission:
```bash
chmod 600 /var/www/schoolcatering/.env
chown <deploy-user>:<deploy-group> /var/www/schoolcatering/.env
```

3. Ensure process user can read env but non-privileged users cannot.

4. Validate secrets are loaded only from approved locations:
- `apps/api/src/main.ts` loads local `.env` and `/var/www/schoolcatering/.env`.

## Rotation Guidance
- Rotate `AUTH_JWT_SECRET` and `AUTH_JWT_REFRESH_SECRET` on suspicion/incident.
- Revoke active refresh sessions after secret rotation and force re-authentication.
