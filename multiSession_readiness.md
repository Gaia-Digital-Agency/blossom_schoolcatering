# Multi-Session Readiness — SchoolCatering App

## AS IS

The App works well with module Family, Student, Kitchen, Delivery, Menu, Rating, Admin, Ordering, Billing, Schools. Proven and Tested on Lunch session being active. Now to enhace these 10 modules and others are ready and will function well when other session, Snacks and Breakfast is active.

- Family — Can order, view bill, see menu in different sessions, multi click bill payment across sessions
- Student — Can order, view bill, see menu in different sessions, multi click bill payment across sessions. Point calculation and accumulation for badges across sessions.
- Kitchen — Can see, mark completion within and between sessions
- Delivery — Delivery can be assigned by sessions and mark complete within and between sessions
- Menu — Separate menus for different sessions
- Rating — Can rate dishes for separate sessions
- Admin — Manage all Admin modules based within and across sessions
- Ordering — Can order based on sessions
- Billing — Can accommodate view, submit payment proof, move between paid and unpaid with tagging on specific sessions
- Schools — Can accommodate matching student and delivery based on specific session

## QUICK STATUS — WHAT IS ALREADY FIXED (as of latest commits)

## COMPLETION SUMMARY

The multi-session implementation exercise is now complete for the scope defined in this file.

- Phase 1 was completed: UI copy was cleaned up, session labels were normalized, kitchen totals were corrected, and admin operational screens were made session-aware.
- Phase 2 was completed: the shared global cutoff decision was preserved, spending and nutrition were updated to expose session-aware data, and badge accumulation was implemented as **per session** with equal weight across Breakfast, Snack, and Lunch.
- Phase 3 was completed: `blackout_days`, `menu_item_ratings`, and `delivery_school_assignments` were upgraded for session-aware behavior, delivery auto-assignment was updated to resolve by school + session, and the related admin flows were updated.

Validation completed during this exercise:

- Breakfast and Snack were activated and seeded on staging using editable app data, not hard-coded records.
- Live multi-session staging regression passed `41/41`.
- Phase 3 live staging regression passed `42/42`.
- Remaining Phase 3 scenario matrix passed `14/14`.
- Final scenario coverage included:
  - Breakfast only
  - Snack only
  - Lunch only
  - Breakfast + Snack
  - Breakfast + Lunch
  - Snack + Lunch
  - Breakfast + Snack + Lunch
  - session toggle validation
  - session-specific blackout validation
  - date-wide blackout validation

Implementation constraints followed:

- No new Family Group records were added.
- No new Student records were added.
- No new School records were added.
- No new Delivery User records were added.
- Snack and Breakfast menu seeding used current Lunch menu data as the source.
- Seeded menus and seeded orders remain normal editable CRUD app data.

Current conclusion:

- The app is now marked **multi-session ready** for the implemented scope in this document.
- `Phase 1`: complete
- `Phase 2`: complete
- `Phase 3`: complete
- Remaining next work, if needed, is no longer core implementation from this file; it is rollout, monitoring, and production-readiness planning.

These items were identified as gaps earlier but have already been resolved in the current codebase:

- **Student billing** is now fully implemented with its own youngster-authorized API endpoints:
  - `GET /billing/youngster/consolidated` added — `apps/api/src/core/core.controller.ts`
  - `POST /billing/proof-upload-batch`, `GET /billing/:id/proof-image`, `GET /billing/:id/receipt`, `POST /billing/:id/revert-proof` all extended to accept `YOUNGSTER` role
  - Frontend `apps/web/app/student/billing/page.tsx` now re-exports `FamilyBillingPage` which detects student view via `usePathname()` and switches to youngster endpoints
  - Spending Dashboard is hidden for student view (parent-specific concept)
  - **Status: DONE — not a blocker anymore**

- **Session constants** are consistently defined:
  - `SessionType = 'LUNCH' | 'SNACK' | 'BREAKFAST'` — `apps/api/src/core/core.types.ts` line 4
  - `const SESSIONS: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST']` — `apps/api/src/core/core.service.ts` line 56
  - `const SESSION_ORDER: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST']` — both order page components

- **Quick reorder is session-aware** — `createQuickReorderCart()` at `core.service.ts` line 4391 extracts `source.session` from the source order and passes it through to `createCart()` correctly

- **Admin Menu page has a session filter** — `apps/web/app/admin/menu/page.tsx` line 589 has a working session dropdown that hits `/admin/menus?session=${menuSession}`

## ASSESSMENT

The app is partially ready for Breakfast and Snack, but not safe to call "multi-session ready" yet. The base data model, ordering flow, menu separation, and most order-level APIs already carry session — the foundation is there. The main gaps fall into four buckets:

1. **Schema gaps** — two tables lack a session column that they structurally need (blackout_days, delivery_school_assignments)
2. **Calculation gaps** — kitchen totals, badge streaks, spending dashboard, and nutrition tracking all aggregate in ways that break or mislead under multi-session load
3. **UI/operational gaps** — most admin and operations screens show session data but give no way to filter by it
4. **Copy/messaging gaps** — several error paths still hardcode Lunch-specific language

This is from static code review combined with a live codebase exploration. Real Breakfast/Snack scenarios have not been run end-to-end.

## FINDINGS — WHAT IS CONFIRMED SESSION-READY

These are verified as already working correctly across all sessions:

