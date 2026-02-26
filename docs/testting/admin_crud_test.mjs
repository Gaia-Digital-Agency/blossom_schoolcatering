import fs from 'node:fs';

const BASE = 'http://127.0.0.1/schoolcatering/api/v1';
const stamp = Date.now().toString().slice(-6);
const results = [];

function add(entity, op, pass, detail) {
  results.push({ entity, op, pass, detail });
}

async function req(path, { method = 'GET', token, body } = {}) {
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
  return { status: res.status, body: json };
}

async function test(entity, op, fn) {
  try {
    const detail = await fn();
    add(entity, op, true, detail || 'OK');
  } catch (e) {
    add(entity, op, false, e.message || String(e));
  }
}

function nextWeekday(offset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const adminLogin = await req('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123', role: 'ADMIN' },
  });

  if (adminLogin.status < 200 || adminLogin.status >= 300) {
    const out = { fatal: `Admin login failed: ${adminLogin.status}`, results };
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const adminToken = adminLogin.body.accessToken;
  const orderDate = nextWeekday(12);
  const orderDate2 = nextWeekday(13);

  let schoolId = '';
  let parentId = '';
  let childId = '';
  let childUsername = '';
  let childPassword = '';
  let orderId = '';
  let dishId = '';
  let dishName = '';
  let updateMenuItemId = '';
  let blackoutId = '';
  let deliveryUserId = '';

  const schools = await req('/schools?active=true', { token: adminToken });
  schoolId = (schools.body || [])[0]?.id || '';

  await test('Parent', 'Create', async () => {
    const username = `crud_parent_${stamp}`;
    const r = await req('/auth/register', {
      method: 'POST',
      body: {
        role: 'PARENT',
        username,
        password: 'Parent123',
        firstName: 'Crud',
        lastName: 'Parent',
        phoneNumber: `62866${stamp}01`,
        email: `${username}@mail.local`,
        address: 'Jl CRUD Parent',
      },
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`status=${r.status}`);

    const p = await req('/admin/parents', { token: adminToken });
    const row = (p.body || []).find((x) => x.username === username);
    parentId = row?.id || '';
    if (!parentId) throw new Error('parent id not found in admin list');
    return `username=${username} parentId=${parentId}`;
  });

  await test('Parent', 'Read', async () => {
    const r = await req('/admin/parents', { token: adminToken });
    if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`status=${r.status}`);
    return `rows=${r.body.length}`;
  });

  await test('Parent', 'Update', async () => {
    throw new Error('Missing API endpoint for parent update');
  });

  await test('Parent', 'Delete', async () => {
    throw new Error('Missing API endpoint for parent delete');
  });

  await test('Youngster', 'Create', async () => {
    if (!parentId || !schoolId) throw new Error('missing parentId/schoolId');
    const r = await req('/children/register', {
      method: 'POST',
      token: adminToken,
      body: {
        firstName: 'CrudKid',
        lastName: `Flow${stamp}`,
        phoneNumber: `62866${stamp}02`,
        email: `crudkid.${stamp}@mail.local`,
        dateOfBirth: '2015-01-01',
        gender: 'MALE',
        schoolId,
        schoolGrade: 'Grade 3',
        parentId,
        allergies: 'Peanut Milk Egg',
      },
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`status=${r.status}`);
    childId = r.body.childId;
    childUsername = r.body.username;
    childPassword = r.body.generatedPassword;
    if (!childId) throw new Error('missing childId');
    return `childId=${childId} username=${childUsername}`;
  });

  await test('Youngster', 'Read', async () => {
    const r = await req('/admin/children', { token: adminToken });
    if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`status=${r.status}`);
    const found = r.body.find((c) => c.id === childId);
    if (!found) throw new Error('created child not in admin list');
    return `rows=${r.body.length}`;
  });

  await test('Youngster', 'Update', async () => {
    throw new Error('Missing API endpoint for youngster update');
  });

  await test('Youngster', 'Delete', async () => {
    throw new Error('Missing API endpoint for youngster delete');
  });

  await test('Dish/Menu', 'Create', async () => {
    const ings = await req('/admin/ingredients', { token: adminToken });
    const ingredientIds = (ings.body || []).slice(0, 3).map((i) => i.id);
    const r = await req('/admin/menu-items', {
      method: 'POST',
      token: adminToken,
      body: {
        serviceDate: orderDate,
        session: 'LUNCH',
        name: `CRUD Dish ${stamp}`,
        description: 'CRUD dish test',
        nutritionFactsText: 'Calories 500',
        caloriesKcal: 500,
        price: 32000,
        imageUrl: '/schoolcatering/assets/hero-meal.jpg',
        ingredientIds,
        isAvailable: true,
        displayOrder: 50,
        cutleryRequired: true,
        packingRequirement: 'CRUD pack',
      },
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`status=${r.status}`);
    dishId = r.body.itemId || r.body.id;
    dishName = `CRUD Dish ${stamp}`;
    if (!dishId) throw new Error('missing dishId');
    return `dishId=${dishId}`;
  });

  await test('Dish/Menu', 'Read', async () => {
    const r = await req(`/admin/menus?service_date=${orderDate}&session=LUNCH`, { token: adminToken });
    if (r.status !== 200) throw new Error(`status=${r.status}`);
    const found = (r.body.items || []).find((i) => i.id === dishId);
    if (!found) throw new Error('dish not found in admin menus');
    return `items=${(r.body.items || []).length}`;
  });

  await test('Dish/Menu', 'Update', async () => {
    if (!dishId) throw new Error('missing dishId');
    const ings = await req('/admin/ingredients', { token: adminToken });
    const ingredientIds = (ings.body || []).slice(0, 3).map((i) => i.id);
    const r = await req(`/admin/menu-items/${dishId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        serviceDate: orderDate,
        session: 'LUNCH',
        name: dishName,
        description: 'CRUD dish updated',
        nutritionFactsText: 'Calories 540',
        caloriesKcal: 540,
        price: 35000,
        imageUrl: '/schoolcatering/assets/hero-meal.jpg',
        ingredientIds,
        isAvailable: true,
        displayOrder: 51,
        cutleryRequired: true,
        packingRequirement: 'CRUD pack updated',
      },
    });
    if (r.status !== 200) throw new Error(`status=${r.status}`);
    return 'price/calories updated';
  });

  await test('Dish/Menu', 'Delete', async () => {
    throw new Error('Missing API endpoint for dish/menu-item delete');
  });

  await test('Ingredient', 'Read', async () => {
    const r = await req('/admin/ingredients', { token: adminToken });
    if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`status=${r.status}`);
    return `rows=${r.body.length}`;
  });

  await test('Ingredient', 'Create', async () => {
    throw new Error('Missing API endpoint for ingredient create');
  });

  await test('Ingredient', 'Update', async () => {
    throw new Error('Missing API endpoint for ingredient update');
  });

  await test('Ingredient', 'Delete', async () => {
    throw new Error('Missing API endpoint for ingredient delete');
  });

  await test('Order', 'Create', async () => {
    if (!childId || !dishId) throw new Error('missing childId/dishId');
    const cart = await req('/carts', {
      method: 'POST',
      token: adminToken,
      body: { childId, serviceDate: orderDate, session: 'LUNCH' },
    });
    if (cart.status < 200 || cart.status >= 300) throw new Error(`cart status=${cart.status}`);

    const items = await req(`/carts/${cart.body.id}/items`, {
      method: 'PATCH',
      token: adminToken,
      body: { items: [{ menuItemId: dishId, quantity: 1 }] },
    });
    if (items.status !== 200) throw new Error(`items status=${items.status}`);

    const submit = await req(`/carts/${cart.body.id}/submit`, {
      method: 'POST',
      token: adminToken,
    });
    if (submit.status < 200 || submit.status >= 300) throw new Error(`submit status=${submit.status}`);
    orderId = submit.body.id;
    if (!orderId) throw new Error('missing orderId');
    return `orderId=${orderId}`;
  });

  await test('Order', 'Read', async () => {
    const r = await req(`/orders/${orderId}`, { token: adminToken });
    if (r.status !== 200 || r.body.id !== orderId) throw new Error(`status=${r.status}`);
    return `status=${r.body.status}`;
  });

  await test('Order', 'Update', async () => {
    const menu2 = await req(`/admin/menus?service_date=${orderDate2}&session=LUNCH`, { token: adminToken });
    updateMenuItemId = (menu2.body.items || [])[0]?.id || '';
    if (!updateMenuItemId) throw new Error('missing update menu item for target date');
    const r = await req(`/orders/${orderId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        serviceDate: orderDate2,
        session: 'LUNCH',
        items: [{ menuItemId: updateMenuItemId, quantity: 1 }],
      },
    });
    if (r.status !== 200) throw new Error(`status=${r.status}`);
    return `updated orderId=${orderId}`;
  });

  await test('Order', 'Delete', async () => {
    const r = await req(`/orders/${orderId}`, { method: 'DELETE', token: adminToken });
    if (r.status !== 200) throw new Error(`status=${r.status}`);
    return 'soft-delete success';
  });

  await test('Delivery', 'Create', async () => {
    const username = `crud_delivery_${stamp}`;
    const r = await req('/auth/register', {
      method: 'POST',
      body: {
        role: 'DELIVERY',
        username,
        password: 'Delivery123',
        firstName: 'Crud',
        lastName: 'Delivery',
        phoneNumber: `62866${stamp}03`,
        email: `${username}@mail.local`,
      },
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`status=${r.status}`);

    const users = await req('/delivery/users', { token: adminToken });
    const row = (users.body || []).find((u) => u.username === username);
    deliveryUserId = row?.id || '';
    if (!deliveryUserId) throw new Error('delivery user not found in list');
    return `deliveryUserId=${deliveryUserId}`;
  });

  await test('Delivery', 'Read', async () => {
    const users = await req('/delivery/users', { token: adminToken });
    if (users.status !== 200 || !Array.isArray(users.body)) throw new Error(`status=${users.status}`);
    return `rows=${users.body.length}`;
  });

  await test('Delivery', 'Update', async () => {
    if (!deliveryUserId || !schoolId) throw new Error('missing deliveryUserId/schoolId');
    const r1 = await req('/delivery/school-assignments', {
      method: 'POST',
      token: adminToken,
      body: { deliveryUserId, schoolId, isActive: true },
    });
    const r2 = await req('/delivery/school-assignments', {
      method: 'POST',
      token: adminToken,
      body: { deliveryUserId, schoolId, isActive: false },
    });
    const ok1 = r1.status === 200 || r1.status === 201;
    const ok2 = r2.status === 200 || r2.status === 201;
    if (!ok1 || !ok2) throw new Error(`status=${r1.status}/${r2.status}`);
    return 'assignment active->inactive update success';
  });

  await test('Delivery', 'Delete', async () => {
    throw new Error('Missing API endpoint for delivery user delete/deactivate');
  });

  await test('Blackout Date', 'Create', async () => {
    const r = await req('/blackout-days', {
      method: 'POST',
      token: adminToken,
      body: { blackoutDate: '2026-04-21', type: 'ORDER_BLOCK', reason: `CRUD create ${stamp}` },
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`status=${r.status}`);
    blackoutId = r.body.id;
    return `id=${blackoutId}`;
  });

  await test('Blackout Date', 'Read', async () => {
    const r = await req('/blackout-days', { token: adminToken });
    if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`status=${r.status}`);
    const found = r.body.find((x) => x.id === blackoutId);
    if (!found) throw new Error('blackout not found after create');
    return `rows=${r.body.length}`;
  });

  await test('Blackout Date', 'Update', async () => {
    const r = await req('/blackout-days', {
      method: 'POST',
      token: adminToken,
      body: { blackoutDate: '2026-04-21', type: 'BOTH', reason: `CRUD update ${stamp}` },
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`status=${r.status}`);
    if (r.body.type !== 'BOTH') throw new Error('type not updated');
    return `id=${r.body.id}`;
  });

  await test('Blackout Date', 'Delete', async () => {
    const r = await req(`/blackout-days/${blackoutId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    if (r.status !== 200) throw new Error(`status=${r.status}`);
    return 'delete success';
  });

  await test('School', 'Read', async () => {
    const r = await req('/schools?active=true', { token: adminToken });
    if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`status=${r.status}`);
    return `active=${r.body.length}`;
  });

  await test('School', 'Create', async () => {
    throw new Error('Missing API endpoint for school create');
  });

  await test('School', 'Update', async () => {
    if (!schoolId) throw new Error('missing schoolId');
    const r1 = await req(`/admin/schools/${schoolId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: false },
    });
    const r2 = await req(`/admin/schools/${schoolId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: true },
    });
    if (r1.status !== 200 || r2.status !== 200) throw new Error(`status=${r1.status}/${r2.status}`);
    return 'toggle inactive->active success';
  });

  await test('School', 'Delete', async () => {
    throw new Error('Missing API endpoint for school delete');
  });

  const byEntity = results.reduce((acc, row) => {
    if (!acc[row.entity]) acc[row.entity] = [];
    acc[row.entity].push(row);
    return acc;
  }, {});

  const payload = {
    generatedAt: new Date().toISOString(),
    results,
    byEntity,
    summary: {
      total: results.length,
      passed: results.filter((x) => x.pass).length,
      failed: results.filter((x) => !x.pass).length,
    },
  };

  console.log(JSON.stringify(payload, null, 2));
})();
