# Upgrade Stack Plan

Date: 2026-03-02
Project: blossom-schoolcatering

## 1. Baseline and Branch

- Create branch: `codex/deps-upgrade-plan`
- Record current dependency state:
  - `npm ls --depth=0`
  - `npm --prefix apps/web ls --depth=0`
  - `npm --prefix apps/api ls --depth=0`
- Run baseline validation:
  - `npm run build`
  - `npm run test:unit`

## 2. Phase 1: Low-Risk Updates First

- Keep stable dependencies already at latest:
  - `typescript` stays `5.9.3`
  - `prettier` stays `3.8.1`
- Update only patch/minor versions where no breaking change is expected.
- Validate:
  - `npm run build:web`
  - `npm run build:api`
  - `npm run test:unit`

## 3. Phase 2: Frontend Major Migration (Highest Impact)

- Upgrade:
  - `react` + `react-dom`: `18.3.1 -> 19.x`
  - `next`: `14.2.35 -> 16.x`
- Run official codemods and address breaking changes:
  - App Router/runtime behavior
  - middleware changes
  - route handlers/fetch caching behavior
- Validate:
  - `npm run build:web`
  - manual role-based smoke tests (Parent, Youngster, Admin, Kitchen, Delivery)

## 4. Phase 3: Backend/Framework Alignment

- Re-check Nest ecosystem compatibility after frontend migration.
- If needed, update Nest/tooling in one controlled step.
- Validate:
  - `npm run build:api`
  - `npm --prefix apps/api run test`
  - verify API health and Swagger docs endpoints

## 5. Phase 4: Release Safety

- Deploy to staging first, then production.
- Run QA suites:
  - `npm run test:qa`
- Keep rollback ready:
  - pre-upgrade git tag
  - lockfile rollback path
  - PM2 restart/recover checklist

## 6. Recommended Execution Order

1. `eslint` major upgrade (`9 -> 10`) in a separate PR.
2. `next` + `react` major migration in a dedicated PR.
3. optional Nest/tooling cleanup PR.

## 7. Current Known Gap Snapshot

- Behind latest:
  - `next`: `14.2.35` (latest observed `16.1.6`)
  - `react` / `react-dom`: `18.3.1` (latest observed `19.2.4`)
  - `eslint`: `9.39.3` (latest observed `10.0.0`)
- Already latest:
  - `typescript`: `5.9.3`
  - `prettier`: `3.8.1`