| Item | Evidence |
|---|---|
| SessionType enum | `core.types.ts:4` — all three values defined |
| Cart creation enforces session | `core.service.ts:3633` — `assertSessionActiveForOrdering(session)` called before cart insert |
| Cart uniqueness per child+date+session | `core.service.ts:3645-3658` — unique open cart check includes session |
| Order placement passes session through | Cart and order both carry session field end-to-end |
| Menu queries filter by session | `core.service.ts:2338` (getMenus), `2473` (getPublicActiveMenu), `2573` (getAdminMenus) — all accept session param |
| Admin menu UI has session filter | `apps/web/app/admin/menu/page.tsx:589` — working session dropdown |
| Session settings per-session control | `core.service.ts:1216-1225` — each session independently activatable |
| Billing records carry session | `core.service.ts:4627, 4669` — `o.session::text AS session` in both billing queries |
| Billing UI shows session per record | `family-billing-page.tsx:25` — session field in BillingRow type, displayed in cards |
| Batch proof upload is session-neutral | Works on billing record IDs regardless of session |
| Quick reorder preserves session | `core.service.ts:4391-4395` — session extracted from source order |
| ORDER_SESSION_DISABLED thrown correctly | `core.service.ts:1247` — `assertSessionActiveForOrdering()` enforces this |
| Kitchen summary shows session totals | `core.service.ts:6668-6670` — breakfast_orders, snack_orders, lunch_orders counts in summary response |
| Delivery assignments carry session | `core.service.ts:5500` — `o.session::text AS session` in delivery query |
| Student billing now has own endpoints | `core.controller.ts` — `/billing/youngster/consolidated` and all related endpoints accept YOUNGSTER role |

## GAPS AND ISSUES

### CRITICAL — Schema Changes Required

**GAP 1: Blackout days are not session-specific**
- Table columns: `blackout_date, type, reason, created_by, updated_at` — no session column
- `core.service.ts:2224-2226` — INSERT has no session param
- Type is only `ORDER_BLOCK | SERVICE_BLOCK | BOTH` applied to the whole day
- `validateOrderDayRules()` applies the same blackout to all sessions for that date
- **Impact:** Cannot block SNACK ordering on a specific day while LUNCH continues. Cannot block BREAKFAST service while SNACK and LUNCH run. Real operational need — school holidays or special events may affect only certain meal times.
- **Fix required:** Add optional `session session_type` column (nullable = applies to all sessions) to `blackout_days` table. Update `validateOrderDayRules()` to check for session-specific blocks. Update admin blackout management UI.

**GAP 2: Delivery school assignments have no session column**
- Table primary key: `(delivery_user_id, school_id)` only — `core.service.ts:1163`
- `autoAssignDeliveriesForDate()` at `core.service.ts:5335-5365` queries by school only, no session filter
- Exact auto-assign query at lines 5342-5351 has `WHERE o.service_date = $1` with NO session clause
- One delivery user is assigned to a school and receives ALL sessions for that school
- **Impact:** Cannot assign Staff A for Breakfast deliveries and Staff B for Lunch deliveries at the same school. Breakfast typically happens earlier and may need a different driver or team.
- **Fix required:** Add `session session_type` column to `delivery_school_assignments`. Update admin delivery mapping UI to assign by school+session. Update `autoAssignDeliveriesForDate()` to match orders by school AND session. Migration needed for existing mappings.

**GAP 3: menu_item_ratings has no session tracking**
- Table columns: `menu_item_id, user_id, user_role, stars, created_at, updated_at` — `core.service.ts:1144-1155`
- Primary key: `(menu_item_id, user_id)` — one rating per user per dish, ever
- A dish served in both Lunch and Snack gets a single combined rating
- **Impact:** Cannot distinguish whether a student rated the Nasi Goreng as Breakfast or as Lunch. Cannot compute session-specific dish satisfaction scores for kitchen/menu planning.
- **Fix required:** Add `session session_type` column to `menu_item_ratings` and change primary key to `(menu_item_id, user_id, session)`. This allows one rating per user per dish per session. Update `createOrUpdateMenuRating()` at `core.service.ts:2680` and all rating queries.

### HIGH — Calculation Bugs and Logic Gaps

**GAP 4: Kitchen totals are inflated by the order_items join**
- Exact query at `core.service.ts:6663-6675`:
  ```sql
  SELECT COUNT(*)::int AS total_orders,
         COUNT(*) FILTER (WHERE o.delivery_status IN (...))::int AS total_orders_complete,
         COUNT(*) FILTER (WHERE o.session = 'BREAKFAST')::int AS breakfast_orders,
         COUNT(*) FILTER (WHERE o.session = 'SNACK')::int AS snack_orders,
         COUNT(*) FILTER (WHERE o.session = 'LUNCH')::int AS lunch_orders
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  ```
- `COUNT(*)` counts joined rows, not distinct orders. One order with 3 items = counted 3 times in total_orders AND in the session bucket
- `total_dishes` uses `SUM(oi.quantity)` which is correct — only the order counts are wrong
- **Impact:** Kitchen overview numbers will be untrustworthy. With multi-session, each session adds more orders with multiple items. Trust in the dashboard drops exactly when it matters most.
- **Fix:** Change `COUNT(*)` to `COUNT(DISTINCT o.id)` and `COUNT(*) FILTER (...)` to `COUNT(DISTINCT o.id) FILTER (...)` throughout that summary query.

**GAP 5: Ordering cutoff time is global — not per session**
- `site_settings` table columns: `setting_key (text PK), setting_value (text), updated_at`
- Single `ordering_cutoff_time` value (default `08:00`) returned by `getSiteSettings()` at `core.service.ts:7998`
- `getMakassarOrderingWindow()` in both order pages uses this one value for ALL sessions
- **Impact:** Breakfast ordering likely needs a much earlier cutoff (e.g., 07:00 the day before or same morning), Snack may need a different cutoff than Lunch, but all three use the same clock. This will cause confusion — parents ordering Breakfast after its real-world cutoff but within the system cutoff.
- **Fix options:**
  - Add `ordering_cutoff_time_breakfast` and `ordering_cutoff_time_snack` keys to site_settings
  - Or add a per-session cutoff map: `{ LUNCH: '08:00', SNACK: '08:00', BREAKFAST: '07:00' }`
  - Update `assertSessionActiveForOrdering()` and frontend ordering window logic to use session-specific cutoffs

**GAP 6: Badge and streak calculation is date-based, not session-based**
- Exact query at `core.service.ts:6565-6580`:
  ```sql
  SELECT to_char(o.service_date, 'YYYY-MM-DD')
  FROM orders o
  WHERE o.child_id = $1
    AND o.service_date >= ($2::date - INTERVAL '70 day')
    AND o.status <> 'CANCELLED'
    AND o.deleted_at IS NULL
  GROUP BY o.service_date
  ```
