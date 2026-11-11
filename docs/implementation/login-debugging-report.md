# Demo login verification — 5 November 2026

The isolated PostgreSQL database, real backend login, and login through the
installed Flutter Android app were verified successfully. No migration, reset,
drop, seed, branch change, commit, push, or merge was performed.

## 1. Root causes and evidence

- The normal backend imported `dotenv/config` and read `DATABASE_URL` from
  `backend/.env`, targeting `localhost:5432/e_clearance_dev`. Setting
  `DEMO_DATABASE_URL` did not switch this application pool. This explains why
  the reported `42P01` login failure did not reflect the already-migrated demo
  database. No connection or mutation of the development database was needed.
- The demo role's persisted SCRAM verifier matched neither the running
  container's `POSTGRES_PASSWORD` nor the password in the operator's supplied
  `DEMO_DATABASE_URL`. External authentication reproduced PostgreSQL `28P01`.
  Both comparisons were made in memory, without printing passwords or hashes.
  Container-local connections succeeded under existing `trust` rules, which
  did not validate the password used by external clients. Authentication rules
  were not changed.
- `connectDemoDatabase` discarded its original exception; `run-demo.ts` then
  replaced every error with one generic message. These catches concealed the
  actual authentication failure. The repaired CLI reports the SQLSTATE and a
  safe explanation.
- The existing fictional application account was active and linked to
  `DEMO-CASE-001`, but the supplied application password returned HTTP 401.
  After explicit authorization, only that account's password was updated using
  Argon2id. Subsequent real login succeeded.
- Flutter's session restoration parsed `/auth/me` as a bare user even though
  the backend returns `{ "user": ... }`. A regression test reproduced
  `type 'Null' is not a subtype of type 'String'`; the parser now reads the
  correct envelope.

## 2. Files changed by this work

Backend root: `E:\FYP\e-clearance-management-system\backend`.

| File | Change |
| --- | --- |
| `.env` (Git-ignored) | Only `DATABASE_URL` switched to the verified demo target; JWT and other settings preserved. |
| `package.json` | Added `demo:start` and `test:demo`. |
| `src/db/demo/demo-database.ts` | Preserve original connection failures as causes and keep all target guards. |
| `src/db/demo/demo-database.test.ts` | Regression for safe authentication diagnostics, including cleanup failure. |
| `src/db/demo/demo-commands.ts` | Identify application-authored guard diagnostics as safe to display. |
| `src/db/demo/demo-migrations.ts` | Display safe migration guard diagnostics; SQL and ledger checks unchanged. |
| `src/db/demo/verify-demo.ts` | Display safe fixture-conflict diagnostics without row contents. |
| `src/db/demo/run-demo.ts` | Print safe diagnostic messages and recognized error codes. |
| `src/db/demo/start-demo.ts` | Verify the target and migration ledger before importing the API and overriding its database URL. |
| `src/utils/safe-error.ts` | Format trusted guard messages and recognized error codes, excluding raw SQL, parameters, credentials, and stacks. |
| `src/utils/safe-error.test.ts` | Verify redaction, cause traversal, safe codes, and cyclic/aggregate errors. |
| `src/middleware/errorHandler.ts` | Replace raw error logging with the safe formatter. |

Additional changed files:

- `E:\FYP\e-clearance-management-system\docs\implementation\local-demo-postgresql.md`
  — demo startup and diagnostic instructions.
- This verification report.
- `E:\FYP\Mobile\lib\core\auth\auth_repository.dart`
  — correct the session response envelope.
- `E:\FYP\Mobile\test\auth_session_test.dart`
  — two session regression tests.

The actual mobile checkout is `E:\FYP\Mobile`; the supplied
`E:\FYP\e-clearance-mobile` path does not exist. Existing staged and unstaged
work, including `src/server.ts` and generated Flutter files, was preserved.
Temporary operational helpers and evidence were kept under ignored `backend/tmp`
and `.dart_tool`; no password was embedded in application source or an APK.
The encrypted credential handoff, unused mobile probe source, and temporary
Android hierarchy file were removed after verification. The dashboard screenshot
and helpers containing no credentials were retained.

## 3. Database and account changes

The isolated target was verified as database/role `e_clearance_demo`, PostgreSQL
18.6, at `127.0.0.1:55477`. Before repairing the role, the same container session
also checked that no additional non-template database existed besides the demo
database and PostgreSQL's default `postgres` database.

Only the isolated role's password was synchronized to the operator-supplied URL.
The fictional application's password was subsequently changed on exactly one
row after matching its email, employee number, role, active status, fictional
name, designation, faculty, and department. Password hashing uses the existing
`argon2` library with `argon2id`; authentication and JWT logic were unchanged.

