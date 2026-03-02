# Go-Live Runbook (Hour-by-Hour)

Date: Tuesday, 2026-03-03  
Timezone: Asia/Makassar (WITA, UTC+8)  
Owner: Release manager + Ops lead

## T-120 min (06:00)
- [ ] Confirm latest `main` commit hash and release tag
- [ ] Confirm no open blocker defects
- [ ] Confirm production `.env` values checklist complete

## T-90 min (06:30)
- [ ] Put change freeze in effect (non-critical deploys blocked)
- [ ] Announce maintenance window to stakeholders
- [ ] Verify backup storage target has free space

## T-60 min (07:00)
- [ ] Take pre-go-live DB backup
- [ ] Validate backup integrity (`./scripts/db_restore_dry_run.sh <backup-file>`)

## T-45 min (07:15)
- [ ] Run production DB migration plan
- [ ] Verify tables/indexes/views and core seed data

## T-30 min (07:30)
- [ ] Deploy application build on production host
- [ ] Restart PM2 services
- [ ] Run health endpoints:
  - `/health`
  - `/ready`

## T-20 min (07:40)
- [ ] Run smoke test set:
  - admin login
  - parent registration/login
  - menu page loads
  - create cart/place order
  - billing list and status

## T-10 min (07:50)
- [ ] Verify logs and monitoring:
  - JSON logs flowing
  - no critical errors in PM2 logs
  - nginx access/error logs healthy

## Go-Live (08:00)
- [ ] Remove maintenance notice
- [ ] Open production URL for users
- [ ] Send go-live announcement

## T+30 min (08:30)
- [ ] Monitor order creation rate and response times
- [ ] Monitor billing proof uploads and verification flow
- [ ] Confirm delivery and kitchen dashboards refresh correctly

## T+120 min (10:00)
- [ ] Final post-launch review with Product/Ops/QA
- [ ] Confirm no Sev-1/Sev-2 issues
- [ ] Close go-live change ticket
