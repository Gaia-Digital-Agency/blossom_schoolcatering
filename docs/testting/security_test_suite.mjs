const base = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const out = [];

function add(name, pass, detail) {
  out.push({ name, pass, detail });
}

async function req(path, { method = 'GET', token, body, headers = {} } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

(async () => {
  try {
    const stamp = Date.now().toString().slice(-6);
    const admin = await req('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123', role: 'ADMIN' } });
    if (admin.status < 200 || admin.status >= 300) throw new Error(`admin login failed ${admin.status}`);
    const at = admin.body.accessToken;

    const parentUser = `sec_parent_${stamp}`;
    const parent = await req('/auth/register', {
      method: 'POST',
      body: {
        role: 'PARENT',
        username: parentUser,
        password: 'Parent#12345',
        firstName: 'Sec',
        lastName: 'Parent',
        phoneNumber: `62899${stamp}01`,
        email: `${parentUser}@mail.local`,
        address: 'Jl Security',
        allergies: 'No Allergies',
      },
    });
    if (parent.status < 200 || parent.status >= 300) throw new Error(`parent register failed ${parent.status}`);
    const pt = parent.body.accessToken;

    const csrf = await req('/auth/refresh', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com' },
      body: { refreshToken: 'invalid' },
    });
    add('csrf origin rejection', csrf.status === 403, `status=${csrf.status}`);

    const rbac = await req('/admin/billing', { token: pt });
    add('rbac parent denied admin endpoint', [401, 403].includes(rbac.status), `status=${rbac.status}`);

    const weakPassword = await req('/auth/register', {
      method: 'POST',
      body: {
        role: 'PARENT',
        username: `weak_parent_${stamp}`,
        password: 'parent123',
        firstName: 'Weak',
        lastName: 'Parent',
        phoneNumber: `62899${stamp}02`,
        email: `weak_parent_${stamp}@mail.local`,
        address: 'Jl Weak',
        allergies: 'No Allergies',
      },
    });
    add('weak password rejected', weakPassword.status === 400, `status=${weakPassword.status}`);

    const invalidUpload = await req('/admin/menu-images/upload', {
      method: 'POST',
      token: at,
      headers: { 'content-type': 'application/json' },
      body: { image: 'not-an-image' },
    });
    add('invalid upload rejected', invalidUpload.status >= 400, `status=${invalidUpload.status}`);

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
