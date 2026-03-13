# Button and Action Inventory

Generated from code audit on 2026-03-11  
Scope: `apps/web/app` interactive actions and API impact.

## Legend
- `No API`: client-only behavior.
- `Read-only`: fetch/read operation.
- `Write`: state mutation endpoint.

## Global/Common

| File | Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `app/_components/password-input.tsx` | Show/Hide password | No API | No API | UI visibility toggle only. |
| `app/_components/role-login-form.tsx` | `Sign In` | `POST /api/v1/auth/login` | Write | Role login pages. |
| `app/_components/google-oauth-button.tsx` | Google sign-in | `POST /api/v1/auth/google/verify` | Write | OAuth login. |
| `app/_components/logout-button.tsx` | `Logout` | `POST /api/v1/auth/logout` | Write | Clears session and local state. |

## Public/Auth

| File | Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `app/login/page.tsx` | `Sign In` | `POST /api/v1/auth/login` | Write | Generic login route. |
| `app/register/youngsters/page.tsx` | `Register Youngster` | `GET /auth/register/schools`, `POST /auth/register/youngsters` | Write | Combined youngster+parent flow. |
| `app/rating/page.tsx` | `Submit Review` | `POST /api/v1/ratings` | Write | Dish rating persistence. |

## Parent (`/parents`)

| Action | Endpoint(s) | Type |
|---|---|---|
| `Place Order` | `POST /carts`, `PATCH /carts/:id/items`, `POST /carts/:id/submit` | Write |
| `Refresh Orders` | `GET /parents/me/orders/consolidated` | Read-only |
| `Edit Before Cutoff` / `Quick Reorder` | `POST /carts/quick-reorder` | Write |
| `Delete Before Cutoff` | `DELETE /orders/:orderId` | Write |
| `Refresh Billing` | `GET /billing/parent/consolidated` | Read-only |
| `Upload Proof (Batch)` | `POST /billing/proof-upload-batch` | Write |
| `View Proof Image` | `GET /billing/:billingId/proof-image` | Read-only |
| `Open Receipt` | `GET /billing/:billingId/receipt` | Read-only |
| `Redo (Move to Unpaid)` | `POST /billing/:billingId/revert-proof` | Write |
| `Refresh Spending` | `GET /parents/me/spending-dashboard` | Read-only |

## Youngster (`/youngsters`)

| Action | Endpoint(s) | Type |
|---|---|---|
| `Place Order` | `POST /carts`, `PATCH /carts/:id/items`, `POST /carts/:id/submit` | Write |
| Insights load/reload | `GET /youngsters/me/insights` | Read-only |
| Orders load/reload | `GET /youngsters/me/orders/consolidated` | Read-only |

