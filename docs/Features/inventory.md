# Apps Inventory (Latest)

Generated: 2026-02-28
Source basis: `git ls-files apps` (excluding `*.md` and `package-lock.json`).

## Summary
- Total files: `129`
- Total text/code lines: `16967`

## Files by Category

| Category | Files | Text/Code Lines |
|---|---:|---:|
| Backend Config | 5 | 148 |
| Backend Source | 60 | 8445 |
| Backend Test | 4 | 147 |
| Frontend Config | 4 | 53 |
| Frontend Source | 51 | 8256 |
| Frontend Static Asset | 5 | 24 |
| Database Utility | 1 | 81 |

## Notable Growth Since Previous Inventory
- API source expanded significantly (DTO coverage and core/auth logic growth).
- Frontend module pages now include richer admin and kitchen/delivery implementations.
- Shared frontend utilities now include:
  - `apps/web/lib/dish-tags.ts`
  - `apps/web/lib/image.ts`
  - `apps/web/app/_components/logout-button.tsx`
  - `apps/web/app/_components/network-activity-indicator.tsx`
- Added runtime page modules:
  - `apps/web/app/guide/page.tsx`
  - `apps/web/app/rating/page.tsx`

## Largest Runtime Source Files (Current)

| File | Lines |
|---|---:|
| `apps/api/src/core/core.service.ts` | 5314 |
| `apps/api/src/auth/auth.service.ts` | 1027 |
| `apps/web/app/admin/menu/page.tsx` | 982 |
| `apps/web/app/globals.css` | 1009 |
| `apps/web/app/parents/page.tsx` | 615 |
| `apps/web/app/admin/delivery/page.tsx` | 505 |
| `apps/web/app/youngsters/page.tsx` | 439 |
| `apps/web/app/kitchen/_components/kitchen-dashboard.tsx` | 381 |
| `apps/web/app/register/youngsters/page.tsx` | 389 |

## Inventory Notes
- Asset binary files (`jpg`, `svg`) are counted as files and marked `N/A` for line count.
- This inventory is repository-based (tracked files), not runtime build-output based.
- For full implementation behavior, cross-reference:
  - `docs/Features/full_feature_matrix.md`
  - `docs/Features/buttons.md`
  - `docs/Features/map.md`
