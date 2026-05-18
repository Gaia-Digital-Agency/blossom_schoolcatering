# BSC — App Guide

Last updated: 2026-05-05

This is the umbrella guide for everyone using Blossom School Catering. It covers the public pages, registration, login, the menu, dish ratings, billing concept, contact, terms, and privacy. Each role has its own deeper guide.

## Guide Index

| File | Covers |
|---|---|
| [app_guide.md](app_guide.md) | This umbrella guide. Quick welcome (from `guide_short`), full user-facing reference (from `guide_summary`), feature matrix + role/route guards + full API surface (from `guide_features`), Terms & Privacy (from `guide_tNc`). Sections A–Q. |
| [admin_guide.md](admin_guide.md) | Admin Hub with one section per card: Dashboard, Family, Student, Schools, Delivery, Menu, Orders, Multi Orders, Billing, Blackout, Kitchen monitor, Rating, Reports. Plus Time Perspective cheat sheet, Maintenance Toggle (`sc-login`), Good Practice checklist. |
| [parent_guide.md](parent_guide.md) | Family Hub modules: Overview, Order, Multi Order, Billing, Record, Rating, Menu, gAIa. Plus Time Perspective and Common Issues. |
| [student_guide.md](student_guide.md) | Student Hub modules with the same shape as parent, scoped to a single student. |
| [kitchen_guide.md](kitchen_guide.md) | Hub Overview (read once), then Yesterday / Today / Tomorrow / Select Date — each routed to its actual page (e.g. `/kitchen/today`). |
| [delivery_guide.md](delivery_guide.md) | Same pattern as kitchen; mirrors `/delivery/yesterday\|today\|tomorrow\|select-date`. |

Every section in every role guide follows the same **where / why / what / how / API touchpoints** structure.

## Quick Welcome 

Blossom School Catering makes school meal ordering simple — register once, order anytime, from the web or WhatsApp.

### Register on the website
Visit **https://blossomcatering.online/** and tap **Register**. Fill in your family details and add your child (up to **5 students per family**). The Registration Successful card shows your usernames and passwords — keep them safe.

### Register via WhatsApp
Send a message saying **"register"** and Brian will guide you. You will need: family name, parent email, a password, and your child's school and grade. Registration takes under 2 minutes.

### Website features in one screen
- Browse the menu — view daily meals by session (Breakfast, Lunch, Snack).
- Place and manage orders — order for one or several children, edit before cutoff.
- Billing and payments — upload proof of payment, download receipts.
- Order history — full history with quick reorder.
- Family hub — manage linked students and account details.

### WhatsApp features in one screen (Brian)
- Place an order — say what you want and for which child.
- Cancel an order — ask Brian to delete an order before cutoff.
- Check today's order — "what's my order today".
- Bulk orders — order for the whole week or month in one message.
- Daily reminders — receive a morning notification of today's meals.
- Register — say "register" to create a new family account.

For help, contact your school admin or visit https://blossomcatering.online/

## A. The App at a Glance

Blossom School Catering is a school meal ordering platform powered by Blossom Steakhouse Kitchen. It is used by parents, students, school admins, kitchen staff, and delivery staff.

- Open the app: `https://blossomcatering.online/` (alternate: `https://schoolcatering.gaiada1.online`)
- API base path: `/schoolcatering/api/v1`
- After login, every role lands on its own **Hub** page:
  - Admin Hub: `/schoolcatering/admin`
  - Family (Parent) Hub: `/schoolcatering/family`
  - Student Hub: `/schoolcatering/student`
  - Kitchen Hub: `/schoolcatering/kitchen`
  - Delivery Hub: `/schoolcatering/delivery`
- Meal sessions: **Lunch**, **Snack**, **Breakfast** — the active operational session is **Lunch**.
- Roles in the system: `PARENT`, `YOUNGSTER`, `ADMIN`, `KITCHEN`, `DELIVERY`.

## B. Public Pages (No Login Needed)

- `/` and `/home` — landing page with buttons to log in and register.
- `/menu` — read-only public menu.
- `/guide` — the guide index (renders this folder).
- `/privacy-and-confidentiality` — privacy page.
- `/login` — generic login that auto-routes to the right hub.
- Role-specific logins:
  - Admin: `/admin/login`
  - Kitchen: `/kitchen/login`
  - Delivery: `/delivery/login`
  - Parent (Family): `/parent/login`
  - Student: `/youngster/login`
- Registration: `/register/youngsters`

## C. Registration

### Where
- `/schoolcatering/register/youngsters` — combined family + student registration.

### What it creates
- One family account.
- One to five student accounts under that family.
- The registrant chooses their type: **Parent/Guardian**, **Student**, or **Staff**. If **Staff** is selected, staff contact details are required. All registered students remain linked to one family.

### What you fill in for the parent
- Parent Last Name (this label replaces the older "Family Group Name")
- Parent First Name
- Parent Phone Number
- Parent Email
- Parent Password and Confirm Password

### What you fill in for each student
- Student First Name
- Student Last Name (optional)
- Date of Birth
- Grade at registration date — supported grades include **Preschool Stars (PS)** and **Preschool Rainbows (PR)** alongside the standard grades
- School (chosen from the live school list)
- Phone Number
- Email
- Allergies choice

### Rules to remember
- All contact details are required.
- Each parent and each student email must be unique.
- Each parent and each student phone number must be unique.
- A student email cannot be the same as the parent email.
- A student phone number cannot be the same as the parent phone number.

### How usernames and passwords are issued
- Parent username is auto-created as `familyName_parentName`.
- Each student username is auto-created as `familyName_studentName`.
- The parent sets the family password during registration.
- Each student gets an auto-generated password.
- The Registration Successful card shows the parent username and password and every student username and password. **Take a screenshot and keep it safely.**

### After registration
- If anything is wrong (school, name, allergies, contact), ask the school admin to fix it. Do not register a second time.

### API touchpoints (for technical readers)
- `POST /api/v1/auth/register/youngsters` — submit the registration form.
- `GET /api/v1/auth/register/schools` — fetch the live school list shown in the form.
- `POST /api/v1/auth/username/generate` — preview the auto-generated username.

## D. Logging In