## Delivery (`/delivery`)

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Yesterday` / `Today` / `Tomorrow` | Client date selection; uses loaded rows | No API | Works with current loaded dataset. |
| `Refresh` | `GET /delivery/assignments?date=yesterday|today|tomorrow` | Read-only | Reloads 3-day window and merges rows. |
| `Show Service Date` | `GET /delivery/assignments?date=...` | Read-only | Explicit arbitrary-date fetch. |
| `Download PDF` | `GET /delivery/assignments?date=...` | Read-only | Fetches selected-date assignments then opens browser print-to-PDF in 2-column layout. |
| `Mark Complete` / Undo | `PATCH /delivery/assignments/:assignmentId/toggle` | Write | Optional confirmation note included. |

## Kitchen (`/kitchen*`)

| Action | Endpoint(s) | Type |
|---|---|---|
| `Service Date` picker | `GET /kitchen/daily-summary?date=...` | Read-only |
| `Refresh` | `GET /kitchen/daily-summary?date=...` | Read-only |
| `Download PDF` | No API | No API |
| `Mark Kitchen Complete` / revert | `POST /kitchen/orders/:orderId/complete` | Write |

## Admin Dashboard/Reports

| Action | Endpoint(s) | Type |
|---|---|---|
| Dashboard load/refresh | `GET /admin/dashboard?date=...` | Read-only |
| Reports load/refresh | `GET /admin/revenue?...` | Read-only |

## Admin Billing

| Action | Endpoint(s) | Type |
|---|---|---|
| `View Proof` | `GET /admin/billing/:billingId/proof-image` | Read-only |
| `Verify` / `Reject` | `POST /admin/billing/:billingId/verify` | Write |
| `Generate/Regenerate Receipt` | `POST /admin/billing/:billingId/receipt` | Write |

## Admin Schools/Session

| Action | Endpoint(s) | Type |
|---|---|---|
| `Create School` | `POST /admin/schools` | Write |
| School `Activate/Deactivate` | `PATCH /admin/schools/:schoolId` | Write |
| `Delete School` | `DELETE /admin/schools/:schoolId` | Write |
| Session `Activate/Deactivate` | `PATCH /admin/session-settings/:session` | Write |

## Admin Parents/Youngsters

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| Parent `Show Password` | `PATCH /admin/users/:userId/reset-password` | Write | Resets parent password and shows new value. |
| Parent `Delete` | `DELETE /admin/parents/:parentId` | Write | Blocked if linked youngster exists. |
| `Create Youngster` | `POST /children/register` | Write | Admin create youngster profile. |
| `Update Youngster` | `PATCH /admin/youngsters/:youngsterId` | Write | Admin edit youngster profile. |
| `Delete Youngster` | `DELETE /admin/youngsters/:youngsterId` | Write | Admin delete youngster. |
| Youngster `Show Password` | `PATCH /admin/youngsters/:youngsterId/reset-password` | Write | Youngster-scoped reset endpoint. |

## Admin Delivery Management

| Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Create Delivery User` | `POST /admin/delivery/users` | Write | Delivery account create. |
| Delivery user `Edit`/`Save` | `PATCH /admin/delivery/users/:userId` | Write | Profile update. |
| Delivery user `Show Password` | `PATCH /admin/users/:userId/reset-password` | Write | Resets delivery password and shows new value. |
| Delivery user `Activate/Deactivate` | `PATCH /admin/delivery/users/:userId` | Write | Active-state toggle. |
| Delivery user `Delete` | `DELETE /admin/delivery/users/:userId` | Write | Prevented with active assignments. |
| `Save Assignment` | `POST /delivery/school-assignments` | Write | Upsert school mapping. |
| Mapping `Activate/Deactivate` | `POST /delivery/school-assignments` | Write | Mapping state update. |
| Mapping `Delete` | `DELETE /delivery/school-assignments/:deliveryUserId/:schoolId` | Write | Remove mapping row. |
| `Auto Assign by School` | `POST /delivery/auto-assign` | Write | Assigns OUT_FOR_DELIVERY orders by school mapping. |
| `Show Service Date` | `GET /delivery/assignments?date=...` | Read-only | Loads assigned orders for selected date. |
| `Download Summary` | `GET /delivery/summary?date=...` | Read-only | Generates client-side text export. |
| `SEND NOTIFICATION EMAIL` | `POST /admin/delivery/send-notification-email` | Write | Sends today-assigned delivery PDF via email for active delivery users. |

## Admin Kitchen

| Action | Endpoint(s) | Type |
|---|---|---|
| `Refresh` | `GET /kitchen/daily-summary?date=...` | Read-only |

## Admin Menu

| Action | Endpoint(s) | Type |
|---|---|---|
| Context load | `GET /admin/menus`, `GET /admin/ingredients` | Read-only |
| `Seed Sample Menus` | `POST /admin/menus/sample-seed` | Write |
| Dish create/update | `POST /admin/menu-items`, `PATCH /admin/menu-items/:itemId` | Write |
| Dish delete | `DELETE /admin/menu-items/:itemId` | Write |
| Dish availability toggle | `PATCH /admin/menu-items/:itemId` | Write |
| Ingredient quick create | `POST /admin/ingredients` | Write |
| Image upload | `POST /admin/menu-images/upload` | Write |
