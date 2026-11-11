# Student shared authentication (#16 / #22)

Audit date: 11 November 2026. Latest main (`00c3594`, PR #21's Student API
documentation) was merged into the existing `feature/student-auth` branch without
rewriting history. PR #20 is open and unmerged.

**Overall verdict: NO — Parent Issue #16 is not yet complete.**
**PR readiness: READY WITH DOCUMENTED BLOCKERS.** Email/role/JWT support is
implemented and verified; SAP-ID login, migration ordering and demo guard
authorization remain blocked. Ibad owns the Student profile schema; Ahad can
extend shared SAP-ID login only after its real schema and request contract are
confirmed. Shared role/JWT authorization itself needs only the existing users row.

## COMPLETED — verified shared implementation

Pre-created, active `STUDENT` users authenticate by email through the existing
`POST /api/v1/auth/login` endpoint with `{ "email": "fictional@example.invalid",
"password": "<password>" }`. Existing Employee email validation and lowercase
lookup behavior are preserved. No university-domain restriction is introduced.

Login uses the shared Drizzle `users` lookup, Argon2 verification and JWT signer.
The response remains `{ accessToken, tokenType: "Bearer", expiresIn, user }`, where
`user` contains only `id`, `email`, `fullName` and the database `role`.
Wrong passwords, unknown emails and inactive accounts return the same
`401` / `UNAUTHORIZED` / `Invalid credentials` response.

`GET /api/v1/auth/me` uses the existing Bearer-token verifier and reloads the active
user from PostgreSQL. It returns `{ user }` with the same four public fields.
The token's role must agree with the database role. Shared `requireRole("STUDENT")`
supports Student-only routes; existing Employee-only authorization is preserved.
Body, query and custom-header role/user/Student/SAP-ID fields cannot override
`req.auth`. A supplied SAP ID is not proof of authenticated identity.
No Student business routes are added here.

## COMPLETED — narrow migration artifact and safety tests

`0001_student_role.sql` contains exactly:

```sql
ALTER TYPE "public"."user_role" ADD VALUE 'STUDENT';
```

The Drizzle journal registers this migration, and its generated snapshot changes
only the shared role enum and snapshot identifiers. Existing role values, tables,
columns, constraints, indexes and data are preserved. Migration tests compare the
snapshots and rehearse an upgrade with rollback-only fictional Employee fixtures.
PostgreSQL-backed verification must use the isolated PostgreSQL 18
`e_clearance_test` database through the existing test-database guards.

The existing generated metadata is unchanged by this audit:

- Journal: `idx: 1`, `tag: 0001_student_role`, `when: 1794215907667`.
- Snapshot ID: `125d33dc-8e97-4f69-bea5-49f09e7df513`.
- Parent snapshot: `09037170-ad3f-4904-ad7b-50bc8e0f1726`.
- SQL SHA-256 (LF-normalized):
  `859e063b4fa3074afcd0802540af357eef9c08b97cb23020d537e38e9f4865ca`.

No migration was renamed or added, and no generated snapshot or journal entry
was rewritten to force ordering. Test verification is not migration-order approval.

## BLOCKED — SAP-ID schema and login contract

**SAP-ID login is not implemented or tested.** Current main has no Student Drizzle
profile model or SAP-ID relationship. PR #21 documents the SAP-ID contract as
TBD; its example DTO fields are not a physical schema or written login agreement.
Before implementing lookup, Ibad must provide:

1. Approved schema branch/PR/commit, model/table name and exact file path.
2. SAP-ID property/column, database type, canonical format and normalization rules,
   including leading-zero, whitespace and case behavior.
3. Actual uniqueness constraint/index and lookup ambiguity guarantees.
4. Exact FK to `users.id`, cardinality, nullability/delete behavior and missing
   profile handling.
5. Written shared login JSON contract: exact identifier key(s), whether email and
   SAP ID may coexist, validation/precedence and unchanged password behavior.

The current strict `{ email, password }` API is preserved. Extra `sapId` and
`identifier` fields are rejected with 400; bare SAP IDs are not accepted as email.
SAP-ID success, unknown/ambiguous SAP-ID lookup and duplicate-profile tests remain
BLOCKED until the schema and contract exist; no fake test success is claimed.

See [#16](https://github.com/ibad-r/e-clearance-management-system/issues/16),
[#17](https://github.com/ibad-r/e-clearance-management-system/issues/17) and
[#18](https://github.com/ibad-r/e-clearance-management-system/issues/18).
No SAP-ID field, profile model, dummy lookup or Student API is invented here.

## BLOCKED — migration ordering

`0001_student_role` before Ibad's Student schema migration remains a proposal.
Ibad has not confirmed it on #16/#22. He must reserve that role migration and
generate the Student migration from the agreed journal/snapshot, or provide an
alternative coordination plan. Shared/demo/university/production migrations are
not authorized or run by this audit.

## BLOCKED — demo guard ownership and authorization

`backend/src/db/demo/demo-migrations.ts::reviewedDemoMigrations()` requires
exactly one journal entry and one SQL file, `0000_employee_clearance`. This branch
has two of each. The executed `npm run test:demo` fails before the migration suite
can collect tests, with:

> Demo migration files differ from the reviewed initial migration; review before proceeding

The required separately authorized change is a reviewed allowlist for the exact
two migrations, validating both tags, indexes, timestamps and normalized SQL
hashes, plus matching migration-ledger checks and tests. Simply permitting any
two files would weaken the guard. Existing demo databases must not be silently
adopted, reset or upgraded; their handling needs the owner's explicit plan.
Ibad must own a separate scoped fix or authorize it in writing. PR #19 demo files
remain untouched in PR #20. This failure is separate from passing auth tests.

## Verification — executed 11 November 2026

| Command from backend/ | Actual result |
| --- | --- |
| `npm ci` | PASS |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0 |
| `npm test` | PASS: 6 files, 79 tests |
| `npm run test:integration` | PASS: 3 files, 77 tests |
| `npm exec -- vitest run src/modules/employee` | PASS: 4 files, 155 tests |
| `git diff --check` | PASS |
| `npm run test:demo` | FAIL: 1 suite fails at import; 4 files / 58 tests pass |

PostgreSQL-backed tests used only the task-created PostgreSQL 18.6 cluster at
loopback port 55434 and guarded `e_clearance_test` database. Fictional fixtures
were cleaned up or rolled back; the cluster was stopped after verification.
No production, university, shared or demo database was used, reset or reseeded.
Employee runtime, password verification/storage, JWT settings, shared login input,
public response shapes and PR #19 code/configuration remain unchanged.
