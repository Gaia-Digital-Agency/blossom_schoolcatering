# Blossom School Catering Unified API Map

Last synced: 2026-03-14  
Base URL: `/schoolcatering`  
API Base: `/schoolcatering/api/v1`

This file covers non-button API structure, backend connections, module notes, and data relationships.  
Route and link documentation is separated into [links_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/links_api.md).  
Button-specific interactions are documented in [button_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/button_api.md).

## 1) Current Module Notes

### Registration
- Public registration is now unified at `/register`.
- `registrantType` drives whether the submission is treated as:
  - youngster registration
  - parent registration
  - teacher-assisted parent registration
- Duplicate registration is blocked when the same combination is submitted for:
  - registrant type
  - school
  - youngster first name
  - youngster last name
  - parent first name
  - parent last name
- Initial generated passwords use the submitted phone-number string:
  - youngster password from youngster phone
  - parent password from parent phone

### Admin Billing
- Bills are split into:
  - unpaid/pending
  - paid/verified
- Each section is grouped by school.
- Admin reject now moves billing back to `UNPAID`, clears proof, and removes receipt.
- Proof images are previewed through authenticated API fetch.
- Receipt PDF access now uses authenticated API streaming, not raw storage URLs.

### Admin Schools
- Schools are split into:
  - Active Schools
  - Deactivated Schools
- No status column is needed; activation state determines which section the school appears in.

### Admin Parent / Youngster
- Singular routes are preferred:
  - `/admin/parent`
  - `/admin/youngster`
- Legacy plural routes remain as compatibility aliases.
- Password viewing is read-only.
- Password reset is explicit and separate.

## 2) Auth API Map

### `/api/v1/auth`
- `POST /login`
- `POST /register`
- `GET /register/schools`
- `POST /register/youngsters`
- `POST /register/youngster`
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

## 3) Core API Map

### School / Site / Session
- `GET /schools`
- `POST /admin/schools`
- `PATCH /admin/schools/:schoolId`
- `DELETE /admin/schools/:schoolId`
- `GET /admin/site-settings`
- `PATCH /admin/site-settings`
- `GET /admin/session-settings`
- `GET /session-settings`
- `PATCH /admin/session-settings/:session`

### Parent / Youngster / Password
- `POST /children/register`
- `GET /admin/parent`
- `GET /admin/parents`
- `PATCH /admin/parent/:parentId`
- `PATCH /admin/parents/:parentId`
- `DELETE /admin/parent/:parentId`
- `DELETE /admin/parents/:parentId`
- `GET /admin/youngster`
- `GET /admin/youngsters`
- `PATCH /admin/youngster/:youngsterId`
- `PATCH /admin/youngsters/:youngsterId`
- `DELETE /admin/youngster/:youngsterId`
- `DELETE /admin/youngsters/:youngsterId`
- `GET /admin/users/:userId/password`
- `PATCH /admin/users/:userId/reset-password`
- `GET /admin/youngster/:youngsterId/password`
- `PATCH /admin/youngster/:youngsterId/reset-password`
- `GET /children/me`
- `GET /youngster/me/insights`
- `GET /youngster/me/orders/consolidated`
- `GET /youngster/me/orders`
- `GET /parent/me/children/pages`
- `GET /parents/me/children/pages`
- `POST /parents/:parentId/children/:childId/link`

### Dashboard / Reports
- `GET /admin/dashboard`
- `GET /admin/revenue`
- `GET /admin/reports`
- `GET /admin/audit-logs`

### Blackout
- `GET /blackout-days`
- `POST /blackout-days`
- `DELETE /blackout-days/:id`

### Ingredients / Menu / Ratings
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

### Menus / Favourites / Carts / Orders
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
- `GET /parent/me/orders/consolidated`
- `GET /parents/me/orders/consolidated`
- `GET /parent/me/spending-dashboard`
- `GET /parents/me/spending-dashboard`

### Billing
- `GET /billing/parent/consolidated`
- `POST /billing/proof-upload-batch`
- `GET /billing/:billingId/proof-image`
- `GET /billing/:billingId/receipt`
- `POST /billing/:billingId/revert-proof`
- `GET /admin/billing`
- `GET /admin/billing/:billingId/proof-image`
- `POST /admin/billing/:billingId/verify`
- `POST /admin/billing/:billingId/receipt`
- `GET /admin/billing/:billingId/receipt-file`

### Delivery
- `GET /delivery/users`
- `POST /admin/delivery/users`
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
- `POST /admin/delivery/send-notification-email`

### Kitchen
- `GET /kitchen/daily-summary`
- `POST /kitchen/orders/:orderId/complete`

## 4) System Endpoints

- `GET /health`
- `GET /ready`
- `GET /api/v1/health`
- `GET /api/v1/ready`

## 5) High-Level DB Map

### Identity / Profile
- `users`
- `user_preferences`
- `user_identities`
- `auth_refresh_sessions`
- `parents`
- `children`
- `parent_children`

### School / Calendar
- `schools`
- `session_settings`
- `blackout_days`

### Menu / Ordering
- `menus`
- `menu_items`
- `ingredients`
- `menu_item_ingredients`
- `order_carts`
- `cart_items`
- `orders`
- `order_items`
- `order_mutations`
- `favourite_meals`
- `favourite_meal_items`

### Billing / Delivery
- `billing_records`
- `digital_receipts`
- `delivery_assignments`
- `delivery_school_assignments`

### Analytics / Gamification
- `child_badges`
- `analytics_daily_agg`
