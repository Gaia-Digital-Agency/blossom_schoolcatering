# Button Inventory and Endpoint/DB Impact Map

Generated from static code audit on 2026-02-28.
Scope: `apps/web/app` button elements and their wired API actions.

## Legend
- `No API`: UI-only action, no backend call.
- `Read-only`: API read, no DB write expected.
- `DB IDs affected`: primary IDs/tables touched (directly or by endpoint behavior).

## Global/Common Components

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/_components/password-input.tsx` | Show/Hide password | No API | Toggles password input visibility. | None |
| `apps/web/app/_components/role-login-form.tsx` | `Sign In` | `POST /api/v1/auth/login` | Role login (admin/kitchen/delivery/parent/youngster pages that use this component). | Reads `users.id` by username/role; writes/rotates refresh session (`auth_refresh_sessions`/session token id). |
| `apps/web/app/_components/dev-page.tsx` | `Update Password` | `POST /api/v1/auth/change-password` | Changes current user password. | `users.id` (password hash update). |
| `apps/web/app/_components/google-oauth-button.tsx` | Google OAuth button | `POST /api/v1/auth/google/verify` | Google sign-in/up and role validation. | `users.id` (create/read), and linked role table row (`parents.id` or `children.id`) depending role. |

## Public/Home/Auth Pages

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/page.tsx` | Nav menu toggle | No API | Opens/closes mobile nav. | None |
| `apps/web/app/page.tsx` | Scroll-to-top button | No API | Scrolls page to top. | None |
| `apps/web/app/login/page.tsx` | `Sign In` | `POST /api/v1/auth/login` | Generic home login, redirects by returned role. | Reads `users.id`; writes refresh session id/token. |
| `apps/web/app/register/_components/register-form.tsx` | `Create Account` | `POST /api/v1/auth/register` | Registers role account (used by register pages using this component). | Creates `users.id`; for parent role also creates/updates `parents.id`. |
| `apps/web/app/register/youngsters/page.tsx` | `Register Youngster` | `POST /api/v1/auth/register/youngsters` (`GET /auth/register/schools` for select preload) | One-flow youngster + parent registration/linking. | Creates/links `users.id`, `children.id`, `parents.id`; links parent-child relation row. |
| `apps/web/app/menu/page.tsx` | (No submit button; view page) | `GET /api/v1/public/menu` (on load) | Loads public active menu. | Read-only (`menus.id`, `menu_items.id`). |
| `apps/web/app/dashboard/page.tsx` | `Log Out` | `POST /api/v1/auth/logout` | Clears session and local auth state. | Removes/invalidates refresh session token/row for current `users.id`. |

