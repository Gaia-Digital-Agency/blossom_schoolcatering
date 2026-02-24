BEGIN;

-- ============================================================
-- SCHOOL: Bali International School (seed reference)
-- ============================================================
INSERT INTO schools (name, address, city, contact_email, contact_phone, is_active)
SELECT 'Bali International School', 'Jl. Hang Tuah No. 46, Sanur, Denpasar', 'Denpasar', 'info@bis.bali.edu', '62361288770', true
WHERE NOT EXISTS (SELECT 1 FROM schools WHERE lower(name) = lower('Bali International School'));

INSERT INTO schools (name, address, city, contact_email, contact_phone, is_active)
SELECT 'Green School Bali', 'Jl. Raya Sibang Kaja, Abiansemal, Badung', 'Badung', 'info@greenschool.org', '62361469875', true
WHERE NOT EXISTS (SELECT 1 FROM schools WHERE lower(name) = lower('Green School Bali'));

-- ============================================================
-- ACADEMIC YEAR: 2025-2026 for Bali International School
-- ============================================================
INSERT INTO academic_years (school_id, label, start_date, end_date, is_active)
SELECT s.id, '2025-2026', DATE '2025-08-01', DATE '2026-07-31', true
FROM schools s
WHERE lower(s.name) = lower('Bali International School')
  AND NOT EXISTS (
    SELECT 1 FROM academic_years ay WHERE ay.school_id = s.id AND ay.label = '2025-2026'
  );

-- ============================================================
-- ACADEMIC TERMS for 2025-2026
-- ============================================================
INSERT INTO academic_terms (academic_year_id, label, term_number, start_date, end_date, is_active)
SELECT ay.id, 'Term 1', 1, DATE '2025-08-01', DATE '2025-11-30', true
FROM academic_years ay
JOIN schools s ON s.id = ay.school_id
WHERE lower(s.name) = lower('Bali International School') AND ay.label = '2025-2026'
  AND NOT EXISTS (SELECT 1 FROM academic_terms at2 WHERE at2.academic_year_id = ay.id AND at2.term_number = 1);

INSERT INTO academic_terms (academic_year_id, label, term_number, start_date, end_date, is_active)
SELECT ay.id, 'Term 2', 2, DATE '2026-01-05', DATE '2026-04-10', true
FROM academic_years ay
JOIN schools s ON s.id = ay.school_id
WHERE lower(s.name) = lower('Bali International School') AND ay.label = '2025-2026'
  AND NOT EXISTS (SELECT 1 FROM academic_terms at2 WHERE at2.academic_year_id = ay.id AND at2.term_number = 2);

INSERT INTO academic_terms (academic_year_id, label, term_number, start_date, end_date, is_active)
SELECT ay.id, 'Term 3', 3, DATE '2026-04-27', DATE '2026-07-31', true
FROM academic_years ay
JOIN schools s ON s.id = ay.school_id
WHERE lower(s.name) = lower('Bali International School') AND ay.label = '2025-2026'
  AND NOT EXISTS (SELECT 1 FROM academic_terms at2 WHERE at2.academic_year_id = ay.id AND at2.term_number = 3);

-- ============================================================
-- USERS  (password hashes are placeholders; replace in app bootstrap)
-- ============================================================
INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
SELECT 'ADMIN', 'admin_master', 'CHANGE_ME_HASH', 'System', 'Admin', '628111111111', 'admin@blossomcatering.local'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin_master');

INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
SELECT 'KITCHEN', 'kitchen_ops', 'CHANGE_ME_HASH', 'Kitchen', 'Ops', '628111111112', 'kitchen@blossomcatering.local'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'kitchen_ops');

INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
SELECT 'DELIVERY', 'delivery_team1', 'CHANGE_ME_HASH', 'Delivery', 'Team', '628111111113', 'delivery@blossomcatering.local'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'delivery_team1');

INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
SELECT 'PARENT', 'wijaya_parent', 'CHANGE_ME_HASH', 'Ayu', 'Wijaya', '628123450001', 'ayu.wijaya@example.com'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'wijaya_parent');

INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
SELECT 'CHILD', 'wijaya_budi', 'CHANGE_ME_HASH', 'Budi', 'Wijaya', '628123450011', 'budi.wijaya@example.com'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'wijaya_budi');

INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email)
SELECT 'CHILD', 'wijaya_sinta', 'CHANGE_ME_HASH', 'Sinta', 'Wijaya', '628123450012', 'sinta.wijaya@example.com'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'wijaya_sinta');

-- ============================================================
-- USER PREFERENCES (one row per user seeded above)
-- ============================================================
INSERT INTO user_preferences (user_id, dark_mode_enabled, onboarding_completed, tooltips_enabled)
SELECT u.id, false, true, true
FROM users u
WHERE u.username IN ('admin_master', 'kitchen_ops', 'delivery_team1', 'wijaya_parent', 'wijaya_budi', 'wijaya_sinta')
  AND NOT EXISTS (SELECT 1 FROM user_preferences up WHERE up.user_id = u.id);

-- ============================================================
-- PARENT PROFILE
-- ============================================================
INSERT INTO parents (user_id, address)
SELECT u.id, 'Jl. Sunset Road No. 88, Kuta, Bali'
FROM users u
WHERE u.username = 'wijaya_parent'
  AND NOT EXISTS (SELECT 1 FROM parents p WHERE p.user_id = u.id);

-- ============================================================
-- CHILDREN PROFILES  (now reference schools.id)
-- ============================================================
INSERT INTO children (user_id, school_id, date_of_birth, gender, school_grade, photo_url)
SELECT u.id, s.id, DATE '2015-08-12', 'MALE', 'Grade 5', NULL
FROM users u
JOIN schools s ON lower(s.name) = lower('Bali International School')
WHERE u.username = 'wijaya_budi'
  AND NOT EXISTS (SELECT 1 FROM children c WHERE c.user_id = u.id);

INSERT INTO children (user_id, school_id, date_of_birth, gender, school_grade, photo_url)
SELECT u.id, s.id, DATE '2017-04-03', 'FEMALE', 'Grade 3', NULL
FROM users u
JOIN schools s ON lower(s.name) = lower('Bali International School')
WHERE u.username = 'wijaya_sinta'
  AND NOT EXISTS (SELECT 1 FROM children c WHERE c.user_id = u.id);

-- ============================================================
-- PARENT-CHILD LINKS
-- ============================================================
INSERT INTO parent_children (parent_id, child_id)
SELECT p.id, c.id
FROM parents p
JOIN users up ON up.id = p.user_id AND up.username = 'wijaya_parent'
JOIN children c ON c.user_id IN (
  SELECT id FROM users WHERE username IN ('wijaya_budi', 'wijaya_sinta')
)
WHERE NOT EXISTS (
  SELECT 1 FROM parent_children pc WHERE pc.parent_id = p.id AND pc.child_id = c.id
);

-- ============================================================
-- INGREDIENT MASTER LIST
-- ============================================================
INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Chicken', true, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Chicken'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Egg', true, true, 'Common allergen'
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Egg'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Milk', true, true, 'Dairy allergen'
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Milk'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Wheat Flour', true, true, 'Gluten source'
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Wheat Flour'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Rice', true, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Rice'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Tomato', true, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Tomato'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Peanut', true, true, 'Nut allergen'
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Peanut'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Fish', true, true, 'Seafood allergen'
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Fish'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Soy Sauce', true, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Soy Sauce'));

INSERT INTO ingredients (name, is_active, allergen_flag, notes)
SELECT 'Garlic', true, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE lower(name) = lower('Garlic'));

