# Menu User Guide

Last updated: 2026-02-28

## Admin Menu Management
- Route: `/schoolcatering/admin/menu`
- Set context by service date and session.
- Actions:
  - create dish
  - update dish
  - delete dish
  - activate/deactivate dish
  - seed sample menus

## Dish Data Fields
- Name and description.
- Nutrition facts text and calories.
- Price.
- Ingredient links.
- Display order.
- Cutlery required flag.
- Packing requirement flag.
- Image URL/upload.

## Ingredient and Image Workflow
- Missing ingredients can be created directly from menu workflow.
- Uploaded images are processed before save and stored for runtime access.

## Ordering Impact
- Parent/youngster menus consume active dishes from this module.
- Session availability and service date validity are still enforced server-side.
