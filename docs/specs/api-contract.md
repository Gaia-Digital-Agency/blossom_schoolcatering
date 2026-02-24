# API Contract Specification

## API Style
- Primary: REST JSON
- Auth: JWT Bearer token
- Base URL (staging): `http://34.124.244.233/schoolcatering/api/v1`

## Global Standards
- Timezone for cutoff/service checks: `Asia/Makassar` (UTC+8)
- Correlation ID: every request receives a `X-Request-ID` header in response for tracing
- OpenAPI/Swagger: auto-generated from NestJS decorators; available at `/api/v1/docs`
- Rate limiting: applied per endpoint via NestJS ThrottlerModule; auth and upload endpoints have stricter limits
- Error format:
```json
{
  "error": {
    "code": "ORDER_CUTOFF_EXCEEDED",
    "message": "Order changes are not allowed after 08:00 local time.",
    "details": {}
  }
}
```
- Pagination query params: `page`, `limit`, `sort`, `order`
- Soft warning response flag (non-blocking): `"soft_warning": "Service date is outside the active academic term."`

## Authentication

### POST `/auth/login`
- Public
- Request: `{ "username": "tan_parent", "password": "628123456789" }`
- Response: `{ "access_token": "jwt", "refresh_token": "jwt", "user": { "id": "uuid", "role": "PARENT", "username": "tan_parent" } }`

### POST `/auth/refresh`
- Public with refresh token
- Implements token rotation: new access + refresh token pair issued; old refresh token invalidated in Redis

### POST `/auth/logout`
- Authenticated; invalidates refresh token in Redis

### GET `/auth/google/start`
- Public
- Starts Google OAuth login flow

### GET `/auth/google/callback`
- Public
- Completes Google OAuth login
- Links existing user by email or creates user + identity record
- Returns app JWT tokens

---

## Registration

### POST `/auth/register/parent`
- Public
- Request:
```json
{
  "first_name": "Ayu",
  "last_name": "Wijaya",
  "phone_number": "628123450001",
  "email": "ayu@example.com",
  "address": "Jl. Sunset Road No. 88, Kuta, Bali"
}
```
- Creates user record (role=PARENT), parent profile, user_preferences record
- Username collision handling: append `-1`, `-2`, ... when generated username already exists
- Response: user + access tokens (auto-login after registration)

### POST `/children/register`
- Roles: Parent, Admin
- Parent registers a child and links to their account in one step
- Request:
```json
{
  "first_name": "Budi",
  "last_name": "Wijaya",
  "phone_number": "628123450011",
  "date_of_birth": "2015-08-12",
  "gender": "MALE",
  "school_id": "uuid",
  "school_grade": "Grade 5",
  "photo": "(multipart, optional)"
}
```
- Creates user record (role=CHILD), children profile, user_preferences record, and parent_children link (for parent actor)
- Username collision handling: append `-1`, `-2`, ... when generated username already exists

### POST `/admin/import/csv`
- Role: Admin
- Multipart CSV upload for bulk parent and child registration
- CSV must match documented column schema
- Response:
```json
{
  "total_rows": 50,
  "success_count": 48,
  "failures": [
    { "row": 12, "reason": "CSV_IMPORT_SCHOOL_NOT_FOUND", "data": {} },
    { "row": 27, "reason": "CSV_IMPORT_DUPLICATE_USERNAME", "data": {} }
  ]
}
```

---

## Profiles

### GET `/me`
- Authenticated
- Returns: user profile, role, linked entities (children for parent, parent info for child), user_preferences

### PATCH `/me`
- Authenticated
- Update own profile fields (name, phone, email, address)

### GET `/me/preferences`
- Authenticated

### PATCH `/me/preferences`
- Authenticated
- Request: `{ "dark_mode_enabled": true, "tooltips_enabled": false, "onboarding_completed": true }`

### GET `/parents/{parentId}/children`
- Roles: Parent (own), Admin
- Returns linked children with school info

