# Parent User Guide

## Access
- Login: `/schoolcatering/parent/login`
- Main page: `/schoolcatering/parents`
- Parent view is youngster-scoped. Select a youngster first.

## Core Modules
- Session menu + draft cart
- Consolidated orders
- Favourite meal combos (save/apply/delete)
- Quick reorder from existing order
- Meal plan wizard (copy one source order to multiple dates)
- Consolidated billing + proof upload + receipt access
- Spending dashboard

## Ordering Flow
- Pick youngster, `Service Date`, and `Session`
- Menu is loaded from active admin dishes for that date/session
- Add dishes to draft (max 5 items per order)
- Adjust quantity or remove dish in Draft Section
- Place order

## Draft Behavior
- Existing open draft cart auto-resumes
- Draft expiration is shown with countdown
- You can discard a draft cart when needed

## Billing Flow
- Billing cards show payment + delivery status
- Upload proof image (WebP/data URL or URL)
- Admin verifies/rejects proof
- Receipt opens after admin generates it

## Rules
- Cutoff and blackout/session rules are enforced by API
- Non-lunch sessions can be disabled by admin settings
- Duplicate menu item lines are rejected in an order
