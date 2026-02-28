import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const short = String(Date.now()).slice(-6);
const results = [];

function ok(step, pass, detail) {
  results.push({ step, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${step} - ${detail}`);
}

function dbUrl() {
  const envUrl = (process.env.DATABASE_URL || '').trim();
  if (envUrl) return envUrl;
  throw new Error('DATABASE_URL is required for allergen_badge_test.mjs');
}

function db(sql) {
  return execFileSync('psql', [dbUrl(), '-q', '-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim();
}

function q(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function api(path, { method = 'GET', token, body, expect = [200, 201] } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let json;
  try { json = txt ? JSON.parse(txt) : {}; } catch { json = { raw: txt }; }
  if (!expect.includes(r.status)) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function login(username, password, role) {
  return api('/auth/login', { method: 'POST', body: { username, password, role } });
}

function addWeekdays(startDate, count) {
  const out = [];
  const d = new Date(`${startDate}T00:00:00Z`);
  while (out.length < count) {
    if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function prevMonthWeekdays(count) {
  const now = new Date();
  const firstCurrent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startPrev = new Date(Date.UTC(firstCurrent.getUTCFullYear(), firstCurrent.getUTCMonth() - 1, 1));
  return addWeekdays(startPrev.toISOString().slice(0, 10), count);
}

function currentMonthWeekdays(count) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return addWeekdays(start.toISOString().slice(0, 10), count);
}

function nextWeekday(offset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function ensureMenuDate(serviceDate, session = 'LUNCH') {
  db(`
    INSERT INTO menus (session, service_date, is_published)
    VALUES (${q(session)}::session_type, DATE ${q(serviceDate)}, true)
    ON CONFLICT (session, service_date) DO UPDATE SET is_published = true, updated_at = now();
  `);
  const menuId = db(`SELECT id FROM menus WHERE session=${q(session)}::session_type AND service_date=DATE ${q(serviceDate)} LIMIT 1;`);
  const allergenIng = db(`SELECT id FROM ingredients WHERE allergen_flag=true AND is_active=true AND deleted_at IS NULL ORDER BY name LIMIT 1;`);
  db(`
    INSERT INTO menu_items (menu_id, name, description, nutrition_facts_text, price, image_url, is_available, display_order, cutlery_required, packing_requirement, calories_kcal)
    SELECT ${q(menuId)}, ${q(`SAT Allergen ${serviceDate} ${session}`)}, 'SAT allergen test item', 'Calories 360', 26000, '/schoolcatering/assets/hero-meal.jpg', true, 1, true, 'SAT pack', 360
    WHERE NOT EXISTS (
      SELECT 1 FROM menu_items WHERE lower(name)=lower(${q(`SAT Allergen ${serviceDate} ${session}`)})
    );
  `);
  const itemId = db(`SELECT id FROM menu_items WHERE lower(name)=lower(${q(`SAT Allergen ${serviceDate} ${session}`)}) LIMIT 1;`);
  db(`
    INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
    VALUES (${q(itemId)}, ${q(allergenIng)})
    ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;
  `);
}

function ensureOrderForChild(childId, placedByUserId, serviceDate, session = 'LUNCH') {
  const item = db(`
    SELECT mi.id || '|' || mi.name || '|' || mi.price
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
    JOIN ingredients i ON i.id = mii.ingredient_id
    WHERE m.service_date=DATE ${q(serviceDate)}
      AND m.session=${q(session)}::session_type
      AND mi.is_available=true
      AND mi.deleted_at IS NULL
    ORDER BY i.allergen_flag DESC, mi.display_order ASC, mi.created_at ASC
    LIMIT 1;
  `);
  if (!item) throw new Error(`No menu item on ${serviceDate} ${session}`);
  const [menuItemId, menuName, priceRaw] = item.split('|');
  const price = Number(priceRaw || 0).toFixed(2);
  const parentId = db(`SELECT parent_id FROM parent_children WHERE child_id=${q(childId)} ORDER BY created_at LIMIT 1;`);

  const existing = db(`SELECT id FROM orders WHERE child_id=${q(childId)} AND service_date=DATE ${q(serviceDate)} AND session=${q(session)}::session_type AND deleted_at IS NULL AND status<>'CANCELLED' LIMIT 1;`);
  if (existing) return existing;

  const orderId = db(`
    INSERT INTO orders (child_id, placed_by_user_id, session, service_date, status, total_price, dietary_snapshot, delivery_status)
    VALUES (${q(childId)}, ${q(placedByUserId)}, ${q(session)}::session_type, DATE ${q(serviceDate)}, 'PLACED', ${price}, 'ALLERGIES: test-seed', 'PENDING')
    RETURNING id;
  `);
  db(`
    INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
    VALUES (${q(orderId)}, ${q(menuItemId)}, ${q(menuName)}, ${price}, 1)
    ON CONFLICT (order_id, menu_item_id) DO NOTHING;
    INSERT INTO billing_records (order_id, parent_id, status, delivery_status)
    VALUES (${q(orderId)}, ${q(parentId)}, 'UNPAID', 'PENDING')
    ON CONFLICT (order_id) DO NOTHING;
  `);
  return orderId;
}

(async () => {
  try {
    const admin = await login('admin', 'admin123', 'ADMIN');
    const adminToken = admin.accessToken;

    // Allergen test: 1 parent + 1 youngster
    const schoolId = (await api('/schools?active=true', { token: adminToken }))[0].id;
    const pUser = `sat_allergen_parent_${short}`;
    const pReg = await api('/auth/register', {
      method: 'POST',
      body: {
        role: 'PARENT', username: pUser, password: 'Parent123',
        firstName: 'Allergen', lastName: 'Parent', phoneNumber: `62890${short}01`,
        email: `${pUser}@mail.local`, address: 'Jl Allergen'
      }
    });
    const pToken = pReg.accessToken;

    const allergenDate = nextWeekday(5);
    ensureMenuDate(allergenDate, 'LUNCH');
    const menu = await api(`/admin/menus?service_date=${allergenDate}&session=LUNCH`, { token: adminToken });
    if (!menu.items?.length) throw new Error('No menu items for allergen date');

    const cReg = await api('/children/register', {
      method: 'POST',
      token: pToken,
      body: {
        firstName: 'AllergenKid', lastName: `Flow${short}`, phoneNumber: `62891${short}01`,
        email: `allergenkid.${short}@mail.local`, dateOfBirth: '2015-01-01', gender: 'MALE',
        schoolId, schoolGrade: 'Grade 4', allergies: 'Peanut Milk Egg'
      }
    });

    const order = await (async () => {
      const cart = await api('/carts', { method: 'POST', token: pToken, body: { childId: cReg.childId, serviceDate: allergenDate, session: 'LUNCH' } });
      await api(`/carts/${cart.id}/items`, { method: 'PATCH', token: pToken, body: { items: [{ menuItemId: menu.items[0].id, quantity: 1 }] } });
      return api(`/carts/${cart.id}/submit`, { method: 'POST', token: pToken });
    })();

    const kitchen = await login('kitchen', 'kitchen123', 'KITCHEN');
    const ksum = await api(`/kitchen/daily-summary?date=${allergenDate}`, { token: kitchen.accessToken });
    const kRow = (ksum.orders || []).find((o) => o.id === order.id);
    ok('A1', !!kRow && kRow.has_allergen === true, 'Kitchen sees allergen order for the youngster');

    const aOrder = await api(`/orders/${order.id}`, { token: adminToken });
    ok('A2', String(aOrder.dietary_snapshot || '').toLowerCase().includes('peanut') || String(aOrder.dietary_snapshot || '').toLowerCase().includes('allerg'), 'Admin sees allergen/dietary snapshot in order detail');

    // Badge test data setup
    const badgeParent = `sat_badge_parent_${short}`;
    const bReg = await api('/auth/register', {
      method: 'POST',
      body: {
        role: 'PARENT', username: badgeParent, password: 'Parent123',
        firstName: 'Badge', lastName: 'Parent', phoneNumber: `62892${short}01`,
        email: `${badgeParent}@mail.local`, address: 'Jl Badge'
      }
    });
    const bToken = bReg.accessToken;
    const bParentUid = db(`SELECT id FROM users WHERE username=${q(badgeParent)} LIMIT 1;`);

    const defs = [
      { key: 'NONE', ordersCurrent: 1, ordersPrev: 0 },
      { key: 'BRONZE', ordersCurrent: 5, ordersPrev: 0 },
      { key: 'SILVER', ordersCurrent: 10, ordersPrev: 0 },
      { key: 'GOLD', ordersCurrent: 20, ordersPrev: 0 },
      { key: 'PLATINUM', ordersCurrent: 10, ordersPrev: 10 },
    ];

    const currentDays = currentMonthWeekdays(22);
    const prevDays = prevMonthWeekdays(12);
    const badgeMatrix = [];

    for (let i = 0; i < defs.length; i += 1) {
      const d = defs[i];
      const child = await api('/children/register', {
        method: 'POST',
        token: bToken,
        body: {
          firstName: `Badge${d.key}`,
          lastName: `Kid${short}`,
          phoneNumber: `62893${short}${String(i).padStart(2, '0')}`,
          email: `badge.${d.key.toLowerCase()}.${short}@mail.local`,
          dateOfBirth: '2014-01-01',
          gender: 'FEMALE',
          schoolId,
          schoolGrade: 'Grade 5',
          allergies: 'No Allergies',
        },
      });

      const cUid = db(`SELECT id FROM users WHERE username=${q(child.username)} LIMIT 1;`);

      for (const day of currentDays.slice(0, d.ordersCurrent)) {
        ensureMenuDate(day, 'LUNCH');
        ensureOrderForChild(child.childId, bParentUid, day, 'LUNCH');
      }
      for (const day of prevDays.slice(0, d.ordersPrev)) {
        ensureMenuDate(day, 'LUNCH');
        ensureOrderForChild(child.childId, bParentUid, day, 'LUNCH');
      }

      const yl = await login(child.username, child.generatedPassword, 'YOUNGSTER');
      const insight = await api(`/youngsters/me/insights?date=${currentDays[Math.min(9, currentDays.length - 1)]}`, { token: yl.accessToken });
      badgeMatrix.push({ username: child.username, expected: d.key, actual: insight.badge?.level || 'NONE' });
    }

    const badgePass = badgeMatrix.every((r) => r.expected === r.actual);
    ok('B1', badgePass, `Youngster badge levels computed: ${badgeMatrix.map((x) => `${x.username}:${x.actual}`).join(', ')}`);

    const adminChildren = await api('/admin/children', { token: adminToken });
    const adminCanSee = badgeMatrix.every((r) => adminChildren.some((c) => c.username === r.username));
    ok('B2', adminCanSee, 'Admin can see all badge-test parents/youngsters in admin lists (with badge matrix report)');

    const report = {
      generatedAt: new Date().toISOString(),
      results,
      badgeMatrix,
      summary: {
        total: results.length,
        passed: results.filter((x) => x.pass).length,
        failed: results.filter((x) => !x.pass).length,
      },
    };
    const outPath = `/tmp/allergen-badge-test-${short}.json`;
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`REPORT_PATH=${outPath}`);
    console.log(`SUMMARY=${report.summary.passed}/${report.summary.total}`);
    if (report.summary.failed > 0) process.exit(2);
  } catch (e) {
    console.error('FATAL', e.message || e);
    process.exit(1);
  }
})();
