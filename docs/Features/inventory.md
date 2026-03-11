# Apps Inventory (Latest)

Generated: 2026-03-11  
Source basis: `git ls-files apps` (excluding `*.md` and `package-lock.json`).

## Summary
- Total files: `148`
- Total text/code lines: `22933`

## Files by Category

| Category | Files | Text/Code Lines |
|---|---:|---:|
| Backend Config | 5 | 150 |
| Backend Source | 74 | 10999 |
| Backend Test | 2 | 34 |
| Frontend Config | 5 | 158 |
| Frontend Source | 56 | 11527 |
| Frontend Static Asset | 3 | 58 |
| Other App Files | 3 | 7 |

## Largest Runtime Source Files (Current)

| File | Lines |
|---|---:|
| `apps/api/src/core/core.service.ts` | 6985 |
| `apps/web/app/globals.css` | 1203 |
| `apps/api/src/auth/auth.service.ts` | 1160 |
| `apps/web/app/admin/menu/page.tsx` | 1002 |
| `apps/web/app/admin/delivery/page.tsx` | 891 |
| `apps/web/app/admin/youngsters/page.tsx` | 820 |
| `apps/web/app/parents/orders/page.tsx` | 751 |
| `apps/api/src/core/core.controller.ts` | 743 |
| `apps/web/app/youngsters/page.tsx` | 671 |
| `apps/web/app/register/youngsters/page.tsx` | 564 |

## Notable Growth Areas
- `core.service.ts` continues to centralize most business logic (kitchen, delivery, billing, admin CRUD, reporting).
- `admin/delivery` and `admin/youngsters` pages have become dense operational modules.
- delivery/kitchen/admin interactions now include additional state-management and guard workflows.
- Delivery and kitchen now include richer PDF-export workflows (2-column output) and selected-date handling.
- Admin delivery now includes notification email workflow for today assignments with PDF attachment generation.

## Inventory Notes
- Binary/static assets are counted as files; line counts for binaries are not semantically meaningful.
- Inventory is repository-tracked source based, not build-output based.
- Cross-reference behavior docs:
  - `docs/Features/feature_matrix.md`
  - `docs/Features/buttons_api.md`
  - `docs/Features/map.md`
