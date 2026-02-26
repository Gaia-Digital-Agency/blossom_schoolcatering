# Delivery User Guide

## Login
- Open `/schoolcatering/delivery/login`
- Sign in with delivery credentials

## Main Delivery Page
- Open `/schoolcatering/delivery`
- Mobile-first page with vertical scrolling only (no horizontal scroll)
- Pick a `Date` and use `Past / Today / Future` quick buttons
- Click `Refresh Assignments` to reload the selected day

## Assignment Visibility Rules
- Delivery user can only see assignments mapped to their active school(s)
- Assignments are grouped by `School Name` with visible school headers
- Orders from schools not mapped to the logged-in delivery user are hidden

## Delivery Card Details
- Service date + session
- Order ID
- Youngster name
- Youngster mobile number
- Fallback rule: if youngster mobile is empty, parent mobile is shown
- Parent name
- Current delivery/confirmation status

## Complete/Undo Flow
- Button is a toggle:
- `Mark Complete` sets the assignment as delivered
- `Completed (Click to Undo)` reverts it back to assigned
- Toggle updates order + billing delivery status in sync
- Only your own assignments can be toggled

## Admin Dependency
- Admin should map school-to-delivery in `/schoolcatering/admin/delivery`
- After mapping, delivery assignments for that school become visible for the mapped delivery user
