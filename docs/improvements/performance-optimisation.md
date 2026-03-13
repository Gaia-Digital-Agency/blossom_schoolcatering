# Blossom School Catering — Performance Optimisation Plan

Audited: 2026-03-01
Stack: NestJS 11 API · Next.js 14 Web · PostgreSQL · Nginx · PM2 on GCP VM

Items are ordered by **effort** (least → most). Each entry states the problem, impact, and exact steps to fix it.

---

## Tier 1 — 5–15 min each · Server config only · Zero code deploy

---

### 1. Enable Nginx gzip compression level 6

**Impact:** Medium — reduces JSON and JS bundle sizes by 40–60% vs the current default level 1
**File:** `/etc/nginx/nginx.conf` on server

**Problem:**
`gzip_comp_level 6;` is commented out. Nginx defaults to level 1 (minimal compression).

**Fix:**
```nginx
# /etc/nginx/nginx.conf — uncomment this line:
gzip_comp_level 6;
```
Then:
```bash
nginx -t && systemctl reload nginx
```

---

### 2. Nginx upstream keepalive to NestJS

**Impact:** Medium — eliminates new TCP handshake overhead on every API request
**File:** Nginx schoolcatering vhost config on server

**Problem:**
`proxy_pass http://127.0.0.1:3006` creates a brand-new TCP connection to NestJS for every single request. No connection reuse.

**Fix:**
```nginx
# Add above the server{} block:
upstream schoolcatering_api {
    server 127.0.0.1:3006;
    keepalive 32;
}

upstream schoolcatering_web {
    server 127.0.0.1:4173;
    keepalive 16;
}

# Inside the API location block, replace proxy_pass and add Connection header:
location ^~ /schoolcatering/api/v1/ {
    proxy_pass http://schoolcatering_api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";   # required for keepalive
    # ... rest of existing directives unchanged
}

# Inside the web location block:
location /schoolcatering/ {
    proxy_pass http://schoolcatering_web;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    # ... rest unchanged
}
```
Then: `nginx -t && systemctl reload nginx`

---

### 3. Nginx proxy buffer sizes for large API responses

**Impact:** Low–Medium — prevents Nginx spilling large responses (kitchen summary, parent orders) to disk
**File:** Nginx schoolcatering vhost config on server

**Problem:**
No `proxy_buffer_size` or `proxy_buffers` set. Nginx defaults to 4 KB buffer × 8, which overflows for responses like consolidated orders (~100 KB) and causes disk I/O.

**Fix:**
```nginx
# Inside the API location block:
proxy_buffer_size       16k;
proxy_buffers           4 16k;
proxy_busy_buffers_size 32k;
```
Then: `nginx -t && systemctl reload nginx`

---

### 4. Nginx explicit static asset cache headers

**Impact:** Low–Medium — ensures browsers aggressively cache hashed JS/CSS chunks
**File:** Nginx schoolcatering vhost config on server

**Problem:**
No explicit `Cache-Control` for `/_next/static/`. Next.js sets `max-age=31536000, immutable` itself but Nginx should enforce it at the edge.

**Fix:**
```nginx
# Add a dedicated location block for Next.js static assets:
location ^~ /schoolcatering/_next/static/ {
    proxy_pass http://schoolcatering_web;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```
Then: `nginx -t && systemctl reload nginx`

---

## Tier 2 — 20 min · One SQL migration file · Zero application code change

---

### 5. Add missing DB indexes (4 indexes, one migration)

**Impact:** High — fixes several slow query paths used on every page load
**File:** Create `docs/db/002_perf_indexes.sql`, run once on server

**Problem — 5a. `menus(service_date, is_published)`:**
Public menu query always filters by `service_date` but the only index is `UNIQUE(session, service_date)` with `session` as the leading column — so a `service_date`-only filter can't use it efficiently. Every `/public/menu` call does a suboptimal scan.

