# Production Values Checklist

Prepared on: 2026-03-02  
Target go-live date: 2026-03-03

## 1) Environment and Secrets
- [ ] `DATABASE_URL` set to production DB endpoint
- [ ] `AUTH_JWT_SECRET` and `AUTH_JWT_REFRESH_SECRET` replaced with new production secrets
- [ ] `AUTH_COOKIE_SECURE=true`
- [ ] `AUTH_EXPOSE_RESET_TOKEN=false`
- [ ] `CORS_ORIGIN=https://<production-host>`
- [ ] `NEXT_PUBLIC_SITE_URL=https://<production-host>`
- [ ] `NEXT_PUBLIC_API_BASE=/schoolcatering/api/v1`

## 2) Storage and Google Integration
- [ ] `GCS_BUCKET` points to production bucket
- [ ] `GCS_*_FOLDER` values validated
- [ ] `CDN_BASE_URL` verified
- [ ] Google credentials configured (`GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`)
- [ ] OAuth client ID configured in API and web (`GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)

## 3) Server Security
- [ ] `/var/www/schoolcatering/.env` permissions set to `600`
- [ ] ownership of env file verified (`deploy user`)
- [ ] PM2 processes run with `NODE_ENV=production`
- [ ] firewall and SSH access rules verified

## 4) App Health
- [ ] `curl -fsS http://127.0.0.1:3006/health` returns healthy
- [ ] `curl -fsS http://127.0.0.1:3006/ready` returns ready
- [ ] web app reachable on production URL

## 5) Sign-off Gate
- [ ] Product sign-off completed
- [ ] Ops sign-off completed
- [ ] QA sign-off completed