- `GROUP BY o.service_date` — no session grouping. If a student orders Breakfast + Snack + Lunch on one day, it still counts as ONE streak day, not three
- `calculateMaxConsecutiveOrderDays()` at `core.service.ts:6585` operates on date-only arrays
- `currentMonthOrders` also counts by date not by session/order count
- **Impact:** "Point calculation and accumulation across sessions" is not implemented. Students ordering multiple sessions per day get no additional badge progress versus single-session days. This directly contradicts the stated requirement.
- **Decision needed before fixing:** Define the badge rule:
  - Option A: Per-day only (keep current logic, update UI to say "ordering days" not "orders")
  - Option B: Per-session ordered (count each session as a point; Breakfast+Lunch on same day = 2 points)
  - Option C: Weighted (Lunch = 1pt, Snack = 0.5pt, Breakfast = 0.5pt)
  - After decision, update `getYoungsterInsights()` query, badge level thresholds, and student UI copy

**GAP 7: Spending dashboard has no per-session breakdown**
- `getParentSpendingDashboard()` at `core.service.ts:6424` aggregates total spend across all sessions combined
- Response structure: `byChild: Array<{ child_name, orders_count, total_spend }>` — no session dimension
- **Impact:** A parent cannot see "I spent Rp 500,000 on Lunch and Rp 200,000 on Snack this month." When multiple sessions run, total spend figures become less useful without the breakdown.
- **Fix:** Add session dimension to byChild response: `byChild: Array<{ child_name, session, orders_count, total_spend }>` with subtotals per session.

**GAP 8: Nutrition and weekly tracking aggregates across all sessions**
- `getYoungsterInsights()` at `core.service.ts:6510-6545` — nutrition grouped by `o.service_date` with no session filter
- Weekly calories, dishes, orders all sum across Breakfast + Snack + Lunch for the same day
- **Impact:** A student ordering Breakfast+Lunch on the same day will show combined calorie counts with no way to split by meal type.
- **Fix:** Add session to nutrition day rows: `days: Array<{ service_date, session, calories_display, tba_items }>` so the weekly view can show per-session nutrition.

### MEDIUM — UI and Operational Gaps (Backend already supports, frontend missing)

**GAP 9: Admin Orders page has no session filter**
- `apps/web/app/admin/orders/page.tsx:41` — filter modes are `ALL | DATE | SCHOOL | DELIVERY` only
- OrderRow type does include `session: string` (line 11) — the data is there
- Backend controller at `core.controller.ts:297` does not accept a session query param
- **Fix:** Add session filter to backend `getAdminOrders()` and expose a session dropdown in admin orders UI alongside date/school/delivery filters

**GAP 10: Admin Billing page has no session filter**
- `apps/web/app/admin/billing/page.tsx` — BillingRow type has `session: string` (line 17), displayed in UI, but no filter dropdown
- Admin cannot quickly view "all unpaid Breakfast bills" or "all Snack bills pending verification"
- **Fix:** Add session filter dropdown to admin billing page; pass session param to `/admin/billing` endpoint

**GAP 11: Admin Rating page shows session but cannot filter by it**
- `apps/web/app/admin/rating/page.tsx:52` — displays `service_date / session` per rating
- No filter UI — loads all ratings mixed together
- Backend `getAdminMenuRatings()` at `core.service.ts:2633` already accepts session and date params — frontend just doesn't expose them
- **Fix:** Add date and session filter dropdowns to admin rating page; wire to existing backend params

**GAP 12: Admin Delivery page has no session filter**
- `apps/web/app/admin/delivery/page.tsx:38` — Assignment type has `session: string`
- Only date filter exists; no session dropdown
- When Breakfast + Lunch are both active, delivery staff see mixed session assignments in one unsorted list
- **Fix:** Add session filter dropdown. Consider grouping assignments by session within the day.

**GAP 13: Admin Kitchen page has no session filter or grouping**
- `apps/web/app/admin/kitchen/page.tsx` — shows session counts in overview totals but no filter
- Kitchen dashboard fetches `/kitchen/daily-summary?date=${selectedDate}` with no session param — `kitchen-dashboard.tsx:93`
- When Breakfast + Snack + Lunch run on same day, all orders are in one unsorted list
- **Fix:** Add session filter/grouping to kitchen dashboard. Consider "Session tabs" (Breakfast | Snack | Lunch) so kitchen staff can focus on one session at a time

**GAP 14: Kitchen UI lacks session-first navigation flow**
- No session tabs or grouping within the order list — `apps/web/app/kitchen/_components/kitchen-dashboard.tsx`
- Cards are sorted by school+child, not by session
- Kitchen staff working through Breakfast orders must mentally filter them from Snack/Lunch cards
- **Fix:** Group order cards by session first, then school, then child (as already suggested in your file at line 146). Add visual session headers/dividers between groups.

**GAP 15: Family confirmed orders view does not filter by session**
- `family-order-page.tsx` — `confirmedOrders` useMemo at line 232 filters by `service_date` and status but NOT by session
- When three sessions run on the same day, the confirmed orders card shows ALL three session orders for that date
- This is actually correct behavior (showing all sessions for the day) — but needs clear session labels so parents are not confused
- **Note:** `selectedDayOrder` at line 241 correctly filters by date+session — the duplicate check is session-aware. Only the display section shows all sessions for the day.
- **Fix:** Minor — ensure session badges/labels are prominent enough in the confirmed orders display so parents can distinguish between sessions at a glance (already using SessionBadge component, but may need more visual weight)

### LOW — Copy and Messaging Gaps

**GAP 16: ORDER_SESSION_DISABLED error still shows "Only Lunch" copy**
- `apps/web/app/family/_components/family-order-page.tsx:435-437`:
  ```javascript
  if (msg.includes('ORDER_SESSION_DISABLED') && session !== 'LUNCH') {
    setError('Only Lunch Available');
  }
  ```
