# Data Model Specification

## Scope
Data model for `blossom-schoolcatering` using PostgreSQL, aligned to:
- Multi-school / multi-campus support with a schools master table
- Academic year and term configuration per school
- Parent-child hierarchy (max 10 children/parent)
- Cart/basket pre-order staging before order confirmation
- Multi-session daily ordering (Lunch, Snack, Breakfast)
- Favourite meal combinations per user
- Gamification badges (Clean Plate Club)
- User preferences (dark mode, onboarding state, tooltips)
- Role-based access and auditability
- Billing with proof-of-payment uploads and digital receipts
- Kitchen summary and printable tags with QR codes
- Admin full CRUD for meals/menu items

## Conventions
- Primary keys: `uuid` (`gen_random_uuid()`)
- Timestamps: `created_at`, `updated_at` (UTC)
- Soft delete where needed: `deleted_at`
- Monetary values: `numeric(12,2)`
- Enum style: PostgreSQL enums for fixed domain values

## Enumerations
- `role_type`: `PARENT`, `CHILD`, `ADMIN`, `KITCHEN`, `DELIVERY`
- `auth_provider_type`: `LOCAL`, `GOOGLE`
- `session_type`: `LUNCH`, `SNACK`, `BREAKFAST`
- `gender_type`: `MALE`, `FEMALE`, `OTHER`, `UNDISCLOSED`
- `payment_status`: `UNPAID`, `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`
- `order_status`: `PLACED`, `CANCELLED`, `LOCKED`
- `blackout_type`: `ORDER_BLOCK`, `SERVICE_BLOCK`, `BOTH`
- `delivery_status`: `PENDING`, `ASSIGNED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED`
- `cart_status`: `OPEN`, `SUBMITTED`, `EXPIRED`
- `badge_type`: `STREAK_7`, `STREAK_14`, `STREAK_30`, `WEEK_COMPLETE`, `MONTH_COMPLETE`

## Core Tables

### 1) `users`
- `id` uuid pk
- `role` role_type not null
- `username` varchar(120) unique not null
- `password_hash` text not null
- `first_name` varchar(100) not null
- `last_name` varchar(100) not null
- `phone_number` varchar(30) not null
- `email` varchar(255) null
- `is_active` boolean default true
- `last_login_at` timestamptz null
- indexes:
  - unique(`username`)
  - index(`role`)
  - index(`phone_number`)

Notes:
- Parent username format: `lastname_parent`
- Child username format: `lastname_firstname`
- `first_name` now required (not null) to support full-name display.
- Username generation must enforce uniqueness with suffixes: `-1`, `-2`, etc.

### 2) `user_preferences`
- `id` uuid pk
- `user_id` uuid unique fk -> `users.id`
- `dark_mode_enabled` boolean default false
- `onboarding_completed` boolean default false
- `tooltips_enabled` boolean default true
- `created_at` timestamptz
- `updated_at` timestamptz

Notes:
- Created automatically on first login or registration for all roles.
- Drives dark mode rendering, onboarding flow state, and tooltip visibility.

### 3) `user_identities`
- `id` uuid pk
- `user_id` uuid fk -> `users.id`
- `provider` auth_provider_type not null
- `provider_user_id` varchar(255) not null
- `provider_email` varchar(255) null
- `created_at` timestamptz
- unique(`provider`, `provider_user_id`)
- unique(`user_id`, `provider`)

Notes:
- Supports Google login and future providers while keeping internal `users` as the main identity.

### 4) `parents`
- `id` uuid pk
- `user_id` uuid unique fk -> `users.id` (role must be `PARENT`)
- `address` text not null

### 5) `schools`
- `id` uuid pk
- `name` varchar(200) not null
- `address` text null
- `city` varchar(100) null
- `contact_email` varchar(255) null
- `contact_phone` varchar(30) null
- `is_active` boolean default true
- `created_at` timestamptz
- `updated_at` timestamptz
- `deleted_at` timestamptz
- indexes:
  - unique(`name`) case-insensitive

Notes:
- Admin maintains the schools master list.
- Multiple campuses of the same institution are separate records.
- Children link to a school via `school_id` FK (not free text).

