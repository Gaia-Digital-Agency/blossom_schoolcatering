# Test Login Matrix

Last updated: 2026-02-26  
Base URL: `http://34.124.244.233/schoolcatering`

## Core Role Accounts

| Role | Username | Password | Login Path | Landing Path |
|---|---|---|---|---|
| Admin | `admin` | `admin123` | `/admin/login` | `/admin` |
| Kitchen | `kitchen` | `kitchen123` | `/kitchen/login` | `/kitchen` |
| Delivery | `delivery` | `delivery123` | `/delivery/login` | `/delivery` |
| Parent | `parent` | `parent123` | `/parent/login` | `/parents` |
| Youngster | `youngster` | `youngster123` | `/youngster/login` | `/youngsters` |

## Registration Paths
- Parent: `/register/parent`
- Youngster: `/register/youngsters`
- Delivery: `/register/delivery`

## Notes
- Use newly registered parent/youngster users for repeated scenario tests to avoid stale-session confusion.
- If receipt-generation tests are included, ensure Google credential env is configured first.