- Each role has its own login page (see "Public Pages" above) and lands on its own Hub on success.
- Family and student accounts use **different** usernames — keep both safe.
- If you try to open `/admin`, `/kitchen`, etc. and you are not logged in (or are logged in as the wrong role), you will be redirected to the right login page.
- If you forget your password, use the Forgot Password flow from the login page, or contact your school admin to reset it.

### API touchpoints
- `POST /api/v1/auth/login` — username + password login.
- `POST /api/v1/auth/refresh` — silent session refresh (uses the refresh-token cookie).
- `POST /api/v1/auth/logout` — sign out.
- `GET /api/v1/auth/me` — fetch the current logged-in user.
- `POST /api/v1/auth/change-password` — self-service password change.
- `POST /api/v1/auth/password/forgot` — request a password reset.
- `POST /api/v1/auth/password/reset` — complete a password reset.
- `POST /api/v1/auth/role-check` — check whether a username belongs to a given role (used by the role-aware login flow).

## E. The Menu

### What you see
- Available dishes for the active service date and session.
- Dish name, category, description, and price.
- Dish types: **Main**, **Dessert**, and **Drinks**.

### Ordering rules tied to the menu
- One unique dish per meal line.
- Maximum 5 dishes per meal order.
- The menu can change by date and session — what you see today may differ tomorrow.

### Where to view it
- Public, no login: `/schoolcatering/menu`
- Inside Family Hub or Student Hub: tap **Menu**

### Who maintains it
- The school admin maintains the menu under `/schoolcatering/admin/menu`.

### API touchpoints
- `GET /api/v1/public/menu` — public, read-only menu (no login).
- `GET /api/v1/menus` — authenticated menu used by Family and Student hubs.
- `GET /api/v1/admin/menus` — admin menu management list.

## F. Sessions, Cutoff, Blackout, and Weekend Rules

These rules are enforced automatically by the app — there is no manual approval, the system simply blocks ordering when a rule applies.

- **Session** is the meal service window (e.g., Lunch).
- **Meal** is the order placed for one session on a specific date.
- **Dish** is one item selected into a meal (max 5 per meal, unique per line).
- **Cutoff** stops order changes after the configured daily order time.
- **Blackout** dates block ordering or service entirely (e.g., public holidays, school events).
- **Weekends** or operational policy may also block ordering on those days.

## G. Billing and Payment — Shared Concept

The detailed steps for parents and students live in [parent_guide.md](parent_guide.md) and [student_guide.md](student_guide.md). The detailed admin steps live in [admin_guide.md](admin_guide.md). These are the basics everyone should know:

### The four billing states
1. **Unpaid** — bill is due, no proof uploaded yet.
2. **Pending Verification** — proof uploaded, admin has not reviewed it yet.
3. **Verified** — admin confirmed the payment; receipt is generated.
4. **Rejected** — admin rejected the proof; the bill returns to Unpaid.

### What the family/student does
- Review unpaid and paid billing items.
- Upload a clear payment-proof image for each unpaid bill.
- Wait for admin verification.
- Open the receipt once the bill is verified.

### What the admin does
- Open `/schoolcatering/admin/billing`.
- View the proof image, then verify or reject.
- Generate or regenerate the receipt as needed.

### Common confusion
- "I uploaded proof but no receipt." — proof upload alone does not produce a receipt; the admin still needs to verify and the receipt has to be generated.

### API touchpoints
- Family/Student side:
  - `GET /api/v1/billing/parent/consolidated` — fetch all bills for the family.
  - `POST /api/v1/billing/{billingId}/proof-upload` — upload proof for one bill.
  - `POST /api/v1/billing/proof-upload-batch` — upload one proof image for several bills at once.
  - `GET /api/v1/billing/{billingId}/proof-image` — view your uploaded proof.
  - `GET /api/v1/billing/{billingId}/receipt` — open the receipt for a verified bill.
  - `POST /api/v1/billing/{billingId}/revert-proof` — "Redo" — move a pending bill back to Unpaid.
- Admin side:
  - `GET /api/v1/admin/billing` — list every bill across all families.
  - `GET /api/v1/admin/billing/{billingId}/proof-image` — view a family's proof.
  - `POST /api/v1/admin/billing/{billingId}/verify` — verify or reject the proof.
  - `POST /api/v1/admin/billing/{billingId}/receipt` — generate or regenerate the receipt.

## H. Rating Dishes

- Open `/schoolcatering/rating` after login (also reachable from the Family or Student Hub via the **Rating** card).
- Rate dishes you have eaten. Ratings help the chef improve the menu.
- Admins can review the ratings under `/schoolcatering/admin/rating`.

### API touchpoints
- `POST /api/v1/ratings` — submit a rating.
- `GET /api/v1/admin/menu-ratings` — admin view of all ratings.

## I. WhatsApp / Brian Channel

Parents can register, order, cancel, and check orders entirely through WhatsApp by chatting with **Brian**, the Blossom assistant. The web app and Brian share the same data — anything you do in WhatsApp also shows up on the website, and vice versa.

### What you can ask Brian
- Place an order — say what you want and for which child.
- Cancel an order — ask Brian to delete an order before cutoff.
- Check today's order — say "what's my order today".
- Bulk orders — order for the whole week or month in one message.
- Daily reminders — receive a morning notification of today's meals.
- Register — say "register" to start a new family account; Brian will guide you.

### Before chatting
- Have ready: family name, parent email, password, and your child's school and grade. Registration takes under two minutes.

### API touchpoints (Brian uses these against the same backend)
- `POST /api/v1/auth/register/youngsters` — register a family on user confirmation.
- `GET /api/v1/auth/register/schools` — fetch the live school list (Brian does not hardcode school IDs).
- `GET /api/v1/admin/family-context?phone=PHONE` — Brian looks up a family by phone.
- `GET /api/v1/admin/family-orders?phone=PHONE&date=YYYY-MM-DD` — Brian looks up a family's orders for a date.

## J. Contact and Assistance

- Main support channel — WhatsApp **+6285211710217**.
- Contact support for: registration problems, wrong family or student details, wrong school link, password or login problems, billing proof or receipt problems, order cutoff or blackout confusion.
- Helpful information to prepare:
  - Your role: Parent, Student, Admin, Kitchen, or Delivery.
  - Your username.
  - Student name and family group name.
  - Service date and session if the issue is about ordering.
  - A screenshot of the issue if possible.

## K. Terms and Conditions

### 1. Scope
- These terms apply to all users of the Blossom School Catering application.

