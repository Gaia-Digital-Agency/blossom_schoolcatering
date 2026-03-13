# Blossom School Catering - Feature Matrix

Last verified from code: 2026-03-11  
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
- `/`, `/home`, `/menu`, `/guide`, `/privacy-and-confidentiality`
- `/login`, `/register`, `/register/youngsters`, `/register/parent`, `/register/delivery`
- `/admin/login`, `/kitchen/login`, `/delivery/login`, `/parent/login`, `/youngster/login`

### Protected Routes
- Parent: `/parents`, `/parent`, `/parents/*`
- Youngster: `/youngsters`, `/youngster`, `/youngsters/*`
- Admin: `/admin`, `/admin/*`
- Kitchen: `/kitchen`, `/kitchen/*`
- Delivery: `/delivery`, `/delivery/*`

### Middleware Behavior
- Missing token on protected route redirects to role login.
- Wrong role on protected route redirects to matching role login.
- Authenticated role-login access redirects to role home.

## 2) Public and Entry Features

### Home (`/`)
- Mobile-first landing surface with CTA to login/register.
- Includes guide/menu navigation and supporting content sections.

### Login (`/login`)
- Username/password auth; redirects based on role.

### Register (`/register/youngsters`)
- Combined youngster + parent registration.
- Registrant type enforced: `YOUNGSTER | PARENT | TEACHER`.
- Teacher mode enforces `teacherName` max 50 chars.

### Guides (`/guide`)
- Renders markdown from `docs/guides/*`.

### Public Menu (`/menu`)
- Read-only menu display from public API.

### Rating (`/rating`)
- Auth-required dish rating submission.

## 3) Role Feature Matrix

### Parent (`/parents`)
- Child-linked ordering with session/date selection.
- Cart -> submit -> order flow.
- Edit/delete before cutoff (rule-gated).
- Quick reorder flow.
- Consolidated billing and proof upload/batch upload.
- Authenticated billing proof image view.
- Receipt view and proof revert workflow.
- Spending dashboard.

### Youngster (`/youngsters`)
- Weekly nutrition/insight panel.
- Badge/points calculations.
- Ordering flow and consolidated order history.

### Delivery (`/delivery`)
- Assignment views grouped into pending/completed.
- Quick date filters: Yesterday/Today/Tomorrow.
- Manual service date picker + `Show Service Date` for arbitrary dates.
- `Download PDF` for selected service date (2-column output).
- Delivery order cards now include: Session, Youngster Full Name, School, Phone Number, Dietary Allergies, Status, Dishes.
- Assignment completion toggle with optional note.

### Kitchen (`/kitchen*`)
- Day-specific dashboards (`yesterday`, `today`, `tomorrow`).
- Overview, dish summary, dietary alerts, pending/completed order columns.
- `Total Orders Complete` shown in overview.
- Manual date picker on kitchen page now loads selected service date immediately.
- `Download PDF` now renders 2-column output.
- Toggle kitchen completion per order.

### Admin (`/admin/*`)
- Dashboard, reports, schools, sessions, blackout dates, menu, ingredients, billing, kitchen monitor.
- Parents:
  - show password action
  - delete parent action (blocked when linked youngster exists)
- Youngsters:
  - create/edit/delete
  - youngster password reset
- Delivery management:
  - delivery user CRUD + active/inactive toggle
  - show password action for delivery users (admin reset)
  - school mapping CRUD + activate/deactivate
  - `SEND NOTIFICATION EMAIL` action in Delivery vs School Assignment card
  - auto assignment by school
  - `Auto Assignment` includes per-order detailed rows
  - `Show Service Date` loads assigned orders for selected date
- Admin kitchen overview includes `Total Orders Complete`.

## 4) Authentication and Session Features
- Access token + refresh token model.
- Refresh token in HttpOnly cookie.
- Silent refresh path on API 401.
- Role guards in middleware and backend.
- Admin reset-password endpoint supports:
  - `PARENT`
  - `YOUNGSTER`
  - `DELIVERY`

## 5) API Surface (Current)

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
- `POST /password/forgot`
- `POST /password/reset`
- `GET /admin-ping`

### Public (`/api/v1/public`)
- `GET /menu`