- `apps/web/app/student/_components/student-order-page.tsx:430-432`:
  ```javascript
  if (msg.includes('ORDER_SESSION_DISABLED') && session !== 'LUNCH') {
    window.alert('Only Lunch Available');
    setError('Only Lunch Available');
  }
  ```
- **Impact:** If Breakfast is disabled and a student tries to order Breakfast, they get "Only Lunch Available" which is wrong — Snack might also be active.
- **Fix:** Replace with: `setError('This session is not currently available for ordering.')` — remove the `session !== 'LUNCH'` guard too

**GAP 17: Session selector labels are raw enum values**
- Both order pages display session values as `LUNCH | SNACK | BREAKFAST` directly in the session dropdown options
- **Fix:** Map to readable labels: `LUNCH → Lunch`, `SNACK → Snack / Afternoon`, `BREAKFAST → Breakfast / Morning`

## MODULE READINESS SCORECARD

| Module | Status | Biggest Gap |
|---|---|---|
| **Menu** | ✅ Ready | Admin menu filter already works. Minor: session labels in dropdowns |
| **Ordering (core backend)** | ✅ Ready | Cart, order, cutoff window all session-aware |
| **Ordering (cutoff timing)** | ⚠️ Partial | Single global cutoff time — no per-session cutoff |
| **Family ordering UI** | ✅ Ready | Minor copy cleanup needed |
| **Student ordering UI** | ✅ Ready | Minor copy cleanup needed |
| **Family billing** | ✅ Ready | Session shown, batch proof upload works across sessions |
| **Student billing** | ✅ Ready | Fixed — own API endpoints now, student can manage billing |
| **Admin billing** | ⚠️ Partial | No session filter in admin billing UI |
| **Kitchen data** | ⚠️ Partial | COUNT(*) totals bug inflates numbers; no session UI grouping |
| **Delivery data** | ⚠️ Partial | Assignment rows show session, but assignment is school-only not school+session |
| **Delivery assignment** | ❌ Not Ready | No session column in delivery_school_assignments table |
| **Badge / Points** | ⚠️ Partial | Date-based only; session accumulation not implemented |
| **Rating** | ⚠️ Partial | No session column in ratings table; one rating per dish per user ever |
| **Admin Orders** | ⚠️ Partial | Data has session, no filter UI, no backend session param |
| **Admin Rating** | ⚠️ Partial | Backend supports session filter; frontend exposes none |
| **Admin Delivery** | ⚠️ Partial | Session in data; no filter; school-only assignment |
| **Admin Kitchen** | ⚠️ Partial | Session totals shown; no grouping/filter in UI |
| **Blackout Days** | ❌ Not Ready | No session column — blocks all sessions or none |
| **Spending Dashboard** | ⚠️ Partial | Total only — no per-session breakdown |
| **Nutrition / Insights** | ⚠️ Partial | Aggregates all sessions — no per-session nutrition split |
| **Schools** | ❌ Not Ready | No school+session delivery matching capability |
| **Error copy / UX messaging** | ❌ Not Ready | "Only Lunch" hardcoded in two places |

## TECHNICAL REFERENCE — EXACT FILE:LINE FOR EACH GAP

| Gap | File | Line(s) | Issue |
|---|---|---|---|
| Kitchen COUNT bug | `core.service.ts` | 6663-6675 | `COUNT(*)` inflated by order_items join |
| Global cutoff time | `core.service.ts` | 7982, 7998 | Single `ordering_cutoff_time` for all sessions |
| Blackout no session | `core.service.ts` | 2224-2226 | INSERT has no session column |
| Delivery assignment no session | `core.service.ts` | 1163 | Table PK is (delivery_user_id, school_id) only |
| Auto-assign no session filter | `core.service.ts` | 5342-5351 | WHERE clause has no session |
| Badge streak date-only | `core.service.ts` | 6565-6585 | GROUP BY service_date, no session |
| Spending no session breakdown | `core.service.ts` | 6424-6450 | Aggregates all sessions |
| Nutrition no session split | `core.service.ts` | 6510-6545 | No session in GROUP BY |
| Rating no session column | `core.service.ts` | 1144-1155 | Table has no session; PK is (menu_item_id, user_id) |
| Admin orders no session filter | `apps/web/app/admin/orders/page.tsx` | 41, 55-58 | Filter modes don't include session |
| Admin billing no session filter | `apps/web/app/admin/billing/page.tsx` | 17 | BillingRow has session but no filter dropdown |
| Admin rating no filter UI | `apps/web/app/admin/rating/page.tsx` | 25, 52 | Backend supports it; frontend exposes nothing |
| Admin delivery no session filter | `apps/web/app/admin/delivery/page.tsx` | 38, 74 | Session in type, date-only filter |
| Admin kitchen no session grouping | `apps/web/app/kitchen/_components/kitchen-dashboard.tsx` | 93 | Fetches by date only |
| "Only Lunch" error copy (family) | `apps/web/app/family/_components/family-order-page.tsx` | 435-437 | Hardcoded "Only Lunch Available" |
| "Only Lunch" error copy (student) | `apps/web/app/student/_components/student-order-page.tsx` | 430-432 | Hardcoded "Only Lunch Available" + window.alert |
| Session labels raw enum | Both order pages | Session `<select>` options | Shows BREAKFAST not Breakfast |

## SUGGESTED CHANGES

Preserving original suggestions and adding new ones:

**Original (confirmed still valid):**
1. Add session to `delivery_school_assignments` and make admin delivery mapping session-aware
2. Fix kitchen totals to use `COUNT(DISTINCT o.id)` instead of `COUNT(*)`
3. Decide and document badge semantics — define rule before coding
4. Add session filters to Admin Orders, Admin Billing, Admin Rating, Admin Delivery, and Admin Kitchen
5. Replace "Only Lunch" error copy with generic active-session language

