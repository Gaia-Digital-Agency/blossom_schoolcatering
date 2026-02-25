# Blossom School Catering - Requirements

## Project Overview
- Project name: `blossom-schoolcatering`
- Purpose: Food ordering web app for school catering services from Blossom Steakhouse kitchen for international schools in Bali.
- Design direction: Mobile-first, simple and elegant, with a luxury Blossom Steakhouse visual feel.
- Future direction: Start as web app, with possible evolution into a mobile app.

## Core Functional Requirements
- Food catering ordering system with sessions:
  - Lunch
  - Snack
  - Breakfast
- Session ordering rule: order flow and display order should follow Lunch, Snack, Breakfast.
- Ordering can be performed on any day of the year.
- Meals are for weekdays only (Monday-Friday, no weekend meal service).
- Service dates that fall outside an active academic term surface a soft UI warning (not a hard block).

## User Roles and Access
- Roles:
  - Parent
  - Child
  - Admin
  - Kitchen
  - Delivery
- Parent-child relationship:
  - One parent can have multiple children.
  - Maximum 10 children per parent.
- Access rules:
  - Parent can view, create, edit, and delete child orders (time-limited).
  - Child can view and create only their own order.
  - Child cannot view sibling/other child orders.
  - Child cannot change or delete order after placing it.
  - Admin can manage menu items (full CRUD).
  - Admin cannot modify placed meals/orders; admin can delete meals/orders for operations and delivery management.
  - Delivery can view assigned meals/orders for the day and confirm each delivered item.
  - Delivery confirmation updates billing/delivery status.

## Username and Login Rules
- Parent username format: `lastname_parent`
- Child username format: `lastname_firstname`
- Username uniqueness rule:
  - If generated username already exists, append numeric suffix: `-1`, `-2`, `-3`, etc.
  - Example: `wijaya_parent`, `wijaya_parent-1`
- Initial login code/password: phone number without `+` and without spaces.
- Both parent and child can log in.
- Google Account login is supported for parent and child accounts.

## Registration Requirements
- A dedicated public registration page must exist.
- Parent and child registrations are separate flows:
  - Parent self-registers on the public registration page.
  - Each child must be registered separately by the parent (after parent login) or by admin.
  - A child cannot self-register.
- Parent registration (all compulsory):
  - first_name
  - last_name
  - phone_number
  - email
  - address
- Child registration (all compulsory except photo):
  - first_name
  - last_name
  - phone_number
  - date_of_birth
  - gender
  - school_id (selected from the registered schools dropdown)
  - school_grade
  - photo (optional)
- Admin can bulk import parents and children via CSV upload:
  - CSV format must be documented with column definitions.
  - Import validates required fields, uniqueness, and school_id references.
  - Import returns a summary report: success count, failure list with per-row reasons.

## Schools and Multi-Campus Support
- A `schools` master table is maintained by admin.
- Each school record includes: name, address, city, contact email, contact phone.
- Children are linked to a school via `school_id` foreign key (not free text).
- Admin can add, edit, and deactivate school records.
- Multiple campuses of the same institution may be added as separate school records.

## Academic Year and Term Configuration
- Admin can configure academic years per school.
- Each academic year has a label (e.g., "2025-2026"), a start date, and an end date.
- Each academic year is divided into terms (e.g., Term 1, Term 2, Term 3).
- Only one academic year may be marked active per school at a time (enforced at service layer).
- Service dates outside any active term surface a soft UI warning, not a hard block.

## Ordering Rules
- Child:
  - One meal set per child per session per day.
  - A child can have up to 3 session orders per day (Lunch, Snack, Breakfast), if available.
  - Cannot edit or delete a placed order.
- Parent:
  - Can place one meal set per child per session per day.
  - Can order for up to 3 sessions per day per child (Lunch, Snack, Breakfast), if available.
  - Can edit/delete order before 08:00 AM on the same service day.
  - Can duplicate meal sets: Daily or Weekly, per child.

## Cart / Basket Metaphor
- Users build a cart for a specific child, session, and service date before confirming.
- Cart persists as a draft until submitted or it expires.
- Cart expires automatically at 08:00 AM (Asia/Makassar) on the service date.
- Maximum 5 distinct items per cart (matches order item limit).
- Submitting a cart creates a confirmed order and a billing record.
- Users can view and edit the cart before submission.
- Abandoned carts are batch-marked as EXPIRED after cutoff.

## Quick Reorder
- Parent can reorder from any previous confirmed order with one tap.
- Quick reorder pre-fills a new cart with prior order items for the selected session and a new service date.
- User must confirm (submit cart) to finalise the reorder.
- Menu items that are no longer available are flagged and excluded from the pre-filled cart.

