# Data Model Specification

## Scope
Data model for `blossom-schoolcatering` using PostgreSQL, aligned to:
- Parent-child hierarchy (max 10 children/parent)
- Multi-session daily ordering (Lunch, Snack, Breakfast)
- Role-based access and auditability
- Billing with proof-of-payment uploads
- Kitchen summary and printable tags
- Admin full CRUD for meals/menu items

## Conventions
- Primary keys: `uuid` (`gen_random_uuid()`)
- Timestamps: `created_at`, `updated_at` (UTC)
- Soft delete where needed: `deleted_at`
- Monetary values: `numeric(12,2)`
- Enum style: PostgreSQL enums for fixed domain values

## Enumerations
- `role_type`: `PARENT`, `CHILD`, `ADMIN`, `KITCHEN`, `DELIVERY`
- `session_type`: `LUNCH`, `SNACK`, `BREAKFAST`
- `gender_type`: `MALE`, `FEMALE`, `OTHER`, `UNDISCLOSED`
- `payment_status`: `UNPAID`, `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`
- `order_status`: `PLACED`, `CANCELLED`, `LOCKED`
- `blackout_type`: `ORDER_BLOCK`, `SERVICE_BLOCK`, `BOTH`
- `delivery_status`: `PENDING`, `ASSIGNED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED`

## Core Tables

### 1) `users`
- `id` uuid pk
- `role` role_type not null
- `username` varchar(120) unique not null
- `password_hash` text not null
- `first_name` varchar(100) null
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

### 2) `parents`
- `id` uuid pk
- `user_id` uuid unique fk -> `users.id` (role must be `PARENT`)
- `address` text not null

### 3) `children`
- `id` uuid pk
- `user_id` uuid unique fk -> `users.id` (role must be `CHILD`)
- `date_of_birth` date not null
- `gender` gender_type not null
- `school_grade` varchar(50) not null
- `school_name` varchar(150) not null
- `photo_url` text null
- `is_active` boolean default true
- indexes:
  - index(`school_name`, `school_grade`)
  - index(`date_of_birth`)

### 4) `parent_children`
- `id` uuid pk
- `parent_id` uuid fk -> `parents.id`
- `child_id` uuid fk -> `children.id`
- unique(`parent_id`, `child_id`)
- business constraint:
  - max 10 children per parent (enforced by application/service layer + DB trigger optional)

### 5) `child_dietary_restrictions`
- `id` uuid pk
- `child_id` uuid fk -> `children.id`
- `restriction_label` varchar(120) not null
- `restriction_details` text null
- `is_active` boolean default true

### 6) `menus`
- `id` uuid pk
- `session` session_type not null
- `service_date` date not null
- `is_published` boolean default false
- unique(`session`, `service_date`)

### 7) `ingredients`
- `id` uuid pk
- `name` varchar(120) unique not null
- `is_active` boolean default true
- `allergen_flag` boolean default false
- `notes` text null
- indexes:
  - unique(`name`)
  - unique index on `lower(name)` (case-insensitive uniqueness)

### 8) `menu_items`
- `id` uuid pk
- `menu_id` uuid fk -> `menus.id`
- `name` varchar(150) not null
- `description` text not null
- `nutrition_facts_text` text not null
- `price` numeric(12,2) not null check (`price >= 0`)
- `image_url` text not null
- `is_available` boolean default true
- `display_order` integer default 0
- indexes:
  - index(`menu_id`, `is_available`)
  - unique index on `lower(name)` (case-insensitive unique meal name)

Admin requirement:
- Admin has full CRUD for meal/menu item fields: name, photo, price, ingredient, nutrient, description, availability.
- Admin can edit meal data, but meal name must remain unique.

### 9) `menu_item_ingredients`
- `id` uuid pk
- `menu_item_id` uuid fk -> `menu_items.id` on delete cascade
- `ingredient_id` uuid fk -> `ingredients.id`
- unique(`menu_item_id`, `ingredient_id`)

Notes:
- UI uses dropdown/multi-select from `ingredients` for each menu item.

### 10) `blackout_days`
- `id` uuid pk
- `blackout_date` date not null unique
- `type` blackout_type not null
- `reason` text null
- `created_by` uuid fk -> `users.id` (admin)

### 11) `orders`
- `id` uuid pk
- `order_number` uuid unique not null
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
- unique(`child_id`, `session`, `service_date`) where `status != 'CANCELLED'`
- indexes:
  - index(`service_date`, `session`)
  - index(`child_id`, `service_date`)

### 12) `order_items`
- `id` uuid pk
- `order_id` uuid fk -> `orders.id` on delete cascade
- `menu_item_id` uuid fk -> `menu_items.id`
- `item_name_snapshot` varchar(150) not null
- `price_snapshot` numeric(12,2) not null
- `quantity` integer not null default 1 check (`quantity > 0`)
- unique(`order_id`, `menu_item_id`)

Constraint:
- max 5 items per order (application/service layer and optional trigger).

### 13) `order_mutations`
- `id` uuid pk
- `order_id` uuid fk -> `orders.id`
- `action` varchar(40) not null  (`CREATE`, `UPDATE`, `DELETE`, `DUPLICATE`)
- `actor_user_id` uuid fk -> `users.id`
- `mutation_at` timestamptz not null
- `before_json` jsonb null
- `after_json` jsonb null

### 14) `delivery_assignments`
- `id` uuid pk
- `order_id` uuid unique fk -> `orders.id` on delete cascade
- `delivery_user_id` uuid fk -> `users.id`
- `assigned_at` timestamptz not null
- `confirmed_at` timestamptz null
- `confirmation_note` text null

### 15) `billing_records`
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

### 16) `analytics_daily_agg` (optional materialized/derived)
- `service_date` date not null
- `session` session_type not null
- `menu_item_id` uuid not null
- `total_qty` bigint not null
- primary key (`service_date`, `session`, `menu_item_id`)

## Integrity and Rule Enforcement
- Child can have only one active order per session per service date.
- Service date must be weekday (`Mon-Fri`) unless policy changes.
- `blackout_days` block ordering or service depending on `type`.
- Parent edit/delete cutoff: same `service_date`, before 08:00 Asia/Makassar.
- Child edits/deletes are always blocked after create.
- Delivery confirmation updates both `orders` and `billing_records` delivery fields.

## UI Input Strategy Mapping (Radio/Dropdown First)
- Use enum-backed dropdowns for:
  - role, gender, session, payment status, blackout type, school grade, ingredient list
- Use radio button groups for:
  - simple mutually exclusive statuses (`is_available`, `is_published`, payment/delivery status display)
- Keep free-text only where required:
  - address, descriptions, nutrition text, blackout reason, delivery confirmation note