**Problem — 5b. `orders(service_date, status) WHERE deleted_at IS NULL`:**
Nearly every orders query filters `deleted_at IS NULL` and/or `status`. No partial index exists for this — every query does a heap-filter pass after the index scan on `(child_id, service_date)`.

**Problem — 5c. `parent_children(child_id)`:**
The unique index is on `(parent_id, child_id)`. Lookups by `child_id` alone (used in `submitCart`, `ensureParentOwnsChild`) cannot use this index because `child_id` is not the leading column.

**Problem — 5d. `billing_records(status)` partial:**
Admin billing dashboard and pending-count query both filter by `status IN ('UNPAID', 'PENDING_VERIFICATION')`. No index on `status` — full table scan as the table grows.

**Fix — create `docs/db/002_perf_indexes.sql`:**
```sql
-- 5a: public menu query — filter by service_date efficiently
CREATE INDEX IF NOT EXISTS menus_service_date_published_idx
  ON menus (service_date, is_published)
  WHERE deleted_at IS NULL;

-- 5b: active orders queries — avoid heap-filter on deleted_at / status
CREATE INDEX IF NOT EXISTS orders_active_date_status_idx
  ON orders (service_date, status)
  WHERE deleted_at IS NULL;

-- 5c: child_id lookups in parent_children without knowing parent_id
CREATE INDEX IF NOT EXISTS parent_children_child_id_idx
  ON parent_children (child_id);

-- 5d: billing status filter — unpaid / pending verification lookups
CREATE INDEX IF NOT EXISTS billing_records_status_idx
  ON billing_records (status)
  WHERE status IN ('UNPAID', 'PENDING_VERIFICATION');
```

**Run on server:**
```bash
ssh -i ~/.ssh/google_compute_engine rogerwoolie@34.124.244.233 \
  "sudo -u postgres psql -d schoolcatering_db \
   -f /var/www/schoolcatering/docs/db/002_perf_indexes.sql"
```

---

## Tier 3 — 30 min · API code change · Single deploy

---

### 6. Move `ensure*Column()` calls to `OnModuleInit` (eliminate DDL on live traffic)

**Impact:** High — removes up to 12 `ALTER TABLE` DDL statements from the first API request after every PM2 restart. `ALTER TABLE` holds an exclusive lock on the table, which can block all readers during morning peak.
**File:** `apps/api/src/core/core.service.ts`

**Problem:**
`ensureMenuItemExtendedColumns()`, `ensureSessionSettingsTable()`, `ensureMenuRatingsTable()`, and `ensureChildRegistrationSourceColumns()` each run `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guarded by an in-memory flag. The flag resets on every restart, so the first live request after a deploy fires all DDL while users are waiting.

**Fix:**
Implement `OnModuleInit` in `CoreService` and call all `ensure*` methods there — they run once at startup before any traffic, not during a request:

```typescript
// core.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class CoreService implements OnModuleInit {

  async onModuleInit() {
    await this.ensureMenuItemExtendedColumns();
    await this.ensureSessionSettingsTable();
    await this.ensureMenuRatingsTable();
    await this.ensureChildRegistrationSourceColumns();
  }

  // Remove the guard-flag checks from each ensure* method header —
  // onModuleInit guarantees they only run once at startup.
}
```

---

### 7. Cache `/public/menu` response in-memory (60-second TTL)

**Impact:** High — the highest-traffic endpoint currently hits PostgreSQL on every single browser page view. A 60-second cache cuts DB load by ~99% during peak morning browsing.
**File:** `apps/api/src/core/core.service.ts`

**Problem:**
`getPublicActiveMenu()` has no caching at any layer — not in NestJS, not in Nginx, and the frontend uses `cache: 'no-store'`. Every parent/youngster opening the menu page sends a fresh DB query.

**Fix:**
```typescript
// core.service.ts — add near the top of the class:
private _publicMenuCache = new Map<string, { data: unknown; expiresAt: number }>();

