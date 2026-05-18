# Blossom School Catering — App Guide

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

## Quick Welcome (good for sharing with new users)

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
