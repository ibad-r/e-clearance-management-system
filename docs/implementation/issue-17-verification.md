# Issue #17: documentation remediation verification

Date: 2026-11-10 (PKT). This records checks executed during the final remediation,
not results copied from the earlier login report or PR #20.

## Workspace and scope

- Workspace: `E:/FYP/e-clearance-management-system`.
- Branch verified before edits: `feature/local-demo-postgresql`.
- HEAD: `db7e561f15e19e22ef88e6290adb6fb7d11ae0f8`.
- Documentation edited: `student-flutter-handoff.md`, `student-api-contract.md`,
  `../references/openapi_employee_v1_updated.yaml`, and this verification note.
- The canonical `../references/openapi_employee_v1.yaml` already had working-tree
  changes before remediation. It received no edits during this remediation; its
  diff against HEAD remains 540 added / 111 removed lines.
- No Student backend, shared auth, Employee runtime, schema or migration changes.
  No branch switch, reset, clean, stash, commit, push, merge or issue closure.

## Fresh commands and results

The following commands ran from `E:/FYP/e-clearance-management-system/backend`.

| Command | Fresh result |
| --- | --- |
| `npm run lint` | PASS, exit 0. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run build` | PASS, exit 0 on the approved host-permission retry. The initial sandbox attempt failed with TS5033 / EPERM when writing existing `backend/dist` JavaScript outputs; no source/type error was reported. |
| `npm test` | PASS: 6 files, 72 tests. |
| `npm exec -- vitest run src/modules/employee/employee.schemas.test.ts src/modules/employee/employee.service.test.ts src/modules/employee/employee.routes.test.ts` | PASS: 3 files, 129 tests. These are the explicitly selected database-free Employee suites. |
| `npm run test:demo` | PASS: 5 files, 69 tests. Database clients, migration and seed calls are mocked in these suites. |

From the repository root, `git diff --check` passed. Source/migration/configuration
diff inspection with `git diff --name-only -- backend .github` returned no files.
The requested build regenerated ignored `backend/dist` outputs. Existing ignored
temporary helpers and unrelated untracked files were preserved.

`npm run test:integration`, `employee.integration.test.ts`, database migration,
seed and live database checks were not executed. No fresh PostgreSQL integration
result is claimed; those checks are outside the authorized remediation scope.

## Full OpenAPI and example validation

No tooling was installed. Existing tools were located and used:

- YAML parser: js-yaml 3.14.1 at
  `C:/Users/uibad/.vscode/extensions/ritwickdey.liveserver-5.7.10/node_modules/js-yaml`.
- Validator: AJV 6.15.0 from `backend/node_modules/ajv`, with its Draft-04
  meta-schema registered using `addMetaSchema` and `schemaId: auto`.
- Official validation schema: [OpenAPI Specification 3.0.3 schema](https://github.com/OAI/OpenAPI-Specification/blob/3.0.3/schemas/v3.0/schema.json),
  retrieved read-only through GitHub file access. Blob SHA:
  `71808402f6297eb3b6340ffe336d9b8f94f135e1`.
  Schema ID: `https://spec.openapis.org/oas/3.0/schema/2019-04-02`.

A Node REPL loaded each complete YAML file with `yaml.safeLoad`, compiled the
official schema with AJV, and ran the compiled validator against both documents.
It also resolved every local JSON pointer reference and checked unique operation
IDs, required path parameters and referenced security schemes.

| File | Fresh result |
| --- | --- |
| `../references/openapi_employee_v1.yaml` | PASS: 39 operations, 49 component schemas, 330 resolved reference occurrences after YAML alias expansion. |
| `../references/openapi_employee_v1_updated.yaml` | PASS: 33 operations, 40 component schemas, 272 resolved reference occurrences. Structurally valid, explicitly non-canonical legacy/reference material. |

The secondary file is untracked and `git log --all --oneline --
docs/references/openapi_employee_v1_updated.yaml` returned no history in local
refs. Its original provenance is not inferred. Its remediation changes only the
warning comments and `info` metadata; Employee paths, operations and schemas
remain in place. Its old auth envelopes are explicitly labeled outdated and must
not be used for integration or client generation.

All 10 JSON blocks in `student-flutter-handoff.md` parsed and validated against
the applicable canonical request/response schemas using AJV's OpenAPI nullable
support. All six original JSON examples were preserved. Additional consistency
checks passed for profile identity, active summary versus request detail, the
five department rows, computed progress counts, closed count, latest history
summary and the non-empty request list.

A SHA-256 comparison confirmed all 81 protected files captured before remediation
were unchanged. This includes backend sources, migrations, package/configuration
files, existing `backend/tmp` helpers and unrelated untracked reference/report
files. Neither the protected-file check nor OpenAPI validation accesses a database.

## Decision states and remaining acceptance

All 18 IDs remain present with owner actions in the
[decision register](student-api-contract.md#decision-register-acceptance-and-implementation-follow-up):

- UNRESOLVED: U01, U03, U04, U06, U08, U09, U10, U11, U12, U13, U17, U18.
- PROPOSED: U02, U05, U07, U14, U15, U16.
- No row is ACCEPTED or ACCEPTED-DEFERRED; no authorized acceptance evidence was
  fabricated.

The specific documentation/example and fresh verification gaps are remediated.
Laboratory eligibility may remain configurable/unresolved under Issue #17; that
policy alone does not block documentation completion. Stakeholder acceptance of
the handoff and proposed wire contract is still pending. SAP-ID/profile linkage,
lifecycle decisions and migration/demo coordination remain owned follow-up work
before their dependent implementation. This note does not claim Issue #17 is
fully accepted or closed, or that proposed Student endpoints are live.

## Final Git state

HEAD and branch remain as verified above. `git status --short` after remediation:

```text
 M docs/references/openapi_employee_v1.yaml
?? docs/implementation/issue-17-verification.md
?? docs/implementation/login-debugging-report.md
?? docs/implementation/student-api-contract.md
?? docs/implementation/student-flutter-handoff.md
?? docs/references/openapi_employee_v1_updated.yaml
?? docs/references/schema.prisma
```

The canonical OpenAPI modification and all untracked files other than this new
verification note were already present at the start of remediation. Nothing is
staged or published by this work.