### 6) `academic_years`
- `id` uuid pk
- `school_id` uuid fk -> `schools.id`
- `label` varchar(50) not null  (e.g., "2025-2026")
- `start_date` date not null
- `end_date` date not null
- `is_active` boolean default false
- `created_at` timestamptz
- `updated_at` timestamptz
- unique(`school_id`, `label`)
- indexes:
  - index(`school_id`, `is_active`)
  - index(`start_date`, `end_date`)

Notes:
- Only one academic year should be active per school at a time (enforced at service layer).
- Service dates outside any active term generate a soft UI warning, not a hard block.

### 7) `academic_terms`
- `id` uuid pk
- `academic_year_id` uuid fk -> `academic_years.id`
- `label` varchar(100) not null  (e.g., "Term 1", "Semester A")
- `term_number` integer not null
- `start_date` date not null
- `end_date` date not null
- `is_active` boolean default true
- `created_at` timestamptz
- `updated_at` timestamptz
- unique(`academic_year_id`, `term_number`)

### 8) `children`
- `id` uuid pk
- `user_id` uuid unique fk -> `users.id` (role must be `CHILD`)
- `school_id` uuid fk -> `schools.id`
- `date_of_birth` date not null
- `gender` gender_type not null
- `school_grade` varchar(50) not null
- `photo_url` text null
- `is_active` boolean default true
- indexes:
  - index(`school_id`, `school_grade`)
  - index(`date_of_birth`)

Notes:
- `school_name` is no longer a free-text field; resolved via join on `schools`.
- `school_grade` remains per-child (e.g., "Grade 5").

### 9) `parent_children`
- `id` uuid pk
- `parent_id` uuid fk -> `parents.id`
- `child_id` uuid fk -> `children.id`
- unique(`parent_id`, `child_id`)
- constraint: max 10 children per parent (enforced by DB trigger)

### 10) `child_dietary_restrictions`
- `id` uuid pk
- `child_id` uuid fk -> `children.id`
- `restriction_label` varchar(120) not null
- `restriction_details` text null
- `is_active` boolean default true
- `created_at` timestamptz
- `updated_at` timestamptz
- `deleted_at` timestamptz

### 11) `menus`
- `id` uuid pk
- `session` session_type not null
- `service_date` date not null
- `is_published` boolean default false
- `created_at` timestamptz
- `updated_at` timestamptz
- `deleted_at` timestamptz
- unique(`session`, `service_date`)

### 12) `ingredients`
- `id` uuid pk
- `name` varchar(120) not null
- `is_active` boolean default true
- `allergen_flag` boolean default false
- `notes` text null
- `created_at` timestamptz
- `updated_at` timestamptz
- `deleted_at` timestamptz
- indexes:
  - unique index on `lower(name)` (case-insensitive uniqueness)

### 13) `menu_items`
- `id` uuid pk
- `menu_id` uuid fk -> `menus.id`
- `name` varchar(150) not null
- `description` text not null
- `nutrition_facts_text` text not null
- `price` numeric(12,2) not null check (`price >= 0`)
- `image_url` text not null
- `is_available` boolean default true
- `display_order` integer default 0
- `created_at` timestamptz
- `updated_at` timestamptz
- `deleted_at` timestamptz
- indexes:
  - index(`menu_id`, `is_available`)
  - unique index on `lower(name)` (case-insensitive unique meal name)

Admin requirement:
- Full CRUD on fields: name, photo, price, ingredients, nutrition, description, availability.
- Meal name must remain unique even when edited.

### 14) `menu_item_ingredients`
- `id` uuid pk
- `menu_item_id` uuid fk -> `menu_items.id` on delete cascade
- `ingredient_id` uuid fk -> `ingredients.id`
- `created_at` timestamptz
- unique(`menu_item_id`, `ingredient_id`)

Notes:
- UI uses dropdown/multi-select from `ingredients` master list for each menu item.

