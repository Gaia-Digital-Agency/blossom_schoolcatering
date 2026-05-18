# Admin User Guide

Last updated: 2026-05-05

The Admin Hub is the operational control panel for the school. From here you manage families and students, schools, the menu, orders, billing, delivery, the kitchen monitor, blackout dates, ratings, and reports. Most cross-team issues (wrong school, missing student, delivery confusion, billing dispute) are resolved from this hub.

- Login: `/schoolcatering/admin/login`
- Hub: `/schoolcatering/admin`
- Audience: school admins / operations team.

When you log in, the hub shows a grid of cards plus a **Create Order** button at the top. The cards are: **Dashboard, Family, Student, Schools, Delivery, Menu, Orders, Multi Orders, Billing, Blackout, Kitchen, Rating, Reports**. Each section below covers one card.

## 1) Dashboard

### Where
- `/schoolcatering/admin/dashboard`

### Why
- One-screen status of the operation: family count, student count, today's orders, billing, kitchen and delivery progress, and ordering controls. Also the place to update site-wide messages.

### What you can do
- Monitor counts for family, student, delivery, billing, menu, and kitchen operations.
- Update the homepage hero image and the chef's message.
- Update the **assistance message** shown across Family and Student hubs.
- Toggle the `ai_future_enabled` flag (controls visibility of the gAIa "Future Function" card).

### How
1. From the Admin Hub, tap **Dashboard**.
2. Review the headline counts.
3. Use the form sections to update the hero image, chef message, or assistance message.
4. Save changes inline.

### API touchpoints
- `GET /api/v1/admin/dashboard` — counts and operational summary.
- `GET /api/v1/admin/site-settings`, `PATCH /api/v1/admin/site-settings` — site messages and feature flags.
- `GET /api/v1/admin/audit-logs` — admin action audit trail.

## 2) Family

### Where
- `/schoolcatering/admin/family`

### Why
- Manage parent / family records: edit contact details, view passwords (admin reset), reassign a student to a different parent group, and remove a family.

### What you can do
- View existing family groups, usernames, linked students, and password tools.
- **Show password** action — view the parent password (admin reset, audit-logged).
- Reset the parent's password.
- Edit parent contact information (name, phone, email).
- Delete a parent — blocked when a linked youngster still exists; reassign students first.
- **Reassign student** to a different parent group — requires the student last name as a confirmation.

### How
1. From the Admin Hub, tap **Family**.
2. Search for the family by name or username.
3. Use the row actions: **Edit**, **Show Password**, **Reset Password**, **Reassign Student**, **Delete**.
4. For reassignment, enter the student last name when prompted, then choose the destination parent group.
5. Always prefer **edit** or **reassign** over asking the family to re-register.

### API touchpoints
- `GET /api/v1/admin/parents` — family list.
- `PATCH /api/v1/admin/parents/{parentId}` — edit a parent.
- `DELETE /api/v1/admin/parents/{parentId}` — delete (blocked while linked youngsters exist).
- `PATCH /api/v1/admin/users/{userId}/reset-password` — admin password reset.
- `POST /api/v1/parents/{parentId}/children/{childId}/link` — link a child to a parent group.
- `POST /api/v1/admin/families/merge` — merge two family records when needed.

## 3) Student

### Where
- `/schoolcatering/admin/student`

### Why
- Manage student (Youngster) records: add, edit, reassign, delete; reset student passwords; change which school a student is linked to.

### What you can do
- Add a student under a family.
- Edit student details: first name, last name, date of birth, grade (including **Preschool Stars (PS)** and **Preschool Rainbows (PR)**), phone, email, allergies.
- Change the linked **school** (this drives delivery and kitchen routing).
- Reset the student's password (admin reset).
- Delete a student record.

### How
1. From the Admin Hub, tap **Student**.
2. Search by name, family, or school.
3. Use row actions: **Edit**, **Reset Password**, **Delete**.
4. To change a student's school, use the school field in the edit form. Verify the new school link matches the student's actual location before saving.

### Good practice
- Use Admin Student for student corrections instead of asking users to re-register.
- Check school links before investigating delivery issues.