`drizzle/0000_employee_clearance.sql` creates `users` and the other 18 application
tables. SQL, snapshot, journal, constraints, indexes, and existing ledger were
reviewed. The live ledger matched the accepted migration. No migration was
necessary or executed. The two original seeded FC employees remain unlinked;
the separate existing `DEMO-CASE-001` account is the verified login identity.

## 4. Commands and checks actually executed

Commands were run from their respective backend/mobile directories, with host
permissions when Windows sandbox restrictions required them. Secrets were
loaded from the temporary Windows-encrypted operator handoff, not command-line
literals.

| Command/check | Actual result |
| --- | --- |
| `git status --short --branch` and `git diff --check` | Reviewed both repositories; no branch or Git publication changes. |
| `docker context show`, `docker ps`, targeted `docker exec ... psql` reads | Local healthy PostgreSQL 18.6; inspected identity, schema, ledger, and fictional account. |
| Original `npm run demo:inspect` | Reproduced generic failure; direct driver check exposed `28P01`. |
| Repaired `npm run demo:inspect` before credential repair | Correctly reported safe `28P01` diagnostic. Missing explicit environment also produced its specific guard message. |
| Guarded temporary role-repair helper | Synchronized only the demo role; external SCRAM connection and identity then passed. |
| `npm run demo:inspect` after repair | `ready`, 1 migration, 19 tables, 6 enums. |
| `npm run demo:verify` | Fictional dataset verification passed with expected fixture counts. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run build` | Passed; initial sandbox write denial was resolved by running with host permission. |
| `npm run test:demo` | 69 tests passed across 5 files. |
| `npm test` | 72 tests passed across 6 files. |
| `npm run demo:start` | Verified the demo target and started the actual API on port 4000. |
| Guarded fictional account update | Exactly one matching account updated with Argon2id after explicit authorization. |
| `node --import tsx tmp/verify-login.cjs` | Real HTTP login and protected endpoint checks passed after the authorized password update. |
| `flutter test --no-pub --reporter expanded test/auth_session_test.dart` before fix | Both new tests failed, reproducing the session parser error. |
| `flutter test --no-pub --reporter expanded` after fix | All 17 tests passed. |
| Android emulator TCP request to `10.0.2.2:4000/health` | HTTP 200 from the actual backend. |
| Actual installed Flutter login using Android input/accessibility tooling | Authenticated dashboard displayed the fictional employee and existing case. Verified visually and saved screenshot. |
| `flutter build apk --debug --no-pub --target .dart_tool/demo_login_probe.dart --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1` | Failed with JVM native-memory exhaustion. |
| Same APK build with temporary 1536 MB heap, 512 MB metaspace, two workers, and no persistent daemon | Also failed with JVM native-memory exhaustion. No permanent Gradle settings were changed. |

The existing `test:integration` command deliberately requires
`e_clearance_test`; it was not redirected to another database or run against the
demo. Real HTTP checks against the explicitly verified demo target provided the
login integration evidence instead.

## 5. Actual HTTP and Flutter results

| Request | Result |
| --- | --- |
| `GET /health` | 200 |
| `POST /api/v1/auth/login` with authorized fictional credentials | 200; token returned and accepted by protected endpoints |
| `GET /api/v1/auth/me` with returned bearer token | 200; user matched the database identity |
| `GET /api/v1/employee/profile` | 200; employee number `DEMO-CASE-001` |
| `GET /api/v1/employee/cases` | 200 |
| Login with incorrect password | 401 |
| `/auth/me` without a bearer token | 401 |

The Flutter request uses the expected JSON `email`/`password` fields. The
installed Android app successfully communicated through the emulator host alias
and opened the authenticated dashboard. The screenshot is
`E:\FYP\e-clearance-management-system\backend\tmp\flutter-demo-login-success.png`.

## 6. Remaining limitations

- A fresh Android APK build is blocked by host JVM/native-memory exhaustion,
  including the retry with reduced memory settings. The installed app's real
  login is verified. The session-restoration source change is covered by passing
  tests but was not delivered in a newly built APK during this run.
- `FYP_MASTER_CONTEXT.md` was not found in the repositories or searched project
  and user-document locations. Repository schema, configuration, implementation,
  migration, and demo documentation were inspected directly.
- The existing dashboard has a request-code layout overflow. It was observed
  after successful login and left unchanged as outside this login repair.

## 7. Next action

Continue the presentation from the emulator's authenticated fictional employee
dashboard. The backend is running on port 4000. The authorized presentation
password is active and is intentionally omitted from this report.