**New additions from deep analysis:**
6. Add per-session cutoff times — either as separate site_settings keys or a per-session cutoff map
7. Add session column to `blackout_days` (nullable = all sessions blocked, filled = specific session)
8. Add session column to `menu_item_ratings` and update PK to `(menu_item_id, user_id, session)`
9. Add session breakdown to spending dashboard response
10. Add session to nutrition/weekly tracking days array
11. Define and implement session-aware badge accumulation once rule is decided
12. Add session grouping/tabs to Kitchen dashboard UI
13. Map session enum values to readable labels in all dropdowns (BREAKFAST → Breakfast)
14. Remove `window.alert('Only Lunch Available')` from student order page — replace with proper error state

## IMPLEMENTATION PLAN

Ordered from easy / low risk up to hard / high risk:

### 1. UI Copy and Label Cleanup
**Easy, very low risk**

- Replace "Only Lunch Available" error in `family-order-page.tsx:435` and `student-order-page.tsx:430`
- Remove `window.alert('Only Lunch Available')` from student page
- Map session enum to readable labels in all `<select>` dropdowns: `BREAKFAST → Breakfast`, `SNACK → Snack`, `LUNCH → Lunch`
- Review any other labels, empty states, or helper text still implying single-session behavior

### 2. Admin Session Filters — Screens Where Backend Already Ready
**Easy, low risk**

- Add session dropdown to Admin Rating page (`admin/rating/page.tsx:25`) — backend `getAdminMenuRatings()` already accepts session and date
- Add session dropdown and "quick date" buttons to Admin Rating — reuse existing backend params
- Add session filter to Admin Billing page — pass session param to `/admin/billing` endpoint (backend change needed: add optional session filter to `getAdminBilling()`)
- Add session filter to Admin Delivery page — display and filter by session in assignment list

### 3. Kitchen Count Bug Fix
**Medium, medium risk — but high priority for operational trust**

- Change `COUNT(*)` to `COUNT(DISTINCT o.id)` throughout the summary query at `core.service.ts:6663-6675`
- Retest kitchen overview numbers before and after
- Verify `breakfast_orders`, `snack_orders`, `lunch_orders` counts are correct
- This must be done BEFORE multi-session goes live — wrong numbers get worse with more sessions

### 4. Kitchen and Delivery Session Grouping in UI
**Medium, low risk**

- Add session grouping/tabs (Breakfast | Snack | Lunch) to kitchen dashboard
- Group order cards by session first → school → child within each session group
- Add visual session dividers between groups
- Add session filter to Admin Kitchen page (date already works; add session)
- Add session grouping to Admin Delivery page — group delivery assignments by session within the day
- Consider ordering cards: `session ASC → school ASC → child ASC` (already suggested in original file)

### 5. Admin Orders — Add Session Filter
**Medium, medium risk**

- Add optional `session` query param to `getAdminOrders()` backend method
- Expose session dropdown in `admin/orders/page.tsx` alongside existing date/school/delivery filters
- Ensure combined filtering works: date + school + delivery + session all independently combinable
- Ensure delete/read flows are safe when multiple orders exist for same child/date across sessions

### 6. Error Copy — Specific Cutoff Time per Session
**Medium, medium risk**

- Decision needed: one global cutoff or per-session cutoffs?
- If per-session: add `ordering_cutoff_time_breakfast`, `ordering_cutoff_time_snack` to `site_settings` OR add a JSONB column for session-specific overrides
- Update `getSiteSettings()` to return per-session cutoff map
- Update `getMakassarOrderingWindow()` in both order pages to use session-specific cutoff
- Update `assertSessionActiveForOrdering()` in `core.service.ts:1230-1248` to use session-specific cutoff
- Update Admin site settings page to expose per-session cutoff fields

### 7. Spending Dashboard — Add Session Breakdown
**Medium, low risk**

- Update `getParentSpendingDashboard()` at `core.service.ts:6424` query to include session dimension
- New response: `byChild: Array<{ child_name, session, orders_count, total_spend }>` with totals per session per child
- Update family billing page spending dashboard display to show session rows
- Keep a "total across sessions" rollup for easy reading

### 8. Badge Rule Decision and Implementation
**Medium, medium risk — REQUIRES business decision first**

- **Step 1:** Define the rule (per day / per session / weighted)
- **Step 2 if per-session:** Change `GROUP BY o.service_date` to `GROUP BY o.service_date, o.session` in badge query at `core.service.ts:6565-6580`; update streak calculation to count session-days not calendar-days
- **Step 3:** Update `currentMonthOrders` count logic accordingly
- **Step 4:** Update student UI badge display labels to match new semantics
- **Step 5:** Update badge threshold values if needed (ordering 3 sessions/day means hitting thresholds faster)

### 9. Nutrition/Insights — Session Breakdown
**Medium, low risk**

- Add `o.session::text AS session` to nutrition query GROUP BY at `core.service.ts:6510-6545`
- New day row: `{ service_date, session, calories_display, tba_items }`
- Update student overview page to show per-session nutrition rows within a day

### 10. Rating — Add Session Column and Update PK
**Medium, medium risk — schema change**

- Add `session session_type NOT NULL DEFAULT 'LUNCH'` column to `menu_item_ratings`
- Change primary key from `(menu_item_id, user_id)` to `(menu_item_id, user_id, session)`
- Update `createOrUpdateMenuRating()` at `core.service.ts:2680` to include session
- Update all rating queries and `getAdminMenuRatings()` to group/filter by session
- Backfill existing ratings with `session = 'LUNCH'` (they were all placed during Lunch-only period)
- Update admin rating UI to show session column and filter by it

### 11. Blackout Days — Add Session Column
**Hard, medium risk — schema change**

- Add `session session_type NULL` column to `blackout_days` (NULL = applies to all sessions)
- Update `addBlackoutDay()` / `updateBlackoutDay()` service methods to accept optional session
- Update `validateOrderDayRules()` to check both date-level and session-specific blackouts
- Update admin blackout management UI to allow creating session-specific blocks
- Update frontend order pages to correctly show blackout messages scoped to the session being ordered

### 12. Delivery Assignment — Add Session Column
**Hard, high risk — largest structural gap**

