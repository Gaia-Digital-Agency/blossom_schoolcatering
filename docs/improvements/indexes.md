# Database Indexes — schoolcatering_db

95 indexes across 32 tables. Generated from `pg_indexes` on 2026-03-12.

Legend: 🔑 Primary key · 🔒 Unique · 📇 Regular · 🔍 Partial (WHERE clause)

---

## academic_terms (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `academic_terms_pkey` | 🔑 Unique | `(id)` |
| 2 | `academic_terms_academic_year_id_term_number_key` | 🔒 Unique | `(academic_year_id, term_number)` |

---

## academic_years (4)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `academic_years_pkey` | 🔑 Unique | `(id)` |
| 2 | `academic_years_school_id_label_key` | 🔒 Unique | `(school_id, label)` |
| 3 | `academic_years_dates_idx` | 📇 Regular | `(start_date, end_date)` |
| 4 | `academic_years_school_active_idx` | 📇 Regular | `(school_id, is_active)` |

---

## admin_audit_logs (4)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `admin_audit_logs_pkey` | 🔑 Unique | `(id)` |
| 2 | `idx_admin_audit_logs_action` | 📇 Regular | `(action, created_at DESC)` |
| 3 | `idx_admin_audit_logs_actor` | 📇 Regular | `(actor_user_id, created_at DESC)` |
| 4 | `idx_admin_audit_logs_target` | 📇 Regular | `(target_type, created_at DESC)` |

---

## analytics_daily_agg (1)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `analytics_daily_agg_pkey` | 🔑 Unique | `(service_date, session, menu_item_id)` |

---

## auth_refresh_sessions (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `auth_refresh_sessions_pkey` | 🔑 Unique | `(jti)` |
| 2 | `auth_refresh_sessions_user_id_idx` | 📇 Regular | `(user_id)` |
| 3 | `auth_refresh_sessions_active_idx` | 📇 Regular | `(revoked_at, expires_at)` |

---

## billing_records (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `billing_records_pkey` | 🔑 Unique | `(id)` |
| 2 | `billing_records_order_id_key` | 🔒 Unique | `(order_id)` |
| 3 | `billing_records_status_idx` | 🔍 Partial | `(status)` WHERE `status IN ('UNPAID', 'PENDING_VERIFICATION')` |

---

## blackout_days (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `blackout_days_pkey` | 🔑 Unique | `(id)` |
| 2 | `blackout_days_blackout_date_key` | 🔒 Unique | `(blackout_date)` |

---

## cart_items (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `cart_items_pkey` | 🔑 Unique | `(id)` |
| 2 | `cart_items_cart_id_menu_item_id_key` | 🔒 Unique | `(cart_id, menu_item_id)` |

---

## child_badges (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `child_badges_pkey` | 🔑 Unique | `(id)` |
| 2 | `child_badges_child_id_badge_type_key` | 🔒 Unique | `(child_id, badge_type)` |
| 3 | `child_badges_child_idx` | 📇 Regular | `(child_id)` |

---

## child_dietary_restrictions (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `child_dietary_restrictions_pkey` | 🔑 Unique | `(id)` |
| 2 | `idx_child_dietary_restrictions_child_label` | 🔒 Unique | `(child_id, restriction_label)` |

---

## children (4)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `children_pkey` | 🔑 Unique | `(id)` |
| 2 | `children_user_id_key` | 🔒 Unique | `(user_id)` |
| 3 | `children_dob_idx` | 📇 Regular | `(date_of_birth)` |
| 4 | `children_school_grade_idx` | 📇 Regular | `(school_id, school_grade)` |

---

## delivery_assignments (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `delivery_assignments_pkey` | 🔑 Unique | `(id)` |
| 2 | `delivery_assignments_order_id_key` | 🔒 Unique | `(order_id)` |
| 3 | `delivery_assignments_delivery_user_id_idx` | 📇 Regular | `(delivery_user_id)` |

---

## delivery_school_assignments (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `delivery_school_assignments_pkey` | 🔑 Unique | `(delivery_user_id, school_id)` |
| 2 | `idx_delivery_school_assignments_school` | 📇 Regular | `(school_id, is_active)` |

---

## digital_receipts (4)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `digital_receipts_pkey` | 🔑 Unique | `(id)` |
| 2 | `digital_receipts_billing_record_id_key` | 🔒 Unique | `(billing_record_id)` |
| 3 | `digital_receipts_receipt_number_key` | 🔒 Unique | `(receipt_number)` |
| 4 | `digital_receipts_receipt_number_idx` | 📇 Regular | `(receipt_number)` |

---

## favourite_meal_items (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `favourite_meal_items_pkey` | 🔑 Unique | `(id)` |
| 2 | `favourite_meal_items_favourite_meal_id_menu_item_id_key` | 🔒 Unique | `(favourite_meal_id, menu_item_id)` |

---

## favourite_meals (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `favourite_meals_pkey` | 🔑 Unique | `(id)` |
| 2 | `favourite_meals_user_active_idx` | 📇 Regular | `(created_by_user_id, is_active)` |

---

## ingredients (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `ingredients_pkey` | 🔑 Unique | `(id)` |
| 2 | `ingredients_name_ci_uq` | 🔒 Unique | `(lower(name))` — case-insensitive |

---

## menu_item_ingredients (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `menu_item_ingredients_pkey` | 🔑 Unique | `(id)` |
| 2 | `menu_item_ingredients_menu_item_id_ingredient_id_key` | 🔒 Unique | `(menu_item_id, ingredient_id)` |

---

