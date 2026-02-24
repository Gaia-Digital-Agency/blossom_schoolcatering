# Blossom School Catering

Creation date: 2026-02-24  
GitHub remote name: `origin` (`git@github.com-net1io:Gaia-Digital-Agency/blossom_schoolcatering.git`)  
Developed by giada.com  
Copyright (C) 2026

## App Title
Blossom School Catering

## App Introduction
Blossom School Catering is a mobile-first food ordering web application for international school catering in Bali, powered by Blossom Steakhouse kitchen.  
The app is designed for parents and children to place school meal orders (Lunch, Snack, Breakfast), while kitchen and admin users manage operations, reporting, and menu updates.

## Business Goals
- Enable simple, fast meal ordering for families.
- Support parent-to-multiple-child management (up to 10 children per parent).
- Ensure kitchen gets reliable, current order summaries and printable tags.
- Provide billing visibility with proof-of-payment upload.
- Go live by 1 April 2026 with required test completion.

## Functional Scope Summary
- Roles: Parent, Child, Admin, Kitchen, Delivery.
- Sessions: Lunch, Snack, Breakfast.
- Order rule: one meal set per child per session per day (up to 3 sessions/day).
- Child permissions: create own order only; cannot edit/delete.
- Parent permissions: order per child, edit/delete before 08:00 same day.
- Weekday service rule: meals are for Monday-Friday (no weekend meal service).
- Ordering calendar: users can place orders any day; service dates must respect weekday and blackout rules.
- Admin blackout days: admin can block ordering/service dates.
- Admin manages a master ingredient list; each menu item selects ingredients from this list (dropdown/multi-select).
- Menu scale: 20-50 items per session category.
- Max 5 items per meal.
- Ingredient restrictions per child, auto-attached to kitchen-facing order details.
- Delivery role confirms delivered orders for the day and updates billing delivery status.

## App Architecture
### 1) Client Layer (Mobile-first Web)
- Next.js (TypeScript) frontend.
- Responsive parent/child/admin/kitchen dashboards.
- Responsive parent/child/admin/kitchen/delivery dashboards.
- Kitchen dashboard uses polling for updates in v1:
  - auto-refresh interval (e.g., every 30-60 seconds)
  - manual Refresh button

### 2) API/Application Layer
- NestJS (TypeScript) service layer.
- JWT-based authentication and role-based authorization.
- REST JSON APIs as primary interface.
- Optional GraphQL read endpoints for analytics expansion later.

### 3) Data Layer
- PostgreSQL as source of truth.
- Redis for cache/session/short-lived counters.
- GCS for uploaded assets:
  - menu images
  - payment proof images

### 4) Ops/Infra Layer
- GCP VM staging target (`gda-s01`).
- Nginx reverse proxy.
- Firewall-controlled ingress.
- Load balancer and CDN ready topology for scale-up.
- Backups, logs, and monitoring.

## App Language and Frameworks
- Frontend: TypeScript, Next.js, Tailwind CSS
- Backend: TypeScript, NestJS
- Database: PostgreSQL
- Cache: Redis
- Storage: Google Cloud Storage
- Auth: JWT
- API styles:
  - REST (JSON) - primary
  - GraphQL - optional for selected read/analytics use cases
  - gRPC - optional for internal service expansion
  - WebSocket - deferred (not in v1 kitchen view)

## Frontend Features Presence
- UI/UX:
  - luxury Blossom-inspired visual direction with simple child/parent-friendly flows
- Mobile View Friendly:
  - mobile-first layout and interaction patterns
- JWT Auth:
  - role-aware login and session handling
- APIs:
  - REST API integration with typed contracts
- SEO:
  - public homepage metadata, semantic HTML, and indexable content for non-auth pages

## System Design Elements Presence
- Application: multi-role school meal ordering platform
- Framework: Next.js + NestJS
- Database: PostgreSQL
- Firewall: network ACL/security groups for controlled access
- Load Balancers: supported for production rollout
- CDN Server: static/media acceleration path
- Caching: Redis
- Networking notes:
  - IP/TCP foundation for transport
  - TCP carries HTTP and optional WebSocket upgrades
  - Request path model: Port -> IP -> DNS (resolution and routing context)
- API patterns:
  - REST JSON (primary)
  - GraphQL (optional)
  - gRPC (optional internal)
  - WebSocket (future enhancement)

## Proposed File Structure
```text
blossom-schoolcatering/
  README.md
  requirements.md
  apps/
    web/                 # Next.js frontend
    api/                 # NestJS backend
  packages/
    ui/                  # shared UI components
    config/              # ts/eslint/prettier/shared settings
    types/               # shared DTO/types
  infra/
    nginx/
    gcp/
    scripts/
  docs/
    architecture/
    testing/
  .github/
    workflows/
```

## Core Module Design
- Identity and Access:
  - parent/child/admin/kitchen roles
  - username conventions (`lastname_parent`, `lastname_firstname`)
- Family and Child Profiles:
  - parent-child mapping, school metadata, dietary restrictions
- Menu Management:
  - admin CRUD, category/session binding, nutrition and ingredient data
  - ingredient master list CRUD with per-meal ingredient selection
- Ordering:
  - session/day constraints, weekday service checks, cutoff logic, quantity limits
- Billing and Payment Proof:
  - order-linked billing records, image upload and status markers
- Kitchen Operations:
  - polling-based aggregate summary, print reports, print order tags
- Delivery Operations:
  - assigned daily deliveries, tick/confirm delivery, billing delivery status sync
- Analytics:
  - day/week/month summaries and demographic comparisons

## Compile Steps
```bash
# 1) Install dependencies
npm install

# 2) Build all apps/packages
npm run build
```

## Run Steps
```bash
# 1) Start local services (example)
# postgres, redis (docker compose or local services)

# 2) Start backend API
npm run dev:api

# 3) Start frontend web
npm run dev:web

# 4) Open local app
# http://localhost:3000
```

## Environment and Deployment Notes
- Staging VM: `gda-s01`
- Staging path: `/var/www/schoolcatering`
- Staging URL: `http://34.124.244.233/schoolcatering`
- Bucket: `gda-ce01` / folder `blossom_schoolcatering`
- SSH: `ssh -i ~/.ssh/gda-ce01 azlan@34.124.244.233`

## Suggested Testing
- Unit Testing:
  - validators, business rules, authorization checks, pricing and totals
- Integration Testing:
  - API + DB flows for auth/menu/order/billing
- System Testing:
  - end-to-end flows per role (parent/child/admin/kitchen)
- User Testing (UAT):
  - school operations simulation, parent ordering, kitchen print workflows
- Regression Testing:
  - cutoff times, weekday-only service, blackout day enforcement
- Security Testing:
  - JWT/session hardening, upload validation, role access boundaries
- Performance Testing:
  - peak-hour ordering and kitchen summary refresh load

## Quality Gates Before Go-Live (1 April 2026)
- All critical and high defects closed.
- Required tests completed and signed off:
  - Unit
  - Integration
  - System
  - User testing
- Data backup/restore checks passed.
- Monitoring and alerting baseline active.

## Additional Notes
- Footer requirement in app:
  - Copyright (C) 2026
  - Developed by Gaiada.com
  - Visitor count (starting at 35), location, and time
- Privacy requirement:
  - strict privacy and confidentiality page must be included.
