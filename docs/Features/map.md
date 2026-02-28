# Blossom School Catering Data Map

## Scope
This map lists current application tables, core fields, key attributes, and relationships based on the active code + schema docs.

Record counts:
- Live DB record counts are **not available** in this workspace because the local PostgreSQL role/database is not initialized (`role "schoolcatering" does not exist`).
- Replace `N/A` with live counts after DB is running.

## Tables, Fields, Records, Attributes

| Table | Core Fields | Attributes / Constraints | Records |
|---|---|---|---|
| `users` | `id`, `role`, `username`, `password_hash`, `first_name`, `last_name`, `phone_number`, `email`, `is_active`, `last_login_at` | PK `id`, unique `username`, role enum, soft-delete via `deleted_at` | N/A |
| `user_preferences` | `id`, `user_id`, `dark_mode_enabled`, `onboarding_completed`, `tooltips_enabled` | PK `id`, unique FK `user_id -> users.id` | N/A |
| `user_identities` | `id`, `user_id`, `provider`, `provider_user_id`, `provider_email` | PK `id`, unique (`provider`,`provider_user_id`) | N/A |
| `auth_refresh_sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at` | Refresh token rotation store | N/A |
| `parents` | `id`, `user_id`, `address` | PK `id`, unique FK `user_id -> users.id` | N/A |
| `children` | `id`, `user_id`, `school_id`, `date_of_birth`, `gender`, `school_grade`, `registration_actor_type`, `registration_actor_teacher_name`, `photo_url`, `is_active` | PK `id`, unique FK `user_id -> users.id` | N/A |
| `parent_children` | `id`, `parent_id`, `child_id` | PK `id`, unique (`parent_id`,`child_id`) | N/A |
| `schools` | `id`, `name`, `address`, `city`, `contact_email`, `contact_phone`, `is_active` | PK `id`, soft-delete, active/inactive toggle | N/A |
| `academic_years` | `id`, `school_id`, `label`, `start_date`, `end_date`, `is_active` | PK `id`, FK `school_id -> schools.id` | N/A |
| `academic_terms` | `id`, `academic_year_id`, `label`, `term_number`, `start_date`, `end_date`, `is_active` | PK `id`, FK `academic_year_id -> academic_years.id` | N/A |
| `child_dietary_restrictions` | `id`, `child_id`, `restriction_label`, `restriction_details`, `is_active` | FK `child_id -> children.id`, soft-delete | N/A |
| `menus` | `id`, `session`, `service_date`, `is_published` | unique (`session`,`service_date`), soft-delete | N/A |
| `menu_items` | `id`, `menu_id`, `name`, `description`, `nutrition_facts_text`, `calories_kcal`, `price`, `image_url`, `is_available`, `display_order`, `cutlery_required`, `packing_requirement` | FK `menu_id -> menus.id`, soft-delete | N/A |
| `ingredients` | `id`, `name`, `allergen_flag`, `is_active`, `notes` | unique normalized name, soft-delete | N/A |
| `menu_item_ingredients` | `id`, `menu_item_id`, `ingredient_id` | unique (`menu_item_id`,`ingredient_id`) | N/A |
| `blackout_days` | `id`, `blackout_date`, `type`, `reason`, `created_by` | unique `blackout_date`, enum type | N/A |
| `session_settings` | `session`, `is_active` | Controls orderable sessions (Lunch enforced active) | N/A |
| `order_carts` | `id`, `child_id`, `created_by_user_id`, `session`, `service_date`, `status`, `expires_at` | one open cart per child/date/session, enum `cart_status` | N/A |
| `cart_items` | `id`, `cart_id`, `menu_item_id`, `quantity` | unique (`cart_id`,`menu_item_id`) | N/A |
| `orders` | `id`, `order_number`, `cart_id`, `child_id`, `placed_by_user_id`, `session`, `service_date`, `status`, `total_price`, `dietary_snapshot`, `delivery_status` | unique active order per child/date/session | N/A |
| `order_items` | `id`, `order_id`, `menu_item_id`, `item_name_snapshot`, `price_snapshot`, `quantity` | unique (`order_id`,`menu_item_id`) | N/A |
| `order_mutations` | `id`, `order_id`, `action`, `actor_user_id`, `mutation_at`, `before_json`, `after_json` | Order audit history | N/A |
| `favourite_meals` | `id`, `created_by_user_id`, `child_id`, `label`, `session`, `is_active` | soft-delete, user-scoped templates | N/A |
| `favourite_meal_items` | `id`, `favourite_meal_id`, `menu_item_id`, `quantity` | FK to favourite template + menu item | N/A |
| `billing_records` | `id`, `order_id`, `parent_id`, `status`, `proof_image_url`, `proof_uploaded_at`, `verified_by`, `verified_at`, `delivery_status`, `delivered_at` | payment status enum, proof-based verification | N/A |
| `digital_receipts` | `id`, `billing_record_id`, `receipt_number`, `pdf_url`, `generated_by_user_id`, `generated_at` | one receipt row per billing record | N/A |
| `delivery_assignments` | `id`, `order_id`, `delivery_user_id`, `assigned_at`, `confirmed_at`, `confirmation_note` | one assignment per order | N/A |
| `delivery_school_assignments` | `delivery_user_id`, `school_id`, `is_active` | composite PK (`delivery_user_id`,`school_id`) | N/A |
| `child_badges` | `id`, `child_id`, `badge_type`, `earned_at`, `streak_count` | badge progression | N/A |
| `analytics_daily_agg` | `service_date`, `session`, `menu_item_id`, `total_qty` | aggregate table for reporting | N/A |

## Schema and Relationships

### Identity and Profile
- `users` 1:1 `user_preferences`
- `users` 1:1 `parents`
- `users` 1:1 `children`
- `users` 1:N `user_identities`
- `parents` N:M `children` via `parent_children`

### School and Academic Structure
- `schools` 1:N `children`
- `schools` 1:N `academic_years`
- `academic_years` 1:N `academic_terms`

### Menu and Ingredient Model
- `menus` 1:N `menu_items`
- `menu_items` N:M `ingredients` via `menu_item_ingredients`
- `session_settings` controls active sessions exposed to ordering users

### Ordering Flow
- `children` 1:N `order_carts`
- `order_carts` 1:N `cart_items`
- `order_carts` 1:1/N `orders` (cart submission)
- `orders` 1:N `order_items`
- `orders` 1:N `order_mutations`
- `favourite_meals` 1:N `favourite_meal_items`

### Billing and Delivery
- `orders` 1:1 `billing_records`
- `billing_records` 1:1 `digital_receipts` (upsert behavior)
- `orders` 1:1 `delivery_assignments`
- `delivery_school_assignments` links delivery users to school routing

### Admin / Rule Controls
- `blackout_days` controls blocked order/service dates
- `session_settings` controls orderable sessions
- `child_badges` stores youngster gamification milestones
- `analytics_daily_agg` stores reporting aggregates
