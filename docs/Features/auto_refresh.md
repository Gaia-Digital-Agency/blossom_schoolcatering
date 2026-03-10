## Auto Refresh Note

Last reviewed: 2026-03-09

Count of automatic refresh mechanisms (without button click): **2**

1. `apps/web/app/kitchen/_components/kitchen-dashboard.tsx`
   - Auto loads kitchen data every 60 minutes (only during 05:00-21:00 Asia/Makassar).

2. `apps/web/lib/auth.ts`
   - Auto triggers `window.location.reload()` after successful `POST/PATCH/PUT/DELETE` API calls (unless `skipAutoReload` is enabled).

### Not counted as auto refresh

- `apps/web/app/parents/page.tsx`
- `apps/web/app/youngsters/page.tsx`

These use 1-second timers only to update on-screen countdown/clock state, not to refresh data from the server.

## Related UX Standard (2026-03-09)
- Runtime action errors are displayed inline as bold red blocks (`.auth-error`).
- Disabled/unallowed buttons are visibly marked in red with `not-allowed` cursor.
