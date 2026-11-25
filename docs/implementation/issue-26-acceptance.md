# Issue #26 final backend acceptance checklist

Verified 25 November 2026 (Asia/Dubai) on `feature/automated-clearance-hr-selection` in `D:\Fyp\e-clearance-issue-26`. Read all sixteen sections of [the contract plan](issue-26-api-contract-plan.md), reviewed actual implementation/test source and preserved the existing local implementation commit `f893852`. This checkout initially had no unstaged/staged/untracked changes. The separate `e-clearance-management-system` checkout and its merge conflicts were untouched.

No commit, push or merge was performed. All database execution used PostgreSQL 18 `e_clearance_test` at `127.0.0.1:55478`, container `e-clearance-implementation-test`; no dev/demo/shared database was used. The execution wrapper verified the container name, loopback binding and database, kept credentials out of output, then supplied process-local test/app URLs. Fictional committed fixtures were cleaned by exact UUID; transactional fixtures rolled back. Fresh/prefix migration tests removed only their own unique temporary schemas/files within this isolated target.

## Actual final checks

| Command | Final result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: **403 tests, 24 files**, zero failures |
| `npm run test:integration` | PASS: **183 tests, 8 files**, zero failures |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| Guarded `npm run db:migrate:test` | PASS; additive migrations installed only on port 55478 |

Total unit/integration coverage executed: **586 passing tests**. Integration command selects every integration suite plus the guarded connection check, including complete migration rehearsals and configured mounted HTTP workflows. Unit coverage includes demo guard regressions and canonical OpenAPI parse/spec/reference/inventory checks. No existing tests were removed or assertions relaxed; fixtures now contain valid v1 questionnaires, migration counts match the appended chain, and Employee/HR projection assertions verify that the selecting HR identity stays staff-only.

The initial unconfigured unit invocation had 329 passing tests and three import failures because DATABASE_URL was missing; supplying the explicit isolated test environment resolved those failures. Intermediate TypeScript/lint/generator issues were fixed. Final results above come from the complete required check set after the final source changes, not from extrapolated counts.

## Acceptance against actual source and tests

| Plan criterion | Result / concrete evidence |
|---|---|
| Preserve Student ownership, academic snapshots, strict five-field body, duplicates/references | PASS — existing `student.service/routes/schemas` and Student/auth regression suites retained |
| Exactly five independent Student rows and honest applicability | PASS — fixed enum roster, configured applicability validation; tests cover required Laboratory, explicit test exemption, unknown Laboratory and malformed roster |
| Typed automatic rules; missing data/rules never clear/exempt | PASS — shared evaluator tests and saved Student/Employee incomplete outcomes; malformed ISO provenance also remains pending |
| Student overall status/progress/closure | PASS under explicit configured policy — `studentCanComplete` and Student verification atomically close only a valid resolved roster; tests verify completion/history/new active slot and unknown-Lab blocking |
| Safe Student-visible reasons, private remarks protected in both projections | PASS — separate `student_visible_remarks`, curated configured text, service/view projection; router/service and mounted HTTP tests verify matching dashboard/detail and hidden historical notes |
| Verification provenance and immutable history | PASS — retained rule/dataset versions/times/content fingerprints/checked primitives and bounded attempt history; source and tests prove edited rules do not rewrite prior outcomes |
| Internal retries/rechecks | PASS foundation — parent locks, fingerprint deduplication, three-attempt technical bound, explicit obligation-recheck gate, pinned rules, no cleared/terminal reopening; concurrency uses independent guarded connections |
| Employee immutable answers/advice and pending HR | PASS — v1 activation is explicit; submission records answers/advice/audit with null template and zero stages/approvals/checks. Missing template no longer blocks submission |
| Recommendations never assignments | PASS — independent snapshot and configured complete answer mapping; HTTP HR selection deliberately differs from saved advice |
| Three HR APIs with real shared authentication | PASS — mounted app uses requireAuth/HR_OFFICER and service-level active-user reload. Real Argon2 login/JWT fixtures exercise HR queue/detail/confirmation |
| HR scope/FC/self-case/role enforcement | PASS — SQL scope and self-case exclusions, category lock, configured scope fail-closed; service/auth/HTTP tests deny Student/Employee/Admin/Approver, missing scope, inactive users, foreign/non-FC/self cases |
| Strict selection validation and only selected stage/rule creation | PASS — UUID/revision schema rejects duplicates (including case), empty/oversized/extra inputs; scoped active mappings are validated and snapshotted in server order; no unselected stages/checks/approvals |
| Concurrent confirmation and safe replay | PASS — different-set concurrent HTTP confirmation yields one 200/one 409; same-set concurrent requests return the same saved result with one confirmation/check audit. Original revision/order-independent replay is mutation-free |
| Audit rollback and safe operational metadata | PASS — Student and Employee failure-injection tests roll back parent/children/results on audit failure. Student IDs never enter Employee audit requestId FK; raw form/metric/private data is not audited |
| Employee aggregate states and selected progress | PASS — failed selected stage yields ACTION_REQUIRED; incomplete evidence keeps active processing; configured nonempty all-clear closes with timestamp. Missing final policy stays IN_PROGRESS; no fabricated approvals/certificates |
| Legacy compatibility | PASS — historical questionnaire/advice/HR nulls, real children and hidden private Student remarks retained; legacy cancelled null-template lifecycle verified; ordinary internal retries skip legacy Employee cases |
| Additive SQL/snapshot/journal/enum boundaries | PASS — `0000`–`0004` unchanged; `0005`/`0006` appended with valid snapshot ancestry and reviewed demo hashes. New enum use occurs after commit, not in uncommitted enum-alter transaction |
| Fresh and prefix-upgrade migration execution | PASS — installed Drizzle migrator rehearsed fresh and each prefix length 1–6, exact ledger/hash/reruns, preserved legacy row/table OID and pending state/shape constraints, inside the isolated database |
| Configured end-to-end HTTP workflows | PASS — actual mounted Express app, real login/JWT, PostgreSQL persistence and reload; Student completion/holds/history, Employee pending/advice, scoped HR selection, incomplete/hold/clear results, replay/concurrency/authorization |
| All six extensions and three new APIs in OpenAPI/handoffs | PASS — canonical v1.4 schemas, pending enum, questionnaire, safe reasons, staff-only metadata, strict selection/replay/errors and all fourteen mounted Auth/Student/Employee/HR operations validated; other designs explicitly unimplemented |
| Removed Student PATCH / invented institutional policy | PASS constraint — no Student department-write route or human result override added. Real institutional decisions remain explicit configuration/activation blockers |

