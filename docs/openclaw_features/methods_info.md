# Methods Info

Reference for `apps/api/src/core/` — the facade `core.service.ts` plus 15 sub-services it delegates to. Every endpoint in `core.controller.ts`, `public.controller.ts`, and `archived.controller.ts` goes through `CoreService`, which forwards to one of these sub-services.

---

## `apps/api/src/core/core.service.ts`

**Purpose:** Thin facade. Controllers call `coreService.xxx()`; each call is a one-line delegation to the owning sub-service. Holds boot orchestration (`onModuleInit`) and DB liveness (`healthCheck`) only. Every public method listed in `core.service.public-surface.json` must remain callable on this class — guarded by `core.service.public-surface.spec.ts`.

**Methods:**
- `onModuleInit` — runs `schema.runAll()` → `audit.ensureAdminAuditTrailTable()` → `helpers.ensureFamilyIdColumns()` at app start.
- `healthCheck` — `SELECT 1` probe used by the `/api/v1/health` route.
- ~250 delegation stubs forwarding to the 15 sub-services below.

---

## `apps/api/src/core/services/admin-reports.service.ts`

**Purpose:** Read-only cross-domain aggregations for admin views. Composes data from Order, Billing, MultiOrder, Delivery, Menu, Users.

**Methods:**
- `getAdminDashboard`
- `getAdminRevenueDashboard`
- `getAdminPrintReport`
- `getParentSpendingDashboard`
- `getYoungsterSpendingDashboard`
- `getYoungsterInsights`

---

## `apps/api/src/core/services/audit.service.ts`

**Purpose:** Admin audit trail — owns the `admin_audit_logs` table, records every privileged admin action, and serves the admin-visible log query.

**Methods:**
- `ensureAdminAuditTrailTable` — idempotent migration.
- `recordAdminAudit` — write (no-op for non-ADMIN actors).
- `getAdminAuditLogs` — admin-gated read.

---

## `apps/api/src/core/services/billing.service.ts`

**Purpose:** Single-order billing lifecycle: proofs, admin verification, receipts, consolidated views, legacy shapes.

**Methods:**
- Proofs: `uploadBillingProof`, `uploadBillingProofBatch`, `getBillingProofImage`, `revertBillingProof`
- Admin review: `getAdminBilling`, `getAdminBillingLegacy`, `verifyBilling`, `deleteBilling`
- Receipts: `generateReceipt`, `getBillingReceipt`, `getBillingReceiptFile`
- Consolidated views: `getParentConsolidatedBilling`, `getYoungsterConsolidatedBilling`, `getParentConsolidatedBillingLegacy`, `getYoungsterConsolidatedBillingLegacy`

---

## `apps/api/src/core/services/delivery.service.ts`

**Purpose:** Delivery domain — delivery-user lifecycle, school-assignment matrix, per-order auto-assignment, operator UI feed, daily notes, WhatsApp notification logs, summary + email, confirm/toggle, seed flows.

**Methods:**
- Delivery users: `getDeliveryUsers`, `createDeliveryUser`, `updateDeliveryUser`, `deactivateDeliveryUser`, `deleteDeliveryUser`
- School assignments: `getDeliverySchoolAssignments`, `upsertDeliverySchoolAssignment`, `deleteDeliverySchoolAssignment`
- Per-order: `autoAssignDeliveriesForDate`, `autoAssignDeliveries`, `assignDelivery`, `getDeliveryAssignments`
- Daily notes: `getDeliveryDailyNote`, `updateDeliveryDailyNote`
- WhatsApp notifications: `getDailyWhatsappOrderNotifications`, `markDailyWhatsappOrderNotificationSent`, `markDailyWhatsappOrderNotificationFailed`
- Summary + email: `getDeliverySummary`, `sendDeliveryNotificationEmails`
- Confirm / toggle: `confirmDelivery`, `toggleDeliveryCompletion`
- Seed: `pickSeedDeliveryUser`, `applySeedOrderLifecycle`, `seedAdminOrdersSample`

---

## `apps/api/src/core/services/gaia.service.ts`

**Purpose:** AI assistant (Vertex) + phone-based lookups used by the WhatsApp bot. Handles prompt building, usage cap, topic classification, quick-order NL parsing.

**Methods:**
- AI runtime: `getAiRuntimeConfig`, `ensureAiFutureEnabled`, `enforceAiDailyLimit`, `recordAiUsage`, `categorizeAiQuestion`, `isBlockedGaiaQuestion`, `resolveAiFamilyScope`, `buildAiFamilyContext`, `buildGaiaPrompt`, `callVertexGaia`
- Entry points: `quickOrder`, `queryGaia`
- Phone lookups: `lookupNameByPhone`, `resolveFamilyScopeByPhone`, `getDailyOrdersByPhone`, `getAdminFamilyContextByPhone`, `getAdminFamilyOrdersByPhone`

---

## `apps/api/src/core/services/helpers.service.ts`