### GET `/parents/me/children/pages`
- Role: Parent
- Returns child switcher payload for one-login multi-child navigation with separate child pages

### POST `/parents/{parentId}/children/{childId}/link`
- Roles: Parent (own), Admin
- Rule: max 10 children per parent

---

## Schools

### GET `/schools`
- Roles: All authenticated
- Query: `active=true|false` (default true)

### POST `/schools`
- Role: Admin
- Request: `{ "name": "Bali International School", "address": "...", "city": "Denpasar", "contact_email": "...", "contact_phone": "..." }`
- Validation: school name must be unique (case-insensitive)

### PATCH `/schools/{schoolId}`
- Role: Admin

### DELETE `/schools/{schoolId}`
- Role: Admin (soft delete / deactivate)

---

## Academic Years and Terms

### GET `/schools/{schoolId}/academic-years`
- Roles: All authenticated

### POST `/schools/{schoolId}/academic-years`
- Role: Admin
- Request: `{ "label": "2025-2026", "start_date": "2025-08-01", "end_date": "2026-07-31", "is_active": true }`
- Rule: setting `is_active = true` deactivates all other academic years for this school (service layer)

### PATCH `/academic-years/{yearId}`
- Role: Admin

### DELETE `/academic-years/{yearId}`
- Role: Admin

### GET `/academic-years/{yearId}/terms`
- Roles: All authenticated

### POST `/academic-years/{yearId}/terms`
- Role: Admin
- Request: `{ "label": "Term 1", "term_number": 1, "start_date": "2025-08-01", "end_date": "2025-11-30" }`

### PATCH `/academic-terms/{termId}`
- Role: Admin

### DELETE `/academic-terms/{termId}`
- Role: Admin

---

## Ingredients Master List

### GET `/ingredients`
- Roles: Admin, Parent, Child, Kitchen
- Query: `active=true|false` (default true), `allergen_only=true`

### POST `/ingredients`
- Role: Admin
- Request: `{ "name": "Peanut", "allergen_flag": true, "notes": "Tree nut cross-check" }`
- Validation: name unique (case-insensitive)

### PATCH `/ingredients/{ingredientId}`
- Role: Admin

### DELETE `/ingredients/{ingredientId}`
- Role: Admin (soft delete)

---

## Menu and Meals

