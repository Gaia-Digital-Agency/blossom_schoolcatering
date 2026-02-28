# Button and Action Inventory (Latest)

Generated from code audit on 2026-02-28.
Scope: `apps/web/app` interactive actions and their backend impact.

## Legend
- `No API`: client-only interaction.
- `Read-only`: GET/read operation, no state mutation expected.
- `Write`: endpoint mutates runtime data.

## Global/Common

| File | Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `app/_components/password-input.tsx` | Show/Hide password | No API | No API | UI-only visibility toggle. |
| `app/_components/role-login-form.tsx` | `Sign In` | `POST /api/v1/auth/login` | Write | Role-specific login pages. |
| `app/_components/google-oauth-button.tsx` | Google sign-in | `POST /api/v1/auth/google/verify` | Write | Parent/youngster Google login. |
| `app/_components/dev-page.tsx` | `Update Password` | `POST /api/v1/auth/change-password` | Write | Authenticated password update. |
| `app/_components/logout-button.tsx` | `Logout` | `POST /api/v1/auth/logout` | Write | Clears session + local auth state. |

## Public/Auth

| File | Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `app/page.tsx` | Menu toggle / Back to top | No API | No API | UI behavior only. |
| `app/login/page.tsx` | `Sign In` | `POST /api/v1/auth/login` | Write | Generic login path. |
| `app/register/_components/register-form.tsx` | `Create Account` | `POST /api/v1/auth/register` | Write | Role account registration component. |
| `app/register/youngsters/page.tsx` | `Register Youngster` | `GET /auth/register/schools`, `POST /auth/register/youngsters` | Write | Combined youngster+parent flow with registrant type logic. |
| `app/rating/page.tsx` | `Submit Review` | `POST /api/v1/ratings` | Write | Persists menu ratings. |

## Parent (`/parents`)

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| Add/Remove draft item | No API | No API | Local cart composition before submit. |
| `Place Order` | `POST /carts`, `PATCH /carts/:id/items`, `POST /carts/:id/submit` | Write | Creates order + billing record flow. |
| `Refresh Orders` | `GET /parents/me/orders/consolidated` | Read-only | Reloads consolidated orders. |
| `Edit Before Cutoff` | `POST /carts/quick-reorder` | Write | Reopens order to editable draft. |
| `Delete Before Cutoff` | `DELETE /orders/:orderId` | Write | Deletes order when still editable. |
| `Quick Reorder` | `POST /carts/quick-reorder` | Write | Clones order to target date draft. |
| `Refresh Billing` | `GET /billing/parent/consolidated` | Read-only | Reload billing rows. |
| `Upload Proof For Selected Unpaid Bills` | `POST /billing/proof-upload-batch` | Write | Batch proof upload. |
| `Open Receipt` | `GET /billing/:billingId/receipt` | Read-only | Opens generated receipt URL. |
| `Refresh Spending` | `GET /parents/me/spending-dashboard` | Read-only | Reload spending metrics. |

## Youngster (`/youngsters`)

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| Add/Remove draft item | No API | No API | Local cart composition before submit. |
| `Place Order` | `POST /carts`, `PATCH /carts/:id/items`, `POST /carts/:id/submit` | Write | Creates youngster order flow. |
| Insights reload (page load / post-submit) | `GET /youngsters/me/insights` | Read-only | Badge and nutrition panel. |
| Orders reload | `GET /youngsters/me/orders/consolidated` | Read-only | Confirmed order views. |

## Delivery (`/delivery`)

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Past` / `Today` / `Future` | `GET /delivery/assignments?date=...` | Read-only | Date-window assignment query. |
| `Refresh Assignments` | `GET /delivery/assignments?date=...` | Read-only | Reload list. |
| `Mark Complete` / Undo | `PATCH /delivery/assignments/:assignmentId/toggle` | Write | Toggles completion state with optional note. |

## Kitchen (`/kitchen*`)

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Refresh Now` | `GET /kitchen/daily-summary?date=...` | Read-only | Reloads kitchen dashboard. |
| `Mark Kitchen Complete` | `POST /kitchen/orders/:orderId/complete` | Write | Marks kitchen stage complete. |

## Admin

### Dashboard and Reports

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| Dashboard `Refresh` | `GET /admin/dashboard?date=...` | Read-only | KPI refresh. |
| Reports `Refresh` | `GET /admin/revenue?...` | Read-only | Revenue filters and metrics. |

### Billing

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Verify` / `Reject` | `POST /admin/billing/:billingId/verify` | Write | Billing proof decision. |
| `Generate Receipt` / `Regenerate Receipt` | `POST /admin/billing/:billingId/receipt` | Write | Receipt number/PDF generation flow. |

### Schools and Sessions

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Create School` | `POST /admin/schools` | Write | Creates school. |
| `Activate` / `Deactivate` School | `PATCH /admin/schools/:schoolId` | Write | School status toggle. |
| `Delete` School | `DELETE /admin/schools/:schoolId` | Write | Deletes school. |
| Session `Activate` / `Deactivate` | `PATCH /admin/session-settings/:session` | Write | Lunch enforced ON server-side. |

### Parents and Youngsters

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| Parent `Reset Password` | `PATCH /admin/users/:userId/reset-password` | Write | Admin password reset action. |
| `Create Youngster` | `POST /children/register` | Write | Admin create youngster profile. |
| `Update Youngster` | `PATCH /admin/youngsters/:youngsterId` | Write | Admin edit youngster profile. |
| `Delete Youngster` | `DELETE /admin/youngsters/:youngsterId` | Write | Admin delete youngster. |
| Youngster `Reset Password` | `PATCH /admin/users/:userId/reset-password` | Write | Admin reset youngster account password. |

### Delivery Management

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Create Delivery User` | `POST /admin/delivery/users` | Write | Creates delivery account. |
| User `Edit`/`Save` | `PATCH /admin/delivery/users/:userId` | Write | Update delivery user profile. |
| User `Activate`/`Deactivate` | `PATCH /admin/delivery/users/:userId` | Write | Active-state toggle from UI. |
| `Save Assignment` | `POST /delivery/school-assignments` | Write | Upsert school mapping. |
| Mapping `Activate`/`Deactivate` | `POST /delivery/school-assignments` | Write | Mapping state toggle. |
| `Auto Assign by School` | `POST /delivery/auto-assign` | Write | Auto-create assignments from mappings. |
| `Refresh` | `GET /delivery/assignments?date=...` (+ support reads) | Read-only | Refresh admin delivery overview. |

### Menu Management

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Load Menu Context` | `GET /admin/menus`, `GET /admin/ingredients` | Read-only | Context load for date/session. |
| `Seed Sample Menus` | `POST /admin/menus/sample-seed` | Write | Seeds menu rows. |
| `Create Dish` / `Update Dish` | `POST /admin/menu-items`, `PATCH /admin/menu-items/:itemId` | Write | Menu item upsert flow. |
| `Delete Dish` | `DELETE /admin/menu-items/:itemId` | Write | Removes menu item. |
| `Activate` / `Deactivate` Dish | `PATCH /admin/menu-items/:itemId` | Write | Availability toggle. |
| Ingredient quick-create (conditional) | `POST /admin/ingredients` | Write | Missing ingredient creation path. |
| Image upload | `POST /admin/menu-images/upload` | Write | Upload menu image object. |
