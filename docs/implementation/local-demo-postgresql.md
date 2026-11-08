# Isolated PostgreSQL setup for the November 2 demo

This procedure prepares a dedicated local PostgreSQL 18 database for fictional
Faculty of Computing demo records. The commands below are instructions for a
reviewed setup session; they were not executed while preparing these files.
Draft PR #12 remains unmerged, and the new setup code must be reviewed before it
is pushed or used to modify any database.

The target is fixed: `127.0.0.1:55477/e_clearance_demo`. It is separate from both
the existing `e_clearance_dev` database and CI's disposable `e_clearance_test`.
Never redirect these commands to a university, production or shared database.

## Starting the API against the verified demo target

After setting the explicit demo connection and confirmations below, use
`npm run demo:inspect`, `npm run demo:verify`, then `npm run demo:start` from
`backend`. The startup command verifies the connected database, role,
PostgreSQL 18 and reviewed migration ledger before importing the application.
It sets `DATABASE_URL` to the verified `DEMO_DATABASE_URL` for that process.
The existing `.env` still supplies the JWT secret; it is not rewritten.
`npm run dev` continues to use the normal `DATABASE_URL` configuration.

Demo commands intentionally do not load `.env`. Set `NODE_ENV=development` and
`DEMO_DATABASE_CONFIRMATION=e_clearance_demo` in the same shell as
`DEMO_DATABASE_URL`. A working connection in another shell is not inherited.
Failures now report safe guard messages and recognized error codes. `28P01`
means the supplied database role password was rejected, and `42P01` means a
required relation is missing in the connected database. Changing a container's
`POSTGRES_PASSWORD` environment value does not change an existing volume's
database password. Do not reset that volume to fix a credential mismatch.

The Flutter Android emulator uses
`--dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1`. The login body is JSON
with `email` and `password`; the application password is separate from the
PostgreSQL role password. `scripts/demo-employee.ts` already supports creating
the fictional account with an operator-supplied password and Argon2id. Inspect
for that account first; do not recreate it or replace its hash to test login.

## Prerequisites

- Run from the existing `feature/employee-case-api` checkout with the current Node
  dependencies installed. Use a dedicated PowerShell session for the demo setup.
- Install/start Docker Desktop with its local Linux container engine and Docker
  Compose v2. Confirm the selected Docker context is local; stop if a remote
  context or remote `DOCKER_HOST` is configured.
- Ensure local TCP port `55477` is available. Do not stop or repurpose another
  PostgreSQL instance to make the demo target work.
- Review `backend/compose.demo.yml`, the connection guards, migration procedure
  and seed data before executing write commands.
- Application login remains a separate dependency: the PostgreSQL role password
  below is not an employee login password. The seed does not create application
  users, password hashes or authentication bypasses.

## Start the dedicated local service

From the repository root, first confirm the branch and then enter `backend`:

```powershell
git branch --show-current
Set-Location .\backend
docker context show
docker compose version
```

Supply your own PostgreSQL role password at the hidden prompt. Do not put it in
source code, a command argument, a transcript or an `.env` file. Reuse the same
password when restarting an already-initialized demo volume. Changing the process
variable does not change an existing database role's password.

```powershell
$demoSecurePassword = Read-Host 'Choose the isolated demo PostgreSQL role password' -AsSecureString
$demoPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($demoSecurePassword)
try {
  $env:DEMO_POSTGRES_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($demoPasswordPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($demoPasswordPointer)
  $demoSecurePassword.Dispose()
  Remove-Variable demoSecurePassword, demoPasswordPointer
}
if ([string]::IsNullOrWhiteSpace($env:DEMO_POSTGRES_PASSWORD)) {
  throw 'A nonempty password chosen by the operator is required'
}
$env:COMPOSE_DISABLE_ENV_FILE = '1'
Remove-Item Env:COMPOSE_ENV_FILES -ErrorAction SilentlyContinue
docker compose --project-name e-clearance-demo -f compose.demo.yml config --quiet
docker compose --project-name e-clearance-demo -f compose.demo.yml up -d --wait postgres
docker compose --project-name e-clearance-demo -f compose.demo.yml ps
```

