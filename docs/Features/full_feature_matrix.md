# Blossom School Catering - Exhaustive Feature Matrix (Scarffolded)

Last verified from code and docs: 2026-02-28  
Repository: `/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering`  
Runtime base path: `/schoolcatering`  
API base path: `/schoolcatering/api/v1`

## 1) Scope and intent

This document is a single end-to-end feature inventory of what is implemented in this codebase across:
- Public pages
- Authentication/session behavior
- Parent, Youngster, Admin, Kitchen, Delivery modules
- Shared controls (including logout)
- Backend endpoint surface
- Key business rules and enforcement points

This file is implementation-grounded (actual routes/pages/controllers), not only product intent.

## 2) Role and route map

### Roles
- `PARENT`
- `YOUNGSTER`
- `ADMIN`
- `KITCHEN`
- `DELIVERY`

### Public routes
- `/`
- `/home`
- `/menu`
- `/guide`
- `/login`
- `/register`
- `/register/youngsters`
- `/register/delivery`
- `/admin/login`
- `/kitchen/login`
- `/delivery/login`
- `/parent/login`
- `/youngster/login`

### Protected role routes
- Parent-only: `/parents`, `/parent`, `/parent/*`
- Youngster-only: `/youngsters`, `/youngster`, `/youngster/*`
- Admin-only: `/admin`, `/admin/*`
- Kitchen-only: `/kitchen`, `/kitchen/*`
- Delivery-only: `/delivery`, `/delivery/*`

### Special auth route behavior
- `/rating` requires authentication but is not role-restricted.
- Unauthenticated access to protected routes redirects to role login.
- Wrong role on protected routes redirects to required role login.
- If already logged in and user opens their own role login page, user is redirected to role landing page.

## 3) Global shared capabilities (all authenticated roles where rendered)

### `Logout`
- Shared floating `Logout` button exists on authenticated app pages using the shared component.
- Button action:
  - Calls `POST /auth/logout`
  - Clears local auth state and cookies (`blossom_access_token`, `blossom_role`)
  - Redirects to `/rating`

### `Record` shortcut
- Shared floating `Record` button is visible only for `PARENT` and `YOUNGSTER` roles.
- Button action: opens `/register/youngsters?mode=record`.
- Record mode on youngster registration is read-only for these roles.

### Session/token behaviors
- Access token stored in localStorage + cookie mirror for middleware checks.
- Refresh token stored as HttpOnly cookie server-side.
- On API 401, frontend attempts one silent refresh via `POST /auth/refresh`.
- If refresh fails, frontend clears auth state and redirects to role login.

### Network activity state
- Shared fetch wrapper tracks pending network requests and publishes `blossom:network-busy` event.

## 4) Public and entry features

### Home (`/`)
- Brand header with mobile menu toggle.
- Links: Menu, external Steakhouse site, Guides/T&C.
- CTA buttons:
  - `Log In` -> `/login`
  - `Register` -> `/register/youngsters`
  - Google OAuth button
- Hero image and chef message content.
- Back-to-top button.

### Public menu (`/menu`)
- Loads active menu via public API.
- Read-only menu browsing.

### Guides (`/guide`)
- Dynamically loads markdown from `docs/guides/*`.
- Expandable guide sections with file-based `Last updated` timestamp.

### Generic login (`/login`)
- Username/password login flow.
- Redirect target depends on returned role:
  - Parent -> `/parents`
  - Youngster -> `/youngsters`
  - Other role -> `/dashboard`

### Registration chooser (`/register`)
- Links to youngster registration.
- Notes that delivery registration is admin-managed.

### Youngster registration (`/register/youngsters`)
- Combined youngster + parent registration flow.
- Required registrant selection:
  - `YOUNGSTER`
  - `PARENT`
  - `TEACHER`
- Conditional teacher name requirement when registrant is `TEACHER`.
- School dropdown loaded from `GET /auth/register/schools`.
- Creates/links parent and youngster in one request.
- Record mode (`?mode=record`) for parent/youngster:
  - Read-only view
  - Parent can select one of linked youngsters if multiple
  - Shows record data, no submit allowed

