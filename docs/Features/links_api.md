# Links and Route Map

Last synced: 2026-03-14  
Base URL: `/schoolcatering`

This file documents public links, module routes, aliases, redirects, and the main navigation targets.  
Button-to-endpoint behavior is in [button_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/button_api.md).  
Non-button API/backend mapping is in [map_api.md](/Users/rogerwoolie/Documents/gaiada_projects/blossom-schoolcatering/docs/features/map_api.md).

## 1) Public and Entry Routes

| Route | Purpose | Notes |
|---|---|---|
| `/` | Landing page | Main entry with login and register CTAs |
| `/home` | Home alias | Alternate public entry |
| `/menu` | Public menu | Read-only menu |
| `/guide` | Guides and terms | Static/doc-driven |
| `/privacy-and-confidentiality` | Privacy page | Static content |
| `/login` | Generic login | Shared login entry |
| `/register` | Unified registration page | Main public registration route |
| `/register/youngster` | Compatibility route | Redirects to `/register` |
| `/register/parent` | Compatibility route | Redirects to `/register` |
| `/register/youngsters` | Implementation route | Backing page for unified registration |
| `/register/delivery` | Delivery registration route | Public self-registration not used |
| `/rating` | Ratings page | Auth-required |

## 2) Role Login Routes

- `/admin/login`
- `/kitchen/login`
- `/delivery/login`
- `/parent/login`
- `/youngster/login`

## 3) Protected Module Routes

### Parent
- `/parent`
- `/parent/orders`
- `/parent/billing`
- `/parents`
- `/parents/orders`
- `/parents/billing`

### Youngster
- `/youngster`
- `/youngsters`

### Delivery
- `/delivery`

### Kitchen
- `/kitchen`
- `/kitchen/yesterday`
- `/kitchen/today`
- `/kitchen/tomorrow`

### Admin
- `/admin`
- `/admin/menu`
- `/admin/parent`
- `/admin/parents`
- `/admin/youngster`
- `/admin/youngsters`
- `/admin/schools`
- `/admin/blackout-dates`
- `/admin/backout-dates`
- `/admin/billing`
- `/admin/delivery`
- `/admin/reports`
- `/admin/kitchen`

## 4) Route Preferences and Aliases

- Singular route forms are preferred for current use:
  - `/parent`
  - `/youngster`
  - `/admin/parent`
  - `/admin/youngster`
- Plural route forms remain as compatibility aliases:
  - `/parents`
  - `/youngsters`
  - `/admin/parents`
  - `/admin/youngsters`

## 5) Key Navigation Links

### Landing Page
- `Log In` -> `/login`
- `Register` -> `/register`
- `Menu` -> `/menu`
- `Guides & T&C` -> `/guide`

### Parent Navigation
- `Home` -> `/`
- `Order` -> `/parent/orders`
- `Menu` -> `/menu`
- `Rating` -> `/rating`
- `Billing` -> `/parent/billing`

### Login Redirect Targets
- admin session -> `/admin/login`
- kitchen session -> `/kitchen/login`
- delivery session -> `/delivery/login`
- parent session -> `/parent/login`
- youngster session -> `/youngster/login`
