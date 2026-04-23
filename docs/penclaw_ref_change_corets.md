# penclaw_ref_change_corets.md — core.service.ts split reference

Record of the 20-step refactor that split `apps/api/src/core/core.service.ts` into a facade over 15 domain sub-services. Purpose: freeze what moved where, which commits did it, and how the public API contract is preserved so every controller consumer can keep calling `coreService.xxx()` unchanged.

---

## 1. Before / after

| | Before | After |
|---|---:|---:|
| Main file | `core.service.ts` 12,051 lines | `core.service.ts` 1,416 lines (−88%) |
| Public methods on CoreService | 132 | 132 (all preserved via delegation) |
| Controller-called methods | 127 | 127 (all still callable on CoreService.prototype) |
| Business logic in facade | all | none — only `healthCheck` + `onModuleInit` |
| Sub-services | 0 | 15 in `apps/api/src/core/services/` |

---

## 2. Sub-service roster (15 files, ~12,700 lines)

| File | Lines | Scope |
|---|---:|---|
| `admin-reports.service.ts` | 946 | Admin read-only dashboards + spending + insights |
| `audit.service.ts` | 132 | `admin_audit_logs` table + write helper + admin log query |
| `billing.service.ts` | 929 | Single-order billing lifecycle, proofs, receipts, consolidated views |
| `delivery.service.ts` | 1,723 | Delivery users, assignments, operator UI, WhatsApp notif, seed flows |
| `gaia.service.ts` | 1,067 | Vertex AI assistant + phone-based lookups (WhatsApp bot) |
| `helpers.service.ts` | 734 | Shared utilities (phone, date, hash, family, cutoff, parse) |
| `kitchen.service.ts` | 281 | Kitchen daily summary + mark-complete |
| `media.service.ts` | 624 | GCS upload, Google auth, PDF, email+attachment, image validation |
| `menu.service.ts` | 1,166 | Menu items, ingredients, ratings, public+admin menu, cache |
| `multi-order.service.ts` | 1,232 | Repeat/series order groups + occurrence billing + receipts |
| `order.service.ts` | 1,452 | Cart + order lifecycle, favourites, quick-reorder, meal plan |
| `schema.service.ts` | 656 | 18 runtime `ensure*Table` / `ensure*Column` migrations + `runAll()` |
| `schools.service.ts` | 334 | Schools CRUD, session-settings gate, blackout rules |
| `site-settings.service.ts` | 152 | `site_settings` key/value store (chef msg, hero, cutoff, flags) |
| `users.service.ts` | 1,251 | Parents/youngsters CRUD, passwords, family linking, registration |

---

## 3. Commit trail (20-step refactor)

| SHA | Step | Note |
|---|---|---|
| `801e186` | pre | feat(web): add top Return link on kitchen and delivery sub-pages |
| `7bc0a9a` | 1 | test(api): snapshot CoreService public surface + fix pre-existing tests |
| `f0a28a3` | 2 | refactor(core): scaffold sub-service facade for core.service split |
| `3ee6b06` | 3 | refactor(core): extract AuditService |
| `bc14a89` | 4 | refactor(core): extract SchemaService |
| `34c7918` | 5 | refactor(core): extract HelpersService |
| `1a85307` | 6 | refactor(core): extract MediaService |
| `be46a94` | 7 | refactor(core): extract SiteSettingsService |
| `6ff4661` | 8 | refactor(core): extract SchoolsService |
| `e59ea57` | 9 | refactor(core): extract KitchenService + `helpers.withEffectiveGrade` + `delivery.autoAssignDeliveriesForDate` seed |
| `8a425d3` | 10 | refactor(core): extract MenuService |
| `231e35d` | 11 | refactor(core): extract AdminReportsService + seed `UsersService.getYoungsterMe` |
| `72bb875` | 12 | refactor(core): extract GaiaService |
| `bb245d0` | 13 | refactor(core): extract BillingService |
| `53b99cd` | 14 | refactor(core): extract UsersService |
| `43c8813` | 15 | refactor(core): extract MultiOrderService |
| `846fd21` | 16 | refactor(core): extract DeliveryService remainder |
| `29c81b8` | 17 | refactor(core): extract OrderService — **FINAL extraction** |
| `160d939` | 18-20 | refactor(core): finalize facade + full regression + unused-import cleanup |
| `1f23085` | docs | docs: add `methods_info.md` listing facade + 15 sub-services |