### 15) `blackout_days`
- `id` uuid pk
- `blackout_date` date not null unique
- `type` blackout_type not null
- `reason` text null
- `created_by` uuid fk -> `users.id` (admin)
- `created_at` timestamptz
- `updated_at` timestamptz

### 15) `order_carts`
- `id` uuid pk
- `child_id` uuid fk -> `children.id`
- `created_by_user_id` uuid fk -> `users.id`
- `session` session_type not null
- `service_date` date not null
- `status` cart_status not null default `OPEN`
- `expires_at` timestamptz not null  (08:00 AM Asia/Makassar on service_date)
- `created_at` timestamptz
- `updated_at` timestamptz
- unique(`child_id`, `session`, `service_date`) where `status = 'OPEN'`
- indexes:
  - index(`child_id`, `service_date`, `status`)
  - index(`expires_at`) where `status = 'OPEN'`

Notes:
- Only one OPEN cart per child per session per service date.
- Submitting a cart creates an order and transitions cart to SUBMITTED.
- Carts past `expires_at` are batch-transitioned to EXPIRED via scheduled job or lazy check.

### 16) `cart_items`
- `id` uuid pk
- `cart_id` uuid fk -> `order_carts.id` on delete cascade
- `menu_item_id` uuid fk -> `menu_items.id`
- `quantity` integer not null default 1 check (`quantity > 0`)
- `created_at` timestamptz
- `updated_at` timestamptz
- unique(`cart_id`, `menu_item_id`)

Constraint:
- Max 5 distinct items per cart (enforced at service layer).

### 17) `orders`
- `id` uuid pk
- `order_number` uuid unique not null
- `cart_id` uuid fk -> `order_carts.id` null  (set when order originates from a cart submission)
- `child_id` uuid fk -> `children.id`
- `placed_by_user_id` uuid fk -> `users.id`
- `session` session_type not null
- `service_date` date not null
- `status` order_status not null default `PLACED`
- `total_price` numeric(12,2) not null default 0
- `dietary_snapshot` text null
- `placed_at` timestamptz not null
- `locked_at` timestamptz null
- `delivery_status` delivery_status not null default `PENDING`
- `delivered_at` timestamptz null
- `delivered_by_user_id` uuid fk -> `users.id` null
- `created_at` timestamptz
- `updated_at` timestamptz
- `deleted_at` timestamptz
- unique(`child_id`, `session`, `service_date`) where `status != 'CANCELLED'` and `deleted_at IS NULL`
- check: `service_date` is a weekday (Mon-Fri)
- indexes:
  - index(`service_date`, `session`)
  - index(`child_id`, `service_date`)

### 18) `order_items`
- `id` uuid pk
- `order_id` uuid fk -> `orders.id` on delete cascade
- `menu_item_id` uuid fk -> `menu_items.id`
- `item_name_snapshot` varchar(150) not null
- `price_snapshot` numeric(12,2) not null
- `quantity` integer not null default 1 check (`quantity > 0`)
- `created_at` timestamptz
- `updated_at` timestamptz
- unique(`order_id`, `menu_item_id`)

Constraint:
- Max 5 distinct items per order (service layer + DB trigger).

### 19) `order_mutations`
- `id` uuid pk
- `order_id` uuid fk -> `orders.id`
- `action` varchar(40) not null  (`CREATE`, `UPDATE`, `DELETE`, `DUPLICATE`)
- `actor_user_id` uuid fk -> `users.id`
- `mutation_at` timestamptz not null
- `before_json` jsonb null
- `after_json` jsonb null

### 20) `delivery_assignments`
- `id` uuid pk
- `order_id` uuid unique fk -> `orders.id` on delete cascade
- `delivery_user_id` uuid fk -> `users.id`
- `assigned_at` timestamptz not null
- `confirmed_at` timestamptz null
- `confirmation_note` text null
- `created_at` timestamptz
- `updated_at` timestamptz

### 21) `billing_records`
- `id` uuid pk
- `order_id` uuid unique fk -> `orders.id`
- `parent_id` uuid fk -> `parents.id`
- `status` payment_status not null default `UNPAID`
- `proof_image_url` text null
- `proof_uploaded_at` timestamptz null
- `verified_by` uuid fk -> `users.id` null
- `verified_at` timestamptz null
- `delivery_status` delivery_status not null default `PENDING`
- `delivered_at` timestamptz null
- `created_at` timestamptz
- `updated_at` timestamptz

