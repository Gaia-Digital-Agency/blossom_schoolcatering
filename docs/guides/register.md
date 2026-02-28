# Registration Guide (Youngster + Parent)

Last updated: 2026-02-28

URL: `/schoolcatering/register/youngsters`

This is the active youngster onboarding flow. It can create or link parent data in the same submission.

## Required Inputs
- Registrant type (`Youngster`, `Parent`, `Teacher`)
- Youngster first name, last name, gender, date of birth
- Youngster school and grade
- Youngster phone
- Youngster allergies
- Parent first name, last name, mobile, email

## Conditional Inputs
- `Teacher Name` is required only when registrant type is `Teacher`.

## Optional Inputs
- Youngster email
- Parent address

## Behavior Notes
- School list is loaded from active admin-managed schools.
- Parent account can be reused if parent email already exists.
- Successful registration links parent and youngster records.
- Record mode (`?mode=record`) is read-only for authenticated parent/youngster users.

## Data Linking
Successful flow writes/updates:
- `users`
- `parents`
- `children`
- `parent_children`
- registration metadata fields on `children`