## Changed files

**35 repository files: 21 modified and 14 added.** Inventory relative to this checkout:

| Group | Files |
|---|---|
| Build/configuration | `backend/.env.example`; `backend/package.json`; `backend/package-lock.json` |
| Additive migrations | `backend/drizzle/0005_verification_attempts_and_safe_reasons.sql`; `backend/drizzle/0006_questionnaire_shape_and_legacy_cancellation.sql`; `backend/drizzle/meta/0005_snapshot.json`; `backend/drizzle/meta/0006_snapshot.json`; `backend/drizzle/meta/_journal.json` |
| Schema/migration guards | `backend/src/db/schema/requests.ts`; `backend/src/db/schema/student.ts`; `backend/src/db/README.md`; `backend/src/db/demo/demo-migrations.ts`; `backend/src/db/demo/demo-migrations.test.ts`; `backend/src/db/migration.integration.test.ts`; `backend/src/db/clearance-migration.integration.test.ts` |
| Student | `backend/src/modules/student/student.service.ts`; `student.types.ts`; `student.views.ts`; `student.verification.ts`; `student.integration.test.ts`; `student.routes.test.ts` (same directory) |
| Employee/HR | `backend/src/modules/employee/employee.verification.ts`; `backend/src/modules/employee/employee.integration.test.ts`; `backend/src/modules/hr/hr.service.ts` |
| Shared verification/contracts | `backend/src/modules/verification/clearance.config.ts`; `verification.policy.ts`; `verification.policy.test.ts`; `clearance-workflows.integration.test.ts`; `openapi.test.ts` (same directory); `backend/scripts/update-issue26-openapi.cjs` |
| Handoffs/canonical docs | `docs/references/openapi_employee_v1.yaml`; `docs/implementation/student-flutter-handoff.md`; `employee-flutter-handoff.md`; `issue-26-configuration.md`; `issue-26-acceptance.md` (same implementation directory) |

Development-only YAML/OpenAPI validator dependencies support meaningful canonical contract tests. An execution helper outside Git is at `D:\Fyp\issue26-checks.ps1`; it contains no saved database credential and validates the isolated target before loading credentials transiently. Generated build output is ignored.

## Remaining blockers and explicit limits

Implementation and required checks are complete within the supplied backend scope. Real activation still needs the [complete Section 16 decision register](issue-26-configuration.md#section-16-decisions-still-open): original form/Figma and questionnaire requiredness/rollout; institutional fourteen-area catalog/category/rule mappings; answer/recommendation meanings; actual HR scope/provisioning/self-selection/empty-set/reassignment policy; approved Student metrics/thresholds/Laboratory applicability; visible wording/retention; extra Student completion and Employee downstream authority/final rules; corrected-data/reopening/exhaustion policy; deployment data/provider and operational retry scheduling.

Completion, HR scope, questionnaire activation, visible wording and obligation rechecks remain explicit gates, not invented defaults. The delivered internal functions do not promise a scheduled retry runner, public recheck or durable asynchronous outbox. Historical plans/prisma/legacy OpenAPI are not authority for new runtime rules.

Configured HTTP testing uses fictional policy and data. It does not establish real university integration, deployed backend acceptance or real Student/Employee Flutter device workflows. Lead/mobile contract review, client enum/strict DTO coordination and actual device acceptance remain external work. No commit, push, merge or outbound coordination message was performed.