### Core (`/api/v1`)
- Schools/session/site settings:
  - `GET /schools`
  - `POST /admin/schools`
  - `PATCH /admin/schools/:schoolId`
  - `DELETE /admin/schools/:schoolId`
  - `GET /admin/site-settings`
  - `PATCH /admin/site-settings`
  - `GET /admin/session-settings`
  - `GET /session-settings`
  - `PATCH /admin/session-settings/:session`
- Parent/youngster management:
  - `POST /children/register`
  - `GET /admin/parents`
  - `PATCH /admin/parents/:parentId`
  - `DELETE /admin/parents/:parentId`
  - `GET /admin/children`
  - `PATCH /admin/youngsters/:youngsterId`
  - `DELETE /admin/youngsters/:youngsterId`
  - `PATCH /admin/users/:userId/reset-password`
  - `PATCH /admin/youngsters/:youngsterId/reset-password`
  - `GET /children/me`
  - `GET /youngsters/me/insights`
  - `GET /youngsters/me/orders/consolidated`
  - `GET /parents/me/children/pages`
  - `POST /parents/:parentId/children/:childId/link`
- Dashboard/reports:
  - `GET /admin/dashboard`
  - `GET /admin/revenue`
  - `GET /admin/reports`
  - `GET /admin/audit-logs`
- Blackout:
  - `GET /blackout-days`
  - `POST /blackout-days`
  - `DELETE /blackout-days/:id`
- Ingredients/menu/ratings:
  - `GET /admin/ingredients`
  - `POST /admin/ingredients`
  - `PATCH /admin/ingredients/:ingredientId`
  - `DELETE /admin/ingredients/:ingredientId`
  - `GET /admin/menus`
  - `GET /admin/menu-ratings`
  - `POST /admin/menus/sample-seed`
  - `POST /admin/orders/sample-seed`
  - `POST /admin/menu-items`
  - `PATCH /admin/menu-items/:itemId`
  - `DELETE /admin/menu-items/:itemId`
  - `POST /admin/menu-images/upload`
  - `POST /ratings`
- Menus/favourites/carts/orders:
  - `GET /menus`
  - `GET /favourites`
  - `POST /favourites`
  - `DELETE /favourites/:favouriteId`
  - `POST /favourites/:favouriteId/apply`
  - `POST /carts/quick-reorder`
  - `POST /meal-plans/wizard`
  - `GET /carts`
  - `POST /carts`
  - `GET /carts/:cartId`
  - `PATCH /carts/:cartId/items`
  - `DELETE /carts/:cartId`
  - `POST /carts/:cartId/submit`
  - `GET /orders/:orderId`
  - `PATCH /orders/:orderId`
  - `DELETE /orders/:orderId`
  - `GET /parents/me/orders/consolidated`
  - `GET /parents/me/spending-dashboard`
- Billing:
  - `GET /billing/parent/consolidated`
  - `POST /billing/:billingId/proof-upload`
  - `POST /billing/proof-upload-batch`
  - `GET /billing/:billingId/proof-image`
  - `GET /billing/:billingId/receipt`
  - `POST /billing/:billingId/revert-proof`
  - `GET /admin/billing`
  - `GET /admin/billing/:billingId/proof-image`
  - `POST /admin/billing/:billingId/verify`
  - `POST /admin/billing/:billingId/receipt`
- Delivery:
  - `GET /delivery/users`
  - `POST /admin/delivery/users`
  - `PATCH /admin/delivery/users/:userId/deactivate`
  - `PATCH /admin/delivery/users/:userId`
  - `DELETE /admin/delivery/users/:userId`
  - `POST /admin/delivery/send-notification-email`
  - `GET /delivery/school-assignments`
  - `POST /delivery/school-assignments`
  - `DELETE /delivery/school-assignments/:deliveryUserId/:schoolId`
  - `POST /delivery/auto-assign`
  - `POST /delivery/assign`
  - `GET /delivery/assignments`
  - `GET /delivery/summary`
  - `POST /delivery/assignments/:assignmentId/confirm`
  - `PATCH /delivery/assignments/:assignmentId/toggle`
- Kitchen:
  - `GET /kitchen/daily-summary`
  - `POST /kitchen/orders/:orderId/complete`

### System
- `GET /health`
- `GET /ready`
- `GET /api/v1/health`
- `GET /api/v1/ready`

## 6) Enforcement and Quality
- Server-side enforcement for cutoff/session/blackout/order-state transitions.
- Role and token checks at middleware + API guard layers.
- Error and disabled-state conventions are consistent across operational pages.
