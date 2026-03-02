# Privacy and Confidentiality

Last updated: 2026-03-02

## 1) Scope
This policy applies to the Blossom School Catering web application and API used by Parents, Youngsters, Admin, Kitchen, and Delivery users.

## 2) Data We Process
- Account profile data: name, username, phone number, email, role.
- Student and parent linkage data for ordering operations.
- Meal ordering data, billing status, and proof-of-payment uploads.
- Operational metadata: login/session traces, role authorization outcomes, and admin audit logs.

## 3) Why We Use Data
- To authenticate users and enforce role-based access.
- To provide school meal ordering, billing verification, delivery, and reporting flows.
- To investigate incidents and maintain service integrity via security and audit logs.

## 4) Confidentiality Commitments
- Access to sensitive data is restricted by role and business need.
- Admin-critical actions are recorded in an audit trail.
- Credentials and secrets must not be committed into source code.
- Upload content is validated for type and size before storage.

## 5) Data Security Controls
- Password policy enforcement (length, character-class complexity, weak-password rejection).
- One-time expiring password reset tokens with token-hash storage.
- Correlation ID and standardized API error responses for secure troubleshooting.
- CSRF origin checks on sensitive cookie-based auth flows.

## 6) Data Retention and Deletion
- Operational records are retained according to school and legal requirements.
- Soft-delete is used for selected domain entities to preserve historical integrity.
- Permanent deletion should follow approved operational runbooks.

## 7) User Responsibilities
- Keep credentials confidential and use strong passwords.
- Do not upload unrelated personal or sensitive documents.
- Report suspicious access or account activity immediately.

## 8) Contact
For privacy or confidentiality concerns, contact the school operations/admin team using the approved support channel.