**Purpose:** Shared utility helpers used by every other sub-service. Pure functions where possible; DB-touching helpers that never mutate state. Includes the family-id migration + backfill (needs domain logic, so lives here instead of SchemaService).

**Methods:**
- Text / crypto: `clipText`, `slugify`, `sanitizeUsernamePart`, `hashPassword`, `buildGeneratedPasswordFromPhone`
- Phone: `normalizePhone`, `phoneCompareKey`, `findActiveUserByEmail`, `findActiveUserByPhone`
- Date / time / session: `nextWeekdayIsoDate`, `makassarTodayIsoDate`, `getMakassarNowContext`, `addDaysIsoDate`, `getIsoWeek`, `validateServiceDate`, `normalizeSession`
- Ordering window: `normalizeOrderingCutoffTime`, `formatOrderingCutoffTimeLabel`, `getOrderingCutoffTime`, `isAfterOrAtMakassarCutoff`, `lockOrdersForServiceDateIfCutoffPassed`, `enforceParentYoungsterOrderingWindow`
- Family / ownership: `getParentIdByUserId`, `getChildIdByUserId`, `getParentFamilyId`, `getChildFamilyId`, `getFamilyIdByUserId`, `ensureParentOwnsChild`, `getParentIdByChildId`, `syncParentChildrenByLastName`, `syncFamilyParentChildren`
- Family ID schema + backfill: `ensureFamilyIdColumns`, `assignFamilyIdToParents`, `assignFamilyIdToChildren`, `backfillFamilyIds`, `mergeFamilyIds`, `alignFamilyIdsForLink`
- Pricing / UUID / family-name: `calculateTotalPrice`, `calculateMaxConsecutiveOrderDays`, `calculateMonthOrderStats`, `resolveBadgeLevel`, `assertValidUuid`, `deriveFamilyName`
- Shared parse utilities: `parseJsonLine`, `parseJsonLines`
- Grade resolution: `withEffectiveGrade`

---

## `apps/api/src/core/services/kitchen.service.ts`

**Purpose:** `/kitchen/daily-summary` and `/kitchen/orders/:id/complete` — the kitchen staff UI backing service.

**Methods:**
- `getKitchenDailySummary`
- `markKitchenOrderComplete`

---

## `apps/api/src/core/services/media.service.ts`

**Purpose:** Google Cloud Storage uploads, Google service-account auth, PDF generation, email with attachment, image/PDF content validation, remote binary fetch.

**Methods:**
- GCS config: `normalizeGcsFolder`, `getGcsBucket`, `getGcsRootFolder`, `getGcsCategoryFolder`, `buildStoragePublicUrl`, `buildGoogleStoragePublicUrl`
- Google auth: `getGoogleServiceAccount`, `getGoogleAccessToken`, `getComputeEngineAccessToken`
- Upload: `uploadToGcs`, `uploadMenuImage`, `uploadSiteHeroImage`
- Image/PDF validation: `parseDataUrl`, `detectImageMimeFromMagicBytes`, `isPdfBinary`, `assertSafeImagePayload`, `getFileExtFromContentType`, `isAllowedProofImageUrl`, `isGoogleStorageHost`
- Remote fetch: `fetchProofImageBinary`, `fetchReceiptPdfBinary`, `resolveMenuImageUrl`
- PDF build: `escapePdfText`, `buildSimplePdf`, `buildTwoColumnDeliveryPdfLines`
- Email: `sendEmailWithPdfAttachment`
- Encoding: `toBase64Url`

---

## `apps/api/src/core/services/menu.service.ts`

**Purpose:** Menu items, ingredients, per-user ratings, public (cached) + admin menu views, seed helper, session-setting toggle (owns `clearPublicMenuCache`).

**Methods:**
- Items: `createAdminMenuItem`, `updateAdminMenuItem`, `deleteMenuItem`, `seedAdminMenuSample`, `getMenus`, `getPublicActiveMenu`, `getAdminMenus`
- Ingredients: `getAdminIngredients`, `createIngredient`, `updateIngredient`, `deleteIngredient`, `ensureTbaIngredientId`
- Ratings: `getAdminMenuRatings`, `createOrUpdateMenuRating`
- Cache: `getPublicMenuCacheKey`, `clearPublicMenuCache` (+ the Map state)
- Session setting: `updateSessionSetting`
- Helpers: `resolveCreateMenuServiceDate`, `ensureMenuForDateSession`, `sanitizePackingRequirement`, `normalizeDishCategory`, `normalizeAllergies`, `normalizeMenuText`

---

## `apps/api/src/core/services/multi-order.service.ts`

**Purpose:** Repeat / series order groups — a parent record with start/end dates + repeat weekdays, expanded into occurrence rows that each create individual orders via the cart flow.

