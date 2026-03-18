import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://34.124.244.233/schoolcatering/api/v1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'teameditor123';
const SEEDED_PASSWORD = process.env.SEEDED_PASSWORD || 'Teameditor@123';
const FAMILY_USERNAME = process.env.FAMILY_USERNAME || 'family01_parent01';
const STUDENT_USERNAME = process.env.STUDENT_USERNAME || 'family01_student01a';
const KITCHEN_USERNAME = process.env.KITCHEN_USERNAME || 'kitchen';
const DELIVERY_USERNAME = process.env.DELIVERY_USERNAME || 'delivery';
const OPS_PASSWORD = process.env.OPS_PASSWORD || 'teameditor123';

const out = [];
const PROOF_IMAGE = 'data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoCAAIAAgA0JQBOgCHEgmAA+EQpUapV94M5NPm3kbfRz1ZaiFyAAA==';

function add(area, name, pass, detail) {
  out.push({ area, name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${area} :: ${name} :: ${detail}`);
}

async function req(path, { method = 'GET', token, body, expect = [200, 201] } = {}) {
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
  return req('/auth/login', { method: 'POST', body: { username, password, role } });
}

function nextWeekday(offset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDbUrl() {
  const candidates = ['.env', '/var/www/_env/schoolcatering.env'];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, 'utf8').split('\n').find((row) => row.startsWith('DATABASE_URL='));
    if (line) return line.replace('DATABASE_URL=', '').trim();
  }
  throw new Error('DATABASE_URL not found in .env or /var/www/_env/schoolcatering.env');
}

const DB_URL = process.env.DATABASE_URL || getDbUrl();

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function db(sql) {
  return execFileSync('psql', [DB_URL, '-X', '-q', '-tA', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim();
}

function latestDateWithMenuAndOrders(session) {
  return db(`
    SELECT m.service_date::text
    FROM menus m
    WHERE m.session = ${q(session)}::session_type
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM menu_items mi
        WHERE mi.menu_id = m.id
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
      )
      AND EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.service_date = m.service_date
          AND o.session = m.session
          AND o.deleted_at IS NULL
          AND o.status <> 'CANCELLED'
      )
    ORDER BY m.service_date DESC
    LIMIT 1;
  `);
}

function latestDateWithMenu(session) {
  return db(`
    SELECT m.service_date::text
    FROM menus m
    WHERE m.session = ${q(session)}::session_type
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM menu_items mi
        WHERE mi.menu_id = m.id
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
      )
    ORDER BY m.service_date DESC
    LIMIT 1;
  `);
}

function errorMessage(error) {
  return String(error?.message || error || '');
}

async function setSessionState(token, breakfast, snack) {
  await req('/admin/session-settings/BREAKFAST', {
    method: 'PATCH',
    token,
    body: { isActive: breakfast },
    expect: [200],
  });
  await req('/admin/session-settings/SNACK', {
    method: 'PATCH',
    token,
    body: { isActive: snack },
    expect: [200],
  });
  return req('/session-settings', { token, expect: [200] });
}

async function createCartExpect(pathBody, token, expectedSubstring) {
  try {
    await req('/carts', { method: 'POST', token, body: pathBody, expect: [200, 201] });
    return { pass: false, detail: 'unexpected success' };
  } catch (error) {
    const msg = errorMessage(error);
    return { pass: msg.includes(expectedSubstring), detail: msg };
  }
}

async function main() {
  const admin = await login('admin', ADMIN_PASSWORD, 'ADMIN');
  const family = await login(FAMILY_USERNAME, SEEDED_PASSWORD, 'PARENT');
  const student = await login(STUDENT_USERNAME, SEEDED_PASSWORD, 'YOUNGSTER');
  const kitchen = await login(KITCHEN_USERNAME, OPS_PASSWORD, 'KITCHEN');
  const delivery = await login(DELIVERY_USERNAME, OPS_PASSWORD, 'DELIVERY');

  const adminToken = admin.accessToken;
  const familyToken = family.accessToken;
  const studentToken = student.accessToken;
  const kitchenToken = kitchen.accessToken;
  const deliveryToken = delivery.accessToken;

  const originalSettings = await req('/session-settings', { token: adminToken, expect: [200] });
  const familyChildren = await req('/parent/me/children/pages', { token: familyToken, expect: [200] });
  const childId = familyChildren.children?.[0]?.id;
  if (!childId) throw new Error('Family child not found');

  const breakfastDate = latestDateWithMenuAndOrders('BREAKFAST');
  const snackDate = latestDateWithMenuAndOrders('SNACK');
  const lunchDate = latestDateWithMenuAndOrders('LUNCH');
  const fallbackLunchDate = lunchDate || latestDateWithMenu('LUNCH');
  if (!breakfastDate || !snackDate || !fallbackLunchDate) {
    throw new Error(`Missing scenario dates breakfast=${breakfastDate} snack=${snackDate} lunch=${fallbackLunchDate}`);
  }

  try {
    const breakfastOnlyEffective = await setSessionState(adminToken, true, false);
    add(
      'Scenario',
      'Breakfast enabled with Snack disabled',
      breakfastOnlyEffective.some((row) => row.session === 'BREAKFAST' && row.is_active) &&
        breakfastOnlyEffective.some((row) => row.session === 'SNACK' && row.is_active === false) &&
        breakfastOnlyEffective.some((row) => row.session === 'LUNCH' && row.is_active),
      JSON.stringify(breakfastOnlyEffective),
    );
    const breakfastMenu = await req(`/menus?service_date=${breakfastDate}&session=BREAKFAST`, { token: familyToken, expect: [200] });
    const breakfastOrders = await req(`/admin/orders?date=${breakfastDate}&session=BREAKFAST`, { token: adminToken, expect: [200] });
    const breakfastKitchen = await req(`/kitchen/daily-summary?date=${breakfastDate}`, { token: kitchenToken, expect: [200] });
    const breakfastDelivery = await req(`/delivery/assignments?date=${breakfastDate}`, { token: deliveryToken, expect: [200] });
    const breakfastBilling = await req('/admin/billing?session=BREAKFAST', { token: adminToken, expect: [200] });
    const breakfastRatings = await req(`/admin/menu-ratings?service_date=${breakfastDate}&session=BREAKFAST`, { token: adminToken, expect: [200] });
    add(
      'Scenario',
      'Breakfast scenario works with Lunch baseline',
      (breakfastMenu.items || []).length > 0 &&
        ((breakfastOrders.outstanding || []).length + (breakfastOrders.completed || []).length) > 0 &&
        (breakfastKitchen.orders || []).some((row) => row.session === 'BREAKFAST') &&
        (breakfastDelivery || []).some((row) => row.session === 'BREAKFAST') &&
        (breakfastBilling || []).length > 0 &&
        (breakfastRatings.items || []).length > 0,
      `date=${breakfastDate}`,
    );

    const snackOnlyEffective = await setSessionState(adminToken, false, true);
    add(
      'Scenario',
      'Snack enabled with Breakfast disabled',
      snackOnlyEffective.some((row) => row.session === 'BREAKFAST' && row.is_active === false) &&
        snackOnlyEffective.some((row) => row.session === 'SNACK' && row.is_active) &&
        snackOnlyEffective.some((row) => row.session === 'LUNCH' && row.is_active),
      JSON.stringify(snackOnlyEffective),
    );
    const snackMenu = await req(`/menus?service_date=${snackDate}&session=SNACK`, { token: familyToken, expect: [200] });
    const snackOrders = await req(`/admin/orders?date=${snackDate}&session=SNACK`, { token: adminToken, expect: [200] });
    const snackKitchen = await req(`/kitchen/daily-summary?date=${snackDate}`, { token: kitchenToken, expect: [200] });
    const snackDelivery = await req(`/delivery/assignments?date=${snackDate}`, { token: deliveryToken, expect: [200] });
    const snackBilling = await req('/admin/billing?session=SNACK', { token: adminToken, expect: [200] });
    const snackRatings = await req(`/admin/menu-ratings?service_date=${snackDate}&session=SNACK`, { token: adminToken, expect: [200] });
    add(
      'Scenario',
      'Snack scenario works with Lunch baseline',
      (snackMenu.items || []).length > 0 &&
        ((snackOrders.outstanding || []).length + (snackOrders.completed || []).length) > 0 &&
        (snackKitchen.orders || []).some((row) => row.session === 'SNACK') &&
        (snackDelivery || []).some((row) => row.session === 'SNACK') &&
        (snackBilling || []).length > 0 &&
        (snackRatings.items || []).length > 0,
      `date=${snackDate}`,
    );

    const lunchOnly = await setSessionState(adminToken, false, false);
    add(
      'Scenario',
      'Lunch only active',
      lunchOnly.some((row) => row.session === 'BREAKFAST' && row.is_active === false) &&
        lunchOnly.some((row) => row.session === 'SNACK' && row.is_active === false) &&
        lunchOnly.some((row) => row.session === 'LUNCH' && row.is_active),
      JSON.stringify(lunchOnly),
    );
    const lunchMenu = await req(`/menus?service_date=${fallbackLunchDate}&session=LUNCH`, { token: familyToken, expect: [200] });
    const lunchOrders = await req(`/admin/orders?date=${fallbackLunchDate}&session=LUNCH`, { token: adminToken, expect: [200] });
    const lunchBilling = await req('/admin/billing?session=LUNCH', { token: adminToken, expect: [200] });
    add(
      'Scenario',
      'Lunch-only regression works',
      (lunchMenu.items || []).length > 0 &&
        Array.isArray(lunchBilling) &&
        (((lunchOrders.outstanding || []).length + (lunchOrders.completed || []).length) > 0 || lunchBilling.length > 0),
      `historyDate=${fallbackLunchDate}`,
    );

    const breakfastLunch = await setSessionState(adminToken, true, false);
    const breakfastLunchSpending = await req(`/parent/me/spending-dashboard?month=${breakfastDate.slice(0, 7)}`, { token: familyToken, expect: [200] });
    const breakfastLunchInsights = await req(`/youngster/me/insights?date=${breakfastDate}`, { token: studentToken, expect: [200] });
    add(
      'Scenario',
      'Breakfast + Lunch scenario works',
      breakfastLunch.some((row) => row.session === 'BREAKFAST' && row.is_active) &&
        breakfastLunch.some((row) => row.session === 'SNACK' && row.is_active === false) &&
        Array.isArray(breakfastLunchSpending.byChild) &&
        breakfastLunchSpending.byChild.some((row) => row.session === 'BREAKFAST' || row.session === 'LUNCH') &&
        Boolean(breakfastLunchInsights.badge),
      `rows=${(breakfastLunchSpending.byChild || []).length}`,
    );

    const snackLunch = await setSessionState(adminToken, false, true);
    const snackLunchKitchen = await req(`/kitchen/daily-summary?date=${snackDate}`, { token: kitchenToken, expect: [200] });
    const snackLunchAdminSnack = await req(`/admin/orders?date=${snackDate}&session=SNACK`, { token: adminToken, expect: [200] });
    const snackLunchAdminLunch = await req(`/admin/orders?date=${fallbackLunchDate}&session=LUNCH`, { token: adminToken, expect: [200] });
    add(
      'Scenario',
      'Snack + Lunch scenario works',
      snackLunch.some((row) => row.session === 'BREAKFAST' && row.is_active === false) &&
        snackLunch.some((row) => row.session === 'SNACK' && row.is_active) &&
        (snackLunchKitchen.orders || []).some((row) => row.session === 'SNACK') &&
        ((snackLunchAdminSnack.outstanding || []).length + (snackLunchAdminSnack.completed || []).length) > 0 &&
        (((snackLunchAdminLunch.outstanding || []).length + (snackLunchAdminLunch.completed || []).length) > 0),
      `snackDate=${snackDate}, lunchDate=${fallbackLunchDate}`,
    );

    const allThree = await setSessionState(adminToken, true, true);
    add(
      'Scenario',
      'All three active confirmed',
      allThree.every((row) => row.is_active === true),
      JSON.stringify(allThree),
    );

    const familyBilling = await req('/billing/parent/consolidated', { token: familyToken, expect: [200] });
    const breakfastSnackBillIds = (familyBilling || [])
      .filter((row) => row.service_date === breakfastDate && (row.session === 'BREAKFAST' || row.session === 'SNACK'))
      .map((row) => row.id)
      .slice(0, 2);
    const batchUpload = breakfastSnackBillIds.length === 2
      ? await req('/billing/proof-upload-batch', {
        method: 'POST',
        token: familyToken,
        body: { billingIds: breakfastSnackBillIds, proofImageData: PROOF_IMAGE },
        expect: [200, 201],
      })
      : { ok: false, updatedCount: 0 };
    add(
      'Scenario',
      'Breakfast + Snack batch billing proof upload works',
      breakfastSnackBillIds.length === 2 && batchUpload.updatedCount === 2,
      `billingIds=${breakfastSnackBillIds.join(',') || '-'}`,
    );

    await setSessionState(adminToken, true, true);
    const toggled = await req('/admin/session-settings/SNACK', {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: false },
      expect: [200],
    });
    const toggleBlocked = await createCartExpect(
      { childId, serviceDate: snackDate, session: 'SNACK' },
      familyToken,
      'ORDER_SESSION_DISABLED',
    );
    const toggleBilling = await req('/billing/parent/consolidated', { token: familyToken, expect: [200] });
    add(
      'Scenario',
      'Session toggle blocks Snack orders but keeps existing billing accessible',
      toggled.is_active === false &&
        toggleBlocked.pass &&
        (toggleBilling || []).some((row) => row.service_date === snackDate && row.session === 'SNACK'),
      `${toggleBlocked.detail}`,
    );

    const restoredAfterToggle = await setSessionState(adminToken, true, true);
    add('Scenario', 'Session settings restored after toggle test', restoredAfterToggle.every((row) => row.is_active), JSON.stringify(restoredAfterToggle));

    const snackBlackout = await req('/blackout-days', {
      method: 'POST',
      token: adminToken,
      body: {
        blackoutDate: snackDate,
        session: 'SNACK',
        type: 'ORDER_BLOCK',
        reason: 'Phase3 session blackout check',
      },
      expect: [200, 201],
    });
    const snackBlocked = await createCartExpect(
      { childId, serviceDate: snackDate, session: 'SNACK' },
      familyToken,
      'ORDER_BLACKOUT_BLOCKED',
    );
    const breakfastAllowedCart = await req('/carts', {
      method: 'POST',
      token: familyToken,
      body: { childId, serviceDate: breakfastDate, session: 'BREAKFAST' },
      expect: [200, 201],
    });
    add(
      'Scenario',
      'Session-specific blackout blocks only the targeted session',
      snackBlocked.pass && Boolean(breakfastAllowedCart.id),
      `snack=${snackBlocked.detail}`,
    );

    const lunchWideBlackout = await req('/blackout-days', {
      method: 'POST',
      token: adminToken,
      body: {
        blackoutDate: fallbackLunchDate,
        type: 'ORDER_BLOCK',
        reason: 'Phase3 all-session blackout check',
      },
      expect: [200, 201],
    });
    const lunchBlocked = await createCartExpect(
      { childId, serviceDate: fallbackLunchDate, session: 'LUNCH' },
      familyToken,
      'ORDER_BLACKOUT_BLOCKED',
    );
    add(
      'Scenario',
      'Date-wide blackout blocks all sessions',
      lunchBlocked.pass,
      lunchBlocked.detail,
    );

    if (snackBlackout.id) {
      await req(`/blackout-days/${snackBlackout.id}`, { method: 'DELETE', token: adminToken, expect: [200] });
    }
    if (lunchWideBlackout.id) {
      await req(`/blackout-days/${lunchWideBlackout.id}`, { method: 'DELETE', token: adminToken, expect: [200] });
    }
  } finally {
    const breakfast = originalSettings.find((row) => row.session === 'BREAKFAST')?.is_active ?? true;
    const snack = originalSettings.find((row) => row.session === 'SNACK')?.is_active ?? true;
    await setSessionState(adminToken, breakfast, snack);
  }

  const failed = out.filter((row) => !row.pass);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    base: BASE,
    summary: { total: out.length, passed: out.length - failed.length, failed: failed.length },
    failed,
    results: out,
  }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.log(JSON.stringify({
    fatal: errorMessage(error),
    summary: { total: out.length, passed: out.filter((row) => row.pass).length, failed: out.filter((row) => !row.pass).length + 1 },
    results: out,
  }, null, 2));
  process.exit(1);
});
