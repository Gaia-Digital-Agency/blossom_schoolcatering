# Access Information

Last updated: 2026-02-26
Base URL: `http://34.124.244.233/schoolcatering`

## Role Login Pages
- Admin login: `/admin/login`
- Kitchen login: `/kitchen/login`
- Delivery login: `/delivery/login`
- Parent login: `/parent/login`
- Youngster login: `/youngster/login`
- Home login (Parent + Youngster): `/login`

## Credentials
- Admin:
  - Username: `admin`
  - Password: `admin123`
- Kitchen:
  - Username: `kitchen`
  - Password: `kitchen123`
- Delivery:
  - Username: `delivery`
  - Password: `delivery123`
- Parent:
  - Username: `parent`
  - Password: `parent123`
- Youngster:
  - Username: `youngster`
  - Password: `youngster123`

Reference:
- `docs/testting/test_login_matrix.md`

## Revoked Account
- `teameditor` is revoked and cannot log in.

## Access Rules
- Homepage is public: `/`
- Admin page requires `ADMIN` role:
  - `/admin` -> redirects to `/admin/login` if not logged in as Admin
- Kitchen page requires `KITCHEN` role:
  - `/kitchen` -> redirects to `/kitchen/login` if not logged in as Kitchen
- Delivery page requires `DELIVERY` role:
  - `/delivery` -> redirects to `/delivery/login` if not logged in as Delivery
- Parent page requires `PARENT` role:
  - `/parents` and `/parent` -> redirect to `/parent/login` if not logged in as Parent
- Youngster page requires `YOUNGSTER` role:
  - `/youngsters` and `/youngster` -> redirect to `/youngster/login` if not logged in as Youngster

## Registration
- Available for:
  - Parent + Youngsters (combined): `/register/youngsters`
  - Delivery: `/register/delivery`
- Admin and Kitchen do not have registration pages.
