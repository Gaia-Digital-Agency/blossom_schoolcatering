# Menu User Guide

## Admin Menu Management
- Route: `/schoolcatering/admin/menu`
- Set date/session context
- Create/edit/delete dishes
- Toggle dish availability
- Set display order and cutlery requirement
- Set packing flags (`PACKING_CARE_REQUIRED`, `WET_DISH`)
- Attach up to 20 ingredients per dish

## Image & Ingredient Workflow
- Image upload is converted to WebP before submit
- Master ingredient list can auto-create missing ingredients
- Master dish suggestions can auto-create dish rows
- Sample seed action is available per selected date

## Ordering Side Effect
- Parent/youngster menu pages read active dishes from this module
- Availability/session/date context is enforced by API
