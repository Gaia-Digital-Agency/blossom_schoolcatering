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

## 8) gAIa (Coming Soon)

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