## Youngster Module

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/youngsters/page.tsx` | `Add` (menu item) | No API | Adds dish to local draft selection. | None |
| `apps/web/app/youngsters/page.tsx` | `Remove` (draft item) | No API | Removes dish from local draft selection. | None |
| `apps/web/app/youngsters/page.tsx` | `Place Order` | `POST /api/v1/carts` -> `PATCH /api/v1/carts/:cartId/items` -> `POST /api/v1/carts/:cartId/submit` | Creates cart, writes cart items, submits order. | `carts.id`, `cart_items` (`cart_id`,`menu_item_id`), creates `orders.id`, `order_items.id`, and billing row (`billing_records.id`). |

## Parent Module

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/parents/page.tsx` | `Add` (menu item) | No API | Adds dish to local draft selection. | None |
| `apps/web/app/parents/page.tsx` | `Remove` (draft item) | No API | Removes dish from local draft selection. | None |
| `apps/web/app/parents/page.tsx` | `Place Order` | `POST /api/v1/carts` -> `PATCH /api/v1/carts/:cartId/items` -> `POST /api/v1/carts/:cartId/submit` | Creates/submits order for selected youngster. | `carts.id`, `cart_items`, `orders.id`, `order_items.id`, `billing_records.id`. |
| `apps/web/app/parents/page.tsx` | `Refresh Orders` | `GET /api/v1/parents/me/orders/consolidated` | Reloads order list. | Read-only (`orders.id`,`order_items.id`). |
| `apps/web/app/parents/page.tsx` | `Edit Before Cutoff` | `POST /api/v1/carts/quick-reorder` (+ menu/cart reload) | Reopens selected order into editable draft cart. | New `carts.id`, `cart_items` from source `orders.id`. |
| `apps/web/app/parents/page.tsx` | `Delete Before Cutoff` | `DELETE /api/v1/orders/:orderId` | Cancels/deletes order before cutoff. | `orders.id` (status/deleted), related `billing_records.id` state. |
| `apps/web/app/parents/page.tsx` | `Quick Reorder` | `POST /api/v1/carts/quick-reorder` | Duplicates source order into target-date draft cart. | New `carts.id`, `cart_items`; reads source `orders.id`. |
| `apps/web/app/parents/page.tsx` | `Refresh Billing` | `GET /api/v1/billing/parent/consolidated` | Reloads parent billing rows. | Read-only (`billing_records.id`). |
| `apps/web/app/parents/page.tsx` | `Upload Proof For Selected Unpaid Bills` | `POST /api/v1/billing/proof-upload-batch` | Uploads one proof image for selected billing rows. | `billing_records.id` list (`proof_image_url`,`status`). |
| `apps/web/app/parents/page.tsx` | `Open Receipt` | `GET /api/v1/billing/:billingId/receipt` | Opens generated receipt URL. | Reads `billing_records.id` receipt fields. |
| `apps/web/app/parents/page.tsx` | `Refresh Spending` | `GET /api/v1/parents/me/spending-dashboard` | Reloads spending summary. | Read-only aggregate from `orders.id`/`billing_records.id`. |

## Delivery Module

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/delivery/page.tsx` | `Past` / `Today` / `Future` | `GET /api/v1/delivery/assignments?date=...` (via load effect) | Changes assignment date filter. | Read-only (`delivery_assignments.id`,`orders.id`). |
| `apps/web/app/delivery/page.tsx` | `Refresh` | `GET /api/v1/delivery/assignments?date=...` | Reloads assignments. | Read-only (`delivery_assignments.id`). |
| `apps/web/app/delivery/page.tsx` | Complete toggle button (`Mark Complete`/toggle) | `PATCH /api/v1/delivery/assignments/:assignmentId/toggle` | Marks delivery assignment complete/incomplete. | `delivery_assignments.id`; updates linked `orders.id` delivery status and billing visibility status. |

## Kitchen Module

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/kitchen/_components/kitchen-dashboard.tsx` | `Refresh Now` | `GET /api/v1/kitchen/daily-summary?date=...` | Reloads kitchen summary cards. | Read-only (`orders.id`,`order_items.id`,`children.id`,`schools.id`). |
| `apps/web/app/kitchen/_components/kitchen-dashboard.tsx` | Order card click (`Mark Kitchen Complete`) | `POST /api/v1/kitchen/orders/:orderId/complete` | Marks kitchen production complete for order. | `orders.id` (`kitchen_status`/status fields), may cascade to delivery visibility. |
| `apps/web/app/kitchen/_components/kitchen-dashboard.tsx` | Completed order card button | No API | Read-only display element. | None |

## Admin Dashboard/Reports

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/page.tsx` | `Refresh` | `GET /api/v1/admin/dashboard?date=...` | Reloads admin KPI dashboard. | Read-only aggregate across orders/billing/users. |
| `apps/web/app/admin/reports/page.tsx` | `Refresh` | `GET /api/v1/admin/revenue?...` | Reloads revenue analytics. | Read-only aggregate (`orders`,`billing_records`,`schools`). |

## Admin Billing

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/billing/page.tsx` | `Verify` | `POST /api/v1/admin/billing/:billingId/verify` (`decision=VERIFIED`) | Verifies payment proof and marks paid. | `billing_records.id` (status/proof validation), related `orders.id` billing status. |
| `apps/web/app/admin/billing/page.tsx` | `Reject` | `POST /api/v1/admin/billing/:billingId/verify` (`decision=REJECTED`) | Rejects billing proof. | `billing_records.id` status. |
| `apps/web/app/admin/billing/page.tsx` | `Generate Receipt` / `Regenerate Receipt` | `POST /api/v1/admin/billing/:billingId/receipt` | Creates/updates receipt number/PDF URL. | `billing_records.id` receipt fields; writes receipt file to storage. |

