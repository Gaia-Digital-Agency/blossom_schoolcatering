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
