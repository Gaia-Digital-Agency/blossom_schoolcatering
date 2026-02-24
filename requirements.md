# Blossom School Catering - Requirements

## Project Overview
- Project name: `blossom-schoolcatering`
- Purpose: Food ordering web app for school catering services from Blossom Steakhouse kitchen for international schools in Bali.
- Design direction: Mobile-first, simple and elegant, with a luxury Blossom Steakhouse visual feel.
- Future direction: Start as web app, with possible evolution into a mobile app.

## Core Functional Requirements
- Food catering ordering system with sessions:
  - Lunch
  - Snack
  - Breakfast
- Session ordering rule: order flow and display order should follow Lunch, Snack, Breakfast.
- Ordering can be performed on any day of the year.
- Meals are for weekdays only (Monday-Friday, no weekend meal service).

## User Roles and Access
- Roles:
  - Parent
  - Child
  - Admin
  - Kitchen
  - Delivery
- Parent-child relationship:
  - One parent can have multiple children.
  - Maximum 10 children per parent.
- Access rules:
  - Parent can view, create, edit, and delete child orders (time-limited).
  - Child can view and create only their own order.
  - Child cannot view sibling/other child orders.
  - Child cannot change or delete order after placing it.
  - Admin can manage menu items (full CRUD).
  - Admin cannot modify placed meals/orders; admin can delete meals/orders for operations and delivery management.
  - Delivery can view assigned meals/orders for the day and confirm each delivered item.
  - Delivery confirmation updates billing/delivery status.

## Username and Login Rules
- Parent username format: `lastname_parent`
- Child username format: `lastname_firstname`
- Initial login code/password: phone number without `+` and without spaces.
- Both parent and child can log in.

## Registration Requirements
- Parent (all compulsory):
  - last_name
  - phone_number
  - email
  - address
- Child (all compulsory except photo):
  - last_name
  - phone_number
  - date_of_birth
  - gender
  - school_grade
  - school_name
  - photo (optional)

## Ordering Rules
- Child:
  - One meal set per child per session per day.
  - A child can have up to 3 session orders per day (Lunch, Snack, Breakfast), if available.
  - Cannot edit or delete placed order.
- Parent:
  - Can place one meal set per child per session per day.
  - Parent can order for up to 3 sessions per day per child (Lunch, Snack, Breakfast), if available.
  - Can edit/delete order before 08:00 AM on the same day.
  - Can duplicate meal set:
    - Daily
    - Weekly
    - Per child
- Ingredient restrictions:
  - Parent can set ingredient exclusions/restrictions.
  - Restrictions must auto-duplicate and notify kitchen on each related meal.
- Item limits:
  - Maximum 5 items per meal.

## Menu Management
- Menu categories:
  - Lunch menu
  - Snack menu
  - Breakfast menu
- Estimated menu size:
  - 20 to 50 items per category.
- Menu item fields:
  - name
  - price
  - description
  - ingredients (selected from admin-managed master ingredient list)
  - nutrition_facts
  - image
- Admin has full CRUD on menu items.
- Admin has full CRUD on master ingredient list.
- Meal name must be unique (no duplicate meal names).
- Ingredient name in master list must be unique (no duplicate ingredient names).
- Menu updates by admin should immediately reflect in parent and child views.
- Admin can black out/block specific ordering or service dates.

## Parent and Child Pages (Post-login)
- Lunch Menu Page
- Snack Menu Page
- Breakfast Menu Page
- Daily Order Page
- Weekly Order Page
- Monthly Order Page
- Semester Order Page
- Billing Page

## Billing Requirements
- Billing details must include:
  - order items
  - session
  - day and date
  - price
  - proof of payment status (green/red)
  - delivery status and delivered timestamp
- Billing views:
  - History view
  - Summary view by:
    - session
    - date
    - day
    - meals
    - child
    - parent
- Parent must upload proof-of-payment image to confirm payment.

## Kitchen View and Analytics
- Daily kitchen summary of ordered items (e.g., burgers, nuggets, etc.) with live updates as orders change.
- Analytics views and comparisons:
  - by day, week, month
  - day-to-day comparisons
  - meal vs age
  - meal vs gender
  - meal vs school
  - meal vs sessions
  - additional useful analytics
- Kitchen operations:
  - Print reports
  - Print order tags

## Delivery View
- Delivery user sees assigned meals/orders for the day.
- Delivery user can tick and confirm delivered for each order.
- Delivery confirmation updates billing and order delivery status.

## Admin Analytics
- Admin can dice and slice data by:
  - parent
  - child
  - meal item
  - session
  - order count
  - delivery status
  - payment status
  - date/day/week/month

## Order Tag Requirements
- Order number (UUID)
- Parent name
- Child name
- School name
- Session
- Day
- Date
- Ingredient exclusions

## Privacy, Legal, and Footer
- Strict privacy and confidentiality page is required.
- Footer requirements:
  - `Copyright (C) 2026`
  - `Developed by Gaiada.com`
  - Number of visitors (start counter at 35)
  - Visitor location
  - Visitor time

## Homepage Requirements
- Must include:
  - Login entry
  - Hero image
  - Very simple layman explanation:
    - what the app is
    - how to use it
- Visual feel: luxury Blossom Steakhouse style, adapted for children and parents.

## Scale and Operational Assumptions
- Initial scale:
  - 300+ children
  - some parents have multiple children

## Timeline and Quality Gates
- Go-live deadline: **1 April 2026**
- Required completed testing before go-live:
  - Unit Testing
  - System Testing
  - Integration Testing
  - User Testing

## Infrastructure and Environments
- Staging VM (GCP): `gda-s01`
- Server path: `/var/www/schoolcatering`
- Staging URL: `http://34.124.244.233/schoolcatering`
- Storage bucket: `gda-ce01`
- Bucket folder: `blossom_schoolcatering`
- SSH access command:
  - `ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233`

## Repository Details
- Git remote:
  - `git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`

## README Scope (Next Step)
- README.md should include:
  - creation date
  - GitHub remote name
  - `Developed by Gaiada.com`
  - `Copyright (C) 2026`
  - App title
  - App introduction
  - App architecture
  - App languages and frameworks
  - App file structure
  - compile steps
  - run steps
  - suggested testing
  - other relevant areas
- Frontend feature presence:
  - UI/UX
  - Mobile friendly view
  - JWT auth
  - APIs
  - SEO
- System design element presence:
  - Application
  - Framework
  - PostgreSQL
  - Firewall
  - Load balancer
  - CDN
  - Redis cache
  - Networking notes:
    - IP/TCP
    - TCP -> HTTP/WebSocket
    - Port -> IP -> DNS
  - API styles:
    - REST (JSON)
    - GraphQL
    - gRPC
    - WebSocket
