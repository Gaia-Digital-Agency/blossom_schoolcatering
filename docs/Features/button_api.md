# Button API Map

Last synced: 2026-03-14  
Scope: button-triggered and direct interactive actions in `apps/web/app`.

Route and link documentation is separated into [links_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/links_api.md).

## Legend
- `No API`: client-only behavior.
- `Read`: read-only API call.
- `Write`: state mutation API call.

## Global/Common

| File | Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `app/_components/password-input.tsx` | Show/Hide password | No API | No API | UI-only visibility toggle |
| `app/_components/role-login-form.tsx` | `Sign In` | `POST /api/v1/auth/login` | Write | Multi-role login |
| `app/_components/google-oauth-button.tsx` | Google sign-in | `POST /api/v1/auth/google/verify` | Write | OAuth login |
| `app/_components/logout-button.tsx` | `Logout` | `POST /api/v1/auth/logout` | Write | Clears session and local state |

## Public/Auth

| File | Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `app/register/youngsters/page.tsx` | `Register` | `GET /auth/register/schools`, `POST /auth/register/youngster` | Write | Unified public registration form |
| `app/register/youngsters/page.tsx` | `Have You Saved Information?` | No API | No API | Success-card flow |
| `app/register/youngsters/page.tsx` | `Back To Homepage` | `POST /api/v1/auth/logout` | Write | Clears any session before returning home |
| `app/rating/page.tsx` | `Submit Review` | `POST /api/v1/ratings` | Write | Dish rating persistence |

## Parent

| Area | Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `/parent/orders` | `Place Order` | `POST /carts`, `PATCH /carts/:cartId/items`, `POST /carts/:cartId/submit` | Write | Parent order flow |
| `/parent/orders` | `Quick Reorder` | `POST /carts/quick-reorder` | Write | Rebuilds cart from previous order |
| `/parent/orders` | `Delete` | `DELETE /orders/:orderId` | Write | Before cutoff |
| `/parent/billing` | `Refresh Billing` | `GET /billing/parent/consolidated` | Read | Billing reload |
| `/parent/billing` | `Upload Proof For Selected Unpaid Bills` | `POST /billing/proof-upload-batch` | Write | Batch proof upload |
| `/parent/billing` | `View Proof Image` | `GET /billing/:billingId/proof-image` | Read | Authenticated proof fetch |
| `/parent/billing` | `Open Receipt` | `GET /billing/:billingId/receipt` | Read | Receipt metadata fetch |
| `/parent/billing` | `Redo (Move to Unpaid)` | `POST /billing/:billingId/revert-proof` | Write | Removes proof and resets to unpaid |
| `/parent/billing` | `Refresh Spending` | `GET /parent/me/spending-dashboard` | Read | Spending dashboard reload |

## Youngster

| Area | Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `/youngster` | `Place Order` | `POST /carts`, `PATCH /carts/:cartId/items`, `POST /carts/:cartId/submit` | Write | Youngster order flow |
| `/youngster` | reload actions | `GET /youngster/me/insights`, `GET /youngster/me/orders/consolidated` | Read | Insights and order reload |

## Delivery

| Area | Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `/delivery` | `Yesterday` / `Today` / `Tomorrow` | No API | No API | Date preset only |
| `/delivery` | `Refresh` | `GET /delivery/assignments?date=...` | Read | Assignment reload |
| `/delivery` | `Show Service Date` | `GET /delivery/assignments?date=...` | Read | Arbitrary-date fetch |
| `/delivery` | `Download PDF` | `GET /delivery/assignments?date=...` | Read | Client-side print/PDF export |
| `/delivery` | `Mark Complete` / undo | `PATCH /delivery/assignments/:assignmentId/toggle` | Write | Delivery completion toggle |

## Kitchen

| Area | Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|---|
| `/kitchen*` | `Refresh` / date picker reload | `GET /kitchen/daily-summary?date=...` | Read | Daily kitchen summary |
| `/kitchen*` | `Mark Kitchen Complete` / revert | `POST /kitchen/orders/:orderId/complete` | Write | Kitchen completion toggle |

## Admin Billing

| Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `View Proof` | `GET /admin/billing/:billingId/proof-image` | Read | Opens in-page image preview |
| `Approve` | `POST /admin/billing/:billingId/verify` | Write | Sets bill to `VERIFIED` |
| `Reject` | `POST /admin/billing/:billingId/verify` | Write | Moves bill back to `UNPAID`, clears proof, removes receipt |
| `Receipt` / `Gen Receipt` | `POST /admin/billing/:billingId/receipt` | Write | Generates or regenerates receipt record |
| `Open PDF` | `GET /admin/billing/:billingId/receipt-file` | Read | Streams authenticated PDF file |
| `Download PDF` | `GET /admin/billing/:billingId/receipt-file` | Read | Downloads authenticated PDF file |

## Admin Schools / Sessions

| Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Create School` | `POST /admin/schools` | Write | Creates school |
| `Edit` / `Save` | `PATCH /admin/schools/:schoolId` | Write | Updates school fields |
| `Activate` / `Deactivate` | `PATCH /admin/schools/:schoolId` | Write | Moves school between active/deactivated sections |
| `Delete` | `DELETE /admin/schools/:schoolId` | Write | Removes school |
| Session `Activate` / `Deactivate` | `PATCH /admin/session-settings/:session` | Write | Session toggle |

## Admin Parent / Youngster

| Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| Parent `Show ID` | No API | No API | UI popup only |
| Parent `Show PW` | `GET /admin/users/:userId/password` | Read | Read-only password view |
| Parent `Reset PW` | `PATCH /admin/users/:userId/reset-password` | Write | Reset with confirmation |
| Parent `Delete` | `DELETE /admin/parent/:parentId` | Write | Blocked when linked youngster exists |
| Youngster `Show ID` | No API | No API | UI popup only |
| Youngster `Show PW` | `GET /admin/youngster/:youngsterId/password` | Read | Read-only password view |
| Youngster `Reset PW` | `PATCH /admin/youngster/:youngsterId/reset-password` | Write | Reset with confirmation |
| Youngster `Delete` | `DELETE /admin/youngster/:youngsterId` | Write | Admin delete |

## Admin Delivery

| Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| `Create Delivery User` | `POST /admin/delivery/users` | Write | Creates delivery account |
| Delivery `Edit` / `Save` | `PATCH /admin/delivery/users/:userId` | Write | Updates profile |
| Delivery `Show PW` | `GET /admin/users/:userId/password` | Read | Read-only password view |
| Delivery `Activate` / `Deactivate` | `PATCH /admin/delivery/users/:userId` | Write | Account toggle |
| Delivery `Delete` | `DELETE /admin/delivery/users/:userId` | Write | Blocked by active assignments |
| `Save Assignment` | `POST /delivery/school-assignments` | Write | Upsert school mapping |
| Mapping `Delete` | `DELETE /delivery/school-assignments/:deliveryUserId/:schoolId` | Write | Remove mapping |
| `Auto Assign by School` | `POST /delivery/auto-assign` | Write | Delivery assignment generation |
| `Show Service Date` | `GET /delivery/assignments?date=...` | Read | Loads selected-date assignments |
| `Download Summary` | `GET /delivery/summary?date=...` | Read | Summary export |
| `SEND NOTIFICATION EMAIL` | `POST /admin/delivery/send-notification-email` | Write | Sends delivery PDF email |

## Admin Menu

| Button/Action | Endpoint(s) | Type | Notes |
|---|---|---|---|
| Context load | `GET /admin/menus`, `GET /admin/ingredients` | Read | Initial page data |
| `Seed Sample Menus` | `POST /admin/menus/sample-seed` | Write | Seed menu set |
| Dish create/update | `POST /admin/menu-items`, `PATCH /admin/menu-items/:itemId` | Write | CRUD |
| Dish delete | `DELETE /admin/menu-items/:itemId` | Write | CRUD |
| Dish availability toggle | `PATCH /admin/menu-items/:itemId` | Write | Availability |
| Ingredient quick create | `POST /admin/ingredients` | Write | Ingredient create |
| Image upload | `POST /admin/menu-images/upload` | Write | Dish image upload |