## Admin Blackout Dates

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/blackout-dates/page.tsx` | `Save Blackout Date` | `POST /api/v1/blackout-days` | Creates blackout day rule. | New `blackout_days.id`. |
| `apps/web/app/admin/blackout-dates/page.tsx` | `Refresh` | `GET /api/v1/blackout-days` | Reloads blackout list. | Read-only `blackout_days.id`. |
| `apps/web/app/admin/blackout-dates/page.tsx` | `Delete` | `DELETE /api/v1/blackout-days/:id` | Removes blackout day. | `blackout_days.id`. |

## Admin Schools

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/schools/page.tsx` | `Deactivate`/`Activate` session | `PATCH /api/v1/admin/session-settings/:session` | Toggles app-wide meal session availability. | `session_settings.session` enum row. |
| `apps/web/app/admin/schools/page.tsx` | `Create School` | `POST /api/v1/admin/schools` | Creates school. | New `schools.id`. |
| `apps/web/app/admin/schools/page.tsx` | `Deactivate School`/`Activate School` | `PATCH /api/v1/admin/schools/:schoolId` | Toggles school active status. | `schools.id`. |
| `apps/web/app/admin/schools/page.tsx` | `Delete School` | `DELETE /api/v1/admin/schools/:schoolId` | Soft-deletes school. | `schools.id`. |

## Admin Parents

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/parents/page.tsx` | `Reset Password` | `PATCH /api/v1/admin/users/:userId/reset-password` | Generates and sets new password for parent user. | `users.id` (password hash update). |

## Admin Youngsters

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/youngsters/page.tsx` | `Create Youngster` / `Update Youngster` (submit) | `POST /api/v1/children/register` or `PATCH /api/v1/admin/youngsters/:youngsterId` | Creates youngster account/profile or updates existing one. | Create path: `users.id`,`children.id` (+ parent link); update path: `children.id` and `users.id`. |
| `apps/web/app/admin/youngsters/page.tsx` | `Cancel Edit` | No API | Clears edit form state. | None |
| `apps/web/app/admin/youngsters/page.tsx` | `Edit` | No API | Loads selected youngster into form. | None |
| `apps/web/app/admin/youngsters/page.tsx` | `Delete` | `DELETE /api/v1/admin/youngsters/:youngsterId` | Deactivates/removes youngster. | `children.id` and linked `users.id` state. |
| `apps/web/app/admin/youngsters/page.tsx` | `Reset Password` | `PATCH /api/v1/admin/users/:userId/reset-password` | Regenerates youngster login password. | `users.id` (password hash update). |

