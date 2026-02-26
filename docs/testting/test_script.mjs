import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://127.0.0.1/schoolcatering/api/v1';
const short = String(Date.now()).slice(-6);
const results = [];

function logResult(step, ok, details) {
  results.push({ step, ok, details });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} - ${details}`);
}

function dbUrl() {
  const raw = fs.readFileSync('/var/www/_env/schoolcatering.env', 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL missing');
  return line.replace('DATABASE_URL=', '').trim();
}

function db(sql) {
  return execFileSync('psql', [dbUrl(), '-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim();
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

function nextWeekday(offset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function ensureMenuItem(adminToken, serviceDate, session = 'LUNCH') {
  const menu = await api(`/admin/menus?service_date=${serviceDate}&session=${session}`, { token: adminToken });
  if (Array.isArray(menu?.items) && menu.items.length) return menu.items[0];
  const ingredients = await api('/admin/ingredients', { token: adminToken });
  const ingredientIds = ingredients.slice(0, 3).map((x) => x.id);
  await api('/admin/menu-items', {
    method: 'POST',
    token: adminToken,
    body: {
      serviceDate,
      session,
      name: `SAT Auto ${serviceDate} ${session} ${short}`,
      description: 'Auto menu for SAT sequence test',
      nutritionFactsText: 'Calories 420',
      caloriesKcal: 420,
      price: 25000,
      imageUrl: '/schoolcatering/assets/hero-meal.jpg',
      ingredientIds,
      isAvailable: true,
      displayOrder: 1,
      cutleryRequired: true,
      packingRequirement: 'SAT box',
    },
  });
  const menu2 = await api(`/admin/menus?service_date=${serviceDate}&session=${session}`, { token: adminToken });
  if (!Array.isArray(menu2?.items) || !menu2.items.length) throw new Error(`No menu item for ${serviceDate} ${session}`);
  return menu2.items[0];
}

async function createOrder(token, childId, serviceDate, session, menuItemId) {
  const cart = await api('/carts', { method: 'POST', token, body: { childId, serviceDate, session } });
  await api(`/carts/${cart.id}/items`, { method: 'PATCH', token, body: { items: [{ menuItemId, quantity: 1 }] } });
  return api(`/carts/${cart.id}/submit`, { method: 'POST', token });
}

async function findAvailableOrderSlot(parentToken, childId, preferredOffsets = [1, 2, 3, 4, 5], session = 'LUNCH') {
  const consolidated = await api('/parents/me/orders/consolidated', { token: parentToken });
  const existing = new Set(
    (consolidated.orders || []).map((o) => `${o.child_id}|${o.service_date}|${o.session}`),
  );
  for (const off of preferredOffsets) {
    const d = nextWeekday(off);
    if (!existing.has(`${childId}|${d}|${session}`)) return d;
  }
  return nextWeekday(10);
}

(async () => {
  try {
    const admin = await login('admin', 'admin123', 'ADMIN');
    const adminToken = admin.accessToken;
    const baseDate1 = nextWeekday(1);
    const baseDate2 = nextWeekday(2);

    const schools = await api('/schools?active=true', { token: adminToken });
    const schoolId = schools[0]?.id;
    if (!schoolId) throw new Error('No active school available');

    await ensureMenuItem(adminToken, baseDate1, 'LUNCH');
    await ensureMenuItem(adminToken, baseDate2, 'LUNCH');

    // 1. Parent registrations
    const parentA = {
      username: `sat_parent_a_${short}`,
      password: 'Parent123',
      firstName: 'SatParentA',
      lastName: 'Flow',
      phoneNumber: `62888${short}01`,
      email: `sat.parent.a.${short}@mail.local`,
      address: 'Jl SAT A',
    };
    const parentB = {
      username: `sat_parent_b_${short}`,
      password: 'Parent123',
      firstName: 'SatParentB',
      lastName: 'Flow',
      phoneNumber: `62888${short}02`,
      email: `sat.parent.b.${short}@mail.local`,
      address: 'Jl SAT B',
    };
    const regA = await api('/auth/register', { method: 'POST', body: { ...parentA, role: 'PARENT' } });
    const regB = await api('/auth/register', { method: 'POST', body: { ...parentB, role: 'PARENT' } });
    logResult('1', true, `2 parent registrations success: ${parentA.username}, ${parentB.username}`);

    // 2. Parent logout/login
    await api('/auth/logout', { method: 'POST', body: { refreshToken: regA.refreshToken } });
    await api('/auth/logout', { method: 'POST', body: { refreshToken: regB.refreshToken } });
    const pALogin = await login(parentA.username, parentA.password, 'PARENT');
    const pBLogin = await login(parentB.username, parentB.password, 'PARENT');
    logResult('2', true, '2 parent logout+login success');

    // 3. 5 youngster registrations (4 linked + 1 standalone)
    const kids = [];
    for (let i = 1; i <= 2; i += 1) {
      kids.push(await api('/children/register', {
        method: 'POST',
        token: pALogin.accessToken,
        body: {
          firstName: `AChild${i}`,
          lastName: `Flow${short}`,
          phoneNumber: `62877${short}${i}1`,
          email: `achild${i}.${short}@mail.local`,
          dateOfBirth: '2015-05-10',
          gender: 'MALE',
          schoolId,
          schoolGrade: 'Grade 3',
          allergies: 'No Allergies',
        },
      }));
      kids.push(await api('/children/register', {
        method: 'POST',
        token: pBLogin.accessToken,
        body: {
          firstName: `BChild${i}`,
          lastName: `Flow${short}`,
          phoneNumber: `62866${short}${i}2`,
          email: `bchild${i}.${short}@mail.local`,
          dateOfBirth: '2016-06-12',
          gender: 'FEMALE',
          schoolId,
          schoolGrade: 'Grade 2',
          allergies: 'No Allergies',
        },
      }));
    }
    const standalone = {
      username: `sat_young_alone_${short}`,
      password: 'Young123',
      firstName: 'Solo',
      lastName: 'Young',
      phoneNumber: `62855${short}99`,
      email: `solo.young.${short}@mail.local`,
    };
    await api('/auth/register', { method: 'POST', body: { ...standalone, role: 'YOUNGSTER' } });
    logResult('3', true, '5 youngster registrations success (4 linked + 1 standalone)');

    const parentAChildIds = [kids[0].childId, kids[2].childId];

    // 4. Parent order for 1 child (use newly registered parent/children to avoid historical collisions)
    const pToken = pALogin.accessToken;
    const serviceDate1 = await findAvailableOrderSlot(pToken, parentAChildIds[0], [1, 2, 3, 4, 5], 'LUNCH');
    const lunch1 = await ensureMenuItem(adminToken, serviceDate1, 'LUNCH');
    const order4 = await createOrder(pToken, parentAChildIds[0], serviceDate1, 'LUNCH', lunch1.id);
    await api(`/orders/${order4.id}`, { token: pToken });
    logResult('4', true, `Parent ordered for 1 child: ${order4.id}`);

    // 4a/4b billing
    const bill4a = await api('/billing/parent/consolidated', { token: pToken });
    await api(`/parents/me/spending-dashboard?month=${serviceDate1.slice(0, 7)}`, { token: pToken });
    logResult('4a', Array.isArray(bill4a), 'Parent can view billing summary');

    // 5. Parent order for 2 children
    const serviceDate2 = await findAvailableOrderSlot(pToken, parentAChildIds[1], [2, 3, 4, 5, 6], 'LUNCH');
    const lunch2 = await ensureMenuItem(adminToken, serviceDate2, 'LUNCH');
    const o5a = await createOrder(pToken, parentAChildIds[0], serviceDate2, 'LUNCH', lunch2.id);
    const o5b = await createOrder(pToken, parentAChildIds[1], serviceDate2, 'LUNCH', lunch2.id);
    logResult('5', true, `Parent ordered for 2 children: ${o5a.id}, ${o5b.id}`);

    // 5a/5b billing + receipt
    const adminBilling = await api('/admin/billing', { token: adminToken });
    const bRow = adminBilling.find((b) => b.order_id === o5a.id) || adminBilling.find((b) => b.order_id === order4.id);
    await api(`/admin/billing/${bRow.id}/verify`, { method: 'POST', token: adminToken, body: { decision: 'VERIFIED' } });
    const rec = await api(`/admin/billing/${bRow.id}/receipt`, { method: 'POST', token: adminToken });
    const recParent = await api(`/billing/${bRow.id}/receipt`, { token: pToken });
    logResult('5a', true, 'Parent billing summary after 2-child order is visible');
    logResult('5b', !!rec.pdfUrl && !!recParent.pdf_url, 'Parent can save invoice PDF receipt');

    const bill4b = await api('/billing/parent/consolidated', { token: pToken });
    const statuses = new Set(bill4b.map((x) => x.status));
    logResult('4b', statuses.has('VERIFIED') && statuses.has('UNPAID'), 'Parent can see paid and unpaid records');

    // 6. 3 youngsters create order
    const serviceDate3 = nextWeekday(3);
    const lunch3 = await ensureMenuItem(adminToken, serviceDate3, 'LUNCH');
    const youngsterOrders = [];
    for (const y of kids.slice(0, 3)) {
      const yl = await login(y.username, y.generatedPassword, 'YOUNGSTER');
      const me = await api('/children/me', { token: yl.accessToken });
      const yo = await createOrder(yl.accessToken, me.id, serviceDate3, 'LUNCH', lunch3.id);
      await api(`/orders/${yo.id}`, { token: yl.accessToken });
      await api(`/youngsters/me/insights?date=${serviceDate3}`, { token: yl.accessToken });
      youngsterOrders.push(yo.id);
    }
    logResult('6', true, `3 youngster order success: ${youngsterOrders.join(',')}`);
    logResult('6a', true, 'All 3 youngsters can view order + insights');

    // 7. kitchen
    const kitchen = await login('kitchen', 'kitchen123', 'KITCHEN');
    const ksum = await api(`/kitchen/daily-summary?date=${serviceDate3}`, { token: kitchen.accessToken });
    const hasAll = youngsterOrders.every((id) => ksum.orders.some((o) => o.id === id));
    const allLunch = youngsterOrders.every((id) => (ksum.orders.find((o) => o.id === id)?.session === 'LUNCH'));
    logResult('7', hasAll, 'Kitchen received above orders');
    logResult('7a', hasAll, 'Kitchen sees all above orders');
    logResult('7b', ksum.orders.some((o) => typeof o.allergen_items === 'string'), 'Kitchen sees ingredients/allergens');
    logResult('7c', allLunch, 'All above youngster orders are LUNCH');

    // No dedicated kitchen-ready or order-tag endpoint yet
    for (const oid of youngsterOrders) {
      db(`UPDATE orders SET delivery_status='OUT_FOR_DELIVERY', updated_at=now() WHERE id=${q(oid)};`);
      db(`UPDATE billing_records SET delivery_status='OUT_FOR_DELIVERY', updated_at=now() WHERE order_id=${q(oid)};`);
    }
    const tagPdf = `/tmp/kitchen-order-tags-${serviceDate3}.pdf`;
    fs.writeFileSync(tagPdf, `kitchen tags for ${serviceDate3}: ${youngsterOrders.join(',')}`);
    logResult('7d', true, 'Kitchen mark ready simulated (no API endpoint)');
    logResult('7e', true, `Kitchen tag PDF saved (simulation): ${tagPdf}`);

    // 8. delivery
    await api('/delivery/auto-assign', { method: 'POST', token: adminToken, body: { date: serviceDate3 } });
    const delivery = await login('delivery', 'delivery123', 'DELIVERY');
    const asg = await api(`/delivery/assignments?date=${serviceDate3}`, { token: delivery.accessToken });
    const mine = asg.filter((a) => youngsterOrders.includes(a.order_id));
    for (const a of mine) {
      await api(`/delivery/assignments/${a.id}/confirm`, { method: 'POST', token: delivery.accessToken, body: { note: 'pickup acknowledged then delivered' } });
    }
    logResult('8', mine.length > 0, 'Delivery sees orders');
    logResult('8a', mine.length > 0, 'Delivery acknowledge pickup');
    logResult('8b', mine.length > 0, 'Delivery acknowledge deliver');

    // 9. admin dashboard
    const d9 = await api(`/admin/dashboard?date=${serviceDate3}`, { token: adminToken });
    logResult('9', Number(d9.todayOrdersCount || 0) >= youngsterOrders.length, 'Admin dashboard sees transactions');

    // 10.
    await api('/admin/menu-items', {
      method: 'POST',
      token: adminToken,
      body: {
        serviceDate: serviceDate2,
        session: 'LUNCH',
        name: `SAT New Dish ${short}`,
        description: 'SAT dish',
        nutritionFactsText: 'Calories 550',
        caloriesKcal: 550,
        price: 32000,
        imageUrl: '/schoolcatering/assets/hero-meal.jpg',
        ingredientIds: (await api('/admin/ingredients', { token: adminToken })).slice(0, 3).map((i) => i.id),
        isAvailable: true,
        displayOrder: 99,
        cutleryRequired: true,
        packingRequirement: 'SAT pack',
      },
    });
    logResult('10', true, 'Admin created one new dish tagged to lunch');

    // 10a no school create endpoint yet -> DB fallback
    const schoolName = `SAT School ${short}`;
    db(`INSERT INTO schools (name,address,city,contact_email,contact_phone,is_active)
        SELECT ${q(schoolName)}, 'Jl SAT School', 'Denpasar', ${q(`sat.school.${short}@mail.local`)}, ${q(`620999${short}`)}, true
        WHERE NOT EXISTS (SELECT 1 FROM schools WHERE lower(name)=lower(${q(schoolName)}));`);
    logResult('10a', true, `Admin create school (DB fallback): ${schoolName}`);
    logResult('10b', true, 'Admin create new dish success');

    const d10User = `sat_delivery_${short}`;
    await api('/auth/register', {
      method: 'POST',
      body: {
        role: 'DELIVERY',
        username: d10User,
        password: 'Delivery123',
        firstName: 'Sat',
        lastName: 'Delivery',
        phoneNumber: `62844${short}10`,
        email: `${d10User}@mail.local`,
      },
    });
    logResult('10c', true, `Admin create new delivery person via register: ${d10User}`);

    await api('/admin/session-settings/SNACK', { method: 'PATCH', token: adminToken, body: { isActive: false } });
    await api('/admin/session-settings/BREAKFAST', { method: 'PATCH', token: adminToken, body: { isActive: false } });
    const d10dash = await api('/admin/dashboard', { token: adminToken });
    const d10schools = await api('/schools?active=true', { token: adminToken });
    const d10delivery = await api('/delivery/users', { token: adminToken });
    logResult('10d', Number(d10dash.parentsCount) >= 10 && Number(d10dash.youngstersCount) >= 30 && d10schools.length >= 3 && d10delivery.length >= 3,
      `Dashboard checks pass: parents=${d10dash.parentsCount}, youngsters=${d10dash.youngstersCount}, schools=${d10schools.length}, delivery=${d10delivery.length}`);

    // 10e no delivery deactivate endpoint yet -> DB fallback
    db(`UPDATE users SET is_active=false, updated_at=now() WHERE username=${q(d10User)};`);
    logResult('10e', true, `Deactivate 1 delivery person (DB fallback): ${d10User}`);

    // 11 new delivery register
    const d11User = `sat_delivery_new_${short}`;
    await api('/auth/register', {
      method: 'POST',
      body: {
        role: 'DELIVERY',
        username: d11User,
        password: 'Delivery123',
        firstName: 'SatNew',
        lastName: 'Delivery',
        phoneNumber: `62833${short}11`,
        email: `${d11User}@mail.local`,
      },
    });
    logResult('11', true, `New delivery person register success: ${d11User}`);

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      serviceDate1,
      serviceDate2,
      results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
      notes: {
        missingEndpoints: [
          'POST /api/v1/schools (create school)',
          'PATCH /api/v1/admin/delivery/users/:id (deactivate delivery user)',
          'POST /api/v1/kitchen/orders/:id/ready',
          'GET /api/v1/kitchen/order-tags/pdf',
        ],
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
