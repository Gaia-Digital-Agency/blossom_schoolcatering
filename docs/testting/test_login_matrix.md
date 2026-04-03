# Test Login Matrix

Last updated: 2026-02-26  
Base URL: `http://34.158.47.112/schoolcatering`

## Core Role Accounts

| Role | Username | Password | Login Path | Landing Path |
|---|---|---|---|---|
| Admin | `admin` | `Teameditor@123` | `/admin/login` | `/admin` |
| Kitchen | `kitchen` | `Teameditor@123` | `/kitchen/login` | `/kitchen` |
| Delivery | `delivery` | `Teameditor@123` | `/delivery/login` | `/delivery` |
| Parent | `parent` | `parent123` | `/parent/login` | `/parents` |
| Youngster | `youngster` | `youngster123` | `/youngster/login` | `/youngsters` |

## Registration Paths
- Parent + Youngster (combined): `/register/youngsters`
- Delivery: `/register/delivery`

## Notes
- Use newly registered parent/youngster users for repeated scenario tests to avoid stale-session confusion.
- If receipt-generation tests are included, ensure Google credential env is configured first.