### 2. Registration and accounts
- Users must provide correct family and student information.
- Family and student usernames are generated by the system.
- Registration Successful information should be kept safely.
- Admin may correct family, student, and school-link records when needed.

### 3. Ordering rules
- Orders are subject to active session availability.
- Current ordering operation is based on Lunch.
- Cutoff time, blackout dates, and weekend blocks are enforced by the system.
- A meal order allows a maximum of 5 dishes.

### 4. Menu and food information
- Dish categories may include Main, Dessert, and Drinks.
- Menu availability may change according to operations.
- Allergy information is operational guidance and should be reviewed carefully by guardians.

### 5. Billing and payment
- Billing is based on recorded orders.
- Payment proof may be reviewed before verification.
- Receipt availability depends on successful admin verification and receipt generation.

### 6. Delivery and school links
- Delivery depends on the school linked to the student profile.
- Admin may change student-school links when needed.

### 7. Acceptable use
- Do not misuse the platform.
- Do not share credentials carelessly.
- Do not upload unrelated or unlawful material.

### 8. Service availability
- The platform may be updated, blocked, or interrupted for operational, maintenance, or policy reasons.

## L. Privacy and Confidentiality

### Scope
- This policy applies to the Blossom School Catering web application for Family, Student, Admin, Kitchen, and Delivery users.

### Data used
- Account information such as name, username, phone number, and email.
- Family and student linkage data.
- Student-school linkage data for ordering and delivery.
- Order, billing, payment proof, rating, and delivery records.

### Purpose
- To provide registration, login, ordering, billing, rating, delivery, and reporting functions.
- To maintain operational accuracy and role-based access control.

### Security
- Passwords are stored as hashes (never as plain text).
- Admin actions are recorded in audit logs.
- Payment proof and other protected files are only accessible through authenticated flows.

### User responsibility
- Keep login details private.
- Keep your Registration Successful information safely.
- Contact support quickly if wrong family, student, or school details are shown.

## M. Routes and Route Guarding (technical reference)

The five roles are listed in Section A. Their route mapping is below.

### Public routes
- `/`, `/home`, `/menu`, `/guide`, `/privacy-and-confidentiality`
- `/login`, `/register`, `/register/youngsters`, `/register/parent`, `/register/delivery`
- Role logins: `/admin/login`, `/kitchen/login`, `/delivery/login`, `/parent/login`, `/youngster/login`

### Protected routes
- Parent: `/parent`, `/parents`, `/family`, `/family/*`
- Student / Youngster: `/youngster`, `/youngsters`, `/student`, `/student/*`
- Admin: `/admin`, `/admin/*`
- Kitchen: `/kitchen`, `/kitchen/*`
- Delivery: `/delivery`, `/delivery/*`

### Middleware behavior
- Missing or expired token on a protected route → redirect to that role's login.
- Wrong role on a protected route → redirect to the matching role's login.
- A logged-in user that opens a role-login page → redirect straight to their hub.

## N. Feature Matrix by Role (technical reference)

### Parent (Family Hub)
- Child selector and child-linked ordering with session/date selection.
- Cart → submit → order flow.
- Edit/delete before cutoff (rule-gated).
- Quick reorder.
- Multi-order across dates and children.
- Consolidated billing (proof upload, batch upload, view proof, redo).
- Authenticated billing-proof image view.
- Receipt view and proof revert workflow.
- Spending dashboard.

### Student (Student Hub)
- Personal weekly nutrition / insight panel.
- Badge and points calculations.
- Personal ordering and consolidated history.
- Multi-order across dates.

### Delivery (Delivery Hub)
- Assignment views grouped into pending/completed.
- Quick date filters: Yesterday/Today/Tomorrow.
- Manual service-date picker via the **Select Date** card.
- Download PDF for the selected service date (2-column layout).
- Order cards include: session, youngster full name, school, phone number, dietary allergies, status, dishes.
- Assignment completion toggle with optional note.

### Kitchen (Kitchen Hub)
- Day-specific dashboards (`yesterday`, `today`, `tomorrow`).
- Manual **Select Date** picker that loads the selected service date immediately.
- Overview, dish summary, dietary alerts, pending/completed order columns.
- "Total Orders Complete" shown in overview.
- Download PDF (2-column layout) and Download CSV.
- Toggle kitchen completion per order.

### Admin (Admin Hub)
- Dashboard, reports, schools, sessions, blackout dates, menu, ingredients, billing, kitchen monitor.
- Family management: edit, reassign student to a different parent group (requires student last name), show password, delete (blocked when a linked youngster exists).
- Student management: create / edit / delete, password reset.
- Delivery management: user CRUD + active/inactive toggle, show password (admin reset), school mapping CRUD + activate/deactivate, **Send Notification Email** in the Delivery vs School Assignment card, auto-assignment by school (with per-order detail rows), **Show Service Date** to load assignments for any date.
- Admin kitchen overview includes "Total Orders Complete".
- Admin can create an order on behalf of a family via **Create Order**.

## O. Authentication and Session (technical reference)

- Access token + refresh token model.
- Refresh token in HttpOnly cookie.
- Silent refresh on API 401 responses.
- Role guards live in middleware **and** at the API guard layers.
- Admin reset-password endpoint supports `PARENT`, `YOUNGSTER`, and `DELIVERY`.

## P. Full API Surface (technical reference)

Base path: `/api/v1`. Endpoints below omit it for readability.

### Auth (`/auth`)
- `POST /login`
- `POST /register`
- `GET /register/schools`
- `POST /register/youngsters`
- `POST /google/dev`
- `POST /google/verify`
- `GET /me`
- `POST /refresh`
- `POST /username/generate`
- `GET /onboarding`
- `POST /onboarding`
- `POST /role-check`
- `POST /logout`
- `POST /change-password`
- `POST /password/forgot`
- `POST /password/reset`
- `GET /admin-ping`

### Public (`/public`)
- `GET /menu`

### Schools, sessions, site settings
- `GET /schools`
- `POST /admin/schools`
- `PATCH /admin/schools/{schoolId}`
- `DELETE /admin/schools/{schoolId}`
- `GET /admin/site-settings`
- `PATCH /admin/site-settings`
- `GET /admin/session-settings`
- `GET /session-settings`
- `PATCH /admin/session-settings/{session}`