**Methods:**
- Group lifecycle: `getMultiOrders`, `createMultiOrder`, `getMultiOrderDetail`, `updateMultiOrder`, `deleteMultiOrder`, `getAdminMultiOrders`, `trimMultiOrderFuture`, `createMultiOrderReplacement`, `deleteMultiOrderOccurrence`
- Requests: `createMultiOrderRequest`, `resolveMultiOrderRequest`
- Billing: `getMultiOrderBilling`, `uploadMultiOrderBillingProof`, `revertMultiOrderBillingProof`, `getMultiOrderProofImage`, `verifyMultiOrderBilling`, `generateMultiOrderReceipt`, `getMultiOrderReceipt`, `getMultiOrderReceiptFile`
- Internals: `normalizeMultiOrderRepeatDays`, `getMultiOrderParentId`, `getMultiOrderOwnerChildId`, `getMultiOrderMenuSnapshot`, `getMultiOrderSkippedReason`, `collectMultiOrderPlan`, `getMultiOrderGroupOwned`, `getMultiOrderOccurrences`, `canOwnerEditMultiOrder`, `upsertMultiOrderBilling`, `createMultiOrderOrders`, `recalculateMultiOrderGroupStatus`, `deleteOccurrenceOrders`, `isImmutableMultiOrderStatus`

---

## `apps/api/src/core/services/order.service.ts`

**Purpose:** All order-creation + management logic: carts, submitted orders, favourites, quick-reorder, meal-plan wizard, update/delete, admin orders list. Enforces Makassar ordering window, session activation, blackout rules, cutoff lock, dietary-snapshot capture.

**Methods:**
- Cart: `ensureCartIsOpenAndOwned`, `createCart`, `getCarts`, `getCartById`, `replaceCartItems`, `discardCart`, `submitCart`
- Order: `getOrderDetail`, `getParentConsolidatedOrders`, `getYoungsterConsolidatedOrders`, `getAdminOrders`, `updateOrder`, `deleteOrder`
- Favourites: `getFavourites`, `createFavourite`, `deleteFavourite`
- Convenience flows: `quickReorder`, `mealPlanWizard`, `applyFavouriteToCart`
- Helper: `getOrderDietarySnapshot`

---

## `apps/api/src/core/services/schema.service.ts`

**Purpose:** Runtime schema migrations — 18 idempotent `ensure*Table` / `ensure*Column` methods, plus `runAll()` called once at boot.

**Methods:**
- Orchestrator: `runAll`
- Blackouts + schools: `ensureBlackoutDaysSessionColumn`, `ensureSchoolShortNameColumn`
- Passwords + notifications: `ensureAdminVisiblePasswordsTable`, `ensureDeliveryDailyNotesTable`, `ensureOrderNotificationLogsTable`
- Menu: `ensureMenuItemNameUniquenessScope`, `ensureMenuItemExtendedColumns`, `ensureMenuRatingsTable`, `ensureMenuItemTextDefaults`
- Sessions + parents: `ensureSessionSettingsTable`, `ensureParentDietaryRestrictionsTable`, `ensureParent2Columns`
- Children: `ensureChildRegistrationSourceColumns`, `ensureChildCurrentGradeColumn`
- Billing / AI / Delivery / Site / Multi-order: `ensureBillingReviewColumns`, `ensureAiUsageLogsTable`, `ensureDeliverySchoolAssignmentsTable`, `ensureSiteSettingsTable`, `ensureMultiOrderSchema`

---

## `apps/api/src/core/services/schools.service.ts`

**Purpose:** Schools CRUD, session-settings read/gate, blackout-days management (every order-creation path calls `validateOrderDayRules` / `getBlackoutRuleForDate`).

**Methods:**
- Schools: `getSchools`, `createSchool`, `updateSchool`, `deleteSchool`
- Session settings: `getSessionSettings`, `isSessionActive`, `assertSessionActiveForOrdering`
- Blackouts: `getBlackoutDays`, `createBlackoutDay`, `deleteBlackoutDay`, `getBlackoutRuleForDate`, `validateOrderDayRules`

---

## `apps/api/src/core/services/site-settings.service.ts`

**Purpose:** Singleton `site_settings` key/value store (chef message, hero image, cutoff time, assistance message, multiorder/AI feature flags).

**Methods:**
- `getSiteSettings`
- `updateSiteSettings`

---

## `apps/api/src/core/services/users.service.ts`

**Purpose:** Parents + youngsters CRUD, password admin, family linking/merging, youngster registration, record pages.

**Methods:**
- Registration: `registerYoungster`
- Admin lists: `getAdminParents`, `getAdminChildren`
- Record pages + youngster profile: `getYoungsterMe`, `getParentChildrenPages`, `getYoungsterChildrenPages`, `linkParentChild`
- Parent CRUD: `updateParentProfile`, `deleteParent`, `getParentDeleteBlockers`, `softDeleteParent`
- Youngster CRUD: `updateYoungsterProfile`, `deleteYoungster`, `getYoungsterDeleteBlockers`, `softDeleteYoungster`, `hardDeleteYoungsterIfSafe`
- Passwords (admin): `setAdminVisiblePassword`, `getAdminVisiblePasswordRow`, `adminResetUserPassword`, `adminGetUserPassword`, `adminResetYoungsterPassword`, `adminGetYoungsterPassword`
- Family: `mergeFamily`