- Add `session session_type NOT NULL` to `delivery_school_assignments` table
- Change primary key from `(delivery_user_id, school_id)` to `(delivery_user_id, school_id, session)` — or use a surrogate key with unique constraint on `(school_id, session)`
- Update `autoAssignDeliveriesForDate()` at `core.service.ts:5335` to join on school AND session
- Update admin delivery management UI to assign delivery users by school + session
- Add migration: backfill existing school assignments to `session = 'LUNCH'`
- Test: verify a school can have Staff A for Breakfast and Staff B for Lunch

### 13. Full Multi-Session End-to-End Validation
**Hard, high risk**

Run the full scenario matrix after all above changes:
- Breakfast only active
- Snack only active
- Lunch only active (regression)
- Breakfast + Snack
- Snack + Lunch
- Breakfast + Lunch
- Breakfast + Snack + Lunch (all active)

Validate all 10 modules together in each scenario. Include:
- Cutoff timing per session
- Blackout (session-specific and date-wide)
- Billing proof upload and movement across multiple same-day sessions for one child
- Receipt generation when child has 3 sessions on same day
- Badge accumulation with mixed sessions
- Kitchen counts correctness
- Delivery assignment by school+session
- Admin filtering across all admin screens
- Rating per dish per session

## PHASED APPROACH

### Phase 1 — UX Stabilization and Session Exposure (Fast, Low Risk)

Expose session controls where the backend is already capable. Fix misleading copy. No schema changes.

1. Replace "Only Lunch" error copy in both order pages
2. Map session enum to readable labels in dropdowns
3. Add session filter to Admin Rating page (backend already supports it)
4. Add session filter to Admin Billing page (minor backend change needed)
5. Add session filter/grouping to Admin Delivery page
6. Add session filter to Admin Kitchen page
7. Add session grouping (session tabs/headers) to kitchen dashboard UI
8. Fix kitchen totals COUNT(*) bug — not a copy change but critical for operations trust

**Phase 1 outcome:** Users stop seeing misleading Lunch-only behavior. Admin and kitchen can operate per session more effectively. Kitchen numbers become trustworthy.

### Phase 2 — Calculation Correctness and Business Logic (Moderate Risk)

Fix the main calculation and logic gaps. No major schema redesign yet.

1. Add per-session cutoff times (site_settings + backend + both order page frontends)
2. Add session breakdown to spending dashboard
3. Add session to nutrition/weekly tracking
4. Define badge rule → implement badge calculation update
5. Add session filter to Admin Orders (backend + frontend)
6. Improve Delivery dashboard session grouping within day

**Phase 2 outcome:** Numbers are trustworthy. Cutoff timing is correct per session. Badge behavior matches intended rules. Admin can manage mixed-session days effectively.

### Phase 3 — Schema Changes and Full Structural Readiness (High Risk)

The hardest changes — schema redesign for full multi-session fulfillment.

1. Add session column to `blackout_days` — allow session-specific date blocks
2. Add session column to `menu_item_ratings` — allow per-session dish ratings
3. Add session column to `delivery_school_assignments` — school+session delivery mapping
4. Update `autoAssignDeliveriesForDate()` to resolve by school AND session
5. Update admin delivery management for school+session assignment
6. Migration backfills for all three tables
7. Run full end-to-end scenario matrix (all session combinations × all 10 modules)

**Phase 3 outcome:** Every structural gap is closed. Delivery becomes truly multi-session capable. Ratings are meaningful per session. Blackouts can target specific sessions. The app is ready for a confident multi-session rollout.

## EXECUTION ORDER

```
Phase 1:
  1.1  UI copy cleanup — "Only Lunch" error messages
  1.2  Session label mapping in dropdowns
  1.3  Kitchen COUNT(*) totals bug fix
  1.4  Admin Rating — add session/date filter UI
  1.5  Admin Billing — add session filter
  1.6  Admin Delivery — add session grouping/filter
  1.7  Admin Kitchen — add session grouping/filter
  1.8  Kitchen dashboard — session tabs/grouping

Phase 2:
  2.1  Per-session cutoff time configuration
  2.2  Admin Orders — add session filter (backend + frontend)
  2.3  Spending dashboard — session breakdown
  2.4  Nutrition/insights — session per day row
  2.5  Badge rule decision → implement

Phase 3:
  3.1  blackout_days — add session column + logic
  3.2  menu_item_ratings — add session column + update PK
  3.3  delivery_school_assignments — add session column
  3.4  Auto-assign update for school+session
  3.5  Admin delivery UI for school+session assignment
  3.6  Migration backfills for all three tables
  3.7  Full end-to-end multi-session validation
```

## IMPORTANT IMPLEMENTATION CONSTRAINTS

These constraints are mandatory for the multi-session rollout work:

1. **Do not create new Family Group records**
   - Use only existing current data.

2. **Do not create new Student records**
   - Use only existing current data.

3. **Do not create new School records**
   - Use only existing current data.

4. **Do not create new Delivery User records**
   - Use only existing current data.

5. **Seed Snack and Breakfast menus from the current Lunch menu only**
   - Use only:
     - `2` items from **Main Dishes**
     - **All** items from **Desserts**
     - **All** items from **Sides**
     - **All** items from **Drinks**

6. **Rename seeded dishes by session prefix only**
   - Snack session dish naming format: `snack_<existing lunch dish name>`
   - Breakfast session dish naming format: `breakfast_<existing lunch dish name>`
   - Keep the original Lunch dish name unchanged after the prefix.

7. **Seeded Snack and Breakfast menu data must not be hard coded**
   - After seeding, all seeded menu items must remain fully editable in the app.
   - Admin must be able to update/delete/change them manually through normal CRUD flows.

8. **Seed orders minimally**
   - Add only `1 order per student per session`.
   - Do not create more than the minimum needed for testing and validation.

9. **Seeded orders must not be hard coded**
   - Seeded orders must behave like normal app data.
   - They must remain fully manageable through normal app CRUD behavior.

10. **Seeding should use app-compatible data, not fixed demo-only logic**
    - Anything seeded for Snack and Breakfast must remain usable, editable, and deletable from the live app after insertion.

## DETAILED TODO LIST

