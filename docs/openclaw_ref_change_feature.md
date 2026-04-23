# OpenCLAW Reference — Change & Feature Log

Consolidated record of the changes delivered in this work session on `main`.
Commit hashes are live on `origin/main`.

| # | Commit | Area | Title |
|---|--------|------|-------|
| 1 | `00a2d24` | DB / scripts | Syrowatka order history cleanup (step 1) |
| 2 | `3118394` | Web / homepage | Move Guide button from hero to footer (step 2) |
| 3 | `cfbbf47` | Web / kitchen | CSV download alongside PDF (step 3) |
| 4 | `ec0c8d2` | Shared / grades | Add Preschool Stars (PS) & Preschool Rainbows (PR) (step 4) |
| 5 | `4e9efba` | Web / register | Rename registrant labels to Parent/Guardian, Student, Staff (step 5) |
| 6 | `6aa2c80` | Web + API / register | Optional Student Last Name on youngster registration (step 6) |
| 7 | `6f53eb0` | Web / register | Rename "Family Group Name" → "Parent Last Name" |
| 8 | `efeea21` | Web + API / admin | Reassign student to a different parent group with required student last name |

---

## 1. Syrowatka order history cleanup — `00a2d24`

**Goal.** Remove trial/test orders for the Syrowatka family only, while preserving student and parent profiles.

**Artifact.** `scripts/cleanup_syrowatka_orders.sql`.

**Scope.** Targets parents where `users.role = 'PARENT'` and `users.last_name ILIKE 'syrowatka'`.

**Delete order (FK-safe).**
`digital_receipts → delivery_assignments → billing_records → order_mutations → order_items → orders`, then `cart_items → order_carts`.

**Preserved.** `users`, `parents`, `children`, `schools`, `parent_children` links.

**Safety.** Script wraps everything in a single `BEGIN … ROLLBACK` by default; a preview block prints row counts via `RAISE NOTICE`. Switching the final `ROLLBACK` to `COMMIT` applies the changes.

**Applied.** Cleanup ran on preprod DB:

- 1 parent matched
- 4 children matched
- 36 orders, 111 order items, 39 mutations, 32 billing records, 10 delivery assignments removed
- 37 carts (112 cart items) cleared

Post-run verification query returned `0` remaining Syrowatka orders.

---

## 2. Homepage Guide link moved to footer — `3118394`

**Goal.** Promote Log In / Register on the hero; keep the Guide discoverable but modest.

**Changes.**

- `apps/web/app/page.tsx`: removed the third `btn btn-outline` Guide link from the hero `auth-grid`; added a dedicated Guide link inside the `<footer>`, positioned above the copyright line.
- `apps/web/app/globals.css`: new `.footer-guide` class (0.85rem, underlined, `#ffd37a` with `#ffe6a8` on hover).

Route unchanged — the footer link still points to `/userguide`.

---

## 3. Kitchen CSV download — `cfbbf47`

**Goal.** In every kitchen view (Yesterday, Today, Tomorrow, Select Date) allow CSV export alongside the existing PDF export.

**Changes** (`apps/web/app/kitchen/_components/kitchen-dashboard.tsx`):

- Added `onDownloadCsv` handler — UTF-8 BOM + CRLF + quote-escaped values.
- Rows are exploded: **one row per (order, dish)**. If an order has no dishes, a single row is emitted with empty dish/qty.
- Columns: `Service Date, Session, Student, Grade, School, Phone Number, Family, Dish, Quantity, Dietary Allergies, Order Status, Delivery Status`.
- Filename format: `kitchen-orders-YYYY-MM-DD.csv`.
- Download via `Blob` → temp `<a>` click → `revokeObjectURL`.
- Control row regridded from 4 → 5 columns (with a 2-column fallback under 720px) to fit the extra button cleanly on mobile.

---

## 4. Preschool grades added — `ec0c8d2`

**Goal.** Support `Preschool Stars (PS)` and `Preschool Rainbows (PR)` as distinct grade options on registration + edit dropdowns.

**Notes from user.** Existing `Pre K` entry already represents PK, so no relabel is needed for that row.

**Changes.**

- `apps/web/lib/grades.ts`: inserted `'PS'` and `'PR'` after `'Pre K'` in `GRADE_OPTIONS`.
- `apps/api/src/shared/grade.util.ts`: same insertion into its `GRADE_OPTIONS`.

**Deliberately unchanged.** `GRADE_FAMILY_ORDER` is untouched, so `progressGradeByYears` does **not** auto-promote PS or PR year-over-year (preschool stages are not treated as yearly promotion tracks). A PS or PR child stays at that grade unless explicitly updated.

---

## 5. Registrant label rename — `4e9efba`

**Goal.** Rename the three "Registrant User" options visible to users.

| Internal value (unchanged) | Old label | New label |
|---------------------------|-----------|-----------|
| `PARENT` | Parent | **Parent/Guardian** |
| `YOUNGSTER` | Student | Student (unchanged) |
| `TEACHER` | Guardian/Teacher | **Staff** |

**Changes (display-only, no DB/enum changes).**

- `apps/web/app/register/youngsters/page.tsx`: radio labels, the "Guardian/Teacher Name" / "Guardian/Teacher Phone Number" field captions (now "Staff Name", "Staff Phone Number"), and the two validation error strings.
- `apps/web/app/admin/youngsters/page.tsx`: registration note `"Registered by Staff: …"` replaces `"Registered by Guardian/Teacher: …"`.
- `docs/guides/user-guide.md`, `docs/guides/register.md`: terminology updated so the in-app Guide page reflects the new wording.