## Meal Plan Wizard
- A guided multi-step wizard for ordering meals across a week or a custom date range.
- Steps:
  1. Select child
  2. Select date range (weekly, monthly, or custom)
  3. Select sessions (Lunch, Snack, Breakfast — any combination)
  4. Choose meals per session from available menu
  5. Review summary of all orders to be placed
  6. Confirm and submit all
- Each target date validated against weekday, blackout, and uniqueness rules.
- Partial success: valid dates proceed; failures reported per date with reason.

## Smart Cutoff Countdown
- A visible countdown timer on all cart and order pages.
- Shows time remaining until the 08:00 AM cutoff on the selected service date.
- Timer turns red and shows a warning when fewer than 30 minutes remain.
- Order/edit/submit buttons are automatically disabled once the countdown reaches zero.

## Menu Search and Filter
- Parents and children can search menu items by name or description keyword.
- Filter options:
  - By session (Lunch / Snack / Breakfast)
  - By price range
  - By availability (show available only by default)
  - By allergen (exclude items containing allergen-flagged ingredients)
  - Show only favourites
- Search and filter state persists within the active menu view.

## Guided Onboarding Flow
- First-login wizard shown to new parents:
  1. Welcome screen
  2. Add first child (triggers inline child registration)
  3. Set child dietary restrictions
  4. Preview the menu
  5. Place first order (optional, skippable)
  6. Complete onboarding
- Onboarding completion state stored per user in user_preferences.
- Users can re-access the onboarding guide from their profile settings.

## Tooltips and Contextual Help
- Tooltip icons (ⓘ) on key form fields with short explanations.
- Contextual help shown on:
  - Billing proof upload
  - Dietary restriction fields
  - Ingredient selection (admin)
  - Cutoff time rules
  - Order duplication (daily/weekly wizard)
- Tooltips can be toggled off from user preferences.

## Ingredient Restrictions
- Parent can set ingredient exclusions/restrictions per child (free-text label and details).
- Active restrictions are snapshotted into the order's `dietary_snapshot` field at order creation time.
- Snapshot is immutable on historical records for audit and printing.
- Kitchen views and order tags must always display the dietary snapshot from each order.

## Item Limits
- Maximum 5 distinct items per order.
- Maximum 5 distinct items per cart.

## Menu Management
- Menu categories: Lunch, Snack, Breakfast.
- Estimated menu size: 20 to 50 items per category.
- Menu item fields: name, price, description, ingredients (multi-select from master list), nutrition_facts, image.
- Admin has full CRUD on menu items.
- Admin has full CRUD on master ingredient list.
- Meal name must be unique (case-insensitive).
- Ingredient name must be unique in master list (case-insensitive).
- Menu updates by admin immediately reflect in parent and child views.
- Admin can black out / block specific ordering or service dates.

## Favourite Meals
- Parents and children can save meal combinations as favourites.
- A favourite has a label and a suggested session.
- Favourites can optionally be linked to a specific child or kept general.
- A favourite can be applied to pre-fill a new cart with one tap.
- Maximum 20 favourites per user (enforced at service layer).

## Nutritional Summary
- Each menu item displays its nutrition facts (text format).
- Parent can view a weekly nutritional summary per child:
  - Total orders placed per session
  - Number of distinct meals ordered (variety score)
  - Aggregated nutrition notes per meal

## Birthday Meal Highlights
- Child's date_of_birth is stored on their profile.
- On a child's birthday, the kitchen view and printed order tag display a birthday indicator.
- Admin can optionally note a birthday meal suggestion in the admin panel (informational only).
- No automated meal change is made; highlight is visual only.

## Gamification: Clean Plate Club
- Children earn badges for consistent ordering behaviour.
- Badge types:
  - STREAK_7: 7 consecutive weekdays with at least one order
  - STREAK_14: 14 consecutive weekdays with at least one order
  - STREAK_30: 30 consecutive weekdays with at least one order
  - WEEK_COMPLETE: all 5 weekdays in a calendar week have at least one order
  - MONTH_COMPLETE: all weekdays in a calendar month have at least one order
- Badge check runs server-side on each successful order placement.
- Badges visible on child profile page.
- Order tags display a badge indicator for children who have earned a recent milestone.