async getPublicActiveMenu(serviceDate?: string, session?: string) {
  const cacheKey = `${serviceDate ?? ''}|${session ?? ''}`;
  const cached = this._publicMenuCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // ... existing query logic unchanged ...
  const result = /* existing return value */;

  this._publicMenuCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + 60_000, // 60 seconds
  });
  return result;
}
```

---

### 8. Fix `cache: 'no-store'` on public menu fetch

**Impact:** Medium — pairs with item 7; allows browsers and CDN to also cache
**File:** `apps/web/app/menu/page.tsx`

**Problem:**
The frontend fetches `/public/menu` with `cache: 'no-store'`, bypassing any HTTP caching at browser or Nginx level.

**Fix:**
```typescript
// apps/web/app/menu/page.tsx — change the fetch options:
const res = await fetchWithTimeout(`${getApiBase()}/public/menu`, {
  credentials: 'include',
  cache: 'no-cache',          // was 'no-store' — now allows ETag revalidation
  next: { revalidate: 60 },   // if converted to a server component later
});
```

---

## Tier 4 — 1–2 hrs · API code changes · Single deploy

---

### 9. Parallelise Admin Dashboard queries with `Promise.all`

**Impact:** High — Admin Dashboard currently runs ~24 sequential `await` queries. Wall-clock time = 24 × round-trip latency. `Promise.all` collapses this to ~1 × the slowest query.
**File:** `apps/api/src/core/core.service.ts` → `getAdminDashboard()`

**Problem:**
All date calculations, count queries, delivery metrics, kitchen metrics, billing metrics, and birthday queries are executed serially with `await`. None depend on each other's results (except the counts needing the date values).

**Fix pattern:**
```typescript
// Step 1: compute dates in JS (no DB round-trips needed):
const now = new Date();
const today     = now.toISOString().slice(0, 10);
const yesterday = new Date(now.setDate(now.getDate() - 1)).toISOString().slice(0, 10);
const tomorrow  = new Date(now.setDate(now.getDate() + 2)).toISOString().slice(0, 10);
// etc.

// Step 2: run all independent queries in parallel:
const [
  parentsCount,
  youngstersCount,
  todayDelivery,
  yesterdayDelivery,
  tomorrowDelivery,
  kitchenYesterday,
  billingPastWeek,
  pendingBilling,
  upcomingBlackouts,
  birthdaysToday,
  // ... all others
] = await Promise.all([
  runSql(`SELECT COUNT(*) FROM users WHERE role = 'PARENT' ...`),
  runSql(`SELECT COUNT(*) FROM children WHERE ...`),
  runSql(`SELECT ... FROM orders WHERE service_date = $1 ...`, [today]),
  // ... etc
]);
```

Also fix the birthday query — add a SQL `WHERE` filter instead of fetching all children:
```sql
-- Instead of fetching all children and filtering in JS:
WHERE EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND EXTRACT(DAY   FROM date_of_birth) = EXTRACT(DAY   FROM CURRENT_DATE)
```

---

### 10. Eliminate 7 DB round-trips for date arithmetic in Youngster Insights

**Impact:** High — 7 sequential `SELECT ($1::date + ($2 || ' day')::interval)` queries are pure date math that belongs in JavaScript
**File:** `apps/api/src/core/core.service.ts` → `getYoungsterInsights()`

**Problem:**
A loop runs 7 DB queries just to compute 7 consecutive dates starting from `weekStart`. Also, `to_char(service_date, 'YYYY-MM')` in the WHERE clause wraps the indexed column in a function, preventing index use.

**Fix:**
```typescript
// Compute dates in JS — no DB queries:
const weekDates: string[] = [];
const base = new Date(weekStart);
for (let i = 0; i < 7; i++) {
  const d = new Date(base);
  d.setDate(d.getDate() + i);
  weekDates.push(d.toISOString().slice(0, 10));
}
// weekDates = ['2026-03-02', '2026-03-03', ..., '2026-03-08']