### 22) `digital_receipts`
- `id` uuid pk
- `billing_record_id` uuid unique fk -> `billing_records.id`
- `receipt_number` varchar(50) unique not null  (format: BLC-YYYY-NNNNN, e.g., BLC-2026-00001)
- `pdf_url` text not null
- `generated_at` timestamptz not null
- `generated_by_user_id` uuid fk -> `users.id`
- `created_at` timestamptz

Notes:
- Generated only after payment status transitions to VERIFIED.
- `receipt_number` uses a PostgreSQL sequence for sequential unique numbering.
- `pdf_url` points to GCS + CDN path.

### 23) `favourite_meals`
- `id` uuid pk
- `created_by_user_id` uuid fk -> `users.id`
- `child_id` uuid fk -> `children.id` null  (null = general, not child-specific)
- `label` varchar(150) not null
- `session` session_type not null
- `is_active` boolean default true
- `created_at` timestamptz
- `updated_at` timestamptz
- `deleted_at` timestamptz
- indexes:
  - index(`created_by_user_id`, `is_active`)

Notes:
- Max 20 active favourites per user (enforced at service layer).

### 24) `favourite_meal_items`
- `id` uuid pk
- `favourite_meal_id` uuid fk -> `favourite_meals.id` on delete cascade
- `menu_item_id` uuid fk -> `menu_items.id`
- `quantity` integer not null default 1 check (`quantity > 0`)
- `created_at` timestamptz
- unique(`favourite_meal_id`, `menu_item_id`)

### 25) `child_badges`
- `id` uuid pk
- `child_id` uuid fk -> `children.id`
- `badge_type` badge_type not null
- `earned_at` timestamptz not null
- `streak_count` integer null  (populated for STREAK_* badges)
- `created_at` timestamptz
- `updated_at` timestamptz
- unique(`child_id`, `badge_type`)

Notes:
- One record per badge type per child; upsert on re-earning (updates `earned_at`, `streak_count`).
- Badge calculation triggered server-side on each order placement event.

### 26) `analytics_daily_agg` (optional materialized/derived)
- `service_date` date not null
- `session` session_type not null
- `menu_item_id` uuid not null fk -> `menu_items.id`
- `total_qty` bigint not null
- primary key (`service_date`, `session`, `menu_item_id`)

## Integrity and Rule Enforcement
- Child can have only one active order per session per service date.
- Service date must be weekday (`Mon-Fri`); enforced by DB CHECK constraint.
- `blackout_days` block ordering or service depending on `type`.
- Parent edit/delete cutoff: same `service_date`, before 08:00 Asia/Makassar.
- Child edits/deletes always blocked after creation.
- Delivery confirmation updates both `orders` and `billing_records` delivery fields.
- Cart expires at 08:00 on service date; EXPIRED carts cannot be submitted.
- At most one OPEN cart per child per session per service date.
- Digital receipt generated only after payment status = VERIFIED.
- Badge calculation runs after every successful order placement.
- Only one active academic year per school at a time (service-layer constraint).

## Scalability Notes
- Analytics and reporting queries route to a PostgreSQL read replica.
- All image and PDF URLs point to GCS + Cloud CDN paths.
- `mv_admin_daily_rollup` refreshed via pg_cron every 5 minutes; manually triggerable from admin dashboard.
- NestJS connection pool: min=2, max=20 (env-configurable).
- Redis: JWT refresh token store, cart expiry keys, visitor counter.

## UI Input Strategy Mapping (Radio/Dropdown First)
- Use enum-backed dropdowns for:
  - role, gender, session, payment status, blackout type, school (from schools table), school grade, ingredient list
- Use radio button groups for:
  - `is_available`, `is_published`, payment/delivery status display (binary states)
- Keep free-text only where required:
  - address, descriptions, nutrition text, blackout reason, delivery confirmation note, restriction details