Mark each item: `[ ]` = not started · `[~]` = in progress · `[x]` = done

Goal: seamless App where Snack and Breakfast sessions can be switched ON/OFF from Admin and the entire App — ordering, kitchen, delivery, billing, rating, badges — accommodates immediately with no broken flows.

### PHASE 1 — UX Stabilization (No Schema Changes)

#### P1-1 · UI Copy — Replace "Only Lunch" Error Messages
- [x] `apps/web/app/family/_components/family-order-page.tsx:435` — replace `if (msg.includes('ORDER_SESSION_DISABLED') && session !== 'LUNCH')` block with generic `setError('This session is not currently available for ordering.')`
- [x] `apps/web/app/student/_components/student-order-page.tsx:430` — same fix, also remove `window.alert('Only Lunch Available')`
- [x] Verify no other files contain the string "Only Lunch" as a user-facing message

#### P1-2 · UI Labels — Map Session Enum to Readable Labels
- [x] Create a shared util `getSessionLabel(session: SessionType): string` → `LUNCH → 'Lunch'`, `SNACK → 'Snack'`, `BREAKFAST → 'Breakfast'`
- [x] Apply to session `<select>` options in `family-order-page.tsx`
- [x] Apply to session `<select>` options in `student-order-page.tsx`
- [x] Apply to SessionBadge component if it shows raw enum text
- [x] Check kitchen dashboard, delivery dashboard, admin pages for raw enum display — replace all

#### P1-3 · Bug Fix — Kitchen Totals COUNT Inflation
- [x] `apps/api/src/core/core.service.ts:6663-6675` — change `COUNT(*)` to `COUNT(DISTINCT o.id)` for `total_orders`
- [x] Change `COUNT(*) FILTER (WHERE o.delivery_status IN (...))` to `COUNT(DISTINCT o.id) FILTER (...)` for `total_orders_complete`
- [x] Change `COUNT(*) FILTER (WHERE o.session = 'BREAKFAST')` to `COUNT(DISTINCT o.id) FILTER (...)` for `breakfast_orders`
- [x] Same fix for `snack_orders` and `lunch_orders`
- [x] Keep `SUM(oi.quantity)` for `total_dishes` — this one is correct as-is
- [x] Rebuild API and verify kitchen overview numbers match actual order counts

#### P1-4 · Admin Rating — Add Session and Date Filter UI
- [x] `apps/web/app/admin/rating/page.tsx:25` — add session dropdown state (default: all)
- [x] Add service date filter input
- [x] Wire to existing backend params — `getAdminMenuRatings()` at `core.service.ts:2633` already accepts session and date
- [x] Test: filter by LUNCH, then SNACK — verify results change correctly

#### P1-5 · Admin Billing — Add Session Filter
- [x] `apps/api/src/core/core.service.ts` — add optional `session` param to `getAdminBilling()` method; filter with `AND o.session = $n::session_type` when provided
- [x] `apps/api/src/core/core.controller.ts` — add `@Query('session') session?: string` to admin billing GET endpoint
- [x] `apps/web/app/admin/billing/page.tsx` — add session dropdown filter UI; pass to API call
- [x] Test: view only Snack billing records, then only Breakfast

#### P1-6 · Admin Delivery — Add Session Grouping and Filter
- [x] `apps/web/app/admin/delivery/page.tsx` — add session dropdown filter state
- [x] Filter displayed assignments by selected session
- [x] Group assignment cards by session within the day with clear session headers
- [x] Test: assign date with LUNCH + SNACK active — confirm cards grouped correctly

#### P1-7 · Admin Kitchen — Add Session Grouping and Filter
- [x] `apps/web/app/admin/kitchen/page.tsx` — add session filter dropdown
- [x] Pass session param to kitchen summary API call if backend supports it, or filter client-side
- [x] Test: toggle session filter — confirm orders change

#### P1-8 · Kitchen Dashboard — Session Tabs / Grouping
- [x] `apps/web/app/kitchen/_components/kitchen-dashboard.tsx` — add session tab bar (All | Breakfast | Snack | Lunch)
- [x] Filter displayed order cards by selected session tab
- [x] Sort order cards within each session group: school ASC → child ASC
- [x] Add visual session header/divider between groups when showing All
- [x] Test with multiple sessions active on same day — confirm clean separation

#### P1-9 · Admin Orders — Add Session Filter
- [x] `apps/api/src/core/core.service.ts` — add optional `session` param to `getAdminOrders()` or equivalent query
- [x] `apps/api/src/core/core.controller.ts:297` — add `@Query('session') session?: string`
- [x] `apps/web/app/admin/orders/page.tsx:41` — add session to filter modes; add session dropdown UI
- [x] Test: filter by BREAKFAST — confirm only Breakfast orders shown
- [x] Test: combine date + school + session filter simultaneously

### PHASE 2 — Calculation Correctness and Business Logic

#### P2-1 · Per-Session Cutoff Times
- [x] **Decide:** single global cutoff vs per-session cutoff (business decision)
  - **Decision:** Keep **one global cutoff** for all sessions
- [x] No per-session cutoff implementation needed
- [x] Existing single global cutoff retained in backend and frontend
- [x] Phase 2 conclusion: cutoff logic remains intentionally shared across Breakfast, Snack, and Lunch

#### P2-2 · Spending Dashboard — Add Session Breakdown
- [x] `apps/api/src/core/core.service.ts` — `getParentSpendingDashboard()` now groups by child + session
- [x] Response shape updated to `byChild: Array<{ child_id, child_name, session, orders_count, total_spend }>` with total month rollup retained
- [x] `apps/web/app/family/_components/family-billing-page.tsx` spending dashboard now shows per-session rows
- [x] Build-validated; ready for manual Lunch + Snack scenario verification

#### P2-3 · Nutrition / Weekly Insights — Session Per Day Row
- [x] `apps/api/src/core/core.service.ts` — nutrition query now includes `o.session::text AS session`
- [x] Weekly nutrition grouping changed to `service_date + session`
- [x] Response type updated to `days: Array<{ service_date, session, calories_display, tba_items }>`
- [x] Student overview now displays per-session nutrition rows within the week
- [x] Build-validated; ready for manual Breakfast + Lunch scenario verification