### Parent / Youngster management
- `POST /children/register`
- `GET /admin/parents`
- `PATCH /admin/parents/{parentId}`
- `DELETE /admin/parents/{parentId}`
- `GET /admin/children`
- `PATCH /admin/youngsters/{youngsterId}`
- `DELETE /admin/youngsters/{youngsterId}`
- `PATCH /admin/users/{userId}/reset-password`
- `PATCH /admin/youngsters/{youngsterId}/reset-password`
- `GET /children/me`
- `GET /youngsters/me/insights`
- `GET /youngsters/me/orders/consolidated`
- `GET /parents/me/children/pages`
- `POST /parents/{parentId}/children/{childId}/link`

### Dashboard / reports / audit
- `GET /admin/dashboard`
- `GET /admin/revenue`
- `GET /admin/reports`
- `GET /admin/audit-logs`

### Blackout
- `GET /blackout-days`
- `POST /blackout-days`
- `DELETE /blackout-days/{id}`

### Ingredients / menu / ratings
- `GET /admin/ingredients`
- `POST /admin/ingredients`
- `PATCH /admin/ingredients/{ingredientId}`
- `DELETE /admin/ingredients/{ingredientId}`
- `GET /admin/menus`
- `GET /admin/menu-ratings`
- `POST /admin/menus/sample-seed`
- `POST /admin/orders/sample-seed`
- `POST /admin/menu-items`
- `PATCH /admin/menu-items/{itemId}`
- `DELETE /admin/menu-items/{itemId}`
- `POST /admin/menu-images/upload`
- `POST /ratings`

### Menus / favourites / carts / orders
- `GET /menus`
- `GET /favourites`
- `POST /favourites`
- `DELETE /favourites/{favouriteId}`
- `POST /favourites/{favouriteId}/apply`
- `POST /carts/quick-reorder`
- `POST /meal-plans/wizard`
- `GET /carts`
- `POST /carts`
- `GET /carts/{cartId}`
- `PATCH /carts/{cartId}/items`
- `DELETE /carts/{cartId}`
- `POST /carts/{cartId}/submit`
- `GET /orders/{orderId}`
- `PATCH /orders/{orderId}`
- `DELETE /orders/{orderId}`
- `GET /parents/me/orders/consolidated`
- `GET /parents/me/spending-dashboard`

### Billing
- `GET /billing/parent/consolidated`
- `POST /billing/{billingId}/proof-upload`
- `POST /billing/proof-upload-batch`
- `GET /billing/{billingId}/proof-image`
- `GET /billing/{billingId}/receipt`
- `POST /billing/{billingId}/revert-proof`
- `GET /admin/billing`
- `GET /admin/billing/{billingId}/proof-image`
- `POST /admin/billing/{billingId}/verify`
- `POST /admin/billing/{billingId}/receipt`

### Delivery
- `GET /delivery/users`
- `POST /admin/delivery/users`
- `PATCH /admin/delivery/users/{userId}/deactivate`
- `PATCH /admin/delivery/users/{userId}`
- `DELETE /admin/delivery/users/{userId}`
- `POST /admin/delivery/send-notification-email`
- `GET /delivery/school-assignments`
- `POST /delivery/school-assignments`
- `DELETE /delivery/school-assignments/{deliveryUserId}/{schoolId}`
- `POST /delivery/auto-assign`
- `POST /delivery/assign`
- `GET /delivery/assignments`
- `GET /delivery/summary`
- `POST /delivery/assignments/{assignmentId}/confirm`
- `PATCH /delivery/assignments/{assignmentId}/toggle`

### Kitchen
- `GET /kitchen/daily-summary`
- `POST /kitchen/orders/{orderId}/complete`

### Brian / OpenClaw bridge
- `GET /admin/family-context?phone=PHONE`
- `GET /admin/family-orders?phone=PHONE&date=YYYY-MM-DD`
- `POST /admin/families/merge`

### System
- `GET /health`
- `GET /ready`
- `GET /api/v1/health`
- `GET /api/v1/ready`

## Q. Other Useful Notes

- Family and student contact details must be unique where required by registration rules.
- Student email cannot be the same as the parent email.
- Student phone number cannot be the same as the parent phone number.
- If family, student, school, or password details are wrong, contact support or the school admin.
- For assistance please WhatsApp **+6285211710217**.
- Server-side enforcement applies to cutoff / session / blackout / order-state transitions — the UI mirrors this but the API is the source of truth.
- Error and disabled-state conventions are consistent across operational pages: errors appear inline in **bold red** at the position of the action.


<div style="page-break-after: always;"></div>

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


<div style="page-break-after: always;"></div>

# Kitchen User Guide

Last updated: 2026-05-05

The Kitchen Hub is for production staff. After login, it presents four day cards — **Yesterday**, **Today**, **Tomorrow**, and **Select Date** — each opening the same dashboard scoped to that service date. The dashboard shows everything you need to plan and execute production.

- Login: `/schoolcatering/kitchen/login`
- Hub: `/schoolcatering/kitchen`
- Audience: kitchen production team.
- Operational ordering session: **Lunch**.

## Hub Overview (read once, applies to every day section)

The hub grid contains four cards:

- **Yesterday** → `/schoolcatering/kitchen/yesterday`
- **Today** → `/schoolcatering/kitchen/today` (active by default)
- **Tomorrow** → `/schoolcatering/kitchen/tomorrow`
- **Select Date** → `/schoolcatering/kitchen/select-date`

Each card opens the same kitchen dashboard, just bound to a different service date. The dashboard contains:

- **Overview** — headline numbers including **Total Orders Complete**.
- **Summary** — dish breakdown by session.
- **Dietary Alerts** — flagged orders requiring allergy / dietary attention.
- **Orders** — pending and completed columns; toggle completion per order.
- **Download PDF** — 2-column production list.
- **Download CSV** — same data in spreadsheet format.

There is also a top **Return** link for navigating back to the hub.

### How to log in and reach a day view
1. Open `/schoolcatering/kitchen/login`.
2. Enter your kitchen username and password.
3. You land on the Kitchen Hub.
4. Tap the day card you want, or tap **Select Date** to choose any other date.

### API touchpoints (used by every day view)
- `GET /api/v1/kitchen/daily-summary?date=YYYY-MM-DD` — production data for that service date.
- `POST /api/v1/kitchen/orders/{orderId}/complete` — toggle completion for one order.

