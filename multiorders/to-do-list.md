# Multi Order To Do List

## Documentation

- [x] Write build specification
- [x] Write functional specification and rule set
- [x] Write implementation guide
- [x] Write user guide
- [x] Write client brief

## Database

- [ ] Create migration for `multi_order_groups`
- [ ] Create migration for `multi_order_occurrences`
- [ ] Create migration for `multi_order_billings`
- [ ] Create migration for `multi_order_receipts`
- [ ] Create migration for `multi_order_change_requests`
- [ ] Add `source_type` to `orders`
- [ ] Add `multi_order_group_id` to `orders`
- [ ] Confirm active uniqueness rule on `child_id + service_date + session`
- [ ] Add required indexes

## Backend

- [ ] Create DTOs for create, edit, request, admin resolve
- [ ] Create service methods for create group
- [ ] Create service methods for pre-start owner edit
- [ ] Create service methods for pre-start owner delete
- [ ] Create service methods for request submission
- [ ] Create service methods for admin resolution
- [ ] Create service methods for billing recalculation
- [ ] Create service methods for receipt void and regeneration
- [ ] Add audit logging for all multi-order actions
- [ ] Add admin filters and lookup queries

## API

- [ ] Add family/student multi-order routes
- [ ] Add admin multi-order routes
- [ ] Add grouped billing detail route
- [ ] Add request workflow routes

## Frontend Family/Student

- [ ] Add `Multi Order` card to family hub
- [ ] Add `Multi Order` card to student hub
- [ ] Build family multi-order page
- [ ] Build student multi-order page
- [ ] Build mobile-first step flow
- [ ] Build review summary with skipped date reasons
- [ ] Build read-only started group view
- [ ] Build request submission UI

## Frontend Admin

- [ ] Build `/admin/multiorders`
- [ ] Add list filters
- [ ] Add detail popup
- [ ] Add request resolution popup
- [ ] Add replacement group create popup
- [ ] Add grouped billing popup

## Billing And Receipt

- [ ] Add grouped billing row display in billing page
- [ ] Add grouped billing popup details
- [ ] Add grouped receipt generation
- [ ] Add receipt void history handling
- [ ] Add recalculation on future occurrence deletion

## Validation

- [ ] Enforce 3 month range
- [ ] Enforce weekend exclusion
- [ ] Enforce blackout exclusion
- [ ] Enforce session active requirement
- [ ] Enforce no-overlap rule
- [ ] Enforce after-cutoff immutability
- [ ] Enforce `KITCHEN_COMPLETED`, `IN_DELIVERY`, `DELIVERED` immutability

## Testing

- [ ] Unit test create flow
- [ ] Unit test overlap skip behavior
- [ ] Unit test billing recalculation
- [ ] Unit test receipt versioning
- [ ] Unit test request approval flow
- [ ] Unit test request rejection flow
- [ ] Unit test replacement group creation
- [ ] Regression test single-order create/edit/delete
- [ ] Regression test kitchen daily views
- [ ] Regression test delivery views
- [ ] Regression test admin billing page

## Deployment Preparation

- [ ] Prepare rollout checklist
- [ ] Prepare seed or fixture data
- [ ] Prepare admin training note
- [ ] Prepare client demo script
