# Admin User Guide

## Access
- Login: `/schoolcatering/admin/login`
- Main dashboard: `/schoolcatering/admin`

## Primary Navigation
- `Dashboard`, `Parents`, `Youngsters`, `Schools`, `Delivery`
- `Menu`, `Kitchen`, `Blackout`, `Reports`, `Billing`

## Dashboard
- Date-based KPI snapshot for parents/youngsters/schools
- Delivery metrics (today/yesterday/tomorrow/week/month)
- Menu totals, kitchen exceptions, billing totals
- Birthday highlights and pending billing count

## Operational Modules
- Parents: list and reset password
- Youngsters: create/update/delete, link parent, reset password
- Schools: CRUD and active status control
- Delivery: register/edit/activate users, school mapping, auto-assignment
- Menu: full dish + ingredient management
- Kitchen: read-only kitchen summary monitor
- Blackout: manage blocked service/order dates
- Billing: verify proofs and generate receipts
- Reports: revenue dashboard with multi-filter analysis

## Security & Rules
- Admin actions are role-guarded
- UUID/resource checks and business rules are enforced server-side