## 1) Yesterday

### Where
- `/schoolcatering/kitchen/yesterday`

### Why
- Quick retrospective of yesterday's production — what was prepared, what was completed, and which dietary alerts came up. Useful for handover or post-shift review.

### What you can do
- Review yesterday's overview, dish summary, dietary alerts, and order columns.
- Download yesterday's PDF or CSV for handover or audit.
- Mark a missed order as completed if it was actually delivered (rare correction case).

### How
1. From the Kitchen Hub, tap **Yesterday**.
2. Review the columns; the page is read-only-feeling but completion toggles are still available for corrections.
3. Tap **Download PDF** or **Download CSV** if a record is needed.

## 2) Today

### Where
- `/schoolcatering/kitchen/today`

### Why
- The live production view. This is where the kitchen actually works during service hours.

### What you can do
- See the live overview and dish summary for today.
- Watch dietary alerts to plan allergy-safe production.
- Toggle each order to **completed** as it leaves the kitchen.
- Download today's PDF (2-column) for printing.
- Download today's CSV for tracking sheets.

### How
1. From the Kitchen Hub, tap **Today** (also the default active card).
2. Use **Overview** and **Summary** to plan your batches.
3. Check **Dietary Alerts** before starting allergy-restricted production.
4. As each order leaves the kitchen, tap the row to toggle it to **completed**. The **Total Orders Complete** count in **Overview** updates live.
5. Print **Download PDF** for the line; export **Download CSV** if your tracking sheet needs raw data.

## 3) Tomorrow

### Where
- `/schoolcatering/kitchen/tomorrow`

### Why
- Forward planning. Once cutoff has passed, tomorrow's order list is essentially final and the kitchen can pre-stage production.

### What you can do
- Read tomorrow's confirmed orders and dish counts.
- Spot dietary alerts ahead of time so ingredients can be prepared.
- Print **Download PDF** to brief the morning shift.
- Export **Download CSV** for prep sheets.

### How
1. From the Kitchen Hub, tap **Tomorrow**.
2. Review the dish summary and dietary alerts.
3. Print or export the production sheets for the next morning.
4. Avoid completing orders here — completion belongs on the **Today** view when the meal actually leaves.

## 4) Select Date

### Where
- `/schoolcatering/kitchen/select-date`

### Why
- For any other service date — last week's audit, a future special-event date, or a date the school admin has flagged for review. The **Select Date** picker loads the chosen date immediately.

### What you can do
- Pick any service date.
- See exactly the same dashboard as Yesterday / Today / Tomorrow, but for the date you choose.
- Download PDF or CSV for the chosen date.
- Toggle order completion if you are correcting a record.

### How
1. From the Kitchen Hub, tap **Select Date**.
2. Pick the date in the date picker — the dashboard reloads.
3. Use the same Overview / Summary / Dietary Alerts / Orders sections as the other day views.

## Common Notes

- Kitchen output depends on confirmed student-school orders; orders still in draft are not shown.
- The current operational ordering session is **Lunch**.
- Order cards show the student grade prominently — useful for portion sizing and routing.
- If an expected order is missing, the most likely causes are: the family did not confirm, the date is a blackout date, or the school is not linked correctly. Refer the issue to the school admin.
- Errors appear inline in **bold red** at the position of the failed action.


<div style="page-break-after: always;"></div>

# Delivery User Guide

Last updated: 2026-05-05

The Delivery Hub is for delivery staff. After login it presents four day cards — **Yesterday**, **Today**, **Tomorrow**, and **Select Date** — each opening the same delivery dashboard scoped to that service date.

- Login: `/schoolcatering/delivery/login`
- Hub: `/schoolcatering/delivery`
- Audience: delivery riders / driver team.

## Hub Overview (read once, applies to every day section)

The hub grid contains four cards:

- **Yesterday** → `/schoolcatering/delivery/yesterday`
- **Today** → `/schoolcatering/delivery/today` (active by default)
- **Tomorrow** → `/schoolcatering/delivery/tomorrow`
- **Select Date** → `/schoolcatering/delivery/select-date`

Each card opens the same delivery dashboard bound to a different service date. The dashboard shows assignments grouped into **Pending** and **Completed**. Each order card includes:

- Session
- Youngster full name and **grade**
- School and school short name
- Phone number
- Dietary allergies
- Status (pending / completed)
- Dishes

The dashboard supports:

- **Download PDF** — 2-column delivery list for the chosen service date.
- **Mark Complete** — completion toggle, with optional note.
- A top **Return** link to go back to the hub.

### How to log in and reach a day view
1. Open `/schoolcatering/delivery/login`.
2. Enter your delivery username and password.
3. You land on the Delivery Hub.
4. Tap the day card you want, or tap **Select Date** to choose any other date.

### How assignments reach you
- Assignments come from the school-to-delivery-user mapping maintained by admin.
- Admin can run **Auto Assignment** (per school) which is what most days use, or assign manually.
- If a school is not mapped to you, its orders will not appear here — refer to admin.

### API touchpoints (used by every day view)
- `GET /api/v1/delivery/assignments?date=YYYY-MM-DD` — your assignments for the service date.
- `GET /api/v1/delivery/summary` — summary metrics (totals, pending vs completed).
- `POST /api/v1/delivery/assignments/{assignmentId}/confirm` — confirm an assignment.
- `PATCH /api/v1/delivery/assignments/{assignmentId}/toggle` — toggle completion (with optional note).

## 1) Yesterday

### Where
- `/schoolcatering/delivery/yesterday`

### Why
- Retrospective of yesterday's runs — useful for handover, audit, and confirming any late completions.

### What you can do
- Review yesterday's pending and completed lists.
- Toggle a missed completion if a delivery was actually made but not marked.
- Download the PDF list for record-keeping.

### How
1. From the Delivery Hub, tap **Yesterday**.
2. Review the rows; toggle completion for any correction.
3. Tap **Download PDF** to keep a copy.

## 2) Today

### Why
- The live operational view. This is where you actually work during deliveries.

### Where
- `/schoolcatering/delivery/today`

### What you can do
- See today's pending and completed orders, grouped by school.
- Open each order card to see student name, grade, school, phone, dietary allergies, and dishes.
- **Mark Complete** with an optional note (e.g., "left at security desk").
- Download the day's PDF list to take on the road.

