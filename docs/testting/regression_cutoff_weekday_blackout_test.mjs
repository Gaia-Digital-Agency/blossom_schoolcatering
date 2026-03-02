const base = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const out = [];

function add(name, pass, detail) {
  out.push({ name, pass, detail });
}

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

function nextWeekday(offset = 7) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function nextSaturday(offset = 7) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

(async () => {
  try {
    const stamp = Date.now().toString().slice(-6);
    const weekdayDate = nextWeekday(14);
    const weekendDate = nextSaturday(14);

    const admin = await req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123', role: 'ADMIN' } });
    if (admin.status < 200 || admin.status >= 300) throw new Error(`admin login failed: ${admin.status}`);
    const at = admin.body.accessToken;

    const schools = await req('/schools?active=true', { token: at });
    const schoolId = (schools.body || [])[0]?.id;
    if (!schoolId) throw new Error('missing active school for regression test');

    const parentUsername = `reg_parent_${stamp}`;
    const parent = await req('/auth/register', {
      method: 'POST',
      body: {
        role: 'PARENT',
        username: parentUsername,
        password: 'Parent#12345',
        firstName: 'Regression',
        lastName: 'Parent',
        phoneNumber: `62888${stamp}01`,
        email: `${parentUsername}@mail.local`,
        address: 'Jl Regression',
        allergies: 'No Allergies',
      },
    });
    if (parent.status < 200 || parent.status >= 300) throw new Error(`parent register failed: ${parent.status}`);
    const pt = parent.body.accessToken;

    const child = await req('/children/register', {
      method: 'POST',
      token: pt,
      body: {
        firstName: 'Regression',
        lastName: `Kid${stamp}`,
        phoneNumber: `62888${stamp}02`,
        email: `regression.kid.${stamp}@mail.local`,
        dateOfBirth: '2015-02-01',
        gender: 'MALE',
        schoolId,
        schoolGrade: 'Grade 3',
        allergies: 'No Allergies',
      },
    });
    if (child.status < 200 || child.status >= 300) throw new Error(`child register failed: ${child.status}`);
    const childId = child.body.childId;

    const menu = await req(`/menus?service_date=${weekdayDate}&session=LUNCH`, { token: pt });
    const menuItemId = (menu.body?.items || [])[0]?.id;
    if (!menuItemId) throw new Error('no menu item found for weekday regression date');

    const cartWeekday = await req('/carts', {
      method: 'POST',
      token: pt,
      body: { childId, serviceDate: weekdayDate, session: 'LUNCH' },
    });
    add('weekday order allowed', cartWeekday.status >= 200 && cartWeekday.status < 300, `status=${cartWeekday.status}`);

    const cartWeekend = await req('/carts', {
      method: 'POST',
      token: pt,
      body: { childId, serviceDate: weekendDate, session: 'LUNCH' },
    });
    const weekendMsg = String(cartWeekend.body?.error?.message || cartWeekend.body?.message || '');
    add('weekend blocked', cartWeekend.status === 400 && weekendMsg.includes('ORDER_WEEKEND_SERVICE_BLOCKED'), `status=${cartWeekend.status} msg=${weekendMsg}`);

    const blackout = await req('/blackout-days', {
      method: 'POST',
      token: at,
      body: { blackoutDate: weekdayDate, type: 'ORDER_BLOCK', reason: 'regression check' },
    });
    const blackoutId = blackout.body?.id;
    add('blackout upsert ok', blackout.status >= 200 && blackout.status < 300 && Boolean(blackoutId), `status=${blackout.status}`);

    const cartBlocked = await req('/carts', {
      method: 'POST',
      token: pt,
      body: { childId, serviceDate: weekdayDate, session: 'LUNCH' },
    });
    const blockedMsg = String(cartBlocked.body?.error?.message || cartBlocked.body?.message || '');
    add('blackout blocks cart', cartBlocked.status === 400 && blockedMsg.includes('ORDER_BLACKOUT_BLOCKED'), `status=${cartBlocked.status} msg=${blockedMsg}`);

    if (blackoutId) {
      await req(`/blackout-days/${blackoutId}`, { method: 'DELETE', token: at });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        total: out.length,
        passed: out.filter((x) => x.pass).length,
        failed: out.filter((x) => !x.pass).length,
      },
      results: out,
    };
    console.log(JSON.stringify(report, null, 2));
    if (report.summary.failed > 0) process.exit(1);
  } catch (err) {
    console.error(JSON.stringify({ fatal: err instanceof Error ? err.message : String(err), results: out }, null, 2));
    process.exit(1);
  }
})();
