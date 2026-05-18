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