## Parent and Child Pages (Post-login)
- Lunch Menu Page (with search and filter)
- Snack Menu Page (with search and filter)
- Breakfast Menu Page (with search and filter)
- Cart / Order Draft Page
- Daily Order Page
- Weekly Order Page
- Monthly Order Page
- Semester Order Page
- Meal Plan Wizard Page
- Billing Page (with progress stepper)
- Spending Dashboard Page (parent only)
- Favourites Page
- Profile and Preferences Page (dark mode, tooltips, onboarding)
- Parent Child Switcher Page (single login, separate page per child)
- Parent Consolidated Orders Page (all child orders in one view)
- Parent Consolidated Billing Page (all child billing in one view)

## Admin Pages (Post-login)
- Menu Management
- Ingredient Management
- Blackout Days Management
- Schools Management
- Academic Year and Term Management
- Billing Verification
- Delivery Assignment
- Revenue Dashboard
- Analytics / Reports
- CSV Import (Parent and Child bulk upload)
- Order Tags Print

## Kitchen Pages (Post-login)
- Daily Kitchen Summary (polling-based)
- Allergen Alert Dashboard
- Analytics
- Print Order Tags
- Print Reports

## Delivery Pages (Post-login)
- Today's Assigned Orders
- Confirm Delivery

## Public Pages
- Homepage (login entry, hero image, simple explanation)
- Registration Page (parent self-registration)
- Privacy and Confidentiality Page

## UI/UX Design Requirements

### Color-Coded Sessions
- Each session has a distinct visual identity applied consistently across all views:
  - Lunch: warm amber / orange tones
  - Snack: lime / fresh green tones
  - Breakfast: sky blue / morning tones
- Applied to: menu page headers, cart, order cards, order tags, calendar view, kitchen summary.

### Micro-Animations
- Page and component transitions use subtle fade or slide-in animations.
- Successful order confirmation triggers a success animation (checkmark or brief confetti burst).
- Cart item add/remove uses subtle scale or bounce feedback.
- Loading states use skeleton screens (not spinners).
- Form validation errors appear with a gentle shake animation.

### Dark Mode
- Toggle available in user preferences.
- Preference persisted per user in user_preferences table.
- Respects OS preference (prefers-color-scheme) on first load.
- Applies to all authenticated pages.
- Implemented via Tailwind CSS dark class strategy.

### Progress Stepper for Billing
- Billing page shows a visual progress stepper:
  - UNPAID → PENDING VERIFICATION → VERIFIED (or REJECTED)
- Delivery status shown as a secondary progress bar below:
  - PENDING → ASSIGNED → OUT FOR DELIVERY → DELIVERED
- Clear icons and colour indicators: green = complete, amber = in progress, red = rejected/failed.

### Responsive Design
- Mobile-first layout (min 375px viewport width).
- Tailwind CSS utility classes throughout.
- All pages fully functional on mobile.

## Billing Requirements
- Billing details must include:
  - order items
  - session
  - day and date
  - price
  - proof of payment status (colour indicator: green / red)
  - delivery status and delivered timestamp
- Billing views:
  - History view
  - Summary view by: session, date, day, meals, child, parent
  - Parent consolidated billing view across all linked children
- Parent must upload proof-of-payment image to confirm payment.
- Admin verifies or rejects payment.
- On payment verification, admin may trigger digital receipt generation (PDF).

## Digital Receipts
- Admin triggers receipt generation from the billing verification page.
- Receipt PDF stored in GCS and linked to the billing record.
- Parent can view and download their receipt from the billing page.
- Receipt includes:
  - Receipt number (human-readable sequential: e.g., BLC-2026-00001)
  - Child name and school
  - Order items, session, date
  - Total amount paid
  - Payment verification date
  - Footer: Blossom School Catering, Developed by Gaiada.com

## Spending Dashboard (Parent)
- Accessible from parent's main navigation.
- Displays:
  - Total spent per month (current and historical)
  - Total spent per child
  - Outstanding (unpaid) balance
  - Order count by session
  - Top ordered meals
  - Monthly spending trend (simple bar or line chart)

## Revenue Dashboard (Admin)
- Accessible from admin panel.
- Displays:
  - Total revenue by day / week / month
  - Outstanding unpaid balance total
  - Revenue by session
  - Revenue by school
  - Top selling menu items
  - Order fulfilment rate (delivered vs total)
  - Orders grouped by payment status

## Allergen Alert Dashboard (Kitchen and Admin)
- Shows all orders for the current service date where:
  - The child has at least one active dietary restriction, AND
  - The order contains menu items with allergen-flagged ingredients
- Grouped by session.
- Displays: child name, school, grade, restriction details, flagged ingredient name, meal name.
- Allergen alerts also highlighted on printed order tags.