### How
1. From the Delivery Hub, tap **Today** (default active card).
2. Tap **Download PDF** to print or screenshot the day's list.
3. As you complete each delivery, open the row and tap **Mark Complete** (add a short note if relevant).
4. The **Pending** and **Completed** counts update live.

## 3) Tomorrow

### Where
- `/schoolcatering/delivery/tomorrow`

### Why
- Forward visibility. After cutoff, tomorrow's list is essentially final, so you can plan the route, transport, and load.

### What you can do
- Read tomorrow's confirmed assignments grouped by school.
- Download the PDF list for tomorrow's route briefing.
- Avoid marking completions here — completion belongs on the **Today** view when delivery actually happens.

### How
1. From the Delivery Hub, tap **Tomorrow**.
2. Print or screenshot the PDF list.
3. Plan your route by school clusters.

## 4) Select Date

### Where
- `/schoolcatering/delivery/select-date`

### Why
- For any other service date — last week's audit, a future special-event date, or a date that admin has flagged. The **Select Date** picker loads the chosen date immediately.

### What you can do
- Pick any service date.
- See the same dashboard as the other day views, scoped to your selection.
- Download PDF for the chosen date.
- Toggle completion if you are correcting an old record.

### How
1. From the Delivery Hub, tap **Select Date**.
2. Pick the date — the dashboard reloads.
3. Use the same pending/completed columns and PDF action.

## Common Notes

- Delivery assignments depend on the **student-school link** (maintained by admin) **and** the **school-to-delivery mapping** (also admin).
- If an expected delivery is missing, the most likely causes are: the order was never confirmed, the school is not mapped to you, or the date is a blackout. Refer to admin.
- Use the **note** field on completion to record useful context (security desk, parent collected, etc.).
- Errors appear inline in **bold red** at the position of the failed action.


<div style="page-break-after: always;"></div>

# Parent (Family) User Guide

Last updated: 2026-05-05

The Family Hub is your home page after logging in as a parent. Everything you do — placing meal orders, paying bills, downloading receipts, rating dishes, browsing the menu — starts from here.

- Login: `/schoolcatering/parent/login`
- Hub: `/schoolcatering/family`
- Audience: parents and guardians who are listed as the family contact.

When you log in, the hub greets you with **"Logged In as {first name}"** and shows a grid of cards that take you into each module: **Overview, Order, Multi Order, Billing, Record, Rating, Menu, gAIa**. The sections below cover each card in turn.

## 1) Overview

### Where
- `/schoolcatering/family/overview`

### Why
- A summary of your linked students and today's situation: who is in the family, today's confirmed orders, today's billing snapshot, and the nutrition/badge highlights.

### What you can do
- See the list of students linked to your family.
- See today's order at a glance.
- Use the assistance message and quick contact info displayed on the page.

### How
1. From the Family Hub, tap **Overview**.
2. Review the linked students and today's status.
3. If anything is wrong (missing student, wrong school), contact admin — do not re-register.

### API touchpoints
- `GET /api/v1/auth/me` — your account info.
- `GET /api/v1/parents/me/children/pages` — the parent's children, paged.
- `GET /api/v1/parents/me/orders/consolidated` — today + past order summary.
- `GET /api/v1/admin/site-settings` — the assistance message and other site-wide messages.

## 2) Order — single child, single date

### Where
- `/schoolcatering/family/order`

### Why
- Place a meal order for one student on one service date. This is the most common everyday flow.

### What you can do
- Pick the child, the service date, and the session (currently **Lunch**).
- Browse the menu for that date and add up to **5 unique** dishes.
- Save as a draft, then submit when ready.
- Edit or delete an order **before cutoff** if rules still allow it.
- Use **Quick Reorder** to clone a past order onto a new date.
- Use **Favourites** to save a frequently-ordered combination and apply it later.

### How
1. From the Family Hub, tap **Order**.
2. Select the youngster from the dropdown.
3. Pick the **service date** and **session**.
4. Tap dishes to add them to the draft cart (max 5 distinct items, one line each).
5. Adjust quantities.
6. Tap **Place Order** when done.
7. To change a placed order: open it from **Record** and use **Edit Before Cutoff** or **Delete Before Cutoff**.
8. To clone a past order: open the relevant past order and tap **Quick Reorder**, then choose the new date.

### Rules
- Orders are linked to one selected student.
- Maximum 5 dishes per meal order; one unique dish per line.
- The system blocks ordering once **cutoff time**, **blackout date**, **weekend rule**, or an **inactive session** applies — that is by design, not a bug.
- A duplicate active order for the same child/date/session is blocked.
- If an action fails, the error appears inline in **bold red** at the same place on the page.

### API touchpoints
- `GET /api/v1/menus` — menu data for the chosen date.
- `GET /api/v1/carts`, `POST /api/v1/carts`, `GET /api/v1/carts/{cartId}`, `PATCH /api/v1/carts/{cartId}/items`, `DELETE /api/v1/carts/{cartId}`, `POST /api/v1/carts/{cartId}/submit` — cart and submit flow.
- `GET /api/v1/orders/{orderId}`, `PATCH /api/v1/orders/{orderId}`, `DELETE /api/v1/orders/{orderId}` — view/edit/delete an order.
- `GET /api/v1/favourites`, `POST /api/v1/favourites`, `DELETE /api/v1/favourites/{favouriteId}`, `POST /api/v1/favourites/{favouriteId}/apply` — saved favourites.
- `POST /api/v1/carts/quick-reorder` — clone a past order onto a new date.

## 3) Multi Order — many dates and/or many children at once

### Where
- `/schoolcatering/family/multiorder`

### Why
- Order a whole week or month in one flow, or order for multiple children at once. Avoids placing each meal one by one.

### What you can do
- Select more than one child and multiple service dates.
- Apply a meal-plan wizard that fills several days using the same dish set.
- Review and confirm the bulk order.

### How
1. From the Family Hub, tap **Multi Order**.
2. Choose the children to include.
3. Choose the date range or specific dates.
4. Pick dishes to apply (still capped at 5 unique dishes per meal).
5. Review the generated draft, adjust if needed, and confirm.

### API touchpoints
- `POST /api/v1/meal-plans/wizard` — drives the bulk plan generation.
- `POST /api/v1/carts/quick-reorder` — used when seeding from a previous order.

## 4) Billing

### Where
- `/schoolcatering/family/billing`

