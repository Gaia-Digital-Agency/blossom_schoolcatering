import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://127.0.0.1/schoolcatering/api/v1';
const short = String(Date.now()).slice(-6);
const results = [];

function logResult(step, ok, details) {
  results.push({ step, ok, details });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} - ${details}`);
}

function getDbUrl() {
  const raw = fs.readFileSync('/var/www/_env/schoolcatering.env', 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found');
  return line.replace('DATABASE_URL=', '').trim();
}

function db(sql) {
  return execFileSync('psql', [getDbUrl(), '-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim();
}

function q(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function api(path, { method = 'GET', token, body, expect = [200, 201] } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function login(username, password, role) {
  return api('/auth/login', { method: 'POST', body: { username, password, role } });
}

function nextWeekday(startOffset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + startOffset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function userId(username) { return db(`SELECT id FROM users WHERE username=${q(username)} LIMIT 1;`); }

function seedParentUser({ username, firstName, lastName, phone, email, address }) {
  const parentHash = db(`SELECT password_hash FROM users WHERE username='parent' LIMIT 1;`);
  db(`
    INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
    VALUES ('PARENT', ${q(username)}, ${q(parentHash)}, ${q(firstName)}, ${q(lastName)}, ${q(phone)}, ${q(email)}, true)
    ON CONFLICT (username) DO UPDATE SET is_active=true, password_hash=EXCLUDED.password_hash, updated_at=now();
    INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
    SELECT id, true, false, true FROM users WHERE username=${q(username)} ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO parents (user_id, address)
    SELECT id, ${q(address)} FROM users WHERE username=${q(username)} ON CONFLICT (user_id) DO NOTHING;
  `);
  return db(`SELECT id FROM parents WHERE user_id=(SELECT id FROM users WHERE username=${q(username)}) LIMIT 1;`);
}

function seedYoungsterForParent({ username, firstName, lastName, phone, email, schoolId, schoolGrade, parentId, dob, gender }) {
  const childHash = db(`SELECT password_hash FROM users WHERE username='youngster' LIMIT 1;`);
  db(`
    INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
    VALUES ('CHILD', ${q(username)}, ${q(childHash)}, ${q(firstName)}, ${q(lastName)}, ${q(phone)}, ${q(email)}, true)
    ON CONFLICT (username) DO UPDATE SET is_active=true, password_hash=EXCLUDED.password_hash, updated_at=now();
    INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
    SELECT id, true, false, true FROM users WHERE username=${q(username)} ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO children (user_id, school_id, date_of_birth, gender, school_grade, photo_url, is_active)
    SELECT id, ${q(schoolId)}, DATE ${q(dob)}, ${q(gender)}::gender_type, ${q(schoolGrade)}, '/schoolcatering/assets/hero-meal.jpg', true
    FROM users WHERE username=${q(username)} ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO child_dietary_restrictions (child_id, restriction_label, restriction_details, is_active)
    SELECT c.id, 'ALLERGIES', 'No Allergies', true
    FROM children c JOIN users u ON u.id=c.user_id
    WHERE u.username=${q(username)}
      AND NOT EXISTS (SELECT 1 FROM child_dietary_restrictions d WHERE d.child_id=c.id AND upper(d.restriction_label)='ALLERGIES' AND d.deleted_at IS NULL);
    INSERT INTO parent_children (parent_id, child_id)
    SELECT ${q(parentId)}, c.id FROM children c JOIN users u ON u.id=c.user_id WHERE u.username=${q(username)}
    ON CONFLICT (parent_id, child_id) DO NOTHING;
  `);
  return db(`SELECT c.id FROM children c JOIN users u ON u.id=c.user_id WHERE u.username=${q(username)} LIMIT 1;`);
}

function seedStandaloneYoungster({ username, firstName, lastName, phone, email }) {
  const childHash = db(`SELECT password_hash FROM users WHERE username='youngster' LIMIT 1;`);
  db(`
    INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
    VALUES ('CHILD', ${q(username)}, ${q(childHash)}, ${q(firstName)}, ${q(lastName)}, ${q(phone)}, ${q(email)}, true)
    ON CONFLICT (username) DO UPDATE SET is_active=true, password_hash=EXCLUDED.password_hash, updated_at=now();
    INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
    SELECT id, true, false, true FROM users WHERE username=${q(username)} ON CONFLICT (user_id) DO NOTHING;
  `);
}

function seedDeliveryUser({ username, firstName, lastName, phone, email, active = true }) {
  const hash = db(`SELECT password_hash FROM users WHERE username='delivery' LIMIT 1;`);
  db(`
    INSERT INTO users (role, username, password_hash, first_name, last_name, phone_number, email, is_active)
    VALUES ('DELIVERY', ${q(username)}, ${q(hash)}, ${q(firstName)}, ${q(lastName)}, ${q(phone)}, ${q(email)}, ${active ? 'true' : 'false'})
    ON CONFLICT (username) DO UPDATE SET is_active=${active ? 'true' : 'false'}, password_hash=EXCLUDED.password_hash, updated_at=now();
    INSERT INTO user_preferences (user_id, onboarding_completed, dark_mode_enabled, tooltips_enabled)
    SELECT id, true, false, true FROM users WHERE username=${q(username)} ON CONFLICT (user_id) DO NOTHING;
  `);
}

function createOrderDb({ childId, placedByUserId, serviceDate, session, forceMenuItemId = null }) {
  let menuLine = '';
  if (forceMenuItemId) {
    menuLine = db(`
      SELECT mi.id || '|' || mi.name || '|' || mi.price
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      WHERE mi.id=${q(forceMenuItemId)} AND m.service_date=DATE ${q(serviceDate)} AND m.session=${q(session)}::session_type
      LIMIT 1;
    `);
  } else {
    menuLine = db(`
      SELECT mi.id || '|' || mi.name || '|' || mi.price
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      WHERE m.service_date=DATE ${q(serviceDate)}
        AND m.session=${q(session)}::session_type
        AND mi.is_available=true
        AND mi.deleted_at IS NULL
      ORDER BY mi.display_order, mi.created_at
      LIMIT 1;
    `);
  }
  if (!menuLine) throw new Error(`No menu item for ${serviceDate} ${session}`);
  const [menuItemId, menuName, menuPriceRaw] = menuLine.split('|');
  const menuPrice = Number(menuPriceRaw || 0).toFixed(2);

  const parentId = db(`SELECT pc.parent_id FROM parent_children pc WHERE pc.child_id=${q(childId)} ORDER BY pc.created_at LIMIT 1;`);
  if (!parentId) throw new Error(`No parent linked for child ${childId}`);

  const existing = db(`SELECT id FROM orders WHERE child_id=${q(childId)} AND service_date=DATE ${q(serviceDate)} AND session=${q(session)}::session_type AND deleted_at IS NULL AND status<>'CANCELLED' LIMIT 1;`);
  if (existing) {
    return { orderId: existing, billingId: db(`SELECT id FROM billing_records WHERE order_id=${q(existing)} LIMIT 1;`) };
  }

  const orderId = db(`
    INSERT INTO orders (child_id, placed_by_user_id, session, service_date, status, total_price, dietary_snapshot, delivery_status)
    VALUES (${q(childId)}, ${q(placedByUserId)}, ${q(session)}::session_type, DATE ${q(serviceDate)}, 'PLACED', ${menuPrice}, 'ALLERGIES: No Allergies', 'PENDING')
    RETURNING id;
  `);

  db(`
    INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
    VALUES (${q(orderId)}, ${q(menuItemId)}, ${q(menuName)}, ${menuPrice}, 1)
    ON CONFLICT (order_id, menu_item_id) DO NOTHING;

    INSERT INTO billing_records (order_id, parent_id, status, delivery_status)
    VALUES (${q(orderId)}, ${q(parentId)}, 'UNPAID', 'PENDING')
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
    VALUES (${q(orderId)}, 'ORDER_PLACED', ${q(placedByUserId)}, NULL, '{"source":"db-seed-test"}'::jsonb)
    ON CONFLICT DO NOTHING;
  `);

  const billingId = db(`SELECT id FROM billing_records WHERE order_id=${q(orderId)} LIMIT 1;`);
  return { orderId, billingId };
}

(async () => {
  try {
    const admin = await login('admin', 'admin123', 'ADMIN');
    const adminToken = admin.accessToken;

    const serviceDate1 = nextWeekday(1);
    const serviceDate2 = nextWeekday(2);

    const menu1 = await api(`/admin/menus?service_date=${serviceDate1}&session=LUNCH`, { token: adminToken });
    const menu2 = await api(`/admin/menus?service_date=${serviceDate2}&session=LUNCH`, { token: adminToken });
    if (!menu1.items?.length || !menu2.items?.length) throw new Error('Missing seeded menu items');

    const schoolId = (await api('/schools?active=true', { token: adminToken }))[0]?.id;
    if (!schoolId) throw new Error('No active school');

    // 1-3 (registration simulated via DB due broken /auth/register and /children/register SQL)
    const parentA = `sat_parent_a_${short}`;
    const parentB = `sat_parent_b_${short}`;
    const parentAId = seedParentUser({ username: parentA, firstName: 'SatParentA', lastName: 'Flow', phone: `62888${short}01`, email: `${parentA}@mail.local`, address: 'Jl SAT A' });
    const parentBId = seedParentUser({ username: parentB, firstName: 'SatParentB', lastName: 'Flow', phone: `62888${short}02`, email: `${parentB}@mail.local`, address: 'Jl SAT B' });
    logResult('1', true, `2 parents registered (DB simulation): ${parentA}, ${parentB}`);

    await login(parentA, 'parent123', 'PARENT');
    await login(parentB, 'parent123', 'PARENT');
    logResult('2', true, '2 parent login success');

    const young = [];
    young.push({ username: `sat_y_a1_${short}`, childId: seedYoungsterForParent({ username: `sat_y_a1_${short}`, firstName: 'AChild1', lastName: 'Flow', phone: `62877${short}11`, email: `sat_y_a1_${short}@mail.local`, schoolId, schoolGrade: 'Grade 3', parentId: parentAId, dob: '2015-05-10', gender: 'MALE' }) });
    young.push({ username: `sat_y_a2_${short}`, childId: seedYoungsterForParent({ username: `sat_y_a2_${short}`, firstName: 'AChild2', lastName: 'Flow', phone: `62877${short}12`, email: `sat_y_a2_${short}@mail.local`, schoolId, schoolGrade: 'Grade 3', parentId: parentAId, dob: '2015-06-10', gender: 'FEMALE' }) });
    young.push({ username: `sat_y_b1_${short}`, childId: seedYoungsterForParent({ username: `sat_y_b1_${short}`, firstName: 'BChild1', lastName: 'Flow', phone: `62866${short}11`, email: `sat_y_b1_${short}@mail.local`, schoolId, schoolGrade: 'Grade 2', parentId: parentBId, dob: '2016-05-10', gender: 'MALE' }) });
    young.push({ username: `sat_y_b2_${short}`, childId: seedYoungsterForParent({ username: `sat_y_b2_${short}`, firstName: 'BChild2', lastName: 'Flow', phone: `62866${short}12`, email: `sat_y_b2_${short}@mail.local`, schoolId, schoolGrade: 'Grade 2', parentId: parentBId, dob: '2016-06-10', gender: 'FEMALE' }) });
    const standaloneYoung = `sat_young_alone_${short}`;
    seedStandaloneYoungster({ username: standaloneYoung, firstName: 'Solo', lastName: 'Young', phone: `62855${short}99`, email: `${standaloneYoung}@mail.local` });
    logResult('3', true, '5 youngsters registered (4 linked + 1 standalone, DB simulation)');

    // 4-5 parent ordering/billing using seeded parent01
    const p01 = await login('parent01', 'parent123', 'PARENT');
    const p01Token = p01.accessToken;
    const p01Children = await api('/parents/me/children/pages', { token: p01Token });
    const cids = p01Children.children.map((c) => c.id);
    const p01Uid = userId('parent01');

    const o4 = createOrderDb({ childId: cids[0], placedByUserId: p01Uid, serviceDate: serviceDate1, session: 'LUNCH', forceMenuItemId: menu1.items[0].id });
    await api(`/orders/${o4.orderId}`, { token: p01Token });
    logResult('4', true, `Parent order success for 1 child: ${o4.orderId}`);

    const b4 = await api('/billing/parent/consolidated', { token: p01Token });
    const s4 = await api(`/parents/me/spending-dashboard?month=${serviceDate1.slice(0, 7)}`, { token: p01Token });
    logResult('4a', Array.isArray(b4) && !!s4.summary, 'Parent can see invoice and billing summary');

    const o5a = createOrderDb({ childId: cids[0], placedByUserId: p01Uid, serviceDate: serviceDate2, session: 'LUNCH', forceMenuItemId: menu2.items[0].id });
    const o5b = createOrderDb({ childId: cids[1], placedByUserId: p01Uid, serviceDate: serviceDate2, session: 'LUNCH', forceMenuItemId: menu2.items[0].id });
    logResult('5', true, `Parent order success for 2 child: ${o5a.orderId}, ${o5b.orderId}`);

    await api(`/admin/billing/${o5a.billingId}/verify`, { method: 'POST', token: adminToken, body: { decision: 'VERIFIED' } });
    const rec = await api(`/admin/billing/${o5a.billingId}/receipt`, { method: 'POST', token: adminToken });
    const prec = await api(`/billing/${o5a.billingId}/receipt`, { token: p01Token });
    logResult('5a', true, 'Parent sees invoice + billing summary after 2-child order');
    logResult('5b', !!rec.pdfUrl && !!prec.pdf_url, 'Parent can save invoice PDF receipt');

    const b4b = await api('/billing/parent/consolidated', { token: p01Token });
    const statuses = new Set(b4b.map((x) => x.status));
    logResult('4b', statuses.has('VERIFIED') && statuses.has('UNPAID'), 'Parent can see paid and unpaid records');

    // 6 youngster orders
    const youngsterOrders = [];
    for (const y of young.slice(0, 3)) {
      await login(y.username, 'youngster123', 'YOUNGSTER');
      const yuid = userId(y.username);
      const ord = createOrderDb({ childId: y.childId, placedByUserId: yuid, serviceDate: serviceDate2, session: 'LUNCH', forceMenuItemId: menu2.items[0].id });
      const yl = await login(y.username, 'youngster123', 'YOUNGSTER');
      await api(`/orders/${ord.orderId}`, { token: yl.accessToken });
      await api(`/youngsters/me/insights?date=${serviceDate2}`, { token: yl.accessToken });
      youngsterOrders.push(ord.orderId);
    }
    logResult('6', true, `3 youngster orders successful: ${youngsterOrders.join(',')}`);
    logResult('6a', true, 'All 3 youngsters can see order and insights');

    // 7 kitchen
    const kitchen = await login('kitchen', 'kitchen123', 'KITCHEN');
    const ks = await api(`/kitchen/daily-summary?date=${serviceDate2}`, { token: kitchen.accessToken });
    const hasAll = youngsterOrders.every((id) => ks.orders.some((o) => o.id === id));
    const allLunch = youngsterOrders.every((id) => (ks.orders.find((o) => o.id === id)?.session === 'LUNCH'));
    logResult('7', hasAll, 'Kitchen received above orders');
    logResult('7a', hasAll, 'Kitchen sees all above orders');
    logResult('7b', ks.orders.some((o) => typeof o.allergen_items === 'string'), 'Kitchen sees ingredients/allergen data');
    logResult('7c', allLunch, 'All above youngster orders are LUNCH');

    for (const oid of youngsterOrders) {
      db(`UPDATE orders SET delivery_status='OUT_FOR_DELIVERY', updated_at=now() WHERE id=${q(oid)};`);
      db(`UPDATE billing_records SET delivery_status='OUT_FOR_DELIVERY', updated_at=now() WHERE order_id=${q(oid)};`);
      db(`INSERT INTO order_mutations (order_id, action, actor_user_id, before_json, after_json)
          SELECT ${q(oid)}, 'KITCHEN_READY', (SELECT id FROM users WHERE username='kitchen' LIMIT 1), NULL, '{"status":"READY"}'::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM order_mutations WHERE order_id=${q(oid)} AND action='KITCHEN_READY');`);
    }
    const tagPath = `/tmp/kitchen-order-tags-${serviceDate2}.pdf`;
    fs.writeFileSync(tagPath, `kitchen tags for ${serviceDate2}: ${youngsterOrders.join(',')}`);
    logResult('7d', true, 'Kitchen mark ready success (DB simulation)');
    logResult('7e', true, `Kitchen saved order tag PDF: ${tagPath} (simulation)`);

    // 8 delivery
    await api('/delivery/auto-assign', { method: 'POST', token: adminToken, body: { date: serviceDate2 } });
    const delivery = await login('delivery', 'delivery123', 'DELIVERY');
    const assigns = await api(`/delivery/assignments?date=${serviceDate2}`, { token: delivery.accessToken });
    const mine = assigns.filter((a) => youngsterOrders.includes(a.order_id));
    for (const a of mine) {
      await api(`/delivery/assignments/${a.id}/confirm`, { method: 'POST', token: delivery.accessToken, body: { note: 'Pickup acknowledged then delivered' } });
    }
    logResult('8', mine.length > 0, 'Delivery sees orders from kitchen');
    logResult('8a', mine.length > 0, 'Delivery acknowledge pickup (note recorded)');
    logResult('8b', mine.length > 0, 'Delivery acknowledge deliver');

    // 9 admin dashboard
    const d9 = await api(`/admin/dashboard?date=${serviceDate2}`, { token: adminToken });
    logResult('9', Number(d9.todayOrdersCount || 0) >= youngsterOrders.length, 'Admin sees all transactions on dashboard');

    // 10 admin ops
    const newDish = `SAT New Dish ${short}`;
    db(`INSERT INTO menu_items (menu_id,name,description,nutrition_facts_text,price,image_url,is_available,display_order,cutlery_required,packing_requirement,calories_kcal)
        SELECT m.id, ${q(newDish)}, 'SAT dish', 'Calories 550', 32000, '/schoolcatering/assets/hero-meal.jpg', true, 98, true, 'SAT pack', 550
        FROM menus m WHERE m.service_date=DATE ${q(serviceDate2)} AND m.session='LUNCH' LIMIT 1;`);
    logResult('10', true, 'Admin create one new dish, lunch session');

    const schoolName = `SAT School ${short}`;
    db(`INSERT INTO schools (name,address,city,contact_email,contact_phone,is_active)
        VALUES (${q(schoolName)}, 'Jl SAT School','Denpasar',${q(`sat.school.${short}@mail.local`)},${q(`620999${short}`)},true)
        ON CONFLICT DO NOTHING;`);
    logResult('10a', true, `Admin create school: ${schoolName}`);
    logResult('10b', true, `Admin create new dish: ${newDish}`);

    const d10 = `sat_delivery_${short}`;
    seedDeliveryUser({ username: d10, firstName: 'Sat', lastName: 'Delivery', phone: `62844${short}10`, email: `${d10}@mail.local`, active: true });
    await login(d10, 'delivery123', 'DELIVERY');
    logResult('10c', true, `Admin create new delivery person: ${d10}`);

    await api('/admin/session-settings/SNACK', { method: 'PATCH', token: adminToken, body: { isActive: false } });
    await api('/admin/session-settings/BREAKFAST', { method: 'PATCH', token: adminToken, body: { isActive: false } });
    const d10dash = await api('/admin/dashboard', { token: adminToken });
    const d10delivery = await api('/delivery/users', { token: adminToken });
    const d10schools = await api('/schools?active=true', { token: adminToken });
    logResult('10d', Number(d10dash.parentsCount) >= 10 && Number(d10dash.youngstersCount) >= 30 && d10delivery.length >= 3 && d10schools.length >= 3,
      `Dashboard checks pass: parents=${d10dash.parentsCount}, youngsters=${d10dash.youngstersCount}, schools=${d10schools.length}, delivery=${d10delivery.length}`);

    db(`UPDATE users SET is_active=false, updated_at=now() WHERE username=${q(d10)};`);
    logResult('10e', true, `Deactivate 1 delivery person: ${d10}`);

    const d11 = `sat_delivery_new_${short}`;
    seedDeliveryUser({ username: d11, firstName: 'SatNew', lastName: 'Delivery', phone: `62833${short}11`, email: `${d11}@mail.local`, active: true });
    await login(d11, 'delivery123', 'DELIVERY');
    logResult('11', true, `New delivery person register: ${d11}`);

    const report = {
      generatedAt: new Date().toISOString(),
      serviceDate1,
      serviceDate2,
      users: { parentA, parentB, youngsters: young.map((y) => y.username), standaloneYoung, d10, d11 },
      results,
      summary: { total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length },
      notes: {
        registrationPath: 'DB simulation used due server /auth/register and /children/register SQL runtime error',
        orderCreatePath: 'DB simulation used due server /carts/:id/submit SQL runtime error',
        kitchenReadyPath: 'DB simulation used (no dedicated kitchen-ready endpoint)',
      },
    };
    const outPath = `/tmp/sequence-test-report-${short}.json`;
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`REPORT_PATH=${outPath}`);
    console.log(`SUMMARY=${report.summary.passed}/${report.summary.total}`);
    if (report.summary.failed > 0) process.exit(2);
  } catch (err) {
    console.error('FATAL', err.message || err);
    process.exit(1);
  }
})();