### Delivery registration (`/register/delivery`)
- Uses shared register form path, while operational creation of delivery users is administered through Admin Delivery module.

### Dish rating (`/rating`)
- Auth-required page.
- Loads active dishes from `GET /public/menu`.
- Star rating (1-5) per dish.
- `Submit Review` and `Back To Home` both persist selected ratings then log out and redirect home.

## 5) Role capability matrix (can/cannot summary)

## Parent can
- Log in on `/parent/login`.
- Log out using shared floating logout button.
- Open `Record` view shortcut.
- Load linked youngsters and choose youngster context.
- Browse menu by date/session with filters.
- Manage draft cart (create/resume/update/discard).
- Place order from draft cart.
- Use quick reorder from existing order.
- Edit/delete order before cutoff when `can_edit=true`.
- View consolidated order history for linked youngsters.
- View consolidated billing for linked youngsters.
- Upload payment proof in batch for selected unpaid bills.
- Open receipt after generation.
- View spending dashboard (month totals, by-child spend, birthday highlight info).
- Access session settings read endpoint to adapt UI session options.

## Parent cannot
- Access non-parent protected routes.
- Verify/reject billing.
- Manage admin entities (schools/menu/delivery users/etc).

## Youngster can
- Log in on `/youngster/login`.
- Log out using shared floating logout button.
- Open `Record` view shortcut.
- View own profile summary.
- View own insights (nutrition and badges).
- Browse menu by date/session.
- Manage own draft cart and place orders.
- View own consolidated orders.
- Submit dish ratings.

## Youngster cannot
- Access parent-only or admin-only modules.
- Verify billing.
- Manage school/menu/admin data.

## Admin can
- Log in on `/admin/login`.
- Log out using shared floating logout button.
- Use Admin top navigation across all admin modules.
- View dashboard KPIs and refresh by date.
- Manage parents list and reset parent passwords.
- Manage youngsters (create, edit, delete, reset password).
- Link parent-child relations.
- Manage schools (create, activate/deactivate, delete).
- Manage session settings (toggle snack/breakfast, lunch guard enforced by backend rules).
- Manage blackout days (create/list/delete).
- Manage menu and ingredients:
  - Load menu context by date/session
  - Create/update menu item
  - Activate/deactivate menu item
  - Seed sample menus
  - Auto-create ingredient when needed
  - Upload menu image
  - View menu ratings summary
- Manage billing:
  - View billing rows
  - Verify/reject proof
  - Generate/regenerate receipt
- Manage delivery:
  - Create/edit delivery users
  - Activate/deactivate delivery users
  - Map schools to delivery users
  - Activate/deactivate mapping
  - Auto-assign orders by school/date
  - View assignments
- View kitchen summary from admin kitchen page.
- View revenue/report analytics with filters.

## Kitchen can
- Log in on `/kitchen/login`.
- Log out using shared floating logout button.
- Open kitchen dashboards:
  - `/kitchen` (today)
  - `/kitchen/today`
  - `/kitchen/yesterday`
  - `/kitchen/tomorrow`
- Refresh daily summary.
- On today view, mark order as kitchen-complete.
- View allergen and order board data returned by API.

## Delivery can
- Log in on `/delivery/login`.
- Log out using shared floating logout button.
- Load own assignments for selected date.
- Use Past/Today/Future date quick controls.
- Add optional confirmation note.
- Toggle assignment complete/incomplete (`Mark Complete` / undo).
- View assignment grouping by school.

## 6) Page-by-page implemented features

### Parent module (`/parents`)
- Main sections:
  - youngster selector and profile summary
  - menu and draft cart
  - consolidated orders
  - billing
  - spending dashboard
- Ordering controls:
  - date and session picker
  - menu item `Add`
  - draft item `Remove`
  - `Place Order`
  - draft auto-resume for open cart
- Order controls:
  - `Refresh Orders`
  - `Edit Before Cutoff`
  - `Delete Before Cutoff`
  - `Quick Reorder`
- Billing controls:
  - select unpaid billing rows
  - upload single proof for selected bills
  - `Refresh Billing`
  - `Open Receipt`
- Spending controls:
  - `Refresh Spending`
