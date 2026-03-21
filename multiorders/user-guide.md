# Multi Order User Guide

## What Multi Order Does

Multi Order lets you plan repeated Breakfast, Snack, or Lunch orders for one student without placing each day manually.

Example:

- choose Lunch
- choose a date range
- choose repeating weekdays
- choose dishes once
- submit one multi order

The system then creates the future daily orders for those valid dates.

## Who Can Use It

- Family users for linked students
- Student users for their own account
- Admin users for review, request handling, and replacement plan management

## Main Rules

- Multi Order is for one student only.
- Multi Order is for one session only.
- Maximum future range is 3 months.
- Weekends are skipped automatically.
- Blackout dates are skipped automatically.
- Price is shown only during review and after placement.
- No duplicate order is allowed for the same student, date, and session.

## How To Create A Multi Order

1. Open `Multi Order` from the Family or Student hub.
2. Select the student if you are a Family user.
3. Select one session: Breakfast, Snack, or Lunch.
4. Choose start date and end date.
5. Choose repeat weekdays.
6. Select dishes from the active session menu.
7. Review the generated dates and total.
8. Submit the multi order.

## What You Will See On Review

- all dates to be created
- dates skipped because of weekends
- dates skipped because of blackout days
- dates skipped because of overlap with existing orders
- final total amount

## After Placement

- Billing is created immediately.
- Billing page shows one grouped bill for the multi order.
- You can click the bill to open its detail popup.
- Receipt is group-level and includes occurrence breakdown.

## Editing And Deleting

### Before The Group Starts

- Family or Student user may edit recurrence pattern and dishes.
- Family or Student user may delete the full group.

### After The Group Starts

- Family or Student user becomes read-only.
- Family or Student user may submit a request to Admin.
- Admin handles future-plan changes or deletions.

## Important Limitations

- Multi Order cannot mix sessions in one group.
- Only active sessions can be used for new groups.
- Past and operationally progressed occurrences cannot be changed.
- Delivered occurrences remain immutable history.

## Admin Request Handling

When a started group needs change:

- Admin reviews the request
- Admin deletes future mutable occurrences if required
- Admin creates a new replacement multi order if a new plan is needed
- Original history stays intact

## Billing Changes After Admin Adjustment

If Admin changes future remaining occurrences:

- grouped billing is recalculated
- old receipt becomes void
- new receipt is generated automatically

## Why This Design Is Used

This design keeps:

- kitchen accurate
- delivery accurate
- billing traceable
- reporting consistent
- history reliable
