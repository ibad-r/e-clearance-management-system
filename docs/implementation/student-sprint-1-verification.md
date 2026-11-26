# Student Sprint 1 backend verification — 22 November 2026

Shared Student SAP login is implemented using the existing Node.js/Express/TypeScript,
Drizzle/PostgreSQL account model. Student profile and request ownership protections
already existed and were preserved. Flutter source was inspected and left unchanged
as requested.

## Findings and fixes

| Issue | Existing behavior | Result |
| --- | --- | --- |
| SAP-ID login | Shared email/password, Argon2 and JWT worked; SAP lookup was absent. | Added SAP/password and combined identifier/password login using the existing profile link and password hash. Student email login now also rejects missing profile links. |
| Database profile | JWT subject maps to users.id; service reloads the active Student and resolves student_profiles.user_id. | Already implemented. GET /api/v1/student/profile returns sapId, studentName, registrationNumber, fatherName, program and semester. Name comes from users.full_name; email is available in the shared user response. No separate department field exists in this profile schema. |
| Request ownership/profile | Requests belong to the authenticated profile. Submitted academic fields must exactly match it; stored request identity is a database-derived snapshot. | Already implemented. Client identity overrides are rejected; foreign and missing request UUIDs return the same 404. No payload changes. |
| Identifier validation | SAP is unique, case-sensitive text; profile user_id is a mandatory unique FK. Profile fields have database nonblank checks. Request registrationNumber is a nonblank string, compared exactly with the stored profile. | Owner confirmed opaque identifiers with no institutional regex or fixed length. New login identifiers reject blank/non-string values and trim only surrounding input whitespace. SAP case and leading zeros are preserved. Existing registration validation remains unchanged. |

An authorized backend/admin setup process owns verified Student records and profile
links. This fix adds no provisioning endpoint, real university integration, account
mapping or password rule.

## API contract

POST /api/v1/auth/login accepts password and **exactly one** of:

- identifier: preferred for one UI field labeled “Email or SAP ID”.
- email: existing shared email login.
- sapId: explicit Student SAP login.

Example for the future single-field Student UI:

```json
{ "identifier": "S6468", "password": "<existing account password>" }
```

S6468 is illustrative, not a required format. An email may be sent through the
same identifier field. Both forms resolve to the same users.id and linked
Student profile, verify users.password_hash with the existing Argon2 verifier,
and issue the existing JWT and public user response.

The combined identifier checks email and Student SAP namespaces. If different
accounts match, it returns the generic credentials error instead of assuming
precedence. An email-shaped SAP is supported when unambiguous; both namespaces
matching the same account succeed. Explicit email retains lowercase lookup and
existing no-trimming behavior. identifier and sapId trim surrounding whitespace;
passwords are never trimmed.

Invalid, conflicting, missing or extra fields return
400 VALIDATION_ERROR / Invalid request data. Unknown identifiers, wrong passwords,
inactive users, ambiguous combined identifiers and unlinked Students return
401 UNAUTHORIZED / Invalid credentials. An existing signed Student token with no
profile still receives 404 STUDENT_PROFILE_NOT_FOUND from the profile API.

OpenAPI version is now 1.4.0. LoginResult, JWT claims, /auth/me, Student profile/request
payloads and Employee endpoint contracts are unchanged.

## Files changed

| File | Change |
| --- | --- |
| [auth.schemas.ts](../../backend/src/modules/auth/auth.schemas.ts) | Three strict exclusive login forms; shared password validation and trimmed opaque identifiers. |
| [auth.service.ts](../../backend/src/modules/auth/auth.service.ts) | Existing users/profile join, exact SAP lookup, ambiguity rejection and Student profile requirement; shared password verification preserved. |
| [auth.routes.ts](../../backend/src/modules/auth/auth.routes.ts) | Correct the shared-login comment; response behavior stays the same. |
| [auth.schemas.test.ts](../../backend/src/modules/auth/auth.schemas.test.ts) | Retain original email tests and add new identifier validation coverage. |
| [auth.integration.test.ts](../../backend/src/modules/auth/auth.integration.test.ts) | Verified linked/unlinked fictional fixtures; email/SAP identity equivalence, ownership, ambiguity, invalid credentials and Employee regression coverage. |
| [openapi_employee_v1.yaml](../references/openapi_employee_v1.yaml) | Exclusive login forms, normalization and safe failure contract. |
| [student-auth.md](student-auth.md) | Current behavior note; old audit explicitly historical. |
| [student-flutter-handoff.md](student-flutter-handoff.md) | Current login contract and six-field profile consumption follow-up. |
| [student-sprint-1-verification.md](student-sprint-1-verification.md) | This report. |

No migrations were added or changed. No schema, Student service, Employee workflow,
Admin module, dependency or Flutter file was changed. The pre-existing untracked
issue-18-phase-3-readiness.md was preserved.

## Checks actually executed

All npm commands ran from backend/.

| Check | Observed result |
| --- | --- |
| npm run lint | PASS, exit 0. |
| npm run typecheck | PASS, exit 0. |
| npm run build | PASS, exit 0. |
| npm test | PASS, 328 tests in 17 files. |
| npm run test:integration | PASS, 147 tests in 6 files. |
| npm run test:demo | PASS, 71 tests in 5 files; demo guard/verification unit tests. |
| npm run db:migrate:test | PASS, exit 0; existing three-migration chain applied to the verified new test database only. |
| OpenAPI structure/reference/contract comparison | PASS, exit 0; YAML parses, references resolve, three exclusive forms, other paths/components unchanged. |
| git diff --check | PASS, exit 0. |

The first sandboxed unit run could not create Vitest temporary files (EPERM);
it passed after approved write access. An initial typecheck found an untyped
test array; it was corrected before the passing checks. The final review found
an extra trailing blank line in a test; it was removed.

Database testing used the task-created PostgreSQL 18.6 container
codex-student-sprint1-20261122, bound only to 127.0.0.1:55479, database
e_clearance_test, role codex_student_test. Its database identity and version
(180006) were verified before guarded migration. Tests include existing
authentication/Student/Employee coverage, ownership, mismatch rejection, migration
scope/preservation, concurrency and rollback behavior.

After integration tests, users, Student profiles and Student requests each had
zero rows; the migration ledger had three entries. The container was stopped.
No development, shared, university or live demo database was reset, migrated,
seeded or otherwise modified. Live demo database verification was not run;
the available demo guard test suite passed.

## Remaining work

No unresolved backend credential, provisioning or format decision remains for
this agreed scope. Fictional accounts still need their existing verified profile
links; missing links are safely rejected rather than created during login.

Flutter follow-up is intentionally deferred: send identifier/password from one
Email or SAP ID input, parse all six profile fields, and populate the academic
submission fields from the authenticated profile. The inspected checkout at
E:/FYP/Mobile currently parses only SAP ID/name and drops the returned academic
fields, leaving them empty/editable. The backend supplies and verifies those
fields already; this integration gap needs the later Flutter work.
