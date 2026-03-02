# Testing and Quality Gates

Date: 2026-03-02

## Scope
This defines automated quality gates for Step 13:
- Unit tests
- Integration tests (API + DB)
- E2E role tests
- Regression suite (cutoff/weekdays/blackouts)
- Security tests
- Performance peak-load test

## Command Set
From repo root:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:regression
npm run test:security
npm run test:performance
```

Full gate:
```bash
npm run test:qa
```

## Gate Criteria
- Unit: all Jest suites pass.
- Integration: CRUD and API-DB flow script exits `0`.
- E2E: role-based consolidated + kitchen/billing flow scripts exit `0`.
- Regression: weekend/blackout/cutoff checks pass.
- Security: CSRF-origin, RBAC boundary, weak-password rejection checks pass.
- Performance: success rate >= 99%, p95 latency <= 1500ms.

## Runtime Prerequisites
- API running and reachable via `BASE_URL` (default: `http://127.0.0.1:3000/api/v1`).
- Database connected and seeded role users present (`admin`, `kitchen`, `delivery`).

## Notes
- Integration/E2E/regression/security/performance suites are runtime tests and require a live environment.
- Unit tests run fully in local test context and should pass in CI without API runtime.