// Fix the WHERE clause to use the index:
// BEFORE (breaks index):
//   to_char(service_date, 'YYYY-MM') IN ($2, $3)
// AFTER (index-friendly):
//   service_date BETWEEN $2::date AND $3::date
// Pass monthStart and monthEnd as actual date boundaries.
```

---

### 11. Parallelise Revenue Dashboard queries

**Impact:** Medium — 7 sequential queries, 4 of which are completely independent lookups
**File:** `apps/api/src/core/core.service.ts` → `getAdminRevenueDashboard()`

**Fix:**
```typescript
const [totalsOut, bySchoolOut, bySessionOut,
       filterSchoolsOut, filterDeliveryOut, filterParentsOut, filterDishesOut] =
  await Promise.all([
    runSql(/* totals query */),
    runSql(/* by-school query */),
    runSql(/* by-session query */),
    runSql(/* school lookup */),
    runSql(/* delivery lookup */),
    runSql(/* parents lookup */),
    runSql(/* dishes lookup */),
  ]);
```

---

### 12. Replace correlated subquery in Kitchen Daily Summary

**Impact:** Medium — correlated subquery executes once per order row; with 200 orders that's 200 sub-lookups
**File:** `apps/api/src/core/core.service.ts` → `getKitchenDailySummary()`

**Problem:**
```sql
-- BEFORE: correlated subquery — runs once per order row
COALESCE((
  SELECT SUM(oi2.quantity)::int
  FROM order_items oi2
  WHERE oi2.order_id = o.id
), 0) AS dish_count
```

**Fix:**
```sql
-- AFTER: one aggregation pass joined in
LEFT JOIN (
  SELECT order_id, SUM(quantity)::int AS dish_count
  FROM order_items
  GROUP BY order_id
) AS item_counts ON item_counts.order_id = o.id
-- Then reference item_counts.dish_count in SELECT
```

---

### 13. Add refresh token deduplication in `auth.ts`

**Impact:** Medium — if 3 API calls fire simultaneously and all get 401, currently 3 separate refresh requests are sent. Deduplication fires only 1.
**File:** `apps/web/lib/auth.ts`

**Problem:**
No singleton promise for in-flight refresh. Each `apiFetch` that gets a 401 independently calls `refreshAccessToken()`, causing a burst of refresh requests.

**Fix:**
```typescript
// apps/web/lib/auth.ts — add module-level singleton:
let _refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;          // reuse in-flight refresh
  _refreshPromise = _doRefresh().finally(() => {
    _refreshPromise = null;                              // reset after settle
  });
  return _refreshPromise;
}

async function _doRefresh(): Promise<string | null> {
  // ... existing refresh logic moved here unchanged ...
}
```

---

## Tier 5 — 1–2 hrs · Highest-payoff fix · Single deploy

---

### 14. Fix N+1 query in Parent / Youngster order history

**Impact:** Very High — a parent with 200 historical orders triggers 201 sequential DB queries (1 list + 1 per order for items). At 1 ms each = 200 ms of pure DB wait before any data reaches the browser.
**Files:** `apps/api/src/core/core.service.ts` → `getParentConsolidatedOrders()` and `getYoungsterConsolidatedOrders()`

**Problem:**
```typescript
// BEFORE — N+1 loop:
const orders = /* fetch order list — 1 query */;
for (const order of orders) {
  const itemsOut = await runSql(          // 1 query PER order
    `SELECT ... FROM order_items WHERE order_id = $1`,
    [order.id],
  );
  order.items = parseJsonLines(itemsOut);
}
```

**Fix:**
```typescript
// AFTER — 2 queries total, regardless of order count:

// Query 1: fetch the order list (unchanged)
const orders = /* existing orders query */;
if (!orders.length) return { orders: [] };

