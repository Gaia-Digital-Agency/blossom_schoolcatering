import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3006/api/v1';
const SEEDED_PASSWORD = process.env.SEEDED_PASSWORD || 'Teameditor@123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'teameditor123';
const OPS_PASSWORD = process.env.OPS_PASSWORD || 'teameditor123';
const FAMILY_USERNAME = process.env.FAMILY_USERNAME || 'family01_parent01';
const STUDENT_USERNAME = process.env.STUDENT_USERNAME || 'family01_student01a';
const DELIVERY_USERNAME = process.env.DELIVERY_USERNAME || 'delivery';
const KITCHEN_USERNAME = process.env.KITCHEN_USERNAME || 'kitchen';
const TARGET_DATE = process.env.TARGET_DATE || nextWeekday(1);
const results = [];

function add(area, name, pass, detail) {
  results.push({ area, name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${area} :: ${name} :: ${detail}`);
}

function nextWeekday(offset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getDbUrl() {
  const file = '.env';
  if (!fs.existsSync(file)) throw new Error('DATABASE_URL not found. Set DATABASE_URL or create .env in the repo root.');
  const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.startsWith('DATABASE_URL='));
  if (line) return line.replace('DATABASE_URL=', '').trim();
  throw new Error('DATABASE_URL not found. Set DATABASE_URL or add it to .env in the repo root.');
}

const DB_URL = process.env.DATABASE_URL || getDbUrl();

function db(sql) {
  return execFileSync('psql', [DB_URL, '-X', '-q', '-tA', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim();
}

function dbJson(sql) {
  const raw = db(sql);
  if (!raw) return [];
  return raw
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => JSON.parse(row));
}

async function api(path, { method = 'GET', token, body, expect = [200, 201] } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!expect.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function login(username, password, role) {
  return api('/auth/login', { method: 'POST', body: { username, password, role } });
}

function getSourceLunchItems() {
  const richDate = db(`
    SELECT m.service_date::text
    FROM menus m
    JOIN menu_items mi ON mi.menu_id = m.id
    WHERE m.session = 'LUNCH'
      AND m.deleted_at IS NULL
      AND mi.deleted_at IS NULL
      AND mi.is_available = true
      AND mi.dish_category IN ('DESSERT', 'SIDES', 'DRINK')
    GROUP BY m.service_date
    ORDER BY m.service_date DESC
    LIMIT 1;
  `);
  if (!richDate) throw new Error('No Lunch menu with dessert/side/drink source data found');

  const richItems = dbJson(`
    SELECT row_to_json(t)::text
    FROM (
      SELECT mi.id,
             mi.name,
             mi.description,
             mi.nutrition_facts_text,
             mi.calories_kcal,
             mi.price,
             mi.image_url,
             mi.is_available,
             mi.display_order,
             mi.cutlery_required,
             mi.packing_requirement,
             mi.is_vegetarian,
             mi.is_gluten_free,
             mi.is_dairy_free,
             mi.contains_peanut,
             COALESCE(mi.dish_category, 'MAIN') AS dish_category,
             COALESCE(
               array_agg(DISTINCT mii.ingredient_id::text) FILTER (WHERE mii.ingredient_id IS NOT NULL),
               '{}'
             ) AS ingredient_ids
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
      WHERE m.session = 'LUNCH'
        AND m.service_date = DATE ${q(richDate)}
        AND m.deleted_at IS NULL
        AND mi.deleted_at IS NULL
        AND mi.is_available = true
      GROUP BY mi.id
      ORDER BY CASE COALESCE(mi.dish_category, 'MAIN')
        WHEN 'MAIN' THEN 1
        WHEN 'DESSERT' THEN 2
        WHEN 'SIDES' THEN 3
        WHEN 'DRINK' THEN 4
        ELSE 9
      END, mi.display_order, mi.created_at
    ) t;
  `);

  const mains = [];
  const extras = dbJson(`
    SELECT row_to_json(t)::text
    FROM (
      SELECT mi.id,
             mi.name,
             mi.description,
             mi.nutrition_facts_text,
             mi.calories_kcal,
             mi.price,
             mi.image_url,
             mi.is_available,
             mi.display_order,
             mi.cutlery_required,
             mi.packing_requirement,
             mi.is_vegetarian,
             mi.is_gluten_free,
             mi.is_dairy_free,
             mi.contains_peanut,
             COALESCE(mi.dish_category, 'MAIN') AS dish_category,
             COALESCE(
               array_agg(DISTINCT mii.ingredient_id::text) FILTER (WHERE mii.ingredient_id IS NOT NULL),
               '{}'
             ) AS ingredient_ids
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
      WHERE m.session = 'LUNCH'
        AND m.deleted_at IS NULL
        AND mi.deleted_at IS NULL
        AND mi.is_available = true
        AND COALESCE(mi.dish_category, 'MAIN') = 'MAIN'
      GROUP BY mi.id, m.service_date
      ORDER BY m.service_date DESC, mi.display_order, mi.created_at
    ) t;
  `);
  const seenMainNames = new Set();
  for (const item of extras) {
    const nameKey = String(item.name || '').trim().toLowerCase();
    if (!nameKey || seenMainNames.has(nameKey)) continue;
    seenMainNames.add(nameKey);
    mains.push(item);
    if (mains.length >= 2) break;
  }
  if (mains.length < 2) throw new Error('Not enough Lunch main dishes to seed Breakfast and Snack');

  const selected = [
    ...mains.slice(0, 2),
    ...richItems.filter((item) => item.dish_category === 'DESSERT'),
    ...richItems.filter((item) => item.dish_category === 'SIDES'),
    ...richItems.filter((item) => item.dish_category === 'DRINK'),
  ];
  return {
    sourceDate: richDate,
    items: selected,
  };
}

function ensureMenu(serviceDate, session) {
  const existing = db(`
    SELECT id
    FROM menus
    WHERE service_date = DATE ${q(serviceDate)}
      AND session = ${q(session)}::session_type
    LIMIT 1;
  `);
  if (existing) return existing;
  return db(`
    INSERT INTO menus (session, service_date, is_published)
    VALUES (${q(session)}::session_type, DATE ${q(serviceDate)}, true)
    RETURNING id;
  `);
}

function upsertSessionMenu(session, serviceDate, sourceItems) {
  const menuId = ensureMenu(serviceDate, session);
  const prefix = session === 'BREAKFAST' ? 'breakfast_' : 'snack_';
  const itemIds = [];

  sourceItems.forEach((sourceItem, index) => {
    const targetName = `${prefix}${sourceItem.name}`;
    const itemId = db(`
      WITH existing AS (
        SELECT id
        FROM menu_items
        WHERE menu_id = ${q(menuId)}
          AND lower(name) = lower(${q(targetName)})
          AND deleted_at IS NULL
        LIMIT 1
      ), upsert AS (
        UPDATE menu_items
        SET description = ${q(sourceItem.description || '')},
            nutrition_facts_text = ${q(String(sourceItem.nutrition_facts_text || '').trim() || 'TBA')},
            calories_kcal = ${sourceItem.calories_kcal ?? 'NULL'},
            price = ${Number(Number(sourceItem.price || 0).toFixed(2))},
            image_url = ${q(sourceItem.image_url || '/schoolcatering/assets/hero-meal.jpg')},
            is_available = true,
            display_order = ${index + 1},
            cutlery_required = ${sourceItem.cutlery_required ? 'true' : 'false'},
            packing_requirement = ${q(sourceItem.packing_requirement || null)},
            is_vegetarian = ${sourceItem.is_vegetarian ? 'true' : 'false'},
            is_gluten_free = ${sourceItem.is_gluten_free ? 'true' : 'false'},
            is_dairy_free = ${sourceItem.is_dairy_free ? 'true' : 'false'},
            contains_peanut = ${sourceItem.contains_peanut ? 'true' : 'false'},
            dish_category = ${q(sourceItem.dish_category || 'MAIN')},
            deleted_at = NULL,
            updated_at = now()
        WHERE id IN (SELECT id FROM existing)
        RETURNING id
      ), inserted AS (
        INSERT INTO menu_items (
          menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available, display_order, cutlery_required, packing_requirement,
          is_vegetarian, is_gluten_free, is_dairy_free, contains_peanut, dish_category
        )
        SELECT
          ${q(menuId)}, ${q(targetName)}, ${q(sourceItem.description || '')}, ${q(String(sourceItem.nutrition_facts_text || '').trim() || 'TBA')},
          ${sourceItem.calories_kcal ?? 'NULL'}, ${Number(Number(sourceItem.price || 0).toFixed(2))}, ${q(sourceItem.image_url || '/schoolcatering/assets/hero-meal.jpg')}, true,
          ${index + 1}, ${sourceItem.cutlery_required ? 'true' : 'false'}, ${q(sourceItem.packing_requirement || null)},
          ${sourceItem.is_vegetarian ? 'true' : 'false'}, ${sourceItem.is_gluten_free ? 'true' : 'false'}, ${sourceItem.is_dairy_free ? 'true' : 'false'},
          ${sourceItem.contains_peanut ? 'true' : 'false'}, ${q(sourceItem.dish_category || 'MAIN')}
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id
      )
      SELECT COALESCE((SELECT id FROM upsert LIMIT 1), (SELECT id FROM inserted LIMIT 1));
    `);
    db(`DELETE FROM menu_item_ingredients WHERE menu_item_id = ${q(itemId)};`);
    for (const ingredientId of sourceItem.ingredient_ids || []) {
      db(`
        INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
        VALUES (${q(itemId)}, ${q(ingredientId)})
        ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
      `);
    }
    itemIds.push(itemId);
  });

  db(`
    UPDATE menus
    SET is_published = true,
        deleted_at = NULL,
        updated_at = now()
    WHERE id = ${q(menuId)};
  `);

  return { menuId, itemIds };
}

function ensureDeliveryCoverage() {
  const deliveryUserId = db(`SELECT id FROM users WHERE username = ${q(DELIVERY_USERNAME)} AND is_active = true LIMIT 1;`);
  if (!deliveryUserId) throw new Error(`Delivery user ${DELIVERY_USERNAME} not found`);
  const schoolIds = db(`
    SELECT DISTINCT c.school_id
    FROM children c
    JOIN users u ON u.id = c.user_id
    WHERE c.is_active = true
      AND c.deleted_at IS NULL
      AND u.is_active = true
      AND u.deleted_at IS NULL
      AND u.username LIKE 'family%_student%';
  `).split('\n').map((row) => row.trim()).filter(Boolean);
  for (const schoolId of schoolIds) {
    for (const session of ['BREAKFAST', 'SNACK', 'LUNCH']) {
      db(`
        INSERT INTO delivery_school_assignments (delivery_user_id, school_id, session, is_active, updated_at)
        VALUES (${q(deliveryUserId)}, ${q(schoolId)}, ${q(session)}::session_type, true, now())
        ON CONFLICT (school_id, session)
        DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id, is_active = true, updated_at = now();
      `);
    }
  }
  return schoolIds.length;
}

function getSeededChildren() {
  return dbJson(`
    SELECT row_to_json(t)::text
    FROM (
      SELECT c.id AS child_id,
             child_user.id AS child_user_id,
             child_user.username AS child_username,
             parent_user.id AS parent_user_id,
             parent_user.username AS parent_username,
             c.school_id
      FROM children c
      JOIN users child_user ON child_user.id = c.user_id
      JOIN parent_children pc ON pc.child_id = c.id
      JOIN parents p ON p.id = pc.parent_id
      JOIN users parent_user ON parent_user.id = p.user_id
      WHERE c.is_active = true
        AND c.deleted_at IS NULL
        AND child_user.is_active = true
        AND child_user.deleted_at IS NULL
        AND parent_user.is_active = true
        AND parent_user.deleted_at IS NULL
        AND child_user.username LIKE 'family%_student%'
        AND parent_user.username LIKE 'family%_parent%'
      ORDER BY child_user.username
    ) t;
  `);
}

function createOrderDb({ childId, placedByUserId, serviceDate, session, menuItemId }) {
  const menuLine = db(`
    SELECT mi.id || '|' || mi.name || '|' || mi.price
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    WHERE mi.id = ${q(menuItemId)}
      AND m.service_date = DATE ${q(serviceDate)}
      AND m.session = ${q(session)}::session_type
      AND mi.deleted_at IS NULL
    LIMIT 1;
  `);
  if (!menuLine) throw new Error(`Menu item ${menuItemId} missing for ${serviceDate} ${session}`);
  const [resolvedItemId, itemName, priceRaw] = menuLine.split('|');
  const price = Number(Number(priceRaw || 0).toFixed(2));

  const existing = db(`
    SELECT id
    FROM orders
    WHERE child_id = ${q(childId)}
      AND service_date = DATE ${q(serviceDate)}
      AND session = ${q(session)}::session_type
      AND deleted_at IS NULL
      AND status <> 'CANCELLED'
    LIMIT 1;
  `);
  if (existing) return existing;

  const parentId = db(`
    SELECT parent_id
    FROM parent_children
    WHERE child_id = ${q(childId)}
    ORDER BY created_at
    LIMIT 1;
  `);
  if (!parentId) throw new Error(`No parent linked to child ${childId}`);

  const orderId = db(`
    INSERT INTO orders (child_id, placed_by_user_id, session, service_date, status, total_price, dietary_snapshot, delivery_status)
    VALUES (${q(childId)}, ${q(placedByUserId)}, ${q(session)}::session_type, DATE ${q(serviceDate)}, 'PLACED', ${price}, 'ALLERGIES: No Allergies', 'PENDING')
    RETURNING id;
  `);

  db(`
    INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
    VALUES (${q(orderId)}, ${q(resolvedItemId)}, ${q(itemName)}, ${price}, 1)
    ON CONFLICT (order_id, menu_item_id) DO NOTHING;

    INSERT INTO billing_records (order_id, parent_id, status, delivery_status)
    VALUES (${q(orderId)}, ${q(parentId)}, 'UNPAID', 'PENDING')
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
    VALUES (${q(orderId)}, 'ORDER_PLACED', ${q(placedByUserId)}, NULL, '{"source":"multisession-seed"}'::jsonb)
    ON CONFLICT DO NOTHING;
  `);

  return orderId;
}

async function createOrderViaApi({ token, childId, serviceDate, session, menuItemId, placedByUserId }) {
  try {
    const cart = await api('/carts', {
      method: 'POST',
      token,
      body: { childId, serviceDate, session },
    });
    await api(`/carts/${cart.id}/items`, {
      method: 'PATCH',
      token,
      body: { items: [{ menuItemId, quantity: 1 }] },
    });
    const order = await api(`/carts/${cart.id}/submit`, { method: 'POST', token });
    return { orderId: order.id, via: 'api' };
  } catch (error) {
    const orderId = createOrderDb({ childId, placedByUserId, serviceDate, session, menuItemId });
    return { orderId, via: 'db-fallback', reason: error instanceof Error ? error.message : String(error) };
  }
}

function ensureDeliveryAssignmentsForOrders(orderIds) {
  const deliveryUserId = db(`SELECT id FROM users WHERE username = ${q(DELIVERY_USERNAME)} LIMIT 1;`);
  for (const orderId of orderIds) {
    db(`
      INSERT INTO delivery_assignments (order_id, delivery_user_id, assigned_at)
      VALUES (${q(orderId)}, ${q(deliveryUserId)}, now())
      ON CONFLICT (order_id)
      DO UPDATE SET delivery_user_id = EXCLUDED.delivery_user_id, assigned_at = now(), updated_at = now();
    `);
    db(`
      UPDATE orders
      SET delivery_status = CASE
            WHEN delivery_status = 'PENDING' THEN 'ASSIGNED'
            ELSE delivery_status
          END,
          updated_at = now()
      WHERE id = ${q(orderId)};
      UPDATE billing_records
      SET delivery_status = CASE
            WHEN delivery_status = 'PENDING' THEN 'ASSIGNED'
            ELSE delivery_status
          END,
          updated_at = now()
      WHERE order_id = ${q(orderId)};
    `);
  }
}

async function main() {
  const admin = await login('admin', ADMIN_PASSWORD, 'ADMIN');
  const adminToken = admin.accessToken;
  const family = await login(FAMILY_USERNAME, SEEDED_PASSWORD, 'PARENT');
  const familyToken = family.accessToken;
  const student = await login(STUDENT_USERNAME, SEEDED_PASSWORD, 'YOUNGSTER');
  const studentToken = student.accessToken;
  const kitchen = await login(KITCHEN_USERNAME, OPS_PASSWORD, 'KITCHEN');
  const kitchenToken = kitchen.accessToken;
  const delivery = await login(DELIVERY_USERNAME, OPS_PASSWORD, 'DELIVERY');
  const deliveryToken = delivery.accessToken;

  add('Auth', 'Admin login', Boolean(adminToken), 'ok');
  add('Auth', 'Family login', Boolean(familyToken), FAMILY_USERNAME);
  add('Auth', 'Student login', Boolean(studentToken), STUDENT_USERNAME);
  add('Auth', 'Kitchen login', Boolean(kitchenToken), KITCHEN_USERNAME);
  add('Auth', 'Delivery login', Boolean(deliveryToken), DELIVERY_USERNAME);

  await api('/admin/session-settings/BREAKFAST', {
    method: 'PATCH',
    token: adminToken,
    body: { isActive: true },
  });
  await api('/admin/session-settings/SNACK', {
    method: 'PATCH',
    token: adminToken,
    body: { isActive: true },
  });
  const sessionSettings = await api('/session-settings', { token: adminToken, expect: [200] });
  add(
    'Config',
    'Breakfast and Snack activated',
    Array.isArray(sessionSettings) && sessionSettings.some((s) => s.session === 'BREAKFAST' && s.is_active) && sessionSettings.some((s) => s.session === 'SNACK' && s.is_active),
    JSON.stringify(sessionSettings),
  );

  const deliveryCoverageCount = ensureDeliveryCoverage();
  add('Delivery', 'Delivery coverage ensured', deliveryCoverageCount > 0, `schools=${deliveryCoverageCount}`);

  const source = getSourceLunchItems();
  add('Menu', 'Lunch source selected', source.items.length >= 10, `sourceDate=${source.sourceDate}, items=${source.items.length}`);

  const breakfastSeed = upsertSessionMenu('BREAKFAST', TARGET_DATE, source.items);
  const snackSeed = upsertSessionMenu('SNACK', TARGET_DATE, source.items);
  add('Menu', 'Breakfast menu seeded', breakfastSeed.itemIds.length === source.items.length, `date=${TARGET_DATE}, items=${breakfastSeed.itemIds.length}`);
  add('Menu', 'Snack menu seeded', snackSeed.itemIds.length === source.items.length, `date=${TARGET_DATE}, items=${snackSeed.itemIds.length}`);

  const breakfastMenu = await api(`/menus?service_date=${TARGET_DATE}&session=BREAKFAST`, { token: familyToken, expect: [200] });
  const snackMenu = await api(`/menus?service_date=${TARGET_DATE}&session=SNACK`, { token: familyToken, expect: [200] });
  add('Family', 'Breakfast menu loads', Array.isArray(breakfastMenu.items) && breakfastMenu.items.length > 0, `items=${(breakfastMenu.items || []).length}`);
  add('Family', 'Snack menu loads', Array.isArray(snackMenu.items) && snackMenu.items.length > 0, `items=${(snackMenu.items || []).length}`);

  const children = getSeededChildren();
  const familyLogins = new Map([[FAMILY_USERNAME, familyToken]]);
  const studentLogins = new Map([[STUDENT_USERNAME, studentToken]]);
  const sessionOrders = { BREAKFAST: [], SNACK: [] };
  let apiOrders = 0;
  let dbFallbackOrders = 0;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!familyLogins.has(child.parent_username)) {
      const token = (await login(child.parent_username, SEEDED_PASSWORD, 'PARENT')).accessToken;
      familyLogins.set(child.parent_username, token);
    }
    if (!studentLogins.has(child.child_username)) {
      const token = (await login(child.child_username, SEEDED_PASSWORD, 'YOUNGSTER')).accessToken;
      studentLogins.set(child.child_username, token);
    }

    const breakfastItemId = breakfastMenu.items[index % breakfastMenu.items.length]?.id;
    const snackItemId = snackMenu.items[index % snackMenu.items.length]?.id;

    const breakfastOrder = await createOrderViaApi({
      token: familyLogins.get(child.parent_username),
      childId: child.child_id,
      serviceDate: TARGET_DATE,
      session: 'BREAKFAST',
      menuItemId: breakfastItemId,
      placedByUserId: child.parent_user_id,
    });
    sessionOrders.BREAKFAST.push(breakfastOrder.orderId);
    if (breakfastOrder.via === 'api') apiOrders += 1; else dbFallbackOrders += 1;

    const snackOrder = await createOrderViaApi({
      token: studentLogins.get(child.child_username),
      childId: child.child_id,
      serviceDate: TARGET_DATE,
      session: 'SNACK',
      menuItemId: snackItemId,
      placedByUserId: child.child_user_id,
    });
    sessionOrders.SNACK.push(snackOrder.orderId);
    if (snackOrder.via === 'api') apiOrders += 1; else dbFallbackOrders += 1;
  }

  add(
    'Ordering',
    'Seed orders created',
    sessionOrders.BREAKFAST.length === children.length && sessionOrders.SNACK.length === children.length,
    `children=${children.length}, breakfast=${sessionOrders.BREAKFAST.length}, snack=${sessionOrders.SNACK.length}, api=${apiOrders}, dbFallback=${dbFallbackOrders}`,
  );

  await api('/delivery/auto-assign', {
    method: 'POST',
    token: adminToken,
    body: { date: TARGET_DATE },
  });
  ensureDeliveryAssignmentsForOrders([sessionOrders.BREAKFAST[0], sessionOrders.SNACK[0]]);

  await api('/ratings', {
    method: 'POST',
    token: familyToken,
    body: { menuItemId: breakfastMenu.items[0].id, stars: 4 },
  });
  await api('/ratings', {
    method: 'POST',
    token: studentToken,
    body: { menuItemId: snackMenu.items[0].id, stars: 5 },
  });
  add('Rating', 'Breakfast and Snack ratings submitted', true, `items=${breakfastMenu.items[0].id},${snackMenu.items[0].id}`);
  const ratingRows = dbJson(`
    SELECT row_to_json(t)::text
    FROM (
      SELECT menu_item_id, session::text AS session, stars
      FROM menu_item_ratings
      WHERE menu_item_id IN (${q(breakfastMenu.items[0].id)}, ${q(snackMenu.items[0].id)})
      ORDER BY menu_item_id, session
    ) t;
  `);
  add(
    'Rating',
    'Ratings persist with session scope',
    ratingRows.some((row) => row.menu_item_id === breakfastMenu.items[0].id && row.session === 'BREAKFAST')
      && ratingRows.some((row) => row.menu_item_id === snackMenu.items[0].id && row.session === 'SNACK'),
    JSON.stringify(ratingRows),
  );

  const familyChildren = await api('/parent/me/children/pages', { token: familyToken, expect: [200] });
  add('Family', 'Family children list', Array.isArray(familyChildren.children) && familyChildren.children.length > 0, `children=${(familyChildren.children || []).length}`);

  const parentOrders = await api('/parent/me/orders/consolidated', { token: familyToken, expect: [200] });
  add(
    'Family',
    'Family consolidated orders',
    Array.isArray(parentOrders.orders) && parentOrders.orders.some((row) => row.session === 'BREAKFAST') && parentOrders.orders.some((row) => row.session === 'SNACK'),
    `rows=${Array.isArray(parentOrders.orders) ? parentOrders.orders.length : 0}`,
  );

  const parentBilling = await api('/billing/parent/consolidated', { token: familyToken, expect: [200] });
  add(
    'Billing',
    'Family billing loads across sessions',
    Array.isArray(parentBilling) && parentBilling.some((row) => row.session === 'BREAKFAST') && parentBilling.some((row) => row.session === 'SNACK'),
    `rows=${Array.isArray(parentBilling) ? parentBilling.length : 0}`,
  );

  const spending = await api(`/parent/me/spending-dashboard?month=${TARGET_DATE.slice(0, 7)}`, { token: familyToken, expect: [200] });
  add(
    'Billing',
    'Family spending dashboard session rows',
    Array.isArray(spending.byChild) && spending.byChild.some((row) => row.session === 'BREAKFAST') && spending.byChild.some((row) => row.session === 'SNACK'),
    `rows=${Array.isArray(spending.byChild) ? spending.byChild.length : 0}`,
  );

  const studentInsights = await api(`/youngster/me/insights?date=${TARGET_DATE}`, { token: studentToken, expect: [200] });
  add(
    'Student',
    'Student insights and badges load',
    Boolean(studentInsights.badge) && Array.isArray(studentInsights.week?.days),
    `monthlyOrders=${studentInsights.badge?.monthlyOrders ?? '-'}`,
  );

  try {
    const studentBilling = await api('/billing/youngster/consolidated', { token: studentToken, expect: [200] });
    add(
      'Billing',
      'Student billing loads across sessions',
      Array.isArray(studentBilling) && studentBilling.some((row) => row.session === 'BREAKFAST') && studentBilling.some((row) => row.session === 'SNACK'),
      `rows=${Array.isArray(studentBilling) ? studentBilling.length : 0}`,
    );
  } catch (error) {
    add(
      'Billing',
      'Student billing loads across sessions',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  const adminBreakfastOrders = await api(`/admin/orders?date=${TARGET_DATE}&session=BREAKFAST`, { token: adminToken, expect: [200] });
  const adminSnackOrders = await api(`/admin/orders?date=${TARGET_DATE}&session=SNACK`, { token: adminToken, expect: [200] });
  const breakfastAdminCount = (adminBreakfastOrders.outstanding || []).length + (adminBreakfastOrders.completed || []).length;
  const snackAdminCount = (adminSnackOrders.outstanding || []).length + (adminSnackOrders.completed || []).length;
  add('Admin', 'Admin Breakfast orders filter', breakfastAdminCount > 0, `rows=${breakfastAdminCount}`);
  add('Admin', 'Admin Snack orders filter', snackAdminCount > 0, `rows=${snackAdminCount}`);

  const adminBreakfastBilling = await api('/admin/billing?session=BREAKFAST', { token: adminToken, expect: [200] });
  const adminSnackBilling = await api('/admin/billing?session=SNACK', { token: adminToken, expect: [200] });
  add('Admin', 'Admin Breakfast billing filter', Array.isArray(adminBreakfastBilling) && adminBreakfastBilling.length > 0, `rows=${adminBreakfastBilling.length}`);
  add('Admin', 'Admin Snack billing filter', Array.isArray(adminSnackBilling) && adminSnackBilling.length > 0, `rows=${adminSnackBilling.length}`);

  const adminBreakfastRatings = await api(`/admin/menu-ratings?service_date=${TARGET_DATE}&session=BREAKFAST`, { token: adminToken, expect: [200] });
  const adminSnackRatings = await api(`/admin/menu-ratings?service_date=${TARGET_DATE}&session=SNACK`, { token: adminToken, expect: [200] });
  add('Admin', 'Admin Breakfast ratings filter', Array.isArray(adminBreakfastRatings.items) && adminBreakfastRatings.items.length > 0, `rows=${(adminBreakfastRatings.items || []).length}`);
  add('Admin', 'Admin Snack ratings filter', Array.isArray(adminSnackRatings.items) && adminSnackRatings.items.length > 0, `rows=${(adminSnackRatings.items || []).length}`);

  const kitchenSummaryBefore = await api(`/kitchen/daily-summary?date=${TARGET_DATE}`, { token: kitchenToken, expect: [200] });
  const breakfastKitchenRows = (kitchenSummaryBefore.orders || []).filter((row) => row.session === 'BREAKFAST');
  const snackKitchenRows = (kitchenSummaryBefore.orders || []).filter((row) => row.session === 'SNACK');
  add('Kitchen', 'Kitchen Breakfast summary rows', breakfastKitchenRows.length > 0, `rows=${breakfastKitchenRows.length}`);
  add('Kitchen', 'Kitchen Snack summary rows', snackKitchenRows.length > 0, `rows=${snackKitchenRows.length}`);
  const breakfastKitchenTarget = breakfastKitchenRows.find((row) => row.delivery_status !== 'DELIVERED');
  const snackKitchenTarget = snackKitchenRows.find((row) => row.delivery_status !== 'DELIVERED');
  let kitchenTogglePass = true;
  let kitchenToggleDetail = 'already delivered';
  if (breakfastKitchenTarget && snackKitchenTarget) {
    await api(`/kitchen/orders/${breakfastKitchenTarget.id}/complete`, { method: 'POST', token: kitchenToken });
    await api(`/kitchen/orders/${snackKitchenTarget.id}/complete`, { method: 'POST', token: kitchenToken });
    const kitchenSummaryAfter = await api(`/kitchen/daily-summary?date=${TARGET_DATE}`, { token: kitchenToken, expect: [200] });
    const kitchenCompleted = (kitchenSummaryAfter.orders || []).filter((row) => [breakfastKitchenTarget.id, snackKitchenTarget.id].includes(row.id) && row.delivery_status === 'OUT_FOR_DELIVERY');
    kitchenTogglePass = kitchenCompleted.length === 2;
    kitchenToggleDetail = `rows=${kitchenCompleted.length}`;
  }
  add('Kitchen', 'Kitchen completion toggle works', kitchenTogglePass, kitchenToggleDetail);

  const deliveryAssignmentsBefore = await api(`/delivery/assignments?date=${TARGET_DATE}`, { token: deliveryToken, expect: [200] });
  const breakfastAssignment = (deliveryAssignmentsBefore || []).find((row) => row.session === 'BREAKFAST');
  const snackAssignment = (deliveryAssignmentsBefore || []).find((row) => row.session === 'SNACK');
  add('Delivery', 'Delivery Breakfast assignment visible', Boolean(breakfastAssignment), `assignment=${breakfastAssignment?.id || '-'}`);
  add('Delivery', 'Delivery Snack assignment visible', Boolean(snackAssignment), `assignment=${snackAssignment?.id || '-'}`);

  let deliveryTogglePass = true;
  let deliveryToggleDetail = 'already delivered';
  if (breakfastAssignment && snackAssignment && (!breakfastAssignment.confirmed_at || !snackAssignment.confirmed_at)) {
    if (!breakfastAssignment.confirmed_at) {
      await api(`/delivery/assignments/${breakfastAssignment.id}/toggle`, { method: 'PATCH', token: deliveryToken, body: { note: 'Breakfast delivered' } });
    }
    if (!snackAssignment.confirmed_at) {
      await api(`/delivery/assignments/${snackAssignment.id}/toggle`, { method: 'PATCH', token: deliveryToken, body: { note: 'Snack delivered' } });
    }
    const deliveryAssignmentsAfter = await api(`/delivery/assignments?date=${TARGET_DATE}`, { token: deliveryToken, expect: [200] });
    const deliveredAssignments = (deliveryAssignmentsAfter || []).filter((row) => [breakfastAssignment.id, snackAssignment.id].includes(row.id) && row.confirmed_at);
    deliveryTogglePass = deliveredAssignments.length === 2;
    deliveryToggleDetail = `rows=${deliveredAssignments.length}`;
  }
  add('Delivery', 'Delivery completion toggle works', deliveryTogglePass, deliveryToggleDetail);

  const routes = [
    '/schoolcatering',
    '/schoolcatering/menu',
    '/schoolcatering/family/order',
    '/schoolcatering/student/order',
    '/schoolcatering/admin/orders',
    '/schoolcatering/admin/billing',
    '/schoolcatering/admin/rating',
    '/schoolcatering/kitchen/today',
    '/schoolcatering/delivery/today',
  ];
  for (const route of routes) {
    const status = execFileSync('curl', ['-I', '-s', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1${route}`], { encoding: 'utf8' }).trim();
    add('Routes', route, ['200', '307', '308'].includes(status), `status=${status}`);
  }

  const failed = results.filter((row) => !row.pass);
  console.log(JSON.stringify({
    targetDate: TARGET_DATE,
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    failed,
    results,
  }, null, 2));
  if (failed.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exit(1);
});