- Rule-aware UI:
  - max 5 distinct items enforcement
  - cutoff countdown display
  - session availability from `/session-settings`

### Youngster module (`/youngsters`)
- Main sections:
  - profile
  - weekly insights and badge summary
  - ordering and draft cart
  - own order snapshots
- Ordering controls:
  - date/session selector
  - menu item `Add`
  - draft item `Remove`
  - `Place Order`
- Rule-aware UI:
  - max 5 distinct items enforcement
  - cutoff countdown display
  - open draft resume
  - session availability handling

### Delivery module (`/delivery`)
- Main sections:
  - date controls
  - refresh
  - optional note
  - grouped assignment cards
- Controls:
  - `Past`, `Today`, `Future`
  - `Refresh Assignments`
  - `Mark Complete` / `Completed (Click to Undo)`

### Kitchen module (`/kitchen*`)
- Top controls: date-context tabs and refresh.
- Today view:
  - overview metrics
  - dish summary
  - allergen alerts
  - order board with completion action
- Yesterday/tomorrow views:
  - summary-oriented view per selected date

### Admin dashboard (`/admin`)
- Date selector + refresh.
- KPI cards and operational aggregates.

### Admin parents (`/admin/parents`)
- Parent listing.
- Parent password reset action.

### Admin youngsters (`/admin/youngsters`)
- Create youngster form.
- Edit youngster form.
- Delete youngster action.
- Reset youngster password action.
- Parent linking in creation path.

### Admin schools (`/admin/schools`)
- Create school.
- Activate/deactivate school.
- Delete school.
- Session setting toggles (snack/breakfast).

### Admin menu (`/admin/menu`)
- Context load by service date/session.
- Create/update dish.
- Activate/deactivate dish.
- Seed sample menus.
- Ingredient list load and creation.
- Master dish helper controls.
- Image upload/processing before submit.
- Menu ratings read panel.

### Admin blackout (`/admin/blackout-dates`)
- Create blackout date.
- Filtered list load.
- Delete blackout date.

### Admin delivery (`/admin/delivery`)
- Create delivery user.
- Edit delivery user.
- Activate/deactivate delivery user.
- Create/activate/deactivate school mappings.
- Show today date shortcut.
- Auto assign by school/date.
- Refresh assignment snapshot.

### Admin billing (`/admin/billing`)
- List billing rows.
- Verify proof.
- Reject proof.
- Generate/regenerate receipt.

### Admin reports (`/admin/reports`)
- Revenue query filters:
  - from/to
  - day/month/year
  - school
  - delivery user
  - parent
  - session
  - dish
  - order status
  - billing status
- Refresh analytics output.

### Admin kitchen (`/admin/kitchen`)
- Admin-facing kitchen summary monitor.
- Date + refresh interaction.

### Alias/placeholder routes
- `/parent` re-exports `/parents`.
- `/youngster` re-exports `/youngsters`.
- `/admin/backout-dates` is a placeholder pointing users to canonical `/admin/blackout-dates`.

## 7) Backend endpoint feature surface

## Auth endpoints (`/api/v1/auth`)
- `POST /login`
- `POST /register`
- `GET /register/schools`
- `POST /register/youngsters`
- `POST /google/dev`
- `POST /google/verify`
- `GET /me`
- `POST /refresh`
- `POST /username/generate`
- `GET /onboarding`
- `POST /onboarding`
- `POST /role-check`
- `POST /logout`
- `POST /change-password`
- `GET /admin-ping`

## Public endpoints (`/api/v1/public`)
- `GET /menu`

## Core endpoints (`/api/v1`)
- Schools/session settings:
  - `GET /schools`
  - `POST /admin/schools`
  - `PATCH /admin/schools/:schoolId`
  - `DELETE /admin/schools/:schoolId`
  - `GET /admin/session-settings`
  - `GET /session-settings`
  - `PATCH /admin/session-settings/:session`
- Parent/youngster profile/admin management:
  - `POST /children/register`
  - `GET /admin/parents`
  - `PATCH /admin/parents/:parentId`
  - `DELETE /admin/parents/:parentId`
  - `GET /admin/children`
  - `PATCH /admin/youngsters/:youngsterId`
  - `DELETE /admin/youngsters/:youngsterId`
  - `PATCH /admin/users/:userId/reset-password`
  - `GET /children/me`
  - `GET /youngsters/me/insights`
  - `GET /youngsters/me/orders/consolidated`
  - `GET /parents/me/children/pages`
  - `POST /parents/:parentId/children/:childId/link`
