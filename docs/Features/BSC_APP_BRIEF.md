# Blossom School Catering 
http://34.124.244.233/schoolcatering

## 1) Product Story
Blossom School Catering is a school meal operations platform where Admin, Parent, Youngster, Kitchen, and Delivery each complete part of one connected daily service cycle.

A youngster can be registered through a combined youngster-parent registration flow with a registrant tag that records who initiated registration:
- `YOUNGSTER` (self)
- `PARENT`
- `TEACHER` (with required teacher name)

After registration, users authenticate by role and enter dedicated modules. From there, the system coordinates menu selection, order placement, kitchen preparation, delivery assignment and completion, billing verification, and operational oversight.

The entire app is rule-driven:
- one active order per youngster/session/service date
- session activation control
- blackout day rules
- cutoff/time constraints
- role-based access control at UI and API layers

<div style="page-break-after: always"></div>

## 2) Primary Actor Journeys

## Youngster Journey (Register -> Order -> Points)
### Registration
As a youngster (or as a parent/teacher registering a youngster), I can submit youngster + parent information in one registration flow.

I must provide:
- registrant type (`YOUNGSTER`, `PARENT`, `TEACHER`)
- youngster profile (name, gender, DOB, school, grade, phone; optional email/allergies)
- parent profile (name, mobile, email, optional address)
- teacher name when registrant is `TEACHER`

The system stores registration source metadata for compliance and audit (`registration_actor_type`, `registration_actor_teacher_name`).

### Authentication and daily use
As a youngster, I log in at the youngster role login and access youngster pages only.

I can:
- browse available menu items by service date/session
- create and submit an order via cart flow
- view consolidated order history
- see nutrition and achievement insights

### Points/Insights
As a youngster, I can track:
- weekly total calories
- weekly total orders
- weekly total dishes
- badge level progression (Bronze/Silver/Gold/Platinum logic)
- birthday countdown

This turns repeated, consistent ordering behavior into visible progress (Clean Plate Club style motivation).

## Parent Journey (Register -> Order -> Billing)
### Registration and account ownership
As a parent, I can be created through youngster registration or parent flows and then log in to parent pages.

### Ordering
As a parent, I can:
- select linked youngster(s)
- choose service date and session (Lunch/Snack/Breakfast)
- build cart and place order
- quick reorder previous patterns
- edit/delete orders before cutoff (when rules permit)

### Billing and proof
As a parent, I can:
- review consolidated billing records
- upload payment proof (single/batch)
- view proof image via authenticated endpoint
- open receipt when generated
- revert pending proof back to unpaid if correction is needed

### Spending visibility
As a parent, I can view spending dashboard summaries for financial tracking.

## Delivery Journey (See -> Deliver -> Confirm)
### Assignment visibility
As a delivery user, I log in and see only assignments routed to my account.

I can:
- use quick windows (Yesterday/Today/Tomorrow)
- use manual `Service Date` picker + `Show Service Date` for any date
- view pending and completed assignments grouped by school

### Completion workflow
As a delivery user, I can:
- mark assignment complete
- undo completion if needed
- submit optional confirmation note

The app updates delivery state so Admin and Billing status stay synchronized with fulfillment.

## Kitchen Journey (See -> Prepare -> Mark Complete)
### Kitchen dashboard
As a kitchen user, I can open daily dashboards (yesterday/today/tomorrow) and see:
- overview metrics (Total Orders, Total Orders Complete, Total Dishes, per-session counts)
- dish summary quantities
- dietary alerts
- pending vs completed orders

### Kitchen completion
As a kitchen user, I can mark an order kitchen-complete.

When marked complete, the system:
- moves delivery state forward
- triggers/uses assignment logic for delivery operations

If needed (and allowed by state), completion can be reverted to pending.

## Menu Journey (Public browse + Admin control)
### Public/consumer side
As any user (including not logged in), I can browse public menu visibility.

### Admin side
As an admin, I can:
- create/update/delete menu items
- toggle availability
- upload menu images
- seed sample menus/orders
- manage ingredients and item-ingredient composition

This ensures operations can prepare and publish the next service days quickly.

## Rating Journey
As an authenticated user, I can submit dish ratings.

Ratings become part of the admin analytical surface for menu quality tracking and iterative optimization.

## Billing Journey (Parent + Admin)
### Parent side
- view outstanding and historical billing
- upload and revise proofs
- access receipts

### Admin side
As an admin, I can:
- inspect billing records
- view proof images securely
- verify or reject proofs
- generate/regenerate receipts

Billing status and delivery status are linked to order lifecycle so operational and finance views remain consistent.

## Admin Journey (Operational command center)
As an admin, I manage the whole system from one role:

### Core administration
- dashboard KPIs
- revenue/reporting views
- audit logs
- schools CRUD
- session settings (including Lunch always-on enforcement)
- blackout date management

### Parent/Youngster administration
- parent listing
- parent show-password reset
- parent delete (blocked when linked youngsters exist)
- youngster create/edit/delete
- youngster password reset

### Delivery administration
- delivery user CRUD and activation status
- delivery user show-password reset
- delivery-school mapping CRUD/activation
- auto assignment by school
- assignment date filtering (`Show Service Date`)
- downloadable delivery summary

### Kitchen monitoring
- admin kitchen read-only monitoring with same core overview insights as kitchen role

Admin is responsible for keeping data quality, service continuity, and operational accountability intact.

<div style="page-break-after: always"></div>

## 3) System Rules and Constraints (Cross-Role)
- strict role-based route/API access
- auth token + refresh token lifecycle with guarded refresh
- validated API payloads and UUID path checks
- ordering constraints (session status, blackout rules, cutoff)
- delivery/kitchen status transitions enforced by backend
- destructive actions guarded by business checks (example: parent delete blocked when linked youngster exists)

## 4) Outcome 
From registration to plate delivery, each role contributes a controlled step in one flow:
1. Youngster is registered with actor tagging (self/parent/teacher)
2. Parent/youngster places compliant orders
3. Kitchen prepares and marks completion
4. Delivery sees assigned route and confirms delivered status
5. Billing is validated with proof and receipts
6. Admin supervises all operations, exceptions, and quality metrics

This creates a full closed-loop school catering workflow with operational traceability, financial control, and role-focused UX.
