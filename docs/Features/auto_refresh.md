# Auto Refresh Note

Last reviewed: 2026-03-10

## Count of true automatic refresh mechanisms (without explicit button click): **1**

1. `apps/web/lib/auth.ts`
   - `apiFetch()` auto-triggers `window.location.reload()` after successful `POST/PATCH/PUT/DELETE` calls
   - bypassed only when `skipAutoReload: true` is passed

## Not counted as automatic refresh

- `apps/web/app/kitchen/_components/kitchen-dashboard.tsx`
  - loads on mount/date switch, then manual `Refresh` button
  - no periodic interval polling in current code
- `apps/web/app/delivery/page.tsx`
  - loads on mount and on explicit actions (`Refresh`, `Show Service Date`, toggle complete)
- `apps/web/app/admin/delivery/page.tsx`
  - loads on date change and explicit actions (`Show Service Date`, auto assign, CRUD actions)
- countdown/clock timers in role pages (if present)
  - UI state updates only, not server data refresh

## Related UX Standard
- Runtime action errors displayed inline as `.auth-error`
- Disabled/unallowed actions are clearly styled