### GET `/menus`
- Roles: Parent, Child, Admin, Kitchen
- Query:
  - `service_date` (required)
  - `session` (LUNCH|SNACK|BREAKFAST)
  - `search` (keyword search on name/description)
  - `allergen_exclude` (comma-separated ingredient ids to exclude)
  - `price_min`, `price_max`
  - `favourites_only=true` (filters to items in user's favourites)

### POST `/menus`
- Role: Admin
- Create menu by `service_date` + `session`

### PATCH `/menus/{menuId}`
- Role: Admin

### DELETE `/menus/{menuId}`
- Role: Admin

### POST `/menus/{menuId}/items`
- Role: Admin
- Fields: `name`, `description`, `ingredient_ids[]`, `nutrition_facts_text`, `price`, `image_url`, `is_available`, `display_order`
- Validation: meal `name` unique (case-insensitive)

### PATCH `/menu-items/{itemId}`
- Role: Admin
- Same fields as create; name must remain unique

### DELETE `/menu-items/{itemId}`
- Role: Admin

### GET `/menu-items/{itemId}/ingredients`
- Roles: Admin, Parent, Child, Kitchen

---

## Blackout Days

### GET `/blackout-days`
- Roles: Admin, Parent, Kitchen
- Query: `from_date`, `to_date`

### POST `/blackout-days`
- Role: Admin
- Request: `{ "blackout_date": "2026-03-17", "type": "BOTH", "reason": "School holiday" }`

### DELETE `/blackout-days/{id}`
- Role: Admin

---

## Dietary Restrictions

### GET `/children/{childId}/dietary-restrictions`
- Roles: Parent (linked), Child (self), Admin, Kitchen

### POST `/children/{childId}/dietary-restrictions`
- Roles: Parent (linked), Admin

### PATCH `/dietary-restrictions/{id}`
- Roles: Parent (linked), Admin

### DELETE `/dietary-restrictions/{id}`
- Roles: Parent (linked), Admin (soft delete)

---

## Carts

### GET `/carts`
- Roles: Parent (linked children), Child (self), Admin
- Query: `child_id`, `service_date`, `session`, `status`

### POST `/carts`
- Roles: Parent (linked child), Child (self)
- Request:
```json
{
  "child_id": "uuid",
  "session": "LUNCH",
  "service_date": "2026-03-02"
}
```
- Validates: weekday, blackout, no existing OPEN cart for same (child/session/date)
- Sets `expires_at` to 08:00 AM Asia/Makassar on `service_date`
- Response includes `soft_warning` if service date is outside active academic term

### GET `/carts/{cartId}`
- Roles: Parent (linked), Child (self), Admin

### PATCH `/carts/{cartId}/items`
- Roles: Parent (linked), Child (self)
- Replaces the full item list for the cart
- Request: `{ "items": [{ "menu_item_id": "uuid", "quantity": 1 }] }`
- Validates: cart is OPEN, not expired, max 5 items

### POST `/carts/{cartId}/items`
- Roles: Parent (linked), Child (self)
- Add a single item to OPEN cart
- Request: `{ "menu_item_id": "uuid", "quantity": 1 }`

### DELETE `/carts/{cartId}/items/{itemId}`
- Roles: Parent (linked), Child (self)
- Remove item from OPEN cart

### POST `/carts/{cartId}/submit`
- Roles: Parent (linked), Child (self)
- Runs full order validation pipeline
- On success: creates order + billing record, sets cart status to SUBMITTED
- On failure: cart remains OPEN, errors returned

### DELETE `/carts/{cartId}`
- Roles: Parent (linked), Child (self)
- Soft-delete/cancel an OPEN cart

### POST `/carts/quick-reorder`
- Roles: Parent (linked child), Child (self)
- Pre-fills a new cart from an existing order
- Request: `{ "source_order_id": "uuid", "service_date": "2026-03-05" }`
- Returns the new OPEN cart (not yet submitted)

---

## Orders

### GET `/orders`
- Parent: linked children only
- Child: self only
- Admin: all
- Kitchen: all (read-only)
- Delivery: assigned orders only
- Query: `service_date`, `session`, `child_id`, `status`

### GET `/parents/me/orders/consolidated`
- Role: Parent
- Consolidated order history and summary across all linked children
- Query: `from_date`, `to_date`, `session`, `status`

### POST `/orders`
- Roles: Parent (linked), Child (self)
- Direct order creation (without cart; cart flow is preferred)
- Request: `{ "child_id": "uuid", "service_date": "2026-03-02", "session": "LUNCH", "items": [{"menu_item_id": "uuid", "quantity": 1}] }`

### PATCH `/orders/{orderId}`
- Role: Parent only (linked child, before cutoff)

### DELETE `/orders/{orderId}`
- Roles: Parent (before cutoff), Admin (operational)

### POST `/orders/duplicate`
- Role: Parent
- Request: `{ "child_id": "uuid", "source_date": "2026-03-03", "mode": "DAILY|WEEKLY", "target_dates": ["2026-03-04"] }`

---

## Favourites

### GET `/favourites`
- Roles: Parent (own), Child (self)
- Query: `child_id` (optional filter), `session`

### POST `/favourites`
- Roles: Parent, Child
- Request: `{ "label": "My Lunch Combo", "session": "LUNCH", "child_id": "uuid (optional)", "items": [{"menu_item_id": "uuid", "quantity": 1}] }`
- Validation: max 20 active favourites per user

### PATCH `/favourites/{favouriteId}`
- Roles: Parent (own), Child (own)

### DELETE `/favourites/{favouriteId}`
- Roles: Parent (own), Child (own) (soft delete)

### POST `/carts/{cartId}/apply-favourite`
- Roles: Parent (linked), Child (self)
- Pre-fills cart items from a favourite; skips unavailable items
- Request: `{ "favourite_id": "uuid" }`

---

## Billing

### GET `/billing`
- Parent: linked children only
- Child: self only
- Admin: all
- Delivery: assigned orders billing delivery fields only
- Query: `child_id`, `status`, `from_date`, `to_date`

### GET `/parents/me/billing/consolidated`
- Role: Parent
- Consolidated billing summary across all linked children
- Includes totals by payment status and delivery status

### POST `/billing/{orderId}/proof-upload`
- Role: Parent
- Multipart image upload (max 5 MB, MIME validated, resized before GCS storage)
- Side effect: sets `status = PENDING_VERIFICATION`

### PATCH `/billing/{billingId}/status`
- Role: Admin
- Request: `{ "status": "VERIFIED|REJECTED" }`
- Side effect on VERIFIED: emits PaymentVerified event; receipt can be generated

### POST `/billing/{billingId}/generate-receipt`
- Role: Admin
- Generates PDF receipt and stores in GCS
- Creates `digital_receipts` record
- Returns: `{ "receipt_number": "BLC-2026-00001", "pdf_url": "https://..." }`

### GET `/billing/{billingId}/receipt`
- Roles: Parent (linked), Admin
- Returns receipt metadata and download URL

---

## Spending Dashboard (Parent)

### GET `/dashboard/spending`
- Role: Parent
- Query: `year`, `month` (optional filters)
- Response:
```json
{
  "total_by_month": [{ "year": 2026, "month": 3, "total": 1200000 }],
  "total_by_child": [{ "child_id": "uuid", "child_name": "Budi Wijaya", "total": 850000 }],
  "outstanding_balance": 120000,
  "orders_by_session": { "LUNCH": 12, "SNACK": 5, "BREAKFAST": 3 },
  "top_meals": [{ "meal_name": "Chicken Teriyaki Bowl", "count": 8 }]
}
```

---

## Revenue Dashboard (Admin)

### GET `/dashboard/revenue`
- Role: Admin
- Query: `from_date`, `to_date`, `group_by` (DAY|WEEK|MONTH)
- Response:
```json
{
  "total_revenue": 15000000,
  "outstanding_unpaid": 800000,
  "revenue_by_session": { "LUNCH": 9000000, "SNACK": 3500000, "BREAKFAST": 2500000 },
  "revenue_by_school": [{ "school_name": "Bali International School", "total": 12000000 }],
  "top_selling_meals": [{ "meal_name": "Chicken Teriyaki Bowl", "qty": 145, "total": 6525000 }],
  "fulfilment_rate": 0.97,
  "orders_by_payment_status": { "UNPAID": 5, "PENDING_VERIFICATION": 12, "VERIFIED": 280, "REJECTED": 2 }
}
```

---

## Delivery

### GET `/delivery/today`
- Role: Delivery
- Query: `service_date` (default today)
- Response: assigned orders with child, parent, school, session, meal items, dietary restrictions, delivery status

### POST `/delivery/assign`
- Role: Admin
- Request: `{ "order_ids": ["uuid"], "delivery_user_id": "uuid" }`

### POST `/delivery/{assignmentId}/confirm`
- Role: Delivery
- Request: `{ "delivered": true, "confirmation_note": "Delivered to school gate." }`
- Side effects: updates `orders.delivery_status` + `billing_records.delivery_status`; emits DeliveryConfirmed event

---

## Kitchen

### GET `/kitchen/summary`
- Roles: Kitchen, Admin
- Query: `service_date` (required), `session` (optional)
- Response: totals by menu item, totals by session, dietary restriction notes summary, birthday indicators
- Cache-Control: `private, max-age=15`

### GET `/kitchen/allergen-alerts`
- Roles: Kitchen, Admin
- Query: `service_date` (required), `session` (optional)
- Response: orders where child has dietary restrictions AND order items contain allergen-flagged ingredients
- Grouped by session
- Fields: order_id, child name, school, grade, restriction_details, flagged_ingredient, meal_name

### GET `/kitchen/analytics`
- Roles: Kitchen, Admin
- Query: `from_date`, `to_date`, `group_by` (DAY|WEEK|MONTH|AGE|GENDER|SCHOOL|SESSION)

### GET `/kitchen/order-tags`
- Roles: Kitchen, Admin
- Query: `service_date`, `session`
- Response per tag:
  - order UUID (for QR code encoding)
  - parent name, child name, school name
  - session (colour-coded), day, date
  - ingredient exclusions (dietary snapshot)
  - birthday indicator, badge indicator

### GET `/kitchen/reports/print`
- Roles: Kitchen, Admin
- Returns print-friendly PDF payload/URL

---

## Nutritional Summary

### GET `/children/{childId}/nutrition-summary`
- Roles: Parent (linked), Admin
- Query: `from_date`, `to_date` (default current week)
- Response:
```json
{
  "total_orders": 5,
  "orders_by_session": { "LUNCH": 4, "SNACK": 1 },
  "distinct_meals_count": 3,
  "meals": [
    { "meal_name": "Chicken Teriyaki Bowl", "count": 2, "nutrition_facts_text": "..." }
  ]
}
```

---

## Child Badges

### GET `/children/{childId}/badges`
- Roles: Parent (linked), Child (self), Admin, Kitchen (assigned)
- Response: list of earned badges with badge_type, earned_at, streak_count

---

## Polling Contract (Kitchen v1)
- Kitchen UI fetches `/kitchen/summary?service_date=YYYY-MM-DD` every 30–60 seconds.
- Manual Refresh button triggers immediate refetch.
- API cache hint: `Cache-Control: private, max-age=15`

---

## Meta / Enum Options

### GET `/meta/options`
- Public
- Returns enum labels for dropdowns/radio buttons:
  - session_type, gender_type, payment_status, blackout_type, delivery_status, badge_type, cart_status

---

## UI Input Control Guidance
- Enum-backed dropdowns: role, gender, session, blackout type, status fields, ingredient options, school (from schools endpoint)
- Radio button groups: publish/unpublish, available/unavailable, delivered/not-delivered
- Free text: address, descriptions, nutrition text, blackout reason, confirmation notes, restriction details

---

## Validation Error Codes
- `ORDER_DUPLICATE_SESSION`
- `ORDER_ITEM_LIMIT_EXCEEDED`
- `ORDER_WEEKEND_SERVICE_BLOCKED`
- `ORDER_BLACKOUT_BLOCKED`
- `ORDER_CUTOFF_EXCEEDED`
- `ORDER_CHILD_UPDATE_FORBIDDEN`
- `ORDER_OWNERSHIP_FORBIDDEN`
- `ORDER_MENU_UNAVAILABLE`
- `CART_EXPIRED`
- `CART_ALREADY_SUBMITTED`
- `CART_ITEM_LIMIT_EXCEEDED`
- `CART_MENU_ITEM_UNAVAILABLE`
- `FAVOURITES_LIMIT_EXCEEDED`
- `DELIVERY_ASSIGNMENT_FORBIDDEN`
- `DELIVERY_ALREADY_CONFIRMED`
- `INGREDIENT_NOT_IN_MASTER_LIST`
- `MEAL_NAME_ALREADY_EXISTS`
- `INGREDIENT_NAME_ALREADY_EXISTS`
- `SCHOOL_NAME_ALREADY_EXISTS`
- `RECEIPT_PAYMENT_NOT_VERIFIED`
- `CSV_IMPORT_SCHOOL_NOT_FOUND`
- `CSV_IMPORT_DUPLICATE_USERNAME`
