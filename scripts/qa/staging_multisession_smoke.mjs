const base = process.env.BASE_URL || 'http://34.158.47.112/schoolcatering/api/v1';
const seededPassword = process.env.SEEDED_PASSWORD || 'Teameditor@123';
const familyUsername = process.env.FAMILY_USERNAME || 'family01_parent01';
const studentUsername = process.env.STUDENT_USERNAME || 'family01_student01a';
const out = [];

function add(area, name, pass, detail) {
  out.push({ area, name, pass, detail });
}

async function req(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (options.expect && !options.expect.includes(res.status)) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  }
  return { status: res.status, body };
}

function nextWeekday(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function findSessionDate(token, session) {
  for (let i = 1; i <= 14; i += 1) {
    const date = nextWeekday(i);
    const menu = await req(`/admin/menus?service_date=${date}&session=${session}`, { token, expect: [200] });
    if ((menu.body?.items || []).length > 0) return date;
  }
  return '';
}

async function main() {
  try {
    const admin = await req('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: seededPassword, role: 'ADMIN' },
      expect: [200, 201],
    });
    const adminToken = admin.body.accessToken;
    add('Auth', 'Admin login', Boolean(adminToken), 'login ok');

    const sessionSettings = await req('/session-settings', { token: adminToken, expect: [200] });
    add(
      'Config',
      'Session settings load',
      Array.isArray(sessionSettings.body) && sessionSettings.body.length >= 3,
      JSON.stringify(sessionSettings.body),
    );

    const breakfastDate = await findSessionDate(adminToken, 'BREAKFAST');
    const snackDate = await findSessionDate(adminToken, 'SNACK');
    add('Menu', 'Breakfast menu exists', Boolean(breakfastDate), breakfastDate || 'none in next 14 weekdays');
    add('Menu', 'Snack menu exists', Boolean(snackDate), snackDate || 'none in next 14 weekdays');

    const parent = await req('/auth/login', {
      method: 'POST',
      body: { username: familyUsername, password: seededPassword, role: 'PARENT' },
      expect: [200, 201],
    });
    const parentToken = parent.body.accessToken;
    add('Auth', 'Family login', Boolean(parentToken), `login ok (${familyUsername})`);

    const children = await req('/parent/me/children/pages', { token: parentToken, expect: [200] });
    const childId = children.body?.children?.[0]?.id || '';
    add('Family', 'Parent children list', Boolean(childId), `childId=${childId || '-'}`);

    const kitchen = await req('/auth/login', {
      method: 'POST',
      body: { username: 'kitchen', password: seededPassword, role: 'KITCHEN' },
      expect: [200, 201],
    });
    const kitchenToken = kitchen.body.accessToken;
    add('Auth', 'Kitchen login', Boolean(kitchenToken), 'login ok');

    const delivery = await req('/auth/login', {
      method: 'POST',
      body: { username: 'delivery', password: seededPassword, role: 'DELIVERY' },
      expect: [200, 201],
    });
    const deliveryToken = delivery.body.accessToken;
    add('Auth', 'Delivery login', Boolean(deliveryToken), 'login ok');

    const youngster = await req('/auth/login', {
      method: 'POST',
      body: { username: studentUsername, password: seededPassword, role: 'YOUNGSTER' },
      expect: [200, 201],
    });
    const youngsterToken = youngster.body.accessToken;
    add('Auth', 'Student login', Boolean(youngsterToken), `login ok (${studentUsername})`);

    if (breakfastDate) {
      const breakfastMenu = await req(`/menus?service_date=${breakfastDate}&session=BREAKFAST`, {
        token: parentToken,
        expect: [200],
      });
      add('Family', 'Family Breakfast menu', Array.isArray(breakfastMenu.body?.items), `items=${(breakfastMenu.body?.items || []).length}`);

      const breakfastOrders = await req(`/admin/orders?date=${breakfastDate}&session=BREAKFAST`, {
        token: adminToken,
        expect: [200],
      });
      add(
        'Admin',
        'Admin orders Breakfast filter',
        Array.isArray(breakfastOrders.body?.outstanding) && Array.isArray(breakfastOrders.body?.completed),
        `outstanding=${(breakfastOrders.body?.outstanding || []).length}`,
      );

      const breakfastBilling = await req('/admin/billing?session=BREAKFAST', { token: adminToken, expect: [200] });
      add('Admin', 'Admin billing Breakfast filter', Array.isArray(breakfastBilling.body), `rows=${(breakfastBilling.body || []).length}`);

      const breakfastRatings = await req(`/admin/menu-ratings?service_date=${breakfastDate}&session=BREAKFAST`, {
        token: adminToken,
        expect: [200],
      });
      add(
        'Admin',
        'Admin rating Breakfast filter',
        Array.isArray(breakfastRatings.body?.items),
        `rows=${(breakfastRatings.body?.items || []).length}`,
      );

      const breakfastKitchen = await req(`/kitchen/daily-summary?date=${breakfastDate}`, {
        token: kitchenToken,
        expect: [200],
      });
      add(
        'Kitchen',
        'Kitchen Breakfast summary',
        Array.isArray(breakfastKitchen.body?.orders),
        `breakfastRows=${(breakfastKitchen.body?.orders || []).filter((row) => row.session === 'BREAKFAST').length}`,
      );

      const breakfastAssignments = await req(`/delivery/assignments?date=${breakfastDate}`, {
        token: deliveryToken,
        expect: [200],
      });
      add(
        'Delivery',
        'Delivery Breakfast assignments list',
        Array.isArray(breakfastAssignments.body),
        `breakfastRows=${(breakfastAssignments.body || []).filter((row) => row.session === 'BREAKFAST').length}`,
      );
    }

    if (snackDate) {
      const snackMenu = await req(`/menus?service_date=${snackDate}&session=SNACK`, {
        token: parentToken,
        expect: [200],
      });
      add('Family', 'Family Snack menu', Array.isArray(snackMenu.body?.items), `items=${(snackMenu.body?.items || []).length}`);

      const snackOrders = await req(`/admin/orders?date=${snackDate}&session=SNACK`, {
        token: adminToken,
        expect: [200],
      });
      add(
        'Admin',
        'Admin orders Snack filter',
        Array.isArray(snackOrders.body?.outstanding) && Array.isArray(snackOrders.body?.completed),
        `outstanding=${(snackOrders.body?.outstanding || []).length}`,
      );

      const snackBilling = await req('/admin/billing?session=SNACK', { token: adminToken, expect: [200] });
      add('Admin', 'Admin billing Snack filter', Array.isArray(snackBilling.body), `rows=${(snackBilling.body || []).length}`);

      const snackRatings = await req(`/admin/menu-ratings?service_date=${snackDate}&session=SNACK`, {
        token: adminToken,
        expect: [200],
      });
      add(
        'Admin',
        'Admin rating Snack filter',
        Array.isArray(snackRatings.body?.items),
        `rows=${(snackRatings.body?.items || []).length}`,
      );

      const snackInsights = await req(`/youngster/me/insights?date=${snackDate}`, {
        token: youngsterToken,
        expect: [200],
      });
      add(
        'Student',
        'Student insights load',
        Boolean(snackInsights.body?.badge) && Array.isArray(snackInsights.body?.week?.days),
        `weekRows=${(snackInsights.body?.week?.days || []).length}`,
      );

      const youngsterBilling = await req('/billing/youngster/consolidated', {
        token: youngsterToken,
        expect: [200],
      });
      add('Student', 'Student billing load', Array.isArray(youngsterBilling.body), `rows=${(youngsterBilling.body || []).length}`);
    }

    const spending = await req('/parent/me/spending-dashboard', { token: parentToken, expect: [200] });
    add(
      'Family',
      'Family spending dashboard session rows',
      Array.isArray(spending.body?.byChild) && spending.body.byChild.every((row) => typeof row.session === 'string'),
      `rows=${(spending.body?.byChild || []).length}`,
    );

    const failed = out.filter((row) => !row.pass);
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      base,
      breakfastDate,
      snackDate,
      summary: { total: out.length, passed: out.length - failed.length, failed: failed.length },
      results: out,
      failed,
    }, null, 2));
    if (failed.length) process.exit(1);
  } catch (error) {
    console.log(JSON.stringify({ fatal: error.message, results: out }, null, 2));
    process.exit(1);
  }
}

main();