## menu_item_ratings (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `menu_item_ratings_pkey` | 🔑 Unique | `(menu_item_id, user_id)` |
| 2 | `idx_menu_item_ratings_item_stars` | 📇 Regular | `(menu_item_id, stars)` |

---

## menu_items (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `menu_items_pkey` | 🔑 Unique | `(id)` |
| 2 | `menu_items_menu_name_ci_active_uq` | 🔍 Partial Unique | `(menu_id, lower(name))` WHERE `deleted_at IS NULL` |
| 3 | `menu_items_menu_available_idx` | 📇 Regular | `(menu_id, is_available)` |

---

## menus (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `menus_pkey` | 🔑 Unique | `(id)` |
| 2 | `menus_session_service_date_key` | 🔒 Unique | `(session, service_date)` |
| 3 | `menus_service_date_published_idx` | 🔍 Partial | `(service_date, is_published)` WHERE `deleted_at IS NULL` |

---

## mv_admin_daily_rollup (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `mv_admin_daily_rollup_uq` | 🔒 Unique | `(service_date, session, school_id, gender, delivery_status, payment_status)` |
| 2 | `mv_admin_daily_rollup_service_date_idx` | 📇 Regular | `(service_date)` |
| 3 | `mv_admin_daily_rollup_school_idx` | 📇 Regular | `(school_id, service_date)` |

---

## order_carts (4)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `order_carts_pkey` | 🔑 Unique | `(id)` |
| 2 | `order_carts_open_uq` | 🔍 Partial Unique | `(child_id, session, service_date)` WHERE `status = 'OPEN'` |
| 3 | `order_carts_child_date_status_idx` | 📇 Regular | `(child_id, service_date, status)` |
| 4 | `order_carts_expires_open_idx` | 🔍 Partial | `(expires_at)` WHERE `status = 'OPEN'` |

---

## order_items (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `order_items_pkey` | 🔑 Unique | `(id)` |
| 2 | `order_items_order_id_menu_item_id_key` | 🔒 Unique | `(order_id, menu_item_id)` |

---

## order_mutations (1)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `order_mutations_pkey` | 🔑 Unique | `(id)` |

---

## orders (8)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `orders_pkey` | 🔑 Unique | `(id)` |
| 2 | `orders_order_number_uq` | 🔒 Unique | `(order_number)` |
| 3 | `orders_child_session_date_active_uq` | 🔍 Partial Unique | `(child_id, session, service_date)` WHERE `status <> 'CANCELLED' AND deleted_at IS NULL` |
| 4 | `orders_active_date_status_idx` | 🔍 Partial | `(service_date, status)` WHERE `deleted_at IS NULL` |
| 5 | `orders_service_date_delivery_status_idx` | 🔍 Partial | `(service_date, delivery_status)` WHERE `deleted_at IS NULL` |
| 6 | `orders_service_session_idx` | 📇 Regular | `(service_date, session)` |
| 7 | `orders_child_service_idx` | 📇 Regular | `(child_id, service_date)` |
| 8 | `orders_cart_id_idx` | 🔍 Partial | `(cart_id)` WHERE `cart_id IS NOT NULL` |

---

## parent_children (3)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `parent_children_pkey` | 🔑 Unique | `(id)` |
| 2 | `parent_children_parent_id_child_id_key` | 🔒 Unique | `(parent_id, child_id)` |
| 3 | `parent_children_child_id_idx` | 📇 Regular | `(child_id)` |

---

## parent_dietary_restrictions (1)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `parent_dietary_restrictions_pkey` | 🔑 Unique | `(parent_id)` |

---

## parents (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `parents_pkey` | 🔑 Unique | `(id)` |
| 2 | `parents_user_id_key` | 🔒 Unique | `(user_id)` |

---

## schools (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `schools_pkey` | 🔑 Unique | `(id)` |
| 2 | `schools_name_ci_uq` | 🔒 Unique | `(lower(name))` — case-insensitive |

---

## session_settings (1)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `session_settings_pkey` | 🔑 Unique | `(session)` |

---

## site_counters (1)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `site_counters_pkey` | 🔑 Unique | `(counter_key)` |

---

## site_settings (1)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `site_settings_pkey` | 🔑 Unique | `(setting_key)` |

---

## user_identities (4)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `user_identities_pkey` | 🔑 Unique | `(id)` |
| 2 | `user_identities_provider_provider_user_id_key` | 🔒 Unique | `(provider, provider_user_id)` |
| 3 | `user_identities_user_id_provider_key` | 🔒 Unique | `(user_id, provider)` |
| 4 | `user_identities_provider_email_idx` | 📇 Regular | `(provider, lower(provider_email))` — case-insensitive |

---

## user_preferences (2)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `user_preferences_pkey` | 🔑 Unique | `(id)` |
| 2 | `user_preferences_user_id_key` | 🔒 Unique | `(user_id)` |

---

## users (5)

| # | Name | Type | Definition |
|---|------|------|-----------|
| 1 | `users_pkey` | 🔑 Unique | `(id)` |
| 2 | `users_username_uq` | 🔒 Unique | `(username)` |
| 3 | `users_email_ci_uq` | 🔍 Partial Unique | `(lower(email))` WHERE `email IS NOT NULL` — case-insensitive |
| 4 | `users_role_idx` | 📇 Regular | `(role)` |
| 5 | `users_phone_number_idx` | 📇 Regular | `(phone_number)` |

---

## Summary

| Type | Count |
|------|-------|
| 🔑 Primary key | 32 |
| 🔒 Unique (non-PK) | 29 |
| 📇 Regular | 22 |
| 🔍 Partial | 12 |
| **Total** | **95** |