### Why
- See every bill that belongs to your family, upload payment proofs, monitor verification, and download receipts.

### What you can do
- Review **Unpaid** bills (ready to pay).
- Review **Paid Bills (Past 30 Days)** with proof and receipt links.
- Upload a single proof image for one bill, or one image for **several bills at once** (batch upload).
- Use **View Proof Image** to confirm what was uploaded.
- Use **Redo (Move to Unpaid)** while a bill is still in pending verification, in case the wrong proof was sent.
- Open the receipt once a bill is **Verified**.

### Billing status flow
1. **Unpaid** — bill is due, no proof yet.
2. **Pending Verification** — proof uploaded, awaiting admin review.
3. **Verified** — admin approved, receipt available.
4. **Rejected** — admin rejected the proof; the bill returns to Unpaid.

### How
1. From the Family Hub, tap **Billing**.
2. In **Unpaid**, tick the rows you want to pay together.
3. Tap **Upload Proof** and choose a clear image of the transfer / receipt.
4. Wait for admin verification (status shows **Pending Verification** in the meantime).
5. When status becomes **Verified**, tap **Receipt** to open the PDF.
6. If you uploaded the wrong image, tap **Redo (Move to Unpaid)** while still pending, then re-upload.

### API touchpoints
- `GET /api/v1/billing/parent/consolidated` — all bills across the family.
- `POST /api/v1/billing/{billingId}/proof-upload` — single-bill proof upload.
- `POST /api/v1/billing/proof-upload-batch` — multi-bill proof upload.
- `GET /api/v1/billing/{billingId}/proof-image` — view what was uploaded.
- `GET /api/v1/billing/{billingId}/receipt` — open the receipt PDF.
- `POST /api/v1/billing/{billingId}/revert-proof` — "Redo" while pending.

## 5) Record (Order History)

### Where
- `/schoolcatering/family/consolorder`

### Why
- The complete history of orders across all your children — past, today, and any future placed orders.

### What you can do
- Filter by child, date, session, or status.
- Open any order to see the dishes, the school, the delivery status, and the linked bill.
- Use **Quick Reorder** from a past order to clone it onto a new date.
- See your **Spending Dashboard** with totals by child, date, and dish.

### How
1. From the Family Hub, tap **Record**.
2. Use the filters at the top to narrow the list.
3. Tap a row to open the full order details.
4. From a past order, tap **Quick Reorder** to copy it forward.

### API touchpoints
- `GET /api/v1/parents/me/orders/consolidated` — full order history.
- `GET /api/v1/parents/me/spending-dashboard` — spending totals.
- `POST /api/v1/carts/quick-reorder` — clone an order.

## 6) Rating

### Where
- `/schoolcatering/rating` (also linked from the Family Hub **Rating** card).

### Why
- Tell the chef what the family thinks of each dish. Ratings help the chef and admin improve the menu.

### What you can do
- Rate dishes you have eaten.
- See past ratings.

### How
1. From the Family Hub, tap **Rating**.
2. Pick a dish.
3. Submit your rating.

### API touchpoints
- `POST /api/v1/ratings` — submit a rating.

## 7) Menu

### Where
- `/schoolcatering/menu` (public) or via the Family Hub **Menu** card.

### Why
- Browse the available dishes before you build an order.

### What you can do
- View dish names, categories (Main, Dessert, Drinks), descriptions, and prices.
- Note allergies and dietary flags before adding to your order.

### How
1. From the Family Hub, tap **Menu**.
2. Scroll to view today's offering. The order page is where you actually place an order.

### API touchpoints
- `GET /api/v1/public/menu` — the public, read-only menu.
- `GET /api/v1/menus` — the authenticated, day-and-session menu used inside the hub.

## 8) gAIa (Coming Soon)

### Where
- `/schoolcatering/family/gaia` — currently shown as a "Future Function" card.

### Why
- Reserved for AI-assisted recommendations such as suggested meal plans by allergy, age, or past preferences.

### What you can do
- Visit when the feature is enabled — until then the card displays the disabled message **"Future Function"**.

### How
- Wait for the school admin to enable the **AI future** feature flag in site settings.

### API touchpoints
- Surfaces gated behind the `ai_future_enabled` flag in `GET /api/v1/admin/site-settings`.

## Time Perspective — Yesterday / Today / Tomorrow / Select Date

The Family Hub does not have day-named pages like the Kitchen or Delivery hubs do; instead, each module above lets you choose a date. Use this cheat sheet:

- **Yesterday** — open **Record** to see what was ordered and delivered yesterday, and **Billing** to see any bill that came out of it.
- **Today** — open **Overview** for today's order, or **Record** filtered to today's date.
- **Tomorrow** — open **Order** with tomorrow's date selected (cutoff and blackout still apply).
- **Select Date** — open **Order** for a single date, or **Multi Order** for many dates at once.

## Common Issues and Fixes

- **"I cannot place an order for tomorrow."** — cutoff has likely passed, or tomorrow is a blackout/weekend. Check the date picker — blocked dates are flagged.
- **"My child does not appear in the dropdown."** — the student is not linked to your family. Contact admin.
- **"I cannot upload proof."** — confirm the bill is still **Unpaid**. If it is **Pending Verification**, use **Redo** first.
- **"My order is missing in the kitchen list."** — confirm the order is **Confirmed** (not still in draft) and that the service date is correct.
- **"Wrong school on my child's profile."** — admin must change it from the admin panel.


<div style="page-break-after: always;"></div>

# Student User Guide

Last updated: 2026-05-05

The Student Hub is your home page after logging in as a student (Youngster). It mirrors the Family Hub but is scoped to **you only** — your own orders, your own billing view, your own rating, your own nutrition insights.

- Login: `/schoolcatering/youngster/login`
- Hub: `/schoolcatering/student`
- Audience: students who have their own login.

When you log in, the hub greets you with **"Logged In as {first name} ({school})"** and shows a grid of cards: **Overview, Order, Multi Order, Billing, Record, Rating, Menu, gAIa**.

> **Important difference from the Family Hub:** the parent on your account always sees and pays for your bills. You can view billing on your side, but verification is done in the family flow. If something is wrong with your profile (school, name, allergies), contact admin — do not register again.

## 1) Overview

### Where
- `/schoolcatering/student/overview`

### Why
- Your personal dashboard: today's order, points and badges, weekly nutrition insight, and the assistance message.

