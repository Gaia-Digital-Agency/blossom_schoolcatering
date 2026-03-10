# How each Youngster Points Insight is calculated (`/youngsters/me/insights`)

## Clean Plate Club Badges

- `BRONZE`:
  - `maxConsecutiveOrderDays >= 5`
- `SILVER`:
  - `currentMonthOrders >= 10` and `currentMonthConsecutiveWeeks >= 2`
- `GOLD`:
  - `currentMonthOrders >= 20` and `currentMonthConsecutiveWeeks >= 2`
- `PLATINUM`:
  - Previous month met Silver or Gold condition
  - AND current month meets Silver or Gold condition

## Max consecutive order days: 

- Built from unique `service_date` values of non-cancelled orders for the youngster (70-day lookback window).
- Sort dates ascending.
- Longest streak where each next date is exactly +1 day.

## Max consecutive order weeks: 

- Collect order dates (non-cancelled) for current month and previous month.
- For each month:
  - Convert each order date to ISO week number.
  - Deduplicate week numbers.
  - Compute longest consecutive ISO-week streak.
- Final value shown:
  - `max(currentMonthConsecutiveWeeks, previousMonthConsecutiveWeeks)`

## Current month orders: 

- Count of non-cancelled unique order dates (`service_date`) in current month.
- This is effectively "ordered days this month", not raw order-item count.

## Birthday in: 

- Compute next birthday date using youngster DOB and reference date.
- If this year’s birthday already passed, use next year.
- Return:
  - `ceil((nextBirthday - referenceDate) in days)`

## Current Week

- Week start = Monday of reference date (ISO week).
- Week end = week start + 6 days.

### Total Calories: 

- For non-cancelled orders in week range:
  - Sum `order_items.quantity * COALESCE(menu_items.calories_kcal, 0)`

### Total Orders: 

- `COUNT(DISTINCT orders.id)` for youngster in week range, non-cancelled.

### Total Dishes: 

- `SUM(order_items.quantity)` for youngster in week range, non-cancelled.

## Daily calories row

- Generated from per-day week data (`service_date -> calories_display`).
- UI Hidden for later use
