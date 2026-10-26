# Employee database foundation

The schema barrel is `schema/index.ts`. It exports nineteen PostgreSQL tables
and six enums without importing the application pool or loading environment files.
The optional attachments model is deferred. Calendar dates use PostgreSQL `date`
and TypeScript date strings; event timestamps use `timestamp with time zone`.

## Generate and review SQL

From `backend`, run `npm run db:generate -- --name=employee_clearance` to generate
versioned SQL and Drizzle metadata in `drizzle/`. Keep the SQL, snapshot, and journal
together. Generation uses installed tooling and the credentials-free
`drizzle.config.ts`; it does not connect to PostgreSQL. Drizzle Kit itself can load
dotenv files, but this configuration and the schema do not consume those values.

There is no automatic startup migration. `npm run db:migrate:test` uses the installed
Drizzle ORM migrator and these actual SQL files, with the safeguards below. Do not
use `drizzle-kit push` or run this command against a development database.

## Isolated migration verification

CI supplies `TEST_DATABASE_URL` for its disposable PostgreSQL 18 service. There is
no fallback to `DATABASE_URL`, `PGDATABASE`, dotenv or the application pool. The
URL must explicitly name `e_clearance_test`, use a PostgreSQL scheme and hostname,
and contain no query parameters or fragments. Ambiguous routing/connection overrides
are rejected before creating a pool. Encoded or extra database-path segments are
also rejected.

The runner verifies `current_database()` and PostgreSQL major version 18 on a
single checked-out client before calling the migrator. That same client performs
the migration, with `search_path=public` configured explicitly. Verification is
repeated immediately before migration because Drizzle creates its migration ledger
before starting its DDL transaction. Connections are closed on success and failure;
the CLI prints curated messages without raw driver errors or credentials.

CI execution order is checkout, Node setup, dependency installation, lint,
typecheck, build, `npm test`, `npm run db:migrate:test`, then
`npm run test:integration`. The required job name remains `Backend Checks`.

`npm test` includes the existing HTTP tests plus mocked safety/migrator tests;
it requires no database. `npm run test:integration` requires an explicitly configured
test URL and already-applied migrations. Its setup never auto-applies migrations.
It checks tables, enum values, foreign keys, uniqueness, row checks, rejected
relationships and migration idempotency, including unchanged object OIDs and ledger
hashes/timestamps. Database fixture tests use fictional UUID-based identities,
per-test transactions and savepoints, and always roll back. The idempotency test
runs outside fixture transactions because Drizzle manages its own transaction.
No test resets, truncates or drops any table/database.

Local verification is limited to lint, typecheck, build and the database-free
`npm test`. PostgreSQL execution is deferred to GitHub Actions; the migration has
not been applied locally. The database name guard is an accident-prevention check,
not proof that a server is disposable, so never point these commands at a persistent
or shared database merely because it has the test name.

## Update timestamps

`users`, `employees`, `clearance_requests`, and `department_demo_records` have
database `now()` defaults plus Drizzle `$onUpdate` hooks. ORM updates set
`updated_at` unless explicitly supplied by the caller. These hooks are not SQL
triggers: direct SQL updates must set `updated_at` themselves.

## Configuration and historical evidence

Categories, clearance departments, authority memberships, workflow ordering,
required steps, rule operators and expected values are stored as configuration.
No departmental mappings, thresholds or sample data are seeded. Department demo
records contain controlled simulation data only.

A case pins its template at HR initiation. Future services must treat a used
template, its mappings and its referenced rule definitions as immutable and create
a new version for changes. At submission, copy the complete rule definition and
`isRequired` into request snapshots. Required flags default to true for compatibility,
but the submission service must copy false values explicitly. Foreign keys do not
enforce template immutability or snapshot creation.

The partial indexes allow only one nonterminal request per employee and one active
template per category. Only `COMPLETED` and `CANCELLED` are terminal. Positive
orders/version, assignment/decision consistency, cancellation metadata and issue
resolution checks protect individual rows. Future transactional services must
still enforce category/template matching, sequential checks, active authority
membership, role/ownership checks, completion eligibility and certificate issuance.

An approval or return must identify the assigned human decision maker and decision
time; a return also needs remarks. Previous approval rounds and departmental
checks must be preserved in audit events before current-state rows are changed.
Reapproval, delegation, optional-step and certificate reissue policies remain open.

## Authentication and audit boundaries

`users` retains `id`, `email`, `passwordHash` (`password_hash`), `fullName`, `role`,
`isActive`, `createdAt` and `updatedAt`. The role values match the API contract.
Hash algorithm and authentication validation belong to the authentication feature.
No authentication implementation was available in the local branch refs for
direct compatibility checking. API user responses must select only the public
contract fields; they must not serialize database rows containing password hashes.

Audit details must be explicitly allowlisted event data, such as changed field
names, safe old/new departmental values and decision identifiers. Never log
passwords, password hashes, authentication tokens, certificate verification tokens
or whole request/user objects. No audit writer is implemented here. Future services
must append events in the action transaction and enforce append-only access using
application behavior and database permissions.

