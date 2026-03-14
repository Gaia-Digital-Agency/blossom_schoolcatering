# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]
- Root README added and aligned to current architecture/runtime.
- Section 5 master data templates completed:
  - schools, dish, ingredient, blackout, menu, parents, kids, delivery.
- `ingredient.json` upgraded with ingredient categories for dropdown filtering.
- Role-based auth/login routing completed and `teameditor` revoked.
- Google OAuth id-token login flow implemented (frontend GIS + backend verify endpoint).
- Plan/progress docs updated to current completion state.

## [v2026.03.13-beta] - 2026-03-13
- Marked this checkpoint as the App Beta Version.
- Admin Delivery:
  - fixed selected service-date assignment visibility on `/admin/delivery`
  - renamed `Auto Assignment` to `Delivery Assignments`
- Admin Menu:
  - removed date-specific guidance and `Service Date` control from `/admin/menu`
  - aligned menu management to session-based operation only (`LUNCH`, `SNACK`, `BREAKFAST`)

## [v2026.02.25-1] - 2026-02-25
- Baseline staging deployment completed on VM.
- Homepage base UI, hero image, logo, favicon, robots, sitemap configured.
