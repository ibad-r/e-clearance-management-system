# Issue #11: employee clearance API authentication dependency

The employee profile/case services, submission validation and HTTP route factory
are implemented on `feature/employee-case-api`. The production app deliberately
does not mount protected employee routes while the credential-verification
middleware is unavailable. Authentication-independent implementation and tests
continue through an injected, server-only identity interface.

## Available authentication code

`backend/src/modules/auth/auth.schemas.ts` defines login input validation only.
The repository has no authentication verifier, authentication middleware, trusted
request principal type, or middleware wiring that supplies a verified user ID and
role. `validateBody` validates input; it does not authenticate it. The OpenAPI
bearer scheme and `CurrentUser` response do not define a trusted Express principal.

Required handoff from the authentication feature:

- The existing verifier/middleware module path and export to mount before employee
  routes, including how authentication failures are passed to the application.
- The exact server-populated principal location and TypeScript shape, with a
  verified UUID matching `users.id` and a role matching the database role enum.
- Confirmation that verification occurs before the principal is published and how
  inactive accounts are handled. Employee APIs must also enforce employee role,
  account/profile eligibility, Faculty of Computing scope, and record ownership.

The credential verifier's carrier (`req.user`, `res.locals`, or another mechanism)
has not been agreed. The small integration interface in `employee.auth.ts` requires
an explicit `VerifiedIdentityResolver` to map that future carrier to
`{ userId, role }`; it has no default resolver and does not verify or decode tokens.
Malformed or absent principals return 401 and a verified non-employee role returns
403. Services independently check the database user's current role and active
state, linked employee record, category eligibility and FC scope.

Headers, body/query IDs, unverified token payloads, hardcoded identities and
development bypasses are not substitutes. `employeeId` and `initiatedById` are
rejected as client submission fields. Mocked verified identities exist only in
tests; production routes remain unavailable until the handoff is completed.

## Exact remaining authentication integration steps

1. Obtain the actual verified authentication middleware export and its documented
   server-populated principal shape. Add authentication-owner tests for missing,
   invalid and expired credentials; no fake credentials or bypass are provided here.
2. Implement a small resolver that reads that already-verified carrier and returns
   only `{ userId: users.id, role }`. Map names explicitly; do not read identity
   from body/query fields, custom identity headers or unverified token payloads.
3. At the composition root, construct `createEmployeeCaseService(db)` with the
   existing application database connection, then
   `createEmployeeRouter(service, resolver)`.
4. Before the existing 404 handler, mount the real verifier followed by the router
   at `/api/v1/employee`: `app.use('/api/v1/employee', verifier, router)`.
   This is a future integration instruction, not current production wiring.
5. Run the actual-auth HTTP tests and guarded PostgreSQL integration suite in CI.
   Confirm 401/403 behavior, identity spoof rejection, FC scope and foreign-case 404
   responses before enabling the endpoints for the demo.

## Confirmed API contract mismatch

The supplied reference is `docs/references/openapi_employee_v1.yaml`; its server
base URL already contains `/api/v1`.

| Issue #11 API | Updated contract |
| --- | --- |
| `GET /api/v1/employee/profile` | Adds the public employee profile/category DTO |
| `POST /api/v1/employee/cases` | Adds self-initiation and submission in one transaction |
| `GET /api/v1/employee/cases` | Lists only the linked employee's cases, with optional status filter |
| `GET /api/v1/employee/cases/:caseId` | OpenAPI `/employee/cases/{caseId}` returns owned case/stages/progress |

The draft's `CreateCaseRequest` requires client `employeeId`, and its employee
submit route operates on an HR-created case. Issue #11 instead authorizes an
employee to create and submit their own case in one transaction. It requires
`initiatedById` to be the authenticated employee user, initial `IN_PROGRESS` status,
`submittedAt`, frozen workflow stages/rules, `WAITING` approvals, and a safe audit
event. The database can represent this without a schema migration; the historical
`initiatedById` relation's HR-oriented meaning must not constrain the new service.

The actual OpenAPI draft now separates `CreateEmployeeCaseRequest` (date, reason,
optional remarks; no identity fields) from the older HR `CreateCaseRequest`.
The HR-initiation and separate-submit operations remain documented as legacy,
planned operations outside Issue #11 rather than silently disappearing.

Creation returns `IN_PROGRESS` with `submittedAt` populated. Configured stage/rule
and approval snapshots are saved atomically with a safe audit event. Every stage
starts `LOCKED`, and every approval starts `WAITING`: no rule engine or automatic
approval is invented. Missing/inactive workflow configuration returns a controlled
503 without synthetic records. Employee response DTOs include department progress
and exclude password hashes, tokens, private approval remarks and rule snapshots.

The following request body is suitable for the test-mounted router, and later for
production after real authentication is integrated:

```json
{
  "lastWorkingDate": "2026-11-05",
  "reasonForLeaving": "Fictional demo clearance",
  "employeeRemarks": "Development-only example"
}
```

Existing reference documents are local inputs; public-repository inclusion needs
review. No protected endpoint is presented as currently mounted in production.

## Tests and database safety

`npm test` now discovers all database-free suites, including the previously omitted
auth schema tests. It excludes `connection.test.ts` and `*.integration.test.ts`
at command level, leaving the separate CI integration command operational.

Employee API integration tests use the existing `TEST_DATABASE_URL` guard
against a disposable PostgreSQL 18 `e_clearance_test` database and rollback fictional
fixtures. No explicit disposable test connection is available in this session;
no local database connection, migration, fixture write, reset or destructive
operation is authorized by these documentation changes. Existing schema and
migration history are unchanged. See `issue-11-demo-data.md` for the required
development-only fixture prerequisites; this document does not execute seeds.