// Query 2: fetch ALL order items for ALL orders in one shot
const orderIds = orders.map((o) => o.id);
const allItemsOut = await runSql(
  `SELECT
     oi.order_id,
     oi.id,
     mi.name,
     mi.price,
     mi.image_url,
     mi.dish_category,
     oi.quantity,
     oi.item_name_snapshot,
     oi.price_snapshot
   FROM order_items oi
   JOIN menu_items mi ON mi.id = oi.menu_item_id
   WHERE oi.order_id = ANY($1::uuid[])
   ORDER BY oi.order_id, mi.name`,
  [orderIds],
);
const allItems = parseJsonLines<OrderItem>(allItemsOut);

// Group items by order_id in JS — O(n) single pass:
const itemsByOrder = new Map<string, OrderItem[]>();
for (const item of allItems) {
  const list = itemsByOrder.get(item.order_id) ?? [];
  list.push(item);
  itemsByOrder.set(item.order_id, list);
}

// Attach items to their orders:
for (const order of orders) {
  order.items = itemsByOrder.get(order.id) ?? [];
}
```

---

### 15. Wrap `submitCart` in a single DB transaction with batched inserts

**Impact:** Medium — prevents partial-commit state if any step fails; reduces 5+ sequential INSERT round-trips to 1
**File:** `apps/api/src/core/core.service.ts` → `submitCart()`

**Problem:**
Up to 10 sequential writes (order → 5× order_items → billing_record → mutation log → cart update) without a transaction. A crash between steps leaves orphaned rows.

**Fix — use a single transaction:**
```typescript
await runSql('BEGIN');
try {
  // Insert order
  const orderId = await runSql(`INSERT INTO orders ... RETURNING id`);

  // Batch insert all order_items in ONE statement using UNNEST:
  await runSql(
    `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, price_snapshot, quantity)
     SELECT $1, UNNEST($2::uuid[]), UNNEST($3::text[]), UNNEST($4::numeric[]), UNNEST($5::int[])`,
    [orderId, itemIds, itemNames, itemPrices, itemQuantities],
  );

  // Insert billing_record, mutation log, update cart — all in same transaction
  await runSql(`INSERT INTO billing_records ...`);
  await runSql(`INSERT INTO order_mutations ...`);
  await runSql(`UPDATE order_carts SET status = 'SUBMITTED' WHERE id = $1`, [cartId]);

  await runSql('COMMIT');
} catch (err) {
  await runSql('ROLLBACK');
  throw err;
}
```

---

## Summary Table (sorted by effort)

| # | Item | Effort | Impact | Area |
|---|------|--------|--------|------|
| 1 | Enable gzip level 6 | 5 min | Medium | Nginx |
| 2 | Upstream keepalive to NestJS | 10 min | Medium | Nginx |
| 3 | Proxy buffer sizes | 5 min | Low–Med | Nginx |
| 4 | Static asset cache headers | 5 min | Low–Med | Nginx |
| 5 | Add 4 missing DB indexes | 20 min | **High** | DB |
| 6 | Move `ensure*` to `OnModuleInit` | 30 min | **High** | API |
| 7 | Cache `/public/menu` 60 s in-memory | 30 min | **High** | API |
| 8 | Fix `cache: 'no-store'` on menu fetch | 5 min | Medium | Web |
| 9 | Parallelise Admin Dashboard (Promise.all) | 1 hr | **High** | API |
| 10 | Eliminate 7 DB round-trips in Insights | 45 min | **High** | API |
| 11 | Parallelise Revenue Dashboard | 30 min | Medium | API |
| 12 | Remove correlated subquery in Kitchen summary | 30 min | Medium | API |
| 13 | Refresh token deduplication | 45 min | Medium | Web |
| 14 | Fix N+1 in order history (parent/youngster) | 1–2 hrs | **Very High** | API |
| 15 | Wrap submitCart in transaction + batch insert | 1 hr | Medium | API |

**Total estimated effort:** ~9–10 hours
**Highest ROI if time is limited:** Items 5 (DB indexes), 6 (OnModuleInit), 7 (menu cache), 14 (N+1 fix)