### API touchpoints
- `GET /api/v1/admin/children` — student list.
- `PATCH /api/v1/admin/youngsters/{youngsterId}` — edit a student.
- `DELETE /api/v1/admin/youngsters/{youngsterId}` — delete a student.
- `PATCH /api/v1/admin/youngsters/{youngsterId}/reset-password` — student password reset.
- `POST /api/v1/children/register` — register a new student under an existing family.

## 4) Schools

### Where
- `/schoolcatering/admin/schools`

### Why
- Maintain the list of schools the platform serves, plus the meal-session settings (Lunch / Snack / Breakfast availability and cutoff configuration) that the whole app obeys.

### What you can do
- Add a school (name, short name, phone, address).
- Edit a school.
- Delete a school (only when not referenced).
- Configure each meal session's settings: enabled/disabled, cutoff time, etc.

### How
1. From the Admin Hub, tap **Schools**.
2. Use **Add School** to create a new entry; fill in name, short name, phone (format `+[country][area][number]`), and address.
3. Edit an existing school inline.
4. Use the **Meal Sessions** card on the same page to enable/disable Lunch / Snack / Breakfast and set their cutoff times.

### API touchpoints
- `GET /api/v1/schools`, `POST /api/v1/admin/schools`, `PATCH /api/v1/admin/schools/{schoolId}`, `DELETE /api/v1/admin/schools/{schoolId}` — CRUD.
- `GET /api/v1/session-settings`, `GET /api/v1/admin/session-settings`, `PATCH /api/v1/admin/session-settings/{session}` — session config.

## 5) Delivery

### Where
- `/schoolcatering/admin/delivery`

### Why
- Manage delivery user accounts and the school-to-delivery-user mapping that drives every assignment.

### What you can do
- **Delivery Registration (Admin Only)** — create a delivery user, set first/last name, phone, password.
- List delivery users; toggle active / inactive.
- **Show password** action for delivery users (admin reset).
- Edit or delete a delivery user.
- Maintain **Delivery vs School Assignment** — link delivery users to schools, activate/deactivate.
- Send a notification email to delivery staff via **Send Notification Email**.
- Run **Auto Assignment** by school — the result includes per-order detail rows so you can audit the assignments.
- **Show Service Date** — load assigned orders for any specific date.
- **Show Today** — quickly load today's assignments.

### How
1. From the Admin Hub, tap **Delivery**.
2. Use **Delivery Registration** to add a new delivery user.
3. In **List Delivery Users**, toggle active state, edit, reset password, or delete.
4. In **Delivery vs School Assignment**, link delivery users to schools.
5. Tap **Auto Assignment** before the cutoff to assign drivers to all orders.
6. Tap **Show Service Date** and pick a date to review assignments for that date.
7. Use **Send Notification Email** to message delivery users when needed.

### API touchpoints
- `GET /api/v1/delivery/users`, `POST /api/v1/admin/delivery/users`, `PATCH /api/v1/admin/delivery/users/{userId}`, `PATCH /api/v1/admin/delivery/users/{userId}/deactivate`, `DELETE /api/v1/admin/delivery/users/{userId}` — delivery user CRUD.
- `POST /api/v1/admin/delivery/send-notification-email` — push the notification email.
- `GET /api/v1/delivery/school-assignments`, `POST /api/v1/delivery/school-assignments`, `DELETE /api/v1/delivery/school-assignments/{deliveryUserId}/{schoolId}` — school mapping CRUD.
- `POST /api/v1/delivery/auto-assign` — auto-assignment by school.
- `POST /api/v1/delivery/assign` — manual assignment fallback.
- `GET /api/v1/delivery/assignments` — assignments for a service date.
- `GET /api/v1/delivery/summary` — summary metrics.

## 6) Menu

### Where
- `/schoolcatering/admin/menu`

### Why
- Maintain dishes, ingredients, and dish images. The menu is the source of what families and students can order.

### What you can do
- Add, edit, activate, deactivate, and delete dishes.
- Set dish name, description, calories (kcal), category (Main / Dessert / Drinks), price, dietary flags, ingredients.
- Upload a dish image (the upload pipeline auto-converts to WebP).
- Manage the ingredients catalogue used across dishes.
- Sample-seed menus / orders for testing.

