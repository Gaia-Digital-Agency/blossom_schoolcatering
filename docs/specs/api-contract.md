# API Contract Specification

## API Style
- Primary: REST JSON
- Auth: JWT Bearer token
- Base URL (staging): `http://34.124.244.233/schoolcatering/api/v1`

## Global Standards
- Timezone logic for cutoff/service checks: `Asia/Makassar` (UTC+8)
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

## Authentication

### POST `/auth/login`
- Public
- Request:
```json
{
  "username": "tan_parent",
  "password": "628123456789"
}
```
- Response:
```json
{
  "access_token": "jwt",
  "refresh_token": "jwt",
  "user": {
    "id": "uuid",
    "role": "PARENT",
    "username": "tan_parent"
  }
}
```

### POST `/auth/refresh`
- Public with refresh token

### POST `/auth/logout`
- Authenticated

## Registration and Profiles

### POST `/parents/register`
- Public/Admin
- Fields: `last_name`, `phone_number`, `email`, `address`

### POST `/children/register`
- Parent/Admin
- Fields: `last_name`, `phone_number`, `date_of_birth`, `gender`, `school_grade`, `school_name`, optional `photo`

### POST `/parents/{parentId}/children/{childId}/link`
- Parent/Admin
- Rule: max 10 children per parent

### GET `/me`
- Authenticated user profile + role + linked entities

## Ingredients Master List (Admin)

### GET `/ingredients`
- Roles: Admin, Parent, Child, Kitchen
- Query:
  - `active=true|false` (default true)

### POST `/ingredients`
- Role: Admin
- Request:
```json
{
  "name": "Peanut",
  "allergen_flag": true,
  "notes": "Tree nut allergy cross-check"
}
```
- Validation:
  - ingredient name must be unique (case-insensitive)

### PATCH `/ingredients/{ingredientId}`
- Role: Admin

### DELETE `/ingredients/{ingredientId}`
- Role: Admin

## Menu and Meals (Admin full CRUD)

### GET `/menus`
- Roles: Parent, Child, Admin, Kitchen
- Query:
  - `service_date`
  - `session` (`LUNCH|SNACK|BREAKFAST`)

### POST `/menus`
- Role: Admin
- Create menu by `service_date` + `session`

### PATCH `/menus/{menuId}`
- Role: Admin

### DELETE `/menus/{menuId}`
- Role: Admin

### POST `/menus/{menuId}/items`
- Role: Admin
- Full meal create fields:
  - `name`
  - `description`
  - `ingredient_ids` (array from ingredient master list)
  - `nutrition_facts_text`
  - `price`
  - `image_url`
  - `is_available`
  - `display_order`
- Validation:
  - meal `name` must be unique (case-insensitive)

### PATCH `/menu-items/{itemId}`
- Role: Admin
- Full meal update (same fields as create)
- Validation:
  - meal `name` must remain unique (case-insensitive)

### DELETE `/menu-items/{itemId}`
- Role: Admin

### GET `/menu-items/{itemId}/ingredients`
- Roles: Admin, Parent, Child, Kitchen

## Blackout Days

### GET `/blackout-days`
- Roles: Admin, Parent, Kitchen

### POST `/blackout-days`
- Role: Admin
- Request:
```json
{
  "blackout_date": "2026-03-17",
  "type": "BOTH",
  "reason": "School event"
}
```

### DELETE `/blackout-days/{id}`
- Role: Admin

## Dietary Restrictions

### GET `/children/{childId}/dietary-restrictions`
- Roles: Parent (linked child), Child (self), Admin, Kitchen

### POST `/children/{childId}/dietary-restrictions`
- Roles: Parent (linked child), Admin

### PATCH `/dietary-restrictions/{id}`
- Roles: Parent (linked child), Admin

### DELETE `/dietary-restrictions/{id}`
- Roles: Parent (linked child), Admin

## Orders

