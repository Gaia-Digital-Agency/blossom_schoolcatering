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