## Kitchen View and Analytics
- Daily kitchen summary of ordered items with polling-based live updates (30–60 second interval, with manual Refresh button).
- Birthday and Clean Plate Club badge indicators visible on kitchen views.
- Analytics views and comparisons: by day, week, month; meal vs age, gender, school, session.
- Kitchen operations: print reports, print order tags (with QR code encoding order UUID).

## Order Tag Requirements
- Order number UUID (encoded as QR code)
- Parent name
- Child name
- School name
- Session (colour-coded by session type)
- Day and Date
- Ingredient exclusions (dietary snapshot)
- Birthday indicator (if service date = child's birthday)
- Badge indicator (if child has recently earned a Clean Plate Club badge)

## Delivery View
- Delivery user sees assigned meals/orders for the day.
- Can tick and confirm delivered for each order.
- Delivery confirmation updates billing and order delivery status.

## Admin Analytics
- Admin can dice and slice data by:
  - parent, child, meal item, session, school
  - order count, delivery status, payment status
  - date / day / week / month

## Privacy, Legal, and Footer
- Strict privacy and confidentiality page is required.
- Footer requirements:
  - `Copyright (C) 2026`
  - `Developed by Gaiada.com`
  - Number of visitors (counter starting at 35)
  - Visitor location
  - Visitor time

## Homepage Requirements
- Must include: login entry, hero image, simple layman explanation (what the app is, how to use it).
- Visual feel: luxury Blossom Steakhouse style, adapted for children and parents.

## Scale and Operational Assumptions
- Initial scale: 300+ children, multiple international schools in Bali, some parents with multiple children.

## Architecture Notes

### Event-Driven Order Pipeline
- Order lifecycle domain events emitted on each state change:
  - OrderPlaced, OrderUpdated, OrderCancelled, OrderDuplicated, CartSubmitted
  - PaymentProofUploaded, PaymentVerified, PaymentRejected
  - DeliveryConfirmed, BadgeAwarded
- In v1, events handled synchronously within the NestJS service layer using NestJS EventEmitter.
- Handlers designed to be extractable to an async queue in a future version without API changes.
- Event handlers responsible for: billing record creation, audit log write, badge calculation, dietary snapshot attachment, digital receipt generation (on admin-triggered PaymentVerified).

### Scalability Notes
- PostgreSQL read replica for all analytics and reporting queries.
- Analytics endpoints explicitly route to the read replica; transactional writes go to the primary.
- All media (menu images, payment proof images, PDF receipts) served via GCS + Cloud CDN.
- `mv_admin_daily_rollup` materialized view refreshed via pg_cron every 5 minutes; also manually triggerable from admin dashboard.
- NestJS TypeORM connection pool: min=2, max=20 (configurable via environment variables).
- Redis for: JWT refresh token tracking, cart expiry keys, visitor counter (short-lived counters).

### Developer Experience Notes (applied at this stage)
- NestJS Swagger/OpenAPI decorators from day one for auto-generated interactive API docs.
- Correlation ID middleware injects a unique request ID into all API logs.
- Structured JSON logging (Winston) with: level, timestamp, userId, role, requestId, module.
- All configuration managed via NestJS ConfigModule; no hardcoded secrets.

### Security Notes (applied at this stage)
- Rate limiting per endpoint via NestJS ThrottlerModule; stricter limits on auth and upload endpoints.
- Image upload validation: MIME type check, max 5 MB file size, resize before GCS storage.
- JWT refresh token rotation: each refresh issues a new token; prior token invalidated in Redis.
- RBAC enforced at guard level; ownership checks enforced at service layer.
- All API inputs validated via NestJS class-validator DTOs with `whitelist: true`.

## Timeline and Quality Gates
- Go-live deadline: **1 April 2026**
- Required completed testing before go-live:
  - Unit Testing (validators, business rules, auth, pricing, badge logic, cart expiry)
  - Integration Testing (API + DB flows for auth/menu/cart/order/billing)
  - System Testing (end-to-end flows per role)
  - User Testing (UAT with school operations simulation)
  - Regression Testing (cutoff times, weekday service, blackout rules, cart expiry)
  - Security Testing (JWT hardening, upload validation, RBAC boundaries)
  - Performance Testing (peak-hour ordering, kitchen polling load, analytics queries)

## Infrastructure and Environments
- Staging VM (GCP): `gda-s01`
- Server path: `/var/www/schoolcatering`
- Staging URL: `http://34.124.244.233/schoolcatering`
- Storage bucket: `gda-ce01`
- Bucket folder: `blossom_schoolcatering`
- SSH access command: `ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233`

## Repository Details
- Git remote: `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`
