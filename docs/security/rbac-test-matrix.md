# RBAC Test Matrix

Date: 2026-03-02
Automated spec: `apps/api/src/auth/rbac-matrix.spec.ts`

## Matrix Focus
- Admin-only routes remain restricted to `ADMIN`.
- Delivery operational routes remain `DELIVERY` or `ADMIN+DELIVERY` as designed.
- Parent billing-proof routes remain `PARENT` only.

## Critical Route Expectations
- `POST /api/v1/admin/schools` -> `ADMIN`
- `PATCH /api/v1/admin/schools/:schoolId` -> `ADMIN`
- `DELETE /api/v1/admin/schools/:schoolId` -> `ADMIN`
- `GET /api/v1/admin/billing` -> `ADMIN`
- `POST /api/v1/admin/billing/:billingId/verify` -> `ADMIN`
- `POST /api/v1/admin/billing/:billingId/receipt` -> `ADMIN`
- `GET /api/v1/admin/audit-logs` -> `ADMIN`
- `GET /api/v1/delivery/assignments` -> `ADMIN | DELIVERY`
- `POST /api/v1/delivery/assignments/:assignmentId/confirm` -> `DELIVERY`
- `POST /api/v1/billing/:billingId/proof-upload` -> `PARENT`
- `POST /api/v1/billing/proof-upload-batch` -> `PARENT`

## Execution
Run:
```bash
cd apps/api
npm test -- rbac-matrix.spec.ts
```
