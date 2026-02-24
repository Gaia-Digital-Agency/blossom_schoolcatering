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
- Every write operation must be audited (`order_mutations` or activity logs).

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
| Parent Profile | View self | Yes | No | Yes | No | No |
| Parent Profile | Update self | Yes | No | Yes | No | No |
| Child Profile | View | Linked only | Self only | Yes | Limited read | Assigned only |
| Child Profile | Create | Yes (for own family) | No | Yes | No | No |
| Child Profile | Update | Linked only | Limited self fields | Yes | No | No |
| Parent-Child Link | Create/Delete | Yes (own) | No | Yes | No | No |
| Ingredients | View | Yes | Yes | Yes | Yes | Yes |
| Ingredients | Create/Update/Delete | No | No | Yes | No | No |
| Menu | View | Yes | Yes | Yes | Yes | Assigned only |
| Menu | Create/Update/Delete | No | No | Yes | No | No |
| Menu Item/Meal | Full CRUD (name, photo, price, ingredient, nutrient, etc.) | No | No | Yes | No | No |
| Blackout Days | View | Yes | No | Yes | Yes | Yes |
| Blackout Days | Create/Update/Delete | No | No | Yes | No | No |
| Dietary Restrictions | View | Linked only | Self only | Yes | Yes | Assigned only |
| Dietary Restrictions | Create/Update/Delete | Linked only | No | Yes | No | No |
| Orders | Create | Yes (linked child) | Yes (self) | No | No | No |
| Orders | View | Linked only | Self only | Yes | Yes | Assigned only |
| Orders | Update | Yes (before cutoff) | No | No | No | No |
| Orders | Delete | Yes (before cutoff) | No | Yes (operational) | No | No |
| Orders | Duplicate | Yes (linked child) | No | No | No | No |
| Billing | View | Linked only | Self only | Yes | No | Assigned delivery fields only |
| Billing | Upload proof | Yes | No | No | No | No |
| Billing | Verify/Reject | No | No | Yes | No | No |
| Delivery | Assign orders | No | No | Yes | No | No |
| Delivery | View daily assignment | No | No | Yes | No | Yes |
| Delivery | Confirm delivered | No | No | Yes | No | Yes (own assignment) |
| Kitchen Summary | View | No | No | Yes | Yes | No |
| Kitchen Analytics | View | No | No | Yes | Yes | No |
| Kitchen Reports/Tags | Print | No | No | Yes | Yes | No |
| Admin Analytics | Dice/slice by parent/child/meal/session/orders/delivery | No | No | Yes | No | No |

## Critical Policy Details
- Child cannot edit/delete orders after placement.
- Parent can edit/delete only before 08:00 AM on service date (Asia/Makassar).
- Admin cannot modify order content, but admin can delete orders for operational management.
- Kitchen cannot modify orders or menus.
- Delivery can only confirm delivery for assigned orders.

## API Guard Strategy
- JWT includes: `sub`, `role`, `parent_id|child_id` context.
- Endpoint guards:
  - `RoleGuard`: role permission
  - `OwnershipGuard`: linked-child or self verification
  - `CutoffGuard`: parent edit/delete cutoff validation
  - `ServiceDateGuard`: weekday + blackout rule enforcement
  - `DeliveryAssignmentGuard`: delivery user must own assignment

## Auditing Requirements
- Track actor, action, timestamp, target entity, before/after snapshots for:
  - order create/update/delete/duplicate
  - billing verification changes
  - delivery assignment/confirmation changes
  - admin blackout changes
  - menu CRUD changes