- Admin dashboard/reports:
  - `GET /admin/dashboard`
  - `GET /admin/revenue`
  - `GET /admin/reports`
- Blackout:
  - `GET /blackout-days`
  - `POST /blackout-days`
  - `DELETE /blackout-days/:id`
- Ingredients/menu/menu-ratings:
  - `GET /admin/ingredients`
  - `POST /admin/ingredients`
  - `PATCH /admin/ingredients/:ingredientId`
  - `DELETE /admin/ingredients/:ingredientId`
  - `GET /admin/menus`
  - `GET /admin/menu-ratings`
  - `POST /admin/menus/sample-seed`
  - `POST /admin/menu-items`
  - `PATCH /admin/menu-items/:itemId`
  - `DELETE /admin/menu-items/:itemId`
  - `POST /admin/menu-images/upload`
- Menu browsing/favourites/order acceleration:
  - `GET /menus`
  - `GET /favourites`
  - `POST /favourites`
  - `DELETE /favourites/:favouriteId`
  - `POST /carts/quick-reorder`
  - `POST /meal-plans/wizard`
  - `POST /favourites/:favouriteId/apply`
  - `POST /ratings`
- Billing:
  - `GET /billing/parent/consolidated`
  - `POST /billing/:billingId/proof-upload`
  - `POST /billing/proof-upload-batch`
  - `GET /billing/:billingId/receipt`
  - `GET /admin/billing`
  - `POST /admin/billing/:billingId/verify`
  - `POST /admin/billing/:billingId/receipt`
- Delivery:
  - `GET /delivery/users`
  - `POST /admin/delivery/users`
  - `PATCH /admin/delivery/users/:userId/deactivate`
  - `PATCH /admin/delivery/users/:userId`
  - `GET /delivery/school-assignments`
  - `POST /delivery/school-assignments`
  - `POST /delivery/auto-assign`
  - `POST /delivery/assign`
  - `GET /delivery/assignments`
  - `POST /delivery/assignments/:assignmentId/confirm`
  - `PATCH /delivery/assignments/:assignmentId/toggle`
- Cart/order:
  - `GET /carts`
  - `POST /carts`
  - `GET /carts/:cartId`
  - `PATCH /carts/:cartId/items`
  - `DELETE /carts/:cartId`
  - `POST /carts/:cartId/submit`
  - `GET /orders/:orderId`
  - `GET /parents/me/orders/consolidated`
  - `GET /parents/me/spending-dashboard`
  - `PATCH /orders/:orderId`
  - `DELETE /orders/:orderId`
- Kitchen:
  - `GET /kitchen/daily-summary`
  - `POST /kitchen/orders/:orderId/complete`

## 8) Business and security rules implemented in flow

- Role-based route protection via Next.js middleware.
- Backend role protection via JWT guard + roles guard.
- UUID parsing on id params with `ParseUUIDPipe` on core mutation/detail endpoints.
- Parent and youngster order flows use cart lifecycle (`OPEN` -> `SUBMITTED`/`EXPIRED`).
- Max distinct order items is enforced as 5.
- Session availability is controlled by admin session settings.
- Blackout dates block ordering according to service rules.
- Duplicate active order protection exists for child/date/session.
- Refresh-token rotation and persisted refresh-session handling are implemented.
- Change-password endpoint is authenticated.

## 9) Data and operational feature areas covered

- Identity and role-based account model (`users`, role-linked tables).
- Parent-child linking and multi-child parent flows.
- Schools and session operational controls.
- Menus, menu items, ingredients, ingredient associations.
- Carts, orders, order items, order mutation trail.
- Favourite meal templates and apply flow.
- Billing records, proof upload, verification lifecycle.
- Digital receipts generation/read flow.
- Delivery users, school mappings, assignment and confirmation lifecycle.
- Kitchen daily summary and completion status transitions.
- Youngster badge/insight exposure.