-- ============================================================
-- MENUS (weekday service dates)
-- ============================================================
INSERT INTO menus (session, service_date, is_published)
SELECT 'LUNCH', DATE '2026-03-02', true
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE session = 'LUNCH' AND service_date = DATE '2026-03-02');

INSERT INTO menus (session, service_date, is_published)
SELECT 'SNACK', DATE '2026-03-02', true
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE session = 'SNACK' AND service_date = DATE '2026-03-02');

INSERT INTO menus (session, service_date, is_published)
SELECT 'BREAKFAST', DATE '2026-03-02', true
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE session = 'BREAKFAST' AND service_date = DATE '2026-03-02');

-- ============================================================
-- MENU ITEMS (globally unique names across all menus)
-- ============================================================
INSERT INTO menu_items (menu_id, name, description, nutrition_facts_text, price, image_url, is_available, display_order)
SELECT m.id,
  'Blossom Chicken Teriyaki Bowl',
  'Grilled chicken with teriyaki glaze and steamed vegetables over rice.',
  'Approx 520 kcal | Protein 35g | Carbs 55g | Fat 12g',
  45000.00,
  'https://cdn.gda-ce01.storage/blossom_schoolcatering/images/chicken-teriyaki.jpg',
  true, 1
FROM menus m
WHERE m.session = 'LUNCH' AND m.service_date = DATE '2026-03-02'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE lower(name) = lower('Blossom Chicken Teriyaki Bowl'));

INSERT INTO menu_items (menu_id, name, description, nutrition_facts_text, price, image_url, is_available, display_order)
SELECT m.id,
  'Golden Nugget Snack Box',
  'Crispy chicken nuggets served with tomato dipping sauce.',
  'Approx 280 kcal | Protein 18g | Carbs 22g | Fat 12g',
  28000.00,
  'https://cdn.gda-ce01.storage/blossom_schoolcatering/images/nugget-snack-box.jpg',
  true, 1
FROM menus m
WHERE m.session = 'SNACK' AND m.service_date = DATE '2026-03-02'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE lower(name) = lower('Golden Nugget Snack Box'));

INSERT INTO menu_items (menu_id, name, description, nutrition_facts_text, price, image_url, is_available, display_order)
SELECT m.id,
  'Sunrise Egg Fried Rice',
  'Lightly seasoned egg fried rice with mixed vegetables.',
  'Approx 380 kcal | Protein 12g | Carbs 60g | Fat 10g',
  32000.00,
  'https://cdn.gda-ce01.storage/blossom_schoolcatering/images/sunrise-egg-fried-rice.jpg',
  true, 1
FROM menus m
WHERE m.session = 'BREAKFAST' AND m.service_date = DATE '2026-03-02'
  AND NOT EXISTS (SELECT 1 FROM menu_items WHERE lower(name) = lower('Sunrise Egg Fried Rice'));

-- ============================================================
-- MENU ITEM INGREDIENT MAPPINGS
-- ============================================================
INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
SELECT mi.id, i.id
FROM menu_items mi
JOIN ingredients i ON lower(i.name) IN (lower('Chicken'), lower('Rice'), lower('Tomato'), lower('Soy Sauce'), lower('Garlic'))
WHERE lower(mi.name) = lower('Blossom Chicken Teriyaki Bowl')
  AND NOT EXISTS (
    SELECT 1 FROM menu_item_ingredients x WHERE x.menu_item_id = mi.id AND x.ingredient_id = i.id
  );

INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
SELECT mi.id, i.id
FROM menu_items mi
JOIN ingredients i ON lower(i.name) IN (lower('Chicken'), lower('Wheat Flour'), lower('Egg'))
WHERE lower(mi.name) = lower('Golden Nugget Snack Box')
  AND NOT EXISTS (
    SELECT 1 FROM menu_item_ingredients x WHERE x.menu_item_id = mi.id AND x.ingredient_id = i.id
  );

INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
SELECT mi.id, i.id
FROM menu_items mi
JOIN ingredients i ON lower(i.name) IN (lower('Egg'), lower('Rice'), lower('Garlic'))
WHERE lower(mi.name) = lower('Sunrise Egg Fried Rice')
  AND NOT EXISTS (
    SELECT 1 FROM menu_item_ingredients x WHERE x.menu_item_id = mi.id AND x.ingredient_id = i.id
  );

-- ============================================================
-- DIETARY RESTRICTIONS (sample)
-- ============================================================
INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
SELECT c.id, 'No Peanut', 'Exclude all peanut ingredients and traces.', true
FROM children c
JOIN users u ON u.id = c.user_id
WHERE u.username = 'wijaya_budi'
  AND NOT EXISTS (
    SELECT 1 FROM child_dietary_restrictions r
    WHERE r.child_id = c.id AND lower(r.restriction_label) = lower('No Peanut')
  );

-- ============================================================
-- SAMPLE ORDER (from cart submission flow)
-- ============================================================
-- 1) Cart
INSERT INTO order_carts (child_id, created_by_user_id, session, service_date, status, expires_at)
SELECT
  c.id,
  pu.id,
  'LUNCH',
  DATE '2026-03-02',
  'SUBMITTED',
  (DATE '2026-03-02' + INTERVAL '8 hours') AT TIME ZONE 'Asia/Makassar'
FROM children c
JOIN users cu ON cu.id = c.user_id AND cu.username = 'wijaya_budi'
JOIN users pu ON pu.username = 'wijaya_parent'
WHERE NOT EXISTS (
  SELECT 1 FROM order_carts oc
  WHERE oc.child_id = c.id AND oc.session = 'LUNCH' AND oc.service_date = DATE '2026-03-02'
);

-- 2) Cart item
INSERT INTO cart_items (cart_id, menu_item_id, quantity)
SELECT oc.id, mi.id, 1
FROM order_carts oc
JOIN children c ON c.id = oc.child_id
JOIN users cu ON cu.id = c.user_id AND cu.username = 'wijaya_budi'
JOIN menu_items mi ON lower(mi.name) = lower('Blossom Chicken Teriyaki Bowl')
WHERE oc.session = 'LUNCH' AND oc.service_date = DATE '2026-03-02'
  AND NOT EXISTS (SELECT 1 FROM cart_items ci WHERE ci.cart_id = oc.id AND ci.menu_item_id = mi.id);

-- 3) Order (linked to cart)
INSERT INTO orders (
  order_number, cart_id, child_id, placed_by_user_id,
  session, service_date, status, total_price, dietary_snapshot, placed_at, delivery_status
)
SELECT
  gen_random_uuid(),
  oc.id,
  c.id,
  pu.id,
  'LUNCH',
  DATE '2026-03-02',
  'PLACED',
  45000.00,
  'No Peanut',
  now(),
  'ASSIGNED'
FROM order_carts oc
JOIN children c ON c.id = oc.child_id
JOIN users cu ON cu.id = c.user_id AND cu.username = 'wijaya_budi'
JOIN users pu ON pu.username = 'wijaya_parent'
WHERE oc.session = 'LUNCH' AND oc.service_date = DATE '2026-03-02'
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.child_id = c.id AND o.session = 'LUNCH' AND o.service_date = DATE '2026-03-02' AND o.status <> 'CANCELLED'
  );

-- 4) Order item
INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
SELECT o.id, mi.id, mi.name, mi.price, 1
FROM orders o
JOIN children c ON c.id = o.child_id
JOIN users cu ON cu.id = c.user_id AND cu.username = 'wijaya_budi'
JOIN menu_items mi ON lower(mi.name) = lower('Blossom Chicken Teriyaki Bowl')
WHERE o.session = 'LUNCH' AND o.service_date = DATE '2026-03-02' AND o.status <> 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.menu_item_id = mi.id
  );

