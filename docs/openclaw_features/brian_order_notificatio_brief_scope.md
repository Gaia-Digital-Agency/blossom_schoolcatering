# Brian WhatsApp Daily Order Notification

## Scope

Add a daily 9:00 AM Asia/Makassar WhatsApp notification flow through Brian for Blossom School Catering.

Brian will send one WhatsApp message per order for today's service date when the order status is:

- `PLACED`
- `LOCKED`

If one student has two orders on the same day, for example `BREAKFAST` and `LUNCH`, Brian will send two separate WhatsApp messages.

Delivery target priority:

1. Student phone number
2. Parent phone number fallback if student phone is missing

## Message Example

```text
Today's Order

Student: Natasha
Order ID: #08785409
Date: 2026-05-04
Session: LUNCH
Items: Beef Rice Bowl, Beetroot & Hazelnut Salad, Buffalo Chicken, Cheesy Beans, Chicken & Cheese Macaroni

Enjoy your meal, Natasha! 🍽️
```

## Solution

Blossom API will prepare the daily notification list and expose it through admin-only endpoints.

Brian/OpenClaw will:

- run on a daily 9:00 AM schedule
- fetch today's eligible orders
- send one WhatsApp per order
- call Blossom back to mark each send as sent or failed

Blossom will also store a send log to prevent duplicate notifications if the job is re-run.

## In Scope

- daily 9:00 AM scheduled run
- one WhatsApp per eligible order
- status filter for `PLACED` and `LOCKED`
- student phone first, parent fallback second
- send logging and duplicate prevention
- admin-safe rerun support for failed or skipped sends

## Out of Scope

- email notifications
- grouped daily summaries per student
- parent-only notification mode
- full delivery/read receipt tracking from WhatsApp
- advanced retry orchestration beyond safe rerun support

## Deliverables

- new Blossom API endpoints for daily notification payload and send-status updates
- notification log table for audit and deduplication
- Brian cron automation for 9:00 AM daily
- WhatsApp template for per-order notifications
- basic operational rerun path for missed/failed sends

## Estimated Effort

- Backend API and send-log persistence: 7 to 9 hours
- Brian/OpenClaw cron and send flow: 5 to 7 hours
- End-to-end testing and operational validation: 5 to 7 hours

Estimated total:

- 18 Hours (2 + Days)

## Assumptions

- Brian can send outbound WhatsApp messages from the active OpenClaw environment
- Blossom admin or service authentication can be used securely for Brian API access
- Student and parent phone numbers are already stored and readable in current data
- Asia/Makassar is the correct business timezone for the 9:00 AM run

## Approval Point

Once approved, implementation can proceed with:

- Blossom preparing the order notification payload
- Brian executing the scheduled WhatsApp send
- duplicate-safe logging so reruns do not resend already delivered order notifications
