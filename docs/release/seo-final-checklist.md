# Final SEO Check (Pre-Production)

Prepared on: 2026-03-02  
Planned verification date: 2026-03-03

## Title and Meta
- [x] Global title set in Next metadata (`Blossom School Catering`)
- [x] Global description added in layout metadata
- [x] Canonical configured via metadata alternates (`/schoolcatering`)

## Robots and Sitemap
- [x] `robots.txt` generated dynamically from app metadata route
- [x] `sitemap.xml` generated dynamically from app metadata route
- [x] API path disallowed in robots (`/schoolcatering/api/`)
- [ ] Verify production host in robots/sitemap (`NEXT_PUBLIC_SITE_URL`) after deployment

## Canonical and Host Consistency
- [x] Metadata base URL now uses `NEXT_PUBLIC_SITE_URL`
- [ ] Confirm `NEXT_PUBLIC_SITE_URL` is exact production URL (https, no trailing slash mismatch)

## Verification Commands (production)
```bash
curl -I https://<production-host>/schoolcatering/
curl -fsS https://<production-host>/schoolcatering/robots.txt
curl -fsS https://<production-host>/schoolcatering/sitemap.xml
```

## Manual Browser Checks
- [ ] View source on home page and confirm canonical tag points to production host
- [ ] Confirm no `noindex` meta on public pages
- [ ] Confirm login/register/public guide pages are reachable and indexed appropriately