---

## 4. Public API / openclaw integrity — guarantees

- **Snapshot file:** `apps/api/src/core/core.service.public-surface.json` — 132 method names.
- **Callers manifest:** `apps/api/src/core/core.service.controller-callers.json` — 127 methods mapped back to their calling controller.
- **Regression spec:** `apps/api/src/core/core.service.public-surface.spec.ts` — 4 tests that fail hard if any snapshotted or controller-called method disappears from `CoreService.prototype`.

All 127 methods referenced from `core.controller.ts`, `public.controller.ts`, and `archived.controller.ts` are still callable on the facade. Signatures preserved byte-for-byte.

---

## 5. Architecture

**Pattern:** facade over 15 `@Injectable()` sub-services.

**Controllers (untouched):**
- `apps/api/src/core/core.controller.ts`
- `apps/api/src/core/public.controller.ts`
- `apps/api/src/core/archived.controller.ts`

**Boot order (onModuleInit):**
1. `schema.runAll()` — 18 ensure* migrations in the original sequence
2. `audit.ensureAdminAuditTrailTable()`
3. `helpers.ensureFamilyIdColumns()` — triggers `backfillFamilyIds`

**Sub-service wiring:** direct constructor injection where no cycle exists.

**forwardRef(() => CoreService):** used by `GaiaService`, `MultiOrderService`, `DeliveryService` for paths that still transit the facade (quick-order, cart-submit from seed flows, etc.).

---

## 6. Facade invariants (what `core.service.ts` does NOT touch anymore)

- `runSql` calls: **1** (only `healthCheck`)
- Business logic methods: **0**
- Delegation stubs: **251**

**Remaining imports in the facade:**
- `@nestjs/common` → `Injectable`, `OnModuleInit`, `Optional`
- `auth/db.util` → `runSql` (used by `healthCheck` only)
- `core.types` → `AccessUser`, `CartItemInput`, `SessionType`
- 15 sub-service imports

**Removed imports:**
- `fs/promises` → `readFile`
- `crypto` → `createSign`, `randomUUID`, `scryptSync`
- `auth/password-policy` → `validatePasswordPolicy`
- `shared/grade.util` → `normalizeGradeLabel`, `resolveEffectiveGrade`
- `@nestjs/common` exceptions (moved into sub-services)

---

## 7. Verification matrix

Run at every commit in the 20-step sequence:

| Check | Result |
|---|---|
| `pnpm --filter api build` | clean every commit |
| Jest (6 suites / 33 tests) | green every commit |
| `core.service.public-surface.spec.ts` | 4/4 green |
| `pm2 restart schoolcatering-api` | clean start |
| `GET /api/v1/public/site-settings` | 200 |
| `GET /api/v1/public/menu` | 200 (real dish list w/ GCS URLs) |
| `GET /api/v1/public/lookup-name?phone=…` | 200 |
| 59 web pages via `bash /tmp/check-links.sh` | all 200 / 307 |
| Auth-guarded API | 401 (not 5xx) |

---

## 8. Follow-up items (deferred)

1. **Remove `forwardRef(() => CoreService)` from Gaia / MultiOrder / Delivery.** These were introduced because quick-order / cart-submit / seed flows still call methods that transit the facade. After a cleanup pass that routes those callers directly to the owning sub-service, the forwardRefs can be dropped.

2. **Flatten large multi-line delegation stubs on `CoreService`.** Several stubs inherit long parameter-object signatures from the original methods. They still compile to one delegated call but look large in the facade. A future pass can replace these with rest-args wrappers.

3. **Migrate or drop `archived.controller.ts`.** It is not registered in `CoreModule`. The methods it references remain on `CoreService` only because the public-surface spec still guards them. Decide: re-enable the controller or drop the methods + their sub-service bodies.

---

## 9. Summary

| | |
|---|---|
| Started from | monolithic CoreService with 12,051 lines |
| Ended at | thin facade 1,416 lines over 15 focused sub-services (~12,700 lines total) |
| Public API broken? | **no** |
| Tests broken? | **no** |
| Production endpoints broken? | **no** |
| Total commits | 20 |
| Commit window | `801e186` → `1f23085` |