### How
1. From the Admin Hub, tap **Menu**.
2. Use the **Add Dish** form to create a new dish; required fields are name and ingredients/category.
3. Use **Upload Image** on a dish to attach the image.
4. Use the row toggle to activate/deactivate; use Edit / Delete inline.
5. Manage ingredients via the **Ingredients** section on the same page.

### API touchpoints
- `GET /api/v1/admin/menus`, `POST /api/v1/admin/menu-items`, `PATCH /api/v1/admin/menu-items/{itemId}`, `DELETE /api/v1/admin/menu-items/{itemId}` — dish CRUD.
- `POST /api/v1/admin/menu-images/upload` — image upload pipeline.
- `GET /api/v1/admin/ingredients`, `POST /api/v1/admin/ingredients`, `PATCH /api/v1/admin/ingredients/{ingredientId}`, `DELETE /api/v1/admin/ingredients/{ingredientId}` — ingredient catalogue.
- `POST /api/v1/admin/menus/sample-seed`, `POST /api/v1/admin/orders/sample-seed` — test data seeders.

## 7) Orders

### Where
- `/schoolcatering/admin/orders`

### Why
- The cross-family order view. Triage, edit, or delete any order on behalf of a family.

### What you can do
- See **Outstanding** and **Completed** order columns.
- Each card shows the student grade prominently, plus session, school, dishes, status.
- Open **Order Details** to inspect or edit any order.
- Use **Edit** to change an order on behalf of a family (rule-gated by cutoff).
- Filter by service date, school, session, status.

### How
1. From the Admin Hub, tap **Orders**.
2. Use the date and filter controls at the top.
3. Tap **Edit** on a row to open the edit modal; the modal also shows the student grade prominently.
4. Tap a row to open full Order Details.

### API touchpoints
- `GET /api/v1/parents/me/orders/consolidated` — used in family scope; admin-side equivalents are exposed through the admin order views and `GET /api/v1/orders/{orderId}` for single-order edits.
- `PATCH /api/v1/orders/{orderId}`, `DELETE /api/v1/orders/{orderId}` — admin can edit/delete any order.

## 8) Multi Orders

### Where
- `/schoolcatering/admin/multiorders`

### Why
- Bulk admin order management — useful for big batch corrections or to seed a school's week.

### What you can do
- Use the meal-plan wizard against many children/dates at once.
- Quick-reorder past orders forward in bulk.

### How
1. From the Admin Hub, tap **Multi Orders**.
2. Choose families/students and target dates.
3. Apply the wizard or quick-reorder, review the resulting draft, then confirm.

### API touchpoints
- `POST /api/v1/meal-plans/wizard`, `POST /api/v1/carts/quick-reorder`.

### Related — Create Order (top-bar button)
The Admin Hub also exposes a **Create Order** button at the top of the page that takes you to `/schoolcatering/admin/create-order`. Use it to place an order on behalf of a family by searching by name, username, school, or grade.

## 9) Billing

### Where
- `/schoolcatering/admin/billing`

### Why
- Verify every payment and keep receipts flowing. This is the human checkpoint between families uploading proof and the system issuing receipts.

### What you can do
- See **Unpaid / Pending** rows (with row counts) and **Paid / Verified** rows (with row counts).
- View the uploaded proof image.
- **Verify** or **Reject** the payment.
- **Generate** or **Regenerate** the receipt.

### How
1. From the Admin Hub, tap **Billing**.
2. In **Unpaid / Pending**, open the row.
3. Tap **View Proof** to inspect the image.
4. Tap **Verify** when the proof is acceptable; tap **Reject** otherwise (the bill returns to Unpaid).
5. Tap **Receipt** to generate or regenerate the receipt PDF.

### Common scenarios
- Proof uploaded but no receipt → still pending; verify, then generate receipt.
- Family says receipt is missing → check status; if Verified but receipt blank, regenerate.

### API touchpoints
- `GET /api/v1/admin/billing` — list every bill across families.
- `GET /api/v1/admin/billing/{billingId}/proof-image` — view proof.
- `POST /api/v1/admin/billing/{billingId}/verify` — verify or reject.
- `POST /api/v1/admin/billing/{billingId}/receipt` — generate / regenerate the receipt.

## 10) Blackout

### Where
- `/schoolcatering/admin/blackout-dates`

### Why
- Block ordering or service on selected dates (public holidays, school events, days the kitchen will not produce). Server-enforced, so families/students will not be able to place orders for those dates.