### GET `/orders`
- Parent: own linked children
- Child: self only
- Admin: all
- Kitchen: all (read only)
- Delivery: assigned orders only
- Query filters:
  - `service_date`
  - `session`
  - `child_id`
  - `status`

### POST `/orders`
- Roles: Parent, Child
- Request:
```json
{
  "child_id": "uuid",
  "service_date": "2026-03-02",
  "session": "LUNCH",
  "items": [
    {"menu_item_id": "uuid", "quantity": 1}
  ]
}
```
- Rules:
  - max 5 distinct items
  - one active order per child/session/date
  - must not violate weekday/blackout rules

### PATCH `/orders/{orderId}`
- Role: Parent only
- Rules:
  - linked child only
  - before 08:00 same service date

### DELETE `/orders/{orderId}`
- Role: Parent and Admin
- Parent rules:
  - linked child only
  - before 08:00 same service date
- Admin rules:
  - operational deletion allowed (audited)

### POST `/orders/duplicate`
- Role: Parent
- Request:
```json
{
  "child_id": "uuid",
  "source_date": "2026-03-03",
  "mode": "DAILY",
  "target_dates": ["2026-03-04", "2026-03-05"]
}
```

## Billing

### GET `/billing`
- Parent: own linked children
- Child: self
- Admin: all
- Delivery: assigned orders billing delivery fields only

### POST `/billing/{orderId}/proof-upload`
- Role: Parent
- Multipart image upload required to confirm payment

### PATCH `/billing/{billingId}/status`
- Role: Admin
- `status`: `PENDING_VERIFICATION|VERIFIED|REJECTED`

## Delivery

### GET `/delivery/today`
- Role: Delivery
- Query:
  - `service_date` (default today in Asia/Makassar)
- Response:
  - assigned orders with child, parent, school, session, meal items, exclusions, delivery status

### POST `/delivery/assign`
- Role: Admin
- Request:
```json
{
  "order_ids": ["uuid", "uuid"],
  "delivery_user_id": "uuid"
}
```

### POST `/delivery/{assignmentId}/confirm`
- Role: Delivery
- Request:
```json
{
  "delivered": true,
  "confirmation_note": "Delivered to school gate."
}
```
- Side effects:
  - updates `orders.delivery_status` and `orders.delivered_at`
  - updates linked `billing_records.delivery_status` and `billing_records.delivered_at`

## Kitchen

### GET `/kitchen/summary`
- Roles: Kitchen, Admin
- Query:
  - `service_date` (required)
  - `session` (optional)
- Response:
  - totals by menu item
  - totals by session
  - dietary restriction notes summary

### GET `/kitchen/analytics`
- Roles: Kitchen, Admin
- Query:
  - `from_date`, `to_date`
  - `group_by`: `DAY|WEEK|MONTH|AGE|GENDER|SCHOOL|SESSION`

### GET `/kitchen/order-tags`
- Roles: Kitchen, Admin
- Query:
  - `service_date`, `session`
- Includes:
  - order UUID
  - parent name
  - child name
  - school name
  - session/day/date
  - ingredient exclusions

### GET `/kitchen/reports/print`
- Roles: Kitchen, Admin
- Returns print-friendly PDF payload/URL

## Polling Contract (Kitchen v1)
- Kitchen UI fetches:
  - `/kitchen/summary?service_date=YYYY-MM-DD` every 30-60 seconds
- Manual fallback:
  - refresh button triggers immediate refetch
- API caching hints:
  - short TTL (`Cache-Control: private, max-age=15`)

## UI Input Control Guidance (API-Driven)
- Single-choice fields should expose enum options via dropdown:
  - role, gender, session, blackout type, status fields, ingredient options
- Binary states should expose radio options:
  - publish/unpublish, available/unavailable, delivered/not-delivered
- API should provide metadata endpoint:
  - `GET /meta/options` for dropdown/radio values and labels

## Validation Error Codes (Additional)
- `MEAL_NAME_ALREADY_EXISTS`
- `INGREDIENT_NAME_ALREADY_EXISTS`
