# Blossom School Catering Unified Map (Pages, API, DB)

Last synced: 2026-02-28  
Base URL: `/schoolcatering`  
API Base: `/schoolcatering/api/v1`

This file is the merged, deduplicated map for:
- navigation and pages
- form/input fields
- API endpoints
- runtime DB model

## 1) Navigation and Page Map

### Public and Entry
| Page | Purpose | Notes |
|---|---|---|
| `/` | Landing page | Home hero, links, login/register CTA |
| `/home` | Home alias | Re-exports `/` |
| `/menu` | Public menu | Read-only menu view |
| `/guide` | Guides and T&C | Loads markdown from `docs/guides/*` |
| `/login` | Generic login | Parent/Youngster focused, accepts returned role |
| `/register` | Registration entry | Points to youngster flow |
| `/register/youngsters` | Combined youngster+parent registration | Includes required registrant type and teacher conditional field |
| `/register/parent` | Legacy parent entry | Redirects to `/register/youngsters` |
| `/register/delivery` | Legacy delivery entry | Redirects to `/register` |
| `/rating` | Dish rating page | Auth-required |

### Role Login Pages
- `/admin/login`
- `/kitchen/login`
- `/delivery/login`
- `/parent/login`
- `/youngster/login`

### Protected Modules
- Parent: `/parents` (alias: `/parent`)
- Youngster: `/youngsters` (alias: `/youngster`)
- Delivery: `/delivery`
- Kitchen: `/kitchen`, `/kitchen/yesterday`, `/kitchen/today`, `/kitchen/tomorrow`
- Admin:
  - `/admin`
  - `/admin/menu`
  - `/admin/parents`
  - `/admin/youngsters`
  - `/admin/schools`
  - `/admin/blackout-dates`
  - `/admin/billing`
  - `/admin/delivery`
  - `/admin/reports`
  - `/admin/kitchen`
  - `/admin/backout-dates` (placeholder page)

## 2) Key Page Field Map

### `/register/youngsters`
- `registrantType` (required): `YOUNGSTER | PARENT | TEACHER`
- `teacherName` (required when teacher, max 50)
- Youngster profile fields (name, gender, DOB, school, grade, phone, email optional, allergies)
- Parent profile fields (name, phone, email, address optional)

### `/parents`
- Child selector (`selectedChildId`)
- Ordering fields: `serviceDate`, `session`, quantity map per menu item
- Consolidated order actions: edit-before-cutoff, delete-before-cutoff, quick reorder
- Billing fields: selected billing IDs, proof image payload
- Spending dashboard read state

### `/youngsters`
- Profile summary + allergy display
- Weekly insight display (badge, calories, counts)
- Ordering fields: `serviceDate`, `session`, quantity map per menu item

### `/delivery`
- `date`
- `note` (optional)
- assignment toggle action per row

### `/admin/schools`
- New school form (`name`, `city`, `address`, `contactEmail`)
- School active toggle and delete
- Session setting toggle

### `/admin/menu`
- Context fields: `serviceDate`, `session`
- Menu item upsert fields:
  - `name`, `description`, `nutritionFactsText`, `caloriesKcal`, `price`
  - `imageUrl` or uploaded image
  - `ingredientIds[]`
  - `isAvailable`, `displayOrder`, `cutleryRequired`, `packingRequirement`

### `/admin/delivery`
- Delivery user create/edit fields
- School-delivery assignment fields (`deliveryUserId`, `schoolId`, `isActive`)
- Auto-assign date

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
- `GET /admin-ping`

## Public (`/api/v1/public`)
- `GET /menu`

## Core (`/api/v1`)
- Schools/session:
  - `GET /schools`
  - `POST /admin/schools`
  - `PATCH /admin/schools/:schoolId`
  - `DELETE /admin/schools/:schoolId`
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
- Ingredient/menu/menu ratings:
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
- Menu/order acceleration:
  - `GET /menus`
  - `GET /favourites`
  - `POST /favourites`
  - `DELETE /favourites/:favouriteId`
  - `POST /favourites/:favouriteId/apply`
  - `POST /carts/quick-reorder`
  - `POST /meal-plans/wizard`
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

## System Endpoint
- `GET /api/v1/health`

## 4) Runtime DB Map

### Identity and Profile
- `users`
- `user_preferences`
- `user_identities`
- `auth_refresh_sessions`
- `parents`
- `children`
  - includes registration metadata:
    - `registration_actor_type`
    - `registration_actor_teacher_name`
- `parent_children`

### School and Calendar
- `schools`
- `academic_years`
- `academic_terms`
- `session_settings`
- `blackout_days`

### Menu and Ingredients
- `menus`
- `menu_items`
- `ingredients`
- `menu_item_ingredients`

### Ordering and Favourites
- `order_carts`
- `cart_items`
- `orders`
- `order_items`
- `order_mutations`
- `favourite_meals`
- `favourite_meal_items`

### Billing and Delivery
- `billing_records`
- `digital_receipts`
- `delivery_users`
- `delivery_assignments`
- `delivery_school_assignments`

### Analytics/Gamification
- `child_badges`
- `analytics_daily_agg`

## 5) Core Relationship Summary
- `users` 1:1 `parents` and `children` by role-linked entities.
- `parents` N:M `children` through `parent_children`.
- `schools` 1:N `children` and supports delivery mapping.
- `menus` 1:N `menu_items`; `menu_items` N:M `ingredients`.
- `order_carts` -> `cart_items` -> submitted `orders` -> `order_items`.
- `orders` 1:1 billing (`billing_records`) and 1:1 delivery assignment.
- `billing_records` upsert to `digital_receipts`.
