# RBAC Matrix Specification

## Roles
- `PARENT`
- `CHILD`
- `ADMIN`
- `KITCHEN`
- `DELIVERY`

## Rule Baseline
- Deny by default.
- Allow by explicit role + ownership checks.
- Every write operation must be audited (`order_mutations` or equivalent activity log).

## Ownership Rules
- Parent can access only linked children.
- Child can access only self.
- Kitchen is read-only for operational summaries and print outputs.
- Delivery can access only assigned deliveries.
- Admin has full menu CRUD, operational order deletion, and global visibility.

## Permission Matrix

| Module | Action | Parent | Child | Admin | Kitchen | Delivery |
|---|---|---|---|---|---|---|
| Auth | Login/Refresh/Logout | Yes | Yes | Yes | Yes | Yes |
| Auth | Google OAuth Login | Yes | Yes | Yes | Yes | Yes |
| Auth | Register (parent self) | Public | No | Yes | No | No |
| Parent Profile | View self | Yes | No | Yes | No | No |
| Parent Profile | Update self | Yes | No | Yes | No | No |
| Child Profile | View | Linked only | Self only | Yes | Limited read | Assigned only |
| Child Profile | Create (register child) | Yes (own family) | No | Yes | No | No |
| Child Profile | Update | Linked only | Limited self fields | Yes | No | No |
| Parent Child Pages | Switch child context | Yes (linked only) | No | Yes | No | No |
| Parent-Child Link | Create/Delete | Yes (own) | No | Yes | No | No |
| Schools | View | Yes | Yes | Yes | Yes | Yes |
| Schools | Create/Update/Deactivate | No | No | Yes | No | No |
| Academic Years/Terms | View | Yes | Yes | Yes | Yes | No |
| Academic Years/Terms | Create/Update/Delete | No | No | Yes | No | No |
| Ingredients | View | Yes | Yes | Yes | Yes | Yes |
| Ingredients | Create/Update/Delete | No | No | Yes | No | No |
| Menu | View | Yes | Yes | Yes | Yes | Assigned only |
| Menu | Create/Update/Delete | No | No | Yes | No | No |
| Menu Item/Meal | Full CRUD (name, photo, price, ingredient, nutrient, etc.) | No | No | Yes | No | No |
| Blackout Days | View | Yes | No | Yes | Yes | Yes |
| Blackout Days | Create/Delete | No | No | Yes | No | No |
| Dietary Restrictions | View | Linked only | Self only | Yes | Yes | Assigned only |
| Dietary Restrictions | Create/Update/Delete | Linked only | No | Yes | No | No |
| Carts | Create | Yes (linked child) | Yes (self) | No | No | No |
| Carts | View (OPEN) | Linked only | Self only | Yes | No | No |
| Carts | Update items | Yes (linked child, OPEN) | Yes (self, OPEN) | No | No | No |
| Carts | Delete (OPEN) | Yes (linked child) | Yes (self) | No | No | No |
| Carts | Submit | Yes (linked child) | Yes (self) | No | No | No |
| Orders | Create (direct, no cart) | Yes (linked child) | Yes (self) | No | No | No |
| Orders | View | Linked only | Self only | Yes | Yes | Assigned only |
| Orders | Consolidated parent view | Yes (all linked children) | No | Yes | No | No |
| Orders | Update | Yes (before cutoff) | No | No | No | No |
| Orders | Delete | Yes (before cutoff) | No | Yes (operational) | No | No |
| Orders | Duplicate | Yes (linked child) | No | No | No | No |
| Favourites | View | Own only | Own only | Yes | No | No |
| Favourites | Create/Update/Delete | Own only | Own only | No | No | No |
| Favourites | Apply to cart | Yes (linked child) | Yes (self) | No | No | No |
| Billing | View | Linked only | Self only | Yes | No | Assigned delivery fields only |
| Billing | Consolidated parent view | Yes (all linked children) | No | Yes | No | No |
| Billing | Upload proof | Yes | No | No | No | No |
| Billing | Verify/Reject | No | No | Yes | No | No |
| Billing | Generate receipt | No | No | Yes | No | No |
| Digital Receipts | View/Download | Linked only | Self only | Yes | No | No |
| Spending Dashboard | View | Own only | No | Yes | No | No |
| Revenue Dashboard | View | No | No | Yes | No | No |
| Delivery | Assign orders | No | No | Yes | No | No |
| Delivery | View daily assignment | No | No | Yes | No | Yes |
| Delivery | Confirm delivered | No | No | Yes | No | Yes (own assignment) |
| Kitchen Summary | View | No | No | Yes | Yes | No |
| Kitchen Allergen Alerts | View | No | No | Yes | Yes | No |
| Kitchen Analytics | View | No | No | Yes | Yes | No |
| Kitchen Reports/Tags | Print | No | No | Yes | Yes | No |
| Admin Analytics | Dice/slice by parent/child/meal/session/school/orders/delivery | No | No | Yes | No | No |
| Child Badges | View | Linked only | Self only | Yes | Yes (assigned) | No |
| Child Badges | Award (system-triggered) | No | No | System | No | No |
| User Preferences | View | Own only | Own only | Yes | Own only | Own only |
| User Preferences | Update | Own only | Own only | Yes | Own only | Own only |
| CSV Import | Parent/Child bulk upload | No | No | Yes | No | No |

## Critical Policy Details
- Child cannot edit/delete orders after placement.
- Parent can edit/delete only before 08:00 AM on service date (Asia/Makassar).
- Admin cannot modify order content, but can delete orders for operational management.
- Kitchen cannot modify orders, carts, or menus; read-only for operational views.
- Delivery can only confirm delivery for assigned orders.
- Digital receipts visible only to the billing parent and admin.
- Badges are system-awarded only; no manual award or removal by any role.

## API Guard Strategy
- JWT includes: `sub`, `role`, `parent_id|child_id` context.
- Endpoint guards:
  - `RoleGuard`: role permission check
  - `OwnershipGuard`: linked-child or self verification
  - `CutoffGuard`: parent edit/delete cutoff validation
  - `CartStatusGuard`: validates cart is OPEN and not expired before mutations
  - `ServiceDateGuard`: weekday + blackout rule enforcement
  - `DeliveryAssignmentGuard`: delivery user must own the assignment
  - `SchoolActiveGuard`: soft warning when service date outside active academic term

## Auditing Requirements
- Track actor, action, timestamp, target entity, before/after snapshots for:
  - order create/update/delete/duplicate
  - cart submit
  - billing verification changes (verify/reject)
  - receipt generation
  - delivery assignment/confirmation changes
  - admin blackout changes
  - menu CRUD changes
  - school and academic year changes
  - CSV import events (bulk action log)