---

## 6. Optional Student Last Name on registration — `6aa2c80`

**Goal.** Let registrants key a per-student last name at registration. If blank, fall back to the parent last name (today's behaviour).

**Frontend (`apps/web/app/register/youngsters/page.tsx`).**

- New `youngsterLastName` field on `StudentForm` and the empty-form builder.
- New optional input **above** "Student First Name": `Student Last Name (Optional) — Leave blank to use family last name`. Capped at 100 characters.
- Record-mode prefill uses `child.last_name`.
- Payload now includes `youngsterLastName: student.youngsterLastName.trim()`.

**API.**

- `apps/api/src/auth/dto/register-youngster-with-parent.dto.ts`: new `@IsOptional() @IsString() @MaxLength(100) youngsterLastName?: string;` on `RegisterFamilyStudentDto`.
- `apps/api/src/auth/auth.service.ts`:
  - `RegisterYoungsterWithParentInput.students[*].youngsterLastName?: string;`
  - `const youngsterLastName = youngsterLastNameInput || parentLastName;` — the child's `users.last_name` is written from the override when provided.
  - `youngsterNameKey` and the duplicate-registration SQL probe both use the **effective** last name (override or parent fallback), so legitimate custom surnames do not collide with same-first-name siblings under other grouping rules.

**DB.** No migration — `users.last_name VARCHAR(100) NOT NULL` is the existing column that accepts the value.

---

## 7. "Family Group Name" → "Parent Last Name" — `6f53eb0`

Label rename only. Underlying field (`parentLastName`) and behaviour are identical.

**Files.**

- `apps/web/app/register/youngsters/page.tsx`: input label, validation error, success-card row.
- `apps/web/app/admin/parents/page.tsx`: edit input label and validation error.
- `docs/guides/register.md`: registration guide prose.

**Behaviour recap** (already delivered in commit `6aa2c80`):

- Blank `youngsterLastName` → child's last name defaults to parent last name.
- Provided `youngsterLastName` → child's `users.last_name` stores the override, usable for search/reference.
- Family grouping is determined by the `parent_children` junction table, independent of surnames.

Other surface strings that refer to the **concept** of a family group (billing scope, order calendar view, gAIa chat scope, admin list columns) are intentionally left untouched — only the input label was repurposed.

---

## 8. Admin: Reassign Student to Another Parent Group — `efeea21`

**Route.** `https://blossomcatering.online/admin/student` (also reachable via `/admin/youngsters` — the `/admin/student` page is a re-export of `/admin/youngsters`).

### Feature

An admin-only capability to detach a student from the current parent group and link them to a different one, while **explicitly keying the student's last name** (which may differ from the target parent's last name).

### UI changes — `apps/web/app/admin/youngsters/page.tsx`

- New state: `reassignInfo`, `reassignParentId`, `reassignLastName`, `reassignBusy`, `reassignError`.
- New row action **"Reassign Parent"** on every student in the existing table.
- New modal (`.pass-modal-overlay`) with:
  - Read-only context: Student, Current Parent.
  - **New Parent (Required)** — `<select>` listing all parents **except** the current one.
  - **Student Last Name (Required)** — `<input>` prefilled with the current `last_name`; admin can override.
  - Buttons: Confirm Reassign (primary) / Cancel.
- Submit calls the existing endpoint: `PATCH /api/v1/admin/youngster/:id` with `{ parentId, lastName }`.
- Confirmation message on success: `"{First} {LastName} reassigned to {Parent}."`.
- Table updates:
  - Header renamed: `Family Group` → **Student Last Name**.
  - New column **Parent Family** showing `primaryParent.first_name primaryParent.last_name` looked up from `parent_ids[0]`.
  - Empty-state `colSpan` bumped from 7 → 8.

### Server changes — `apps/api/src/core/services/users.service.ts`

In `updateYoungsterProfile`, when `input.parentId` is supplied:

1. Look up the current `parent_children` link for the child.
2. If it differs from the incoming `parentId` (i.e. a real reassignment), require a non-empty student last name — either supplied in the payload **or** already present on the user row. Otherwise throw `BadRequestException('Student last name is required when reassigning to a different parent.')`.
3. The existing flow continues:
   - Validate parent exists/active.
   - Reject student email/phone collisions with the target parent.
   - `DELETE FROM parent_children WHERE child_id = $1;` (detach)
   - `INSERT INTO parent_children (parent_id, child_id) … ON CONFLICT DO NOTHING;` (link)

### DTO

No changes required — `UpdateYoungsterDto` already carries optional `parentId` and `lastName` fields, which satisfy the new validation path.

### DB

No schema change. The feature operates on the existing junction table (`parent_children`) and the existing `users.last_name` column.

---

## Deployment notes

All eight commits are on `origin/main`. Post-merge operational steps performed:

- `pnpm --filter api build` (Nest)
- `pnpm --filter @blossom/web build` (Next.js)
- `pm2 restart schoolcatering-api schoolcatering-web`

Smoke checks after the last deploy returned:

- `GET /health` (API) → 200
- `GET /` (web home) → 200, footer renders `📖 Guide` via `.footer-guide`
- `GET /register/youngsters` → 200, HTML contains `Parent/Guardian`, `Staff`, `Student Last Name`, `Parent Last Name`
- `GET /admin/student` → 307 (middleware redirect to login, as expected for unauthenticated calls); compiled bundle contains `Reassign Parent`, `Student Last Name`, `Parent Family`.

No schema migrations required for any of the eight commits.