## Admin Delivery

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/delivery/page.tsx` | `Create Delivery User` | `POST /api/v1/admin/delivery/users` | Creates delivery user account. | New `users.id`, `delivery_users.id`. |
| `apps/web/app/admin/delivery/page.tsx` | `Edit` / `Save` / `Cancel` user edit | `PATCH /api/v1/admin/delivery/users/:userId` (save) | Edit delivery user profile fields. | `delivery_users.id` via `userId`/linked row; `users.id` where applicable. |
| `apps/web/app/admin/delivery/page.tsx` | `Activate`/`Deactivate` user | `PATCH /api/v1/admin/delivery/users/:userId/deactivate` (toggle payload) | Toggles delivery user active state. | `users.id`, `delivery_users.id` state. |
| `apps/web/app/admin/delivery/page.tsx` | `Save Assignment` | `POST /api/v1/delivery/school-assignments` | Assigns delivery user to school. | `delivery_school_assignments` by (`delivery_user_id`,`school_id`). |
| `apps/web/app/admin/delivery/page.tsx` | Mapping `Deactivate`/`Activate` | `POST /api/v1/delivery/school-assignments` | Toggles existing school-delivery mapping active state. | `delivery_school_assignments` row key (`delivery_user_id`,`school_id`). |
| `apps/web/app/admin/delivery/page.tsx` | `Show Today` | No write API (changes date; load does GET) | Sets date filter to today. | None |
| `apps/web/app/admin/delivery/page.tsx` | `Auto Assign by School` | `POST /api/v1/delivery/auto-assign` | Auto-creates delivery assignments for orders by school mapping. | `delivery_assignments.id`; updates linked `orders.id` delivery assignment/status. |
| `apps/web/app/admin/delivery/page.tsx` | `Refresh` | `GET /api/v1/delivery/assignments?date=...` (+ users/mappings loads) | Reloads delivery admin data. | Read-only `delivery_users.id`,`delivery_school_assignments`,`delivery_assignments.id`. |

## Admin Menu

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/menu/page.tsx` | `Load Menu Context` | `GET /api/v1/admin/ingredients`, `GET /api/v1/admin/menus?service_date&session` | Reloads ingredient + menu context for selected date/session. | Read-only `ingredients.id`, `menus.id`, `menu_items.id`. |
| `apps/web/app/admin/menu/page.tsx` | `Seed Sample Menus` | `POST /api/v1/admin/menus/sample-seed` | Creates sample menu/menu items for date. | `menus.id`, `menu_items.id`, `menu_item_ingredients`. |
| `apps/web/app/admin/menu/page.tsx` | `Create Dish` / `Update Dish` (form submit) | `POST /api/v1/admin/menu-items` or `PATCH /api/v1/admin/menu-items/:itemId` | Creates/updates dish incl. image + ingredient links. | `menu_items.id`, `menus.id`, `menu_item_ingredients`, image object path in storage. |
| `apps/web/app/admin/menu/page.tsx` | `Cancel Edit` | No API | Resets edit mode and form. | None |
| `apps/web/app/admin/menu/page.tsx` | `Add Dish` (selection helper) | No API | Adds local custom dish option to picker. | None |
| `apps/web/app/admin/menu/page.tsx` | Dish chip click | No API | Prefills dish name/description. | None |
| `apps/web/app/admin/menu/page.tsx` | Dish chip double-click (auto-create) | `POST /api/v1/admin/menu-items` | Creates dish quickly from picker. | New `menu_items.id` and related links. |
| `apps/web/app/admin/menu/page.tsx` | `Add Ingredient` (selection helper) | No API | Adds local custom ingredient option to picker list. | None |
| `apps/web/app/admin/menu/page.tsx` | Selected ingredient chip `x` | No API | Removes ingredient from current form selection. | None |
| `apps/web/app/admin/menu/page.tsx` | Ingredient chip click (auto-create+attach if missing) | `POST /api/v1/admin/ingredients` (conditional), then `GET /api/v1/admin/ingredients` | Ensures ingredient exists and adds to form selection. | `ingredients.id` (create/read). |
| `apps/web/app/admin/menu/page.tsx` | `Edit Dish` | No API | Loads menu item into form for editing. | None |
| `apps/web/app/admin/menu/page.tsx` | `Deactivate` / `Activate` dish | `PATCH /api/v1/admin/menu-items/:itemId` | Toggles dish availability. | `menu_items.id` (`is_available`). |

## Admin Kitchen Page

| File | Button | Endpoint(s) | What it does | DB IDs affected |
|---|---|---|---|---|
| `apps/web/app/admin/kitchen/page.tsx` | `Refresh` | `GET /api/v1/kitchen/daily-summary?date=...` | Reloads kitchen daily summary. | Read-only `orders.id`,`order_items.id`,`children.id`,`schools.id`. |

## Notes on IDs
- Most action endpoints use path IDs: `:schoolId`, `:youngsterId`, `:userId`, `:itemId`, `:billingId`, `:assignmentId`, `:cartId`, `:orderId`.
- Parent/Youngster order placement flows create IDs in sequence: `carts.id` -> `orders.id` -> `billing_records.id`.
- File/image uploads do not create DB image IDs; they update URL fields (e.g., `menu_items.image_url`, `billing_records.proof_image_url`) and create storage objects.
