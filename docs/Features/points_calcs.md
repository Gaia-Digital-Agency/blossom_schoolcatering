# Youngster Insights Calculation Notes (`/youngsters/me/insights`)

Last verified from code: 2026-03-10

## 1) Badge Levels

### Clean Plate Club Badge
- `BRONZE`
  - `maxConsecutiveOrderDays >= 5`
- `SILVER`
  - `currentMonthOrders >= 10`
  - and consecutive-week threshold condition met
- `GOLD`
  - `currentMonthOrders >= 20`
  - and consecutive-week threshold condition met
- `PLATINUM`
  - previous month qualified at silver/gold tier
  - and current month also qualifies at silver/gold tier

## 2) Max Consecutive Order Days
- Uses unique non-cancelled `service_date` values for the youngster.
- Sort dates ascending.
- Longest streak where each subsequent date is exactly +1 day.

## 3) Max Consecutive Order Weeks
- Build week sets from non-cancelled order dates for current and previous month.
- Convert to ISO week numbers.
- Deduplicate and compute longest consecutive ISO-week streak.
- Output uses max streak across the two month windows.

## 4) Current Month Orders
- Count of non-cancelled order days in current month.
- This is effectively day-count behavior, not raw order-item count.

## 5) Birthday Countdown
- Computes next birthday from DOB and reference date.
- If birthday already passed this year, uses next year.
- Returns days until next birthday.

## 6) Current Week Metrics
- Week window: Monday to Sunday (ISO-style week window).

### Total Calories
- Sum of `order_items.quantity * COALESCE(menu_items.calories_kcal, 0)` for non-cancelled orders in week window.

### Total Orders
- Distinct order count in week window (non-cancelled).

### Total Dishes
- Sum of `order_items.quantity` in week window (non-cancelled).

## 7) Daily Calories Row
- Daily calories data is prepared from week aggregation.
- Current UI may hide or simplify this row depending on page presentation.
