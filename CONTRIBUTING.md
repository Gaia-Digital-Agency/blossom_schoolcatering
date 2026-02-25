# Contributing Guide

## Delivery Order (Required)
Always follow this order for changes:
1. Server first (`/var/www/schoolcatering`)
2. Push to GitHub (`main` via PR)
3. Pull to local workspace

## Branch and PR Workflow
- Do not push directly to `main`.
- Create a feature branch: `feature/<short-topic>`
- Open PR to `main` with testing notes and deploy impact.
- Merge only after checks pass.

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
cd /var/www/schoolcatering
git fetch origin main
git pull --rebase origin main
rm -rf public/*
cp -r apps/web/* public/
```

## Rollback (Server)
```bash
cd /var/www/schoolcatering
git log --oneline -n 10
git checkout <good_commit_hash>
rm -rf public/*
cp -r apps/web/* public/
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
