# Blossom School Catering Unified Map (Pages, API, DB)

Last synced: 2026-03-10  
Base URL: `/schoolcatering`  
API Base: `/schoolcatering/api/v1`

## 1) Navigation and Page Map

### Public and Entry
| Page | Purpose | Notes |
|---|---|---|
| `/` | Landing page | Home content and auth CTAs |
| `/home` | Home alias | Additional home entry |
| `/menu` | Public menu | Read-only menu |
| `/guide` | Guides | Loads markdown docs |
| `/privacy-and-confidentiality` | Privacy page | Static content |
| `/login` | Generic login | Multi-role signin entry |
| `/register` | Register entry | Routes to youngster flow |
| `/register/youngsters` | Combined youngster+parent registration | Includes registrant type/teacher mode |
| `/register/parent` | Legacy parent entry | Redirects to youngster register |
| `/register/delivery` | Legacy delivery entry | Redirects to register entry |
| `/rating` | Ratings page | Auth-required |

### Role Login Pages
- `/admin/login`
- `/kitchen/login`
- `/delivery/login`
- `/parent/login`
- `/youngster/login`

### Protected Modules
- Parent: `/parents`, `/parent`, `/parents/orders`, `/parents/billing`
- Youngster: `/youngsters`, `/youngster`
- Delivery: `/delivery`
- Kitchen: `/kitchen`, `/kitchen/yesterday`, `/kitchen/today`, `/kitchen/tomorrow`
- Admin:
  - `/admin`
  - `/admin/menu`
  - `/admin/parents`
  - `/admin/youngsters`
  - `/admin/schools`
  - `/admin/blackout-dates`
  - `/admin/backout-dates` (alias info page)
  - `/admin/billing`
  - `/admin/delivery`
  - `/admin/reports`
  - `/admin/kitchen`

## 2) Key UI Field/Action Map

### `/admin/delivery`
- Delivery user CRUD controls
- Delivery user `Show Password` (admin reset-password flow)
- School-delivery mapping CRUD/activation
- `Auto Assignment` by selected date
- `Show Service Date` loads assigned delivery orders for selected date
- Per-delivery order detail list rendered inside auto-assignment table

### `/delivery`
- Quick date buttons: Yesterday/Today/Tomorrow
- Manual `Service Date` picker + `Show Service Date`
- Pending/completed assignment groups
- Toggle completion with optional note

### `/admin/parents`
- `Show Password` action
- `Delete` action only when no active linked youngster

### `/kitchen` and `/admin/kitchen`
- Overview includes:
  - Total Orders
  - Total Orders Complete
  - Total Dishes
  - Session counts
- Kitchen order completion toggle

## 3) API Map (Implemented)

## Auth (`/api/v1/auth`)
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

## Public (`/api/v1/public`)
- `GET /menu`

## Core (`/api/v1`)
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
- Dashboard/reports/audit:
  - `GET /admin/dashboard`
  - `GET /admin/revenue`
  - `GET /admin/reports`
  - `GET /admin/audit-logs`
- Blackout:
  - `GET /blackout-days`
  - `POST /blackout-days`
  - `DELETE /blackout-days/:id`
- Ingredients/menu/menu ratings:
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

## System Endpoints
- `GET /health`
- `GET /ready`
- `GET /api/v1/health`
- `GET /api/v1/ready`

## 4) Runtime DB Map (High-Level)

### Identity/Profile
- `users`, `user_preferences`, `user_identities`, `auth_refresh_sessions`
- `parents`, `children`, `parent_children`

### School/Calendar
- `schools`, `session_settings`, `blackout_days`

### Menu/Ordering
- `menus`, `menu_items`, `ingredients`, `menu_item_ingredients`
- `order_carts`, `cart_items`, `orders`, `order_items`, `order_mutations`
- `favourite_meals`, `favourite_meal_items`

### Billing/Delivery
- `billing_records`, `digital_receipts`
- `delivery_assignments`, `delivery_school_assignments`

### Analytics/Gamification
- `child_badges`, `analytics_daily_agg`
