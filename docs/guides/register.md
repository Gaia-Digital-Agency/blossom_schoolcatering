# Registration Guide (Youngster + Parent)

URL: `/schoolcatering/register/youngsters`

This is the only registration flow for youngster onboarding.  
It also creates or links the parent account in the same process.

## Required Fields
- Youngster First Name
- Youngster Last Name
- Youngster Gender
- Youngster Date Of Birth
- Youngster School (dropdown from active Admin schools)
- Youngster Grade on Registration Date
- Youngster Phone
- Parent First Name
- Parent Mobile Number
- Parent Email

## Optional Fields
- Youngster Email
- Parent Last Name
- Parent Address

## Behavior
- `Register As` is not used in this page.
- If youngster last name already exists for the same youngster first name pattern, system auto-adjusts:
  - `LastName` -> `LastName_1` -> `LastName_2` ...
- If parent email already exists on a parent account:
  - existing parent account is reused
  - new youngster is linked to that parent
- On success, response includes generated login details for youngster and parent (if parent account was newly created).

## Data Linking
Successful registration creates/updates:
- `users` (parent and youngster accounts)
- `parents` (parent profile)
- `children` (youngster profile + school/grade/gender/DOB)
- `parent_children` (youngster-parent linkage)

## Notes
- School choices are loaded from Admin-managed active schools only.
- Use valid date format from date picker (`YYYY-MM-DD`).
