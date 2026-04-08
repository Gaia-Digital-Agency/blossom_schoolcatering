# Contributing Guide

## Delivery Order (Required)
Always follow this order for changes:
1. Server first (`/var/www/schoolcatering`)
2. Push to GitHub (`main`)
3. Pull to local workspace

## Branch and PR Workflow
- The repository is currently maintained directly on `main`.
- Use a feature branch only when the work benefits from a review branch or PR.
- If you use a feature branch, open the PR to `main` with testing notes and deploy impact.

## Commit Message Convention
Use:
`<type>(<scope>): <summary>`

Types:
- `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `infra`

Scopes:
- `web`, `api`, `db`, `infra`, `docs`, `ci`, `ops`

Example:
`fix(web): prevent hero image crop on mobile`

## Deploy (Server)
```bash
ssh 34.158.47.112
cd /var/www/schoolcatering
git pull --ff-only origin main
npm -C apps/api run build
npm -C apps/web run build
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```

## Rollback (Server)
```bash
ssh 34.158.47.112
cd /var/www/schoolcatering
git log --oneline -n 10
git checkout <good_commit_hash>
npm -C apps/api run build
npm -C apps/web run build
pm2 restart schoolcatering-api
pm2 restart schoolcatering-web
```

## Release Tag Convention
Use:
`vYYYY.MM.DD-N`

Example:
`v2026.02.25-1`

Create and push:
```bash
git tag v2026.02.25-1
git push origin v2026.02.25-1
```