-- 5) Delivery assignment
INSERT INTO delivery_assignments (order_id, delivery_user_id, assigned_at)
SELECT o.id, u.id, now()
FROM orders o
JOIN children c ON c.id = o.child_id
JOIN users cu ON cu.id = c.user_id AND cu.username = 'wijaya_budi'
JOIN users u ON u.username = 'delivery_team1'
WHERE o.session = 'LUNCH' AND o.service_date = DATE '2026-03-02' AND o.status <> 'CANCELLED'
  AND NOT EXISTS (SELECT 1 FROM delivery_assignments da WHERE da.order_id = o.id);

-- 6) Billing record
INSERT INTO billing_records (order_id, parent_id, status, proof_image_url, proof_uploaded_at, delivery_status)
SELECT
  o.id,
  p.id,
  'PENDING_VERIFICATION',
  'https://cdn.gda-ce01.storage/blossom_schoolcatering/payments/proof-sample-001.jpg',
  now(),
  o.delivery_status
FROM orders o
JOIN children c ON c.id = o.child_id
JOIN users cu ON cu.id = c.user_id AND cu.username = 'wijaya_budi'
JOIN parents p ON p.user_id = (SELECT id FROM users WHERE username = 'wijaya_parent')
WHERE o.session = 'LUNCH' AND o.service_date = DATE '2026-03-02' AND o.status <> 'CANCELLED'
  AND NOT EXISTS (SELECT 1 FROM billing_records b WHERE b.order_id = o.id);

-- ============================================================
-- SAMPLE FAVOURITE MEAL
-- ============================================================
INSERT INTO favourite_meals (created_by_user_id, child_id, label, session, is_active)
SELECT
  pu.id,
  c.id,
  'Budi''s Favourite Lunch',
  'LUNCH',
  true
FROM users pu
JOIN children c ON c.user_id = (SELECT id FROM users WHERE username = 'wijaya_budi')
WHERE pu.username = 'wijaya_parent'
  AND NOT EXISTS (
    SELECT 1 FROM favourite_meals fm
    WHERE fm.created_by_user_id = pu.id AND lower(fm.label) = lower('Budi''s Favourite Lunch')
  );

INSERT INTO favourite_meal_items (favourite_meal_id, menu_item_id, quantity)
SELECT fm.id, mi.id, 1
FROM favourite_meals fm
JOIN users pu ON pu.id = fm.created_by_user_id AND pu.username = 'wijaya_parent'
JOIN menu_items mi ON lower(mi.name) = lower('Blossom Chicken Teriyaki Bowl')
WHERE lower(fm.label) = lower('Budi''s Favourite Lunch')
  AND NOT EXISTS (
    SELECT 1 FROM favourite_meal_items fmi WHERE fmi.favourite_meal_id = fm.id AND fmi.menu_item_id = mi.id
  );

-- ============================================================
-- SAMPLE BLACKOUT DATE
-- ============================================================
INSERT INTO blackout_days (blackout_date, type, reason, created_by)
SELECT DATE '2026-03-19', 'BOTH', 'School holiday event', u.id
FROM users u
WHERE u.username = 'admin_master'
  AND NOT EXISTS (SELECT 1 FROM blackout_days WHERE blackout_date = DATE '2026-03-19');

-- ============================================================
-- ORDER AUDIT TRAIL (sample mutation log)
-- ============================================================
INSERT INTO order_mutations (order_id, action, actor_user_id, mutation_at, before_json, after_json)
SELECT o.id, 'CREATE', pu.id, now(), NULL, to_jsonb(o)
FROM orders o
JOIN children c ON c.id = o.child_id
JOIN users cu ON cu.id = c.user_id AND cu.username = 'wijaya_budi'
JOIN users pu ON pu.username = 'wijaya_parent'
WHERE o.session = 'LUNCH' AND o.service_date = DATE '2026-03-02' AND o.status <> 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM order_mutations om WHERE om.order_id = o.id AND om.action = 'CREATE'
  );

COMMIT;