### What you can do
- Add a blackout date with a reason (e.g., "Public holiday / school event").
- Filter and view existing blackout entries.
- Delete a blackout entry.

### How
1. From the Admin Hub, tap **Blackout**.
2. Enter the date and reason; save.
3. Use the filter section to find existing entries.
4. Tap **Delete** to remove a row.

### API touchpoints
- `GET /api/v1/blackout-days`, `POST /api/v1/blackout-days`, `DELETE /api/v1/blackout-days/{id}`.

## 11) Kitchen (Admin Monitor)

### Where
- `/schoolcatering/admin/kitchen`

### Why
- Operational view of the kitchen for any service date. Lets the admin verify production matches the order lists.

### What you can do
- See **Overview** — production headline numbers including **Total Orders Complete**.
- See **Summary** — dishes by session.
- See **Dietary Alerts** — orders flagged for allergies / dietary needs.
- See **Orders** column — pending / completed.
- Pick a **Service Date** to load any day's view.

### How
1. From the Admin Hub, tap **Kitchen**.
2. Pick the service date.
3. Use the columns to monitor progress through the day.

### API touchpoints
- `GET /api/v1/kitchen/daily-summary` — daily summary used by both kitchen role and admin monitor.
- `POST /api/v1/kitchen/orders/{orderId}/complete` — toggle order completion.

## 12) Rating

### Where
- `/schoolcatering/admin/rating`

### Why
- Review the dish ratings submitted by families and students. Used to inform menu decisions.

### What you can do
- Browse ratings by dish.
- See the rating average and recent comments.

### How
1. From the Admin Hub, tap **Rating**.
2. Filter by dish or date as needed.

### API touchpoints
- `GET /api/v1/admin/menu-ratings`.

## 13) Reports

### Where
- `/schoolcatering/admin/reports`

### Why
- Operational and financial reporting: orders, revenue, billing, school and delivery filters.

### What you can do
- Open the **Revenue Dashboard** for headline financial numbers.
- Filter by date range, school, parent, delivery user, session, dish, order status, and billing status.
- Export / print the result.

### Usage tip
- Start with a broad date range, then narrow by school or session to investigate a specific issue.

### How
1. From the Admin Hub, tap **Reports**.
2. Set the date range first.
3. Apply filters.
4. Review the resulting tables and totals.

### API touchpoints
- `GET /api/v1/admin/revenue` — revenue dashboard data.
- `GET /api/v1/admin/reports` — main report dataset.

## Time Perspective — Yesterday / Today / Tomorrow / Select Date

The Admin Hub does not have day-named pages. Instead, every operational module above accepts a **Service Date** filter. Use this cheat sheet:

- **Yesterday** — In Orders, Kitchen, Delivery, and Billing, set the service date to yesterday to review what happened.
- **Today** — Default view in Dashboard, Kitchen, Delivery; today's orders in Orders.
- **Tomorrow** — In Delivery, run **Auto Assignment** for tomorrow's orders before cutoff. In Kitchen, switch the service date to tomorrow to confirm production.
- **Select Date** — Every module has a **Service Date** picker. Pick any date for retroactive review (Reports, Orders, Billing) or future planning (Delivery, Kitchen, Multi Orders).

## Maintenance Toggle (Login Disable)

In addition to the in-app modules, server operators can temporarily block all login attempts without taking the site down. Run on the server:

```bash
sudo sc-login off       # block all login attempts (HTTP 503)
sudo sc-login on        # restore normal login
sudo sc-login status    # show current state
```

While off, the auth endpoints `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/google/verify`, and `POST /api/v1/auth/google/dev` all return 503. Already-issued sessions remain valid until they naturally expire; admin and operational pages still work.

## Good Practice Checklist

- Use **Admin → Student** for student corrections instead of asking the family to re-register.
- Check **school links** before investigating delivery issues.
- Check **blackout dates** and **session cutoff** before investigating "I cannot place an order" complaints.
- Use **Reports** with a broad date first, then narrow.
- After any privileged change, the action is recorded in the **audit log** (`/admin/audit-logs`); use it for traceability.
- For billing disputes, always **View Proof** first, then verify or reject; do not generate a receipt without verifying.
