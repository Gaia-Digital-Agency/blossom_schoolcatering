# Master List Note (Section 5 Scope)

Last updated: 2026-02-25

## Confirmed Section 5 Scope
For `5) Core Master Data Modules`, the active scope is limited to:
1. Schools
2. Dish
3. Ingredient
4. Blackout
5. Menu
6. Parents Details
7. Kids (Youngsters) Details
8. Delivery Details

This scope impacts database structure and application-to-database linking for role access below.

## Role Access Matrix (DB-Linked)

### Admin (Full CRUD)
- Schools: Full CRUD
- Dish: Full CRUD
- Ingredient: Full CRUD
- Blackout: Full CRUD
- Menu: Full CRUD
- Parents: Full CRUD
- Youngsters: Full CRUD

### Parents (Master Data Access)
- Schools: Select dropdown
- Dish: Select dropdown
- Blackout: Read
- Menu: Select dropdown
- Youngsters: CRUD

### Youngsters (Master Data Access)
- Schools: Select dropdown
- Dish: Select dropdown
- Blackout: Read
- Menu: Select dropdown
- Parents: Read

### Delivery
- Schools: Read
- Dish: Read
- Blackout: Read
- Menu: Read
- Parents: Read
- Youngsters: Read
- Delivery Status: Dropdown (`Completed` / `Unsuccessful`)

### Kitchen
- Dish: Read
- Ingredient: Read
- Menu: Read
- Blackout: Read
- Print Tag: Enabled
- Order Per Child: Dropdown (`Complete` / `Cancelled` / `Incomplete`)

## Implementation Note
- Use this file as the working reference for Section 5 DB schema updates, API contracts, and role-permission wiring.
- JSON template files prepared in this folder:
  - `schools.json`
  - `dish.json`
  - `ingredient.json`
  - `blackout.json`
  - `menu.json`
  - `parents.json`
  - `kids.json`
  - `delivery.json`