Only `config --quiet` is used: rendered configuration and container-inspection
output can expose environment values. The Compose file requires the password,
binds the port only to loopback, and uses a project-specific persistent named
volume. There is no initialization seed mount and no authentication `trust`
override. PostgreSQL 18 uses a versioned data directory below
`/var/lib/postgresql`, which is the volume target prescribed by the
[official PostgreSQL image](https://hub.docker.com/_/postgres).
Compose's required-variable and double-dollar interpolation behavior is documented
in the [Docker Compose reference](https://docs.docker.com/reference/compose-file/interpolation/).
`COMPOSE_DISABLE_ENV_FILE` prevents automatic `.env` loading, as described in
[Docker's environment-variable reference](https://docs.docker.com/compose/how-tos/environment-variables/envvars/).

## Set the explicit demo connection

Keep credentials in this process environment and do not display the resulting
connection URL. URL encoding permits operator-chosen passwords with special
characters. The normal application `DATABASE_URL` and existing `.env` remain
untouched.

```powershell
$demoEncodedPassword = [uri]::EscapeDataString($env:DEMO_POSTGRES_PASSWORD)
$env:DEMO_DATABASE_URL = "postgresql://e_clearance_demo:${demoEncodedPassword}@127.0.0.1:55477/e_clearance_demo"
Remove-Variable demoEncodedPassword
$env:NODE_ENV = 'development'
$env:DEMO_DATABASE_CONFIRMATION = 'e_clearance_demo'
```

The demo helpers require the explicit development mode, confirmation and URL. They
must reject unexpected hosts, ports, database names, URL overrides and production
mode before connecting, then verify the actual database and PostgreSQL version
on the same client before any write. `DATABASE_URL` and `TEST_DATABASE_URL` are not
fallbacks. A matching database name is an accident-prevention check, not proof
that an arbitrary server is disposable; the operator must also confirm the local
dedicated service above.

## Inspect and review before migration

The accepted Drizzle history is the existing `backend/drizzle/` SQL, snapshot and
journal. Preserve these files together; do not regenerate, baseline, push a schema,
reset a database, or mark unapplied SQL as applied to bypass an inspection error.

```powershell
npm run demo:inspect
Get-Content .\drizzle\meta\_journal.json
Get-Content .\drizzle\0000_employee_clearance.sql
```

Confirm that inspection reports the dedicated local target and PostgreSQL 18.
For a fresh target, confirm there are no existing application objects or unknown
migration history. Review the initial SQL and pending migration procedure before
continuing. If inspection shows an existing schema without the accepted ledger,
unexpected user objects, changed hashes, partial application or an incompatible
history, stop and preserve it for review. Do not apply the initial migration over
unfamiliar existing tables.

Only after both the target and procedure have been reviewed, run the explicit
confirmation form:

```powershell
npm run demo:migrate -- --confirm-reviewed
npm run demo:inspect
```

The demo runner uses the installed Drizzle ORM migrator and actual generated SQL.
It refuses incompatible existing state. Repeating an accepted, fully-applied
migration is a no-op; it does not reset tables. No migration command is run
automatically by application startup or by the seed.

## Seed and verify fictional configuration

```powershell
npm run demo:seed
npm run demo:verify
```

The seed creates only its declared fictional FC employee/configuration records:
category, departments, rule definitions, versioned workflow, ordered stage and
approval mappings, authority positions and controlled department demo records.
It runs transactionally, with stable identifiers for repeatability. An identical
rerun reuses its records; conflicting or modified existing configuration aborts
instead of overwriting it. It does not erase corrections or edit used workflow
versions. No clearance case, decision, certificate or credential is fabricated.

Verification checks the accepted migration ledger and the seeded records without
printing secrets. Employee rows are initially unlinked (`user_id` is null), so a
successful configuration check does not imply that application login is ready.
Do not work around that by hardcoding a user ID or mounting the employee routes
without the real authentication verifier.

For dataset `fictional-fc-demo-v1`, expect the following owned-record counts:

| Record group | Count |
| --- | --- |
| Category `DEMO_FC_TEACHING_V1` | 1 |
| Employees `DEMO-FC-001` and `DEMO-FC-002` | 2 |
| Departments and rule definitions | 2 each |
| Active workflow template | 1 |
| Ordered stage mappings | 2 |
| Authority position and approval mapping | 1 each |
| Controlled employee/department records | 4 |

The initial linked/unlinked employee counts are `0` and `2`. Controlled sample
values include both zero and nonzero outstanding metrics, but no checker executes
them during seeding or submission. Reruns preserve authorized later corrections
to those values and preserve reviewed user links; they do not restore defaults.

## Coordinate application users with the authentication owner

The current branch provides login input validation, but no verified password
hashing/provisioning implementation is available in it. The seed therefore never
inserts or updates `users`, accepts a raw password/hash, or substitutes an unusable
test hash for a real demo login.

Before the authenticated supervisor demo, obtain the actual supported hashing and
provisioning export from the authentication owner. Using that flow, provision an
active, fictional `EMPLOYEE` account in this same isolated demo database, then
review and link it to the intended seeded FC employee. Linking must verify the
user's role, active status and the employee's identity; no automatic email-based
guessing or overwriting an existing link is provided here. The employee relation
is `employees.user_id -> users.id`; no HTTP principal carrier is assumed here.
Do not send raw passwords or hashes in audit events, logs or Git commits.

The remaining production-route steps are in
[`issue-11-auth-dependency.md`](issue-11-auth-dependency.md). The service can create
an `IN_PROGRESS` case only after a trusted identity is supplied; stages remain
`LOCKED` and approvals remain `WAITING` until real checking/approval services exist.
No rule engine, automatic clearance, real university integration or approval
decision is introduced by this setup.

## Verification and stopping

Database-free checks are safe to run without starting PostgreSQL:

```powershell
npm run lint
npm run typecheck
npm run build
npm test
```

Database integration tests keep their separate guarded `TEST_DATABASE_URL` and
disposable `e_clearance_test` target. Never point them at this persistent demo
volume or the existing development database.

To stop the isolated service while retaining its demo records:

```powershell
docker compose --project-name e-clearance-demo -f compose.demo.yml stop postgres
Remove-Item Env:DEMO_DATABASE_URL, Env:DEMO_POSTGRES_PASSWORD, Env:DEMO_DATABASE_CONFIRMATION -ErrorAction SilentlyContinue
```

Restart with the same reviewed Compose project/volume and role password. No reset,
drop, truncate or volume-deletion procedure is part of this setup. Leave Draft
PR #12 unmerged; review the new setup code before any commit or push.
