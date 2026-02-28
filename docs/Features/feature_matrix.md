# Blossom School Catering - Full Feature Matrix

Last verified from code: 2026-02-28  
Repository: `/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering`  
Runtime base path: `/schoolcatering`  
API base path: `/schoolcatering/api/v1`

## 1) Roles and Route Guarding

### Roles
- `PARENT`
- `YOUNGSTER`
- `ADMIN`
- `KITCHEN`
- `DELIVERY`

### Public Routes
- `/`
- `/home`
- `/menu`
- `/guide`
- `/login`
- `/register`
- `/register/youngsters`
- `/register/parent` (redirects to `/register/youngsters`)
- `/register/delivery` (redirects to `/register`)
- `/admin/login`
- `/kitchen/login`
- `/delivery/login`
- `/parent/login`
- `/youngster/login`

### Protected Routes
- Parent: `/parents`, `/parent`, `/parent/*`
- Youngster: `/youngsters`, `/youngster`, `/youngster/*`
- Admin: `/admin`, `/admin/*`
- Kitchen: `/kitchen`, `/kitchen/*`
- Delivery: `/delivery`, `/delivery/*`

### Middleware Behavior
- Missing token on protected route redirects to matching role login.
- Wrong role on protected route redirects to matching role login.
- Authenticated user opening their own role-login route is redirected to role home.
- `/rating` is auth-required but not role-restricted.

## 2) Public and Entry Features

### Home (`/`)
- Brand header with mobile menu toggle.
- Links: Menu, external Steakhouse site, Guides/T&C.
- Calls to action: `Log In`, `Register`, Google OAuth button.
- Hero image, chef message, footer, back-to-top button.

### Login (`/login`)
- Username/password form.
- On success redirects:
  - `PARENT` -> `/parents`
  - `YOUNGSTER` -> `/youngsters`
  - other roles -> `/dashboard`

### Youngster Registration (`/register/youngsters`)
- Combined youngster + parent registration flow.
- Required registrant selector: `YOUNGSTER`, `PARENT`, `TEACHER`.
- Teacher flow requires `teacherName` (max 50 chars).
- School options loaded from `GET /auth/register/schools`.
- Record mode (`?mode=record`) for parent/youngster is read-only.

### Guides (`/guide`)
- Dynamically reads markdown files from `docs/guides/*`.
- Shows file-based `Last updated` timestamps.

### Public Menu (`/menu`)
- Public menu browsing via `GET /public/menu`.

### Rating (`/rating`)
- Auth-required dish rating page.
- Submits ratings via `POST /ratings`.

## 3) Role Feature Matrix

### Parent (`/parents`)
- Linked youngster selection.
- Menu and draft cart management.
- Place order flow (create cart -> patch items -> submit cart).
- Quick reorder and edit-before-cutoff.
- Delete-before-cutoff.
- Consolidated orders.
- Consolidated billing.
- Batch proof upload for unpaid billing.
- Open receipt for paid rows.
- Spending dashboard.
- Shared logout button.

### Youngster (`/youngsters`)
- Profile summary.
- Weekly nutrition and badge insight.
- Menu and draft cart management.
- Place order flow.
- Consolidated own orders.
- Shared logout button.

### Admin (`/admin/*`)
- Dashboard KPI.
- Parent list + reset password.
- Youngster create/edit/delete + reset password.
- School create/activate/deactivate/delete.
- Session setting toggle (Lunch fixed ON).
- Blackout create/list/delete.
- Menu management (create/update/delete/toggle/seed/upload image).
- Ingredient create/update/delete.
- Billing verify/reject and receipt generation.
- Delivery user create/edit/activate-deactivate.
- Delivery-school mapping and auto-assign.
- Reports and admin kitchen monitoring.

### Kitchen (`/kitchen*`)
- Date-specific dashboards (`yesterday`, `today`, `tomorrow`).
- Overview and summary tables.
- Dietary alert section (today view).
- Order board with `Mark Kitchen Complete`.
- Hourly refresh within operational window.

### Delivery (`/delivery`)
- Assignment list by selected date.
- Date quick actions: `Past`, `Today`, `Future`.
- Completion toggle per assignment.
- Optional confirmation note payload.

## 4) Authentication and Session Features
- JWT access token + refresh rotation.
- Refresh token stored in secure HttpOnly cookie.
- Access token mirrored in local storage/cookie for middleware checks.
- Silent refresh on `401` in shared fetch helper.
- Logout invalidates server refresh session and clears local auth state.
- Role-based guards in backend (`JwtAuthGuard`, `RolesGuard`).

## 5) API Surface (Implemented)

### Auth (`/api/v1/auth`)
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

### Public (`/api/v1/public`)
- `GET /menu`

### Core (`/api/v1`)
- Schools/session:
  - `GET /schools`
  - `POST /admin/schools`
  - `PATCH /admin/schools/:schoolId`
  - `DELETE /admin/schools/:schoolId`
  - `GET /admin/session-settings`
  - `GET /session-settings`
  - `PATCH /admin/session-settings/:session`
- Parent/youngster/admin management:
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
- Menu, favourites, ordering acceleration:
  - `GET /menus`
  - `GET /favourites`
  - `POST /favourites`
  - `DELETE /favourites/:favouriteId`
  - `POST /favourites/:favouriteId/apply`
  - `POST /carts/quick-reorder`
  - `POST /meal-plans/wizard`
  - `POST /ratings`
- Admin menu/ingredient:
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

### System
- `GET /api/v1/health`

## 6) Enforcement and Quality
- Request validation via class-validator DTOs + global ValidationPipe.
- Global throttling via Throttler guard/module.
- UUID path parameter validation on mutation/detail endpoints.
- Parent/youngster order constraints:
  - max 5 distinct items
  - cutoff enforcement
  - blackout enforcement
  - session availability enforcement
- Delivery/kitchen status transitions are API-enforced.

## 7) Known In-Progress Areas
- OpenAPI docs endpoint (`/api/v1/docs`) is not yet wired.
- Correlation ID middleware is not yet wired.
- Structured JSON logging stack is not yet finalized.
- CSV import module is still pending.