#### P2-4 · Badge Rule — Decision and Implementation
- [x] **Decide badge accumulation rule** (per day / per session / weighted)
  - **Decision:** `per session`
  - **Meaning:** `Breakfast + Snack + Lunch` on the same day counts as `3`
  - **Weighting:** all sessions have the same weight
- [x] Badge order queries now group by `service_date + session` where session accumulation matters
- [x] `currentMonthOrders` now reflects per-session counting
- [x] Consecutive-day streak kept intentionally day-based; duplicate same-day sessions no longer collapse monthly order count
- [x] Student badge UI labels updated to reflect session-based monthly accumulation
- [x] Badge thresholds left unchanged for now
- [x] Live staging Breakfast/Snack regression completed successfully

### PHASE 3 — Schema Changes (Requires Migrations)

#### P3-1 · Blackout Days — Add Session Column
- [x] Write DB migration: `ALTER TABLE blackout_days ADD COLUMN session session_type NULL;` (NULL = applies to all sessions)
- [x] Update `addBlackoutDay()` service method to accept optional session param
- [x] Update `validateOrderDayRules()` — check both date-level blackouts (session IS NULL) and session-specific blackouts (session = ordering session)
- [x] Update admin blackout management page to show session field; allow creating session-specific blocks
- [x] Update frontend order pages to show correct session-scoped blackout message
- [x] Test: block only SNACK on a date — confirm LUNCH and BREAKFAST ordering still works on that date

#### P3-2 · Menu Item Ratings — Add Session Column and Update PK
- [x] Write DB migration:
  - `ALTER TABLE menu_item_ratings ADD COLUMN session session_type NOT NULL DEFAULT 'LUNCH';`
  - Drop old PK `(menu_item_id, user_id)`
  - Add new PK or unique constraint: `(menu_item_id, user_id, session)`
  - Backfill: `UPDATE menu_item_ratings SET session = 'LUNCH';`
- [x] Update `createOrUpdateMenuRating()` at `core.service.ts:2680` to include session in upsert
- [x] Update `getAdminMenuRatings()` at `core.service.ts:2633` to group by session
- [x] Update all rating query joins to include session in ON clause
- [x] Update admin rating page to show session per rating; add session filter
- [x] Test: separate rating records now persist with session scope in live staging regression (`BREAKFAST` and `SNACK`)

#### P3-3 · Delivery School Assignments — Add Session Column
- [x] Write DB migration:
  - `ALTER TABLE delivery_school_assignments ADD COLUMN session session_type NOT NULL DEFAULT 'LUNCH';`
  - Drop old PK `(delivery_user_id, school_id)`
  - Add unique constraint: `(school_id, session)` — one delivery user per school per session
  - Backfill: `UPDATE delivery_school_assignments SET session = 'LUNCH';`
- [x] Update `autoAssignDeliveriesForDate()` at `core.service.ts:5335` — join on `school_id AND session` not just `school_id`
- [x] Update `getDeliveryAssignmentsForDate()` / related methods to use school+session matching
- [x] Update admin delivery mapping page — assign by school + session; show separate rows per session
- [x] Test: live staging regression passed with session-scoped delivery assignment rows and auto-assigned Breakfast/Snack orders

#### P3-4 · Full Multi-Session End-to-End Validation
- [x] **Scenario 1: Breakfast only active** — order, kitchen, delivery, billing, rating all work
- [x] **Scenario 2: Snack only active** — same checklist
- [x] **Scenario 3: Lunch only active (regression)** — confirm nothing broken vs before
- [x] **Scenario 4: Breakfast + Snack** — cross-session batch billing proof upload; delivery by school+session
- [x] **Scenario 5: Snack + Lunch** — kitchen session grouping; admin filtering by session
- [x] **Scenario 6: Breakfast + Lunch** — badges accumulating correctly; spending dashboard by session
- [x] **Scenario 7: All three active** — live staging regression passed `42/42` with active Breakfast, Snack, and Lunch configuration
- [x] **Session toggle test** — Admin toggles Snack OFF while Breakfast+Lunch active; confirm Snack orders blocked, others unaffected; kitchen and delivery show only active session orders; billing for existing Snack orders still accessible
- [x] **Cutoff rule** — one global cutoff for all sessions by confirmed business decision; no per-session cutoff implementation required
- [x] **Blackout test** — session-specific block + date-wide block both work as expected

### DONE — Already Completed

- [x] Student billing own API endpoints added (`/billing/youngster/consolidated` + all proof/revert/receipt endpoints with YOUNGSTER role)
- [x] Student billing page uses youngster endpoints with student-scoped billing and spending data
- [x] SessionType enum consistent across API and web
- [x] Cart creation enforces session (unique open cart per child+date+session)
- [x] Quick reorder preserves session from source order
- [x] Admin menu page has working session filter
- [x] Session settings per-session activation/deactivation (Admin can toggle Snack and Breakfast ON/OFF)
- [x] `assertSessionActiveForOrdering()` blocks orders for disabled sessions
- [x] Billing records tagged with session in all billing queries
- [x] Kitchen summary returns per-session order counts (breakfast_orders, snack_orders, lunch_orders)
- [x] Phase 1 checklist fully completed
- [x] Phase 2 checklist `P2-1` to `P2-4` fully completed
- [x] Live staging regression for Breakfast and Snack passed `41/41`
- [x] Phase 3 implementation deployed to staging in commits `e85f71d` and `33e8c9a`
- [x] Live staging Phase 3 regression passed `42/42` on `2026-03-19`
- [x] Remaining Phase 3 scenario matrix passed `14/14` on staging on `2026-03-18` after seeding editable future menus for `2026-03-20`
- [x] Phase 3 checklist fully completed

*Progress tracker — update `[ ]` to `[~]` when in progress, `[x]` when done.*
*Target: all items [x] before enabling Snack or Breakfast in production.*