## 10) Related docs already in repo

- Existing map: `docs/complementary/map.md`
- UI action inventory: `docs/Features/buttons.md`
- UAT scenarios: `docs/Features/user_test.md`
- RBAC spec: `docs/specifications/rbac-matrix.md`
- API spec: `docs/specifications/api-contract.md`
- Order rules: `docs/specifications/order-rules.md`
- Data model: `docs/specifications/data-model.md`
- Role user guides: `docs/guides/*.md`

## 11) Explicit capability statements (requested style)

These are direct, implementation-specific statements in plain language.

### Registration and identity
- Teacher can register a youngster (and linked parent flow) from public registration page `/register/youngsters` by choosing registrant type `TEACHER`.
- Teacher registration path requires `Teacher Name` (max 50 chars) before submit.
- Parent can register a youngster from `/register/youngsters` by choosing registrant type `PARENT`.
- Youngster can register from `/register/youngsters` by choosing registrant type `YOUNGSTER`.
- Parent+youngster combined registration is handled by `POST /api/v1/auth/register/youngsters`.
- Parent and youngster can open a read-only youngster record view by pressing `Record` button, which navigates to `/register/youngsters?mode=record`.
- Read-only record mode explicitly tells user to request Admin for edits.

### Youngster account and editing
- Youngster module (`/youngsters`) does not provide an `Edit Youngster` button for profile data changes.
- Youngster module has ordering controls (`Add`, `Remove`, `Place Order`) and insight displays, not profile edit form submission.
- Youngster can view own registration/profile data and order through own account.
- If youngster/parent wants profile data correction, implemented path is Admin edit in `Admin > Youngsters`.

### Admin youngster management
- Admin can open `Admin > Youngsters` at `/admin/youngsters`.
- Admin can create youngster (`Create Youngster`) from admin youngster form.
- Admin can click `Edit` on an existing youngster row and update youngster information.
- Admin update call is `PATCH /api/v1/admin/youngsters/:youngsterId`.
- Admin can change youngster first name, last name, phone, email, date of birth, gender, school, grade, allergies, and linked parent in the form flow.
- Admin can click `Cancel Edit` to reset edit mode.
- Admin can click `Delete` to remove/deactivate youngster (`DELETE /api/v1/admin/youngsters/:youngsterId`).
- Admin can click `Reset Password` for youngster login reset (`PATCH /api/v1/admin/users/:userId/reset-password`).
- Admin youngster screen displays registration note if youngster was registered by teacher (`Registered by Teacher: ...`).

### Ordering and who can place orders
- Parent can place orders for linked youngster from `/parents`.
- Youngster can place own orders from `/youngsters`.
- Teacher does not have a runtime “teacher ordering account/module” for placing orders.
- Teacher participation in current implementation is registration actor metadata on youngster registration flow.

### Login, logout, and session
- Admin can logout from admin pages through shared floating `Logout` button.
- Parent can logout from parent pages through shared floating `Logout` button.
- Youngster can logout from youngster pages through shared floating `Logout` button.
- Kitchen can logout from kitchen pages through shared floating `Logout` button.
- Delivery can logout from delivery pages through shared floating `Logout` button.
- Logout API is `POST /api/v1/auth/logout`, followed by local auth clear and redirect to `/rating`.

### Page-action examples (micro level)
- Parent page has `Edit Before Cutoff` and `Delete Before Cutoff` buttons per order row.
- Parent page has `Quick Reorder` button per order row.
- Parent page has `Upload Proof For Selected Unpaid Bills` and `Open Receipt`.
- Delivery page has `Past`, `Today`, `Future`, `Refresh Assignments`, and `Mark Complete` / `Completed (Click to Undo)`.
- Kitchen today page has order-card completion action (`mark kitchen complete`).
- Admin billing page has `Verify`, `Reject`, `Generate Receipt`, and `Regenerate Receipt`.
- Admin schools page has `Create School`, `Activate/Deactivate School`, `Delete School`, and session toggle buttons.
- Admin menu page has `Load Menu Context`, `Seed Sample Menus`, `Create/Update Dish`, `Cancel Edit`, `Edit Dish`, and `Activate/Deactivate`.