### What you can do
- See today's confirmed order at a glance.
- See your weekly nutrition / insight panel.
- See points and badge totals (these are calculated from your eating history and dish ratings).

### How
1. From the Student Hub, tap **Overview**.
2. Review today's status and the nutrition panel.

### API touchpoints
- `GET /api/v1/auth/me` — your account info.
- `GET /api/v1/children/me` — your student profile (name, school).
- `GET /api/v1/youngsters/me/insights` — weekly nutrition insights.
- `GET /api/v1/youngsters/me/orders/consolidated` — your order history.

## 2) Order — single date

### Where
- `/schoolcatering/student/order`

### Why
- Place a meal order for yourself on one service date.

### What you can do
- Pick the service date and session (currently **Lunch**).
- Browse the menu and add up to **5 unique** dishes per meal.
- Save as a draft, then submit when ready.
- Edit or delete an order **before cutoff** if rules still allow it.

### How
1. From the Student Hub, tap **Order**.
2. Pick the service date and session.
3. Tap dishes to add them to the draft.
4. Adjust quantities (max 5 distinct items, one line each).
5. Tap **Place Order**.
6. To change a placed order: open it from **Record** and use **Edit Before Cutoff** or **Delete Before Cutoff**.

### Rules
- Maximum 5 dishes per meal order; one unique dish per line.
- Ordering is blocked by **cutoff**, **blackout dates**, **weekend rules**, and **inactive sessions**.
- Profile or school-link corrections must go through admin.

### API touchpoints
- `GET /api/v1/menus` — menu for the chosen date.
- `GET /api/v1/carts`, `POST /api/v1/carts`, `PATCH /api/v1/carts/{cartId}/items`, `POST /api/v1/carts/{cartId}/submit` — cart and submit flow.
- `GET /api/v1/orders/{orderId}`, `PATCH /api/v1/orders/{orderId}`, `DELETE /api/v1/orders/{orderId}` — manage a placed order.

## 3) Multi Order — many dates at once

### Where
- `/schoolcatering/student/multiorder`

### Why
- Place orders for several dates in one flow (a whole week or a custom date list).

### What you can do
- Pick a range of dates or specific dates.
- Apply a meal-plan wizard to fill the dates with the same dish set.
- Review the bulk order and submit.

### How
1. From the Student Hub, tap **Multi Order**.
2. Pick the dates.
3. Pick the dishes (still 5-per-meal cap).
4. Review the draft, adjust if needed, submit.

### API touchpoints
- `POST /api/v1/meal-plans/wizard` — drives the bulk plan generation.
- `POST /api/v1/carts/quick-reorder` — used when seeding from a previous order.

## 4) Billing

### Where
- `/schoolcatering/student/billing`

### Why
- See bills connected to your orders. Most students will use this to **view** status; the parent uploads proof and gets the receipt.

### What you can do
- See **Unpaid** and **Paid (Past 30 Days)** bills.
- Open the receipt for verified bills.
- Confirm the proof image already uploaded by the parent.

### Billing status flow
1. **Unpaid** → 2. **Pending Verification** → 3. **Verified** or **Rejected**.

### How
1. From the Student Hub, tap **Billing**.
2. Browse the lists. Use **View Proof Image** to confirm what the parent uploaded.
3. Tap **Receipt** when a row is verified to open the PDF.

### API touchpoints
- `GET /api/v1/billing/parent/consolidated` — bills across the family (you see only your own rows).
- `GET /api/v1/billing/{billingId}/proof-image` — view the proof image.
- `GET /api/v1/billing/{billingId}/receipt` — open the receipt for a verified bill.

## 5) Record (Order History)

### Where
- `/schoolcatering/student/consolorder`

### Why
- Your full personal order history.

### What you can do
- Filter by date, session, or status.
- Open any order to see the dishes, the delivery status, and the linked bill.
- See a personal **Spending Dashboard** for totals.

### How
1. From the Student Hub, tap **Record**.
2. Filter as needed.
3. Tap a row for full details.

### API touchpoints
- `GET /api/v1/youngsters/me/orders/consolidated` — your full history.

## 6) Rating

### Where
- `/schoolcatering/rating` (also linked from the Student Hub **Rating** card).

### Why
- Tell the chef what you thought of each dish.

### What you can do
- Rate dishes you have eaten.

### How
1. From the Student Hub, tap **Rating**.
2. Choose a dish, give it a rating, submit.

### API touchpoints
- `POST /api/v1/ratings` — submit a rating.

## 7) Menu

### Where
- `/schoolcatering/menu` (public) or via the Student Hub **Menu** card.

### Why
- Browse before you order.

### What you can do
- View dish names, categories (**Main**, **Dessert**, **Drinks**), descriptions, prices, and any dietary flags.

### How
1. Tap **Menu** from the hub.
2. Look at the date and session shown above the list.

### API touchpoints
- `GET /api/v1/public/menu`, `GET /api/v1/menus`.

## 8) gAIa 

### Where
- `/schoolcatering/student/gaia` — currently a "Future Function" card.

### Why
- Reserved for AI-assisted personal recommendations (e.g., balanced-meal suggestions based on your insights).

### What you can do
- Wait for the feature to be turned on.

### How
- The card is enabled by an admin via the `ai_future_enabled` site-settings flag.

## Time Perspective — Yesterday / Today / Tomorrow / Select Date

The Student Hub does not have day-named pages like Kitchen or Delivery; each module above lets you choose a date. Use this cheat sheet:

- **Yesterday** — open **Record** filtered to yesterday for what was eaten; **Billing** to see any bill that came out of it.
- **Today** — open **Overview** for today's order, or **Record** filtered to today.
- **Tomorrow** — open **Order** with tomorrow's date (cutoff and blackout still apply).
- **Select Date** — open **Order** for one date or **Multi Order** for several.

## Common Issues and Fixes

- **"I cannot place an order for tomorrow."** — cutoff has likely passed, or tomorrow is a blackout/weekend.
- **"My school is wrong on my profile."** — only admin can change it. Contact admin.
- **"I cannot see my receipt."** — the bill is probably still **Pending Verification** or **Unpaid**. Ask the parent to upload proof or wait for the admin to verify.
- **"My points / badges look wrong."** — points are calculated from your eating history and dish ratings; recent changes may take a moment to refresh.
