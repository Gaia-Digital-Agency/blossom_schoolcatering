# Apps Inventory (Latest)

Generated: 2026-03-14  
Source basis: `git ls-files apps` (excluding `*.md` and `package-lock.json`).

## Summary
- Total files: `156`
- Total text/code lines: `24395`
- API app files: `83`
- Web app files: `73`
- API app text/code lines: `12031`
- Web app text/code lines: `12364`

## Largest Runtime Source Files (Current)

| File | Lines |
|---|---:|
| `apps/api/src/core/core.service.ts` | 7232 |
| `apps/api/src/auth/auth.service.ts` | 1223 |
| `apps/web/app/globals.css` | 1203 |
| `apps/web/app/admin/menu/page.tsx` | 966 |
| `apps/web/app/admin/delivery/page.tsx` | 891 |
| `apps/web/app/admin/youngsters/page.tsx` | 886 |
| `apps/api/src/core/core.controller.ts` | 842 |
| `apps/web/app/parents/orders/page.tsx` | 768 |
| `apps/web/app/youngsters/page.tsx` | 671 |
| `apps/web/app/register/youngsters/page.tsx` | 590 |

## Notable Growth Areas
- `core.service.ts` remains the main business-logic hub for menu, ordering, billing, delivery, schools, and admin workflows.
- `auth.service.ts` continues to absorb registration, identity, password, and account-linking logic.
- Admin operational pages remain the densest frontend surfaces:
  - billing
  - delivery
  - menu
  - youngsters
- Registration is now effectively unified through `/register`, with legacy parent/youngster registration routes acting as compatibility redirects.
- Billing now includes authenticated receipt-file delivery and in-page proof/receipt preview flows.
- Admin schools now separate active and deactivated schools into different sections instead of using a status column in a single table.

## Feature Doc Map
- Button-triggered API/actions: [button_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/button_api.md)
- Route and link map: [links_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/links_api.md)
- Non-button API/page/data map: [map_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/map_api.md)
- Broader feature matrix: [feature_matrix.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/feature_matrix.md)

## Notes
- Inventory is repository-tracked source based, not build-output based.
- Static assets are counted as files but are not a meaningful measure of application complexity.
- Counts in this file reflect the current workspace state at generation time.
