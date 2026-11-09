# Student shared role and authorization (#16)

This branch delivers Ahad's shared `STUDENT` role, narrow migration and
authorization portion of #16. Student profile storage, SAP-ID lookup and Student
business APIs are Ibad's separate integration work. Shared role/JWT authorization
uses the existing `users` row and does not depend on a Student profile table.

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
Body, query and custom-header identity fields cannot override `req.auth`.
No Student business routes are added here.

## Migration

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

## Integration handoff to Ibad

**SAP-ID login is not implemented in this assigned portion.** Current main has
no Student profile model or SAP-ID relationship. Ibad's integration needs the
confirmed Drizzle profile model/table, unique SAP-ID field/type and normalization
rules, foreign key to `users.id`, exact lookup/join and shared login input shape.
See [#16](https://github.com/ibad-r/e-clearance-management-system/issues/16),
[#17](https://github.com/ibad-r/e-clearance-management-system/issues/17) and
[#18](https://github.com/ibad-r/e-clearance-management-system/issues/18).
No SAP-ID field, profile model, dummy lookup or Student API is invented here.

Migration ordering is proposed as `0001_student_role` before Ibad's Student schema
migration; confirmation is pending before merge. The PR #19 demo migration guard also requires
exactly one reviewed migration and rejects this addition. `npm run test:demo`
therefore fails until Ibad coordinates an authorized guard review/update. Demo
code/configuration remains untouched under #16's scope restrictions. These are
integration/merge dependencies; the shared role and authorization are independently
implemented and tested through the existing users/JWT middleware.
