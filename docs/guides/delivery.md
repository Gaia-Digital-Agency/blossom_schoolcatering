# Delivery User Guide

## Access
- Login: `/schoolcatering/delivery/login`
- Main page: `/schoolcatering/delivery`

## Assignment View
- Select date and use `Past / Today / Future`
- Click `Refresh Assignments` to reload
- Assignments are grouped by school name
- Delivery user only sees assignments for mapped active school(s)

## Assignment Card Data
- Service date + session
- Order ID
- Youngster name and mobile
- Parent name
- Delivery status + confirmed timestamp

## Completion Flow
- Optional confirmation note supported
- `Mark Complete` sets delivered
- `Completed (Click to Undo)` reverts to assigned
- Order + billing delivery statuses are updated together

## Dependency
- Admin must map school-to-delivery in `/schoolcatering/admin/delivery`
