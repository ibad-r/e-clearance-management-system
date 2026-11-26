# Issue #18 — Phase 3: Implementation readiness and blocker resolution

Inspection date: **11 November 2026 (Asia/Karachi)**. Scope: current repository, live GitHub records, installed migration implementation, and the Phase 2 design delivered in this chat. This report is the only authorized file change. No Student implementation is authorized by this report.

**Verdict: the backend has reusable technical foundations, but the complete Student implementation is BLOCKED pending owner decisions and an agreed integration base.** Phase 2 is a proposal, not an approved schema or API contract. Its applicability model, initialization defaults, lifecycle, identity history, and DTO extensions are insufficiently specified for safe implementation. The ten grouped decisions below identify the exact answers needed. Recommendations in this report do not approve those answers.

## 1. Current verified state

### Repository and live GitHub

| Item | Directly verified result | Evidence / implication |
| --- | --- | --- |
| Local branch | `docs/issue-17-student-api-handoff` | Read with Git; no checkout, fetch, pull, or branch change performed. |
| Local HEAD | `92c8aafd778f6ceabd25ecbf8483bfa1eb172a4c` | [Local commit](https://github.com/ibad-r/e-clearance-management-system/commit/92c8aafd778f6ceabd25ecbf8483bfa1eb172a4c). Initial working tree and index were clean. |
| Live `main` | `00c3594f8791a5f7f4220e13991459560b0bae8c` | Read through live GitHub branch metadata, not a cached remote-tracking branch; [main commit](https://github.com/ibad-r/e-clearance-management-system/commit/00c3594f8791a5f7f4220e13991459560b0bae8c). |
| Local/backend equivalence | All **73 tracked backend and `.github` file blobs** match the live main tree | Recursive immutable GitHub tree was not truncated; no extra remote backend files. Different commit IDs do not imply different backend code. This comparison does not cover ignored local files or database contents. |
| PR #20 | **OPEN, unmerged**, head `c4008dfaa0a77cc5c31c1163ffb666a8d4e20b4c`, branch `feature/student-auth`, base live `main` above | [PR #20](https://github.com/ibad-r/e-clearance-management-system/pull/20). Metadata, all nine changed-file patches, journal and snapshot inspected. GitHub's mergeable flag is not dependency approval. |
| PR #21 | **MERGED**, merge SHA equals live main | [PR #21](https://github.com/ibad-r/e-clearance-management-system/pull/21), merged 10 November 2026 at **20:26:51 PKT**. Its head was the current local HEAD. |
| Issue #22 | **OPEN**; latest returned comment still requests SAP schema/login contract, migration-order approval and demo ownership | [Latest inspected comment](https://github.com/ibad-r/e-clearance-management-system/issues/22#issuecomment-6790054603). No accepted resolutions appear in the inspected records. |
| Student implementation | No Student runtime schema, routes, services, middleware or module tests in current checkout/live main | Inspected `backend/src`, schema exports, app mounts and live backend tree. Existing auth/middleware tests use Student-like email strings; those strings do not implement a Student module. PR #20 adds role/auth test coverage only. |

Recent local history includes Student contract documentation (`92c8aaf`), isolated demo setup (`db7e561`), Employee/JWT integration (`268c470`), PostgreSQL login/JWT authentication (`163fa5a`), and validation/error middleware (`6f8927f`). No repository `AGENTS.md` was found.

PR #20 changes exactly these files, relative to its inspected base:

| File | Current PR purpose |
| --- | --- |
| [backend/src/db/schema/enums.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/enums.ts) | Append `STUDENT` to the existing shared `user_role` enum. Local/main version still excludes it. |
| `backend/drizzle/0001_student_role.sql` **(PR-only)** | Add the shared PostgreSQL role value; no Student business tables. |
| `backend/drizzle/meta/0001_snapshot.json` **(PR-only)** | Role-addition snapshot; ancestry described below. |
| [backend/drizzle/meta/_journal.json](E:/FYP/e-clearance-management-system/backend/drizzle/meta/_journal.json) | Register migration index 1 in the PR; local/main contains only index 0. |
| [backend/src/db/migration.integration.test.ts](E:/FYP/e-clearance-management-system/backend/src/db/migration.integration.test.ts) | Add role-migration scope, rerun and Employee preservation assertions. |
| [backend/src/middleware/requireRole.test.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/requireRole.test.ts) | Add Student/Employee role-boundary coverage. |
| [backend/src/modules/auth/auth.integration.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.integration.test.ts) | Add shared Student email/JWT tests and spoofing rejection; no SAP lookup. |
| [backend/src/modules/auth/auth.schemas.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.schemas.test.ts) | Confirm strict existing email input rejects client identity additions. |
| `docs/implementation/student-auth.md` **(PR-only)** | Auth handoff distinguishing implemented role/email support from blocked SAP work and demo compatibility. |

PR-only paths above are verified in [PR #20's files](https://github.com/ibad-r/e-clearance-management-system/pull/20/files); they are not local files. The existing contract's older PR head `06c1102` is a historical observation, superseded by the current inspected PR head. PR #20's test claims and Ahad's latest comment are author-reported results, **not tests reproduced in Phase 3**.

### What remained valid, changed, or became clearer

| Classification | Finding |
| --- | --- |
| Previous Phase 2 findings still valid | Main lacks Student schema/SAP login; PR #20 is unmerged; shared auth is reusable; Issue #17 documents proposals; one active request/history and the five-department scope remain the starting requirements. |
| Verified project-state changes since Phase 2 | None found in the re-inspected relevant state. The newer PR #20 head supersedes the older observation embedded in Issue #17 documentation, not the Phase 2 inspection. |
| Newly established technical risks | The installed migrator runs all pending SQL in one transaction; demo handling is empty-only rather than a general upgrade mechanism; ledger hashing uses raw SQL bytes; Employee and demo tests are omitted from default CI commands. These refine the earlier readiness assessment. |
| Unknown | Actual local/shared/demo database contents, applied ledgers, production PostgreSQL version, current credential provisioning, external university policy, and any approval outside the inspected records. No database was accessed. |

### Active architecture

[backend/drizzle.config.ts](E:/FYP/e-clearance-management-system/backend/drizzle.config.ts) is generation-only: PostgreSQL dialect, schema entry `./src/db/schema/index.ts`, output `./drizzle`, no connection credentials. [backend/src/db/index.ts](E:/FYP/e-clearance-management-system/backend/src/db/index.ts) provides the application PostgreSQL/Drizzle connection. [backend/src/db/schema/index.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/index.ts) exports the active schema. [docs/references/schema.prisma](E:/FYP/e-clearance-management-system/docs/references/schema.prisma) is legacy/reference material and was not used as the active schema.

The initial SQL/snapshot contain **19 tables, six enums and 30 foreign keys**, using restrictive deletes/no-action updates. [identity.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/identity.ts) and [requests.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/requests.ts) show UUID primary keys with random defaults, named unique/index/check constraints, and timezone-aware timestamps. `updatedAt` uses an ORM update hook: it is not a database trigger, so raw SQL writers must set it explicitly.

Shared [auth.schemas.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.schemas.ts) accepts strict `{ email, password }`. [auth.service.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.service.ts) performs an exact lowercase email lookup, active-user check and Argon2 verification; it has no SAP lookup. [auth.tokens.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.tokens.ts) signs/verifies shared HS256 JWTs with UUID `sub`, role, issuer/audience and bounded TTL. [requireAuth.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/requireAuth.ts) reloads the active PostgreSQL user, requires token/database role agreement and sets `req.auth = { userId, role, user }`. Public `user` has only `id`, `email`, `fullName`, `role`. [requireRole.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/requireRole.ts) checks that trusted role. Future Student profile lookup can use `req.auth.userId` once the profile FK is agreed; neither SAP login nor a client-supplied SAP ID is necessary to authorize an already authenticated user.

## 2. Phase 2 contradiction audit

Audit references: the Phase 2 chat proposal and the current [Student contract](E:/FYP/e-clearance-management-system/docs/implementation/student-api-contract.md), [Flutter handoff](E:/FYP/e-clearance-management-system/docs/implementation/student-flutter-handoff.md), and canonical [OpenAPI document](E:/FYP/e-clearance-management-system/docs/references/openapi_employee_v1.yaml). Their existence/merge does not accept the unresolved U01–U18 decisions. No contract was rewritten here.

### A. Laboratory applicability: two fields without an established authority

Phase 2 proposes both `student_profiles.laboratory_applicability` and `student_request_departments.applicability`. **This is weak unless they have different, explicit responsibilities.** No inspected runtime model, resolver or approved upstream authority establishes the profile value.

The request row should represent the effective determination for that request. A profile field could represent a current reusable determination only if its source, authorized writer, effective date and meaning are approved. At submission, the service would resolve that current source and copy the result into the request transaction, with enough provenance to explain the determination. The request must not continuously read a changing profile field as historical truth.

**Technical recommendation, not approved:** omit the profile-level derived Lab field from Phase 4 unless an approved reusable source requires it; persist effective applicability per request. A future source can be introduced deliberately. This removes an unexplained duplicate but does not solve the missing eligibility authority. Do not substitute a client flag or Employee rule.

If both fields are retained, owner answers must specify copying/provenance, whether later profile changes affect only future requests, and who may explicitly reassess an active request. Historical requests must not silently synchronize; correcting history would require an approved correction policy. An active reassessment must preserve applicability/status consistency and re-evaluate dashboard counts without inventing closure. **D03 blocks this part of implementation.**

### B. Department initialization: contradictory fallback defaults

Four ordinary departments shown as `REQUIRED/PENDING` and unspecified values defaulting to `UNDETERMINED/PENDING` are not one initialization contract. A fallback can disguise missing configuration as an authorized unresolved decision. There is no approval that all four ordinary departments are universally required.

**Recommended contract for review:** the server resolver must return an explicit result for every one of the five rows. Missing resolver output is a configuration failure, distinct from an intentional unresolved result. Insert the parent request and all five rows atomically. Avoid applicability/status database defaults that make omitted decisions appear valid.

If the proposed enums are accepted, the proposed consistency pairs are:

| Explicit resolver result | Proposed initial state | Meaning |
| --- | --- | --- |
| `REQUIRED` | `PENDING` | An approved determination requires this department; no clearance recorded. |
| `NOT_REQUIRED` | `NOT_REQUIRED` | An explicit exemption; never count it as cleared. |
| `UNDETERMINED` | `PENDING` | An intentional unresolved determination; permitted at submission only if Ibad approves. |
| No result / invalid result | No request committed | Configuration is incomplete; the error contract belongs to D08. |

Ibad must approve applicability sources, ordinary exceptions, Lab determination authority, enum/state pairs, Student-visible remarks/timestamps and whether unresolved applicability blocks submission. The roster stays **Library, Fee & Dues, Student Service, Laboratory, Coordination Office**; proposed business codes require acceptance. Transport's historical discrepancy does not reopen this required five-row scope. Examination remains informational and outside progress/clearance.

A FK, code enum and `(request_id, department_code)` uniqueness prevent invalid/duplicate rows but **do not guarantee exactly five rows**. The service transaction and tests must enforce roster completeness. No deferred trigger is assumed.

### C. Lifecycle: the schema cannot be finalized from `isActive` and `closedAt`

Phase 2 correctly deferred policy but still proposed structures whose constraints depend on it. The smallest practical owner input is **one Phase 4 state/transition matrix**, not a complete speculative university workflow.

For each in-scope literal, Ibad must provide: initial/noninitial designation, active/terminal classification, permitted next states, authorized actor, transition conditions and timestamp effect. Also answer whether any closed outcome permits another request, and whether reopening is in scope or explicitly deferred. If a capability is deferred, no endpoint or inferred transition may implement it.

| Technical dependency | Required lifecycle answer |
| --- | --- |
| Request enum and insertion | Exact initial status and any processing states Phase 4 must store. |
| Active lookup, conflict response and dashboard | Exhaustive active/terminal partition, including any unresolved or action-required states. |
| Closure | Authorized closer and conditions; department clearance counts alone are not authority. |
| Subsequent creation | Which outcomes release the active slot and any additional eligibility conditions. |
| `closedAt` and checks | What event records closure, whether every terminal transition requires it, and handling of any legitimately absent historical timestamp. |
| Derived `isActive` | Derive from the approved status partition; `closedAt === null` alone is insufficient. |
| Partial unique index | Predicate must implement that same partition, with non-null status. |
| Reopening | Whether allowed, how the active slot is reacquired, and what happens if another active request exists. |

**BLOCKED by D04.** Do not use Employee `COMPLETED/CANCELLED`, its initial states, approvals, sequential unlocking or cancellation behavior as Student policy. A creation/read-only Phase 4 still needs an approved initial state, active partition and explicit treatment of unsupported closure features.

### D. Identity, academic data and history

| Choice requiring an answer | Technical consequences / recommendation |
| --- | --- |
| `users.fullName` or separate Student name | The shared name exists, but its Student authority is unverified. Using it avoids duplication; a separate authoritative academic name requires a source, writer and synchronization rule. Recommend the shared name only if Ibad confirms it is authoritative. Do not finalize a name snapshot first. |
| SAP authority and normalization | Text preserves leading zeros. Exact string identity is safer than speculative numeric conversion; any approved trim/case canonicalization must match provisioning, unique constraint and Ahad's lookup. SAP uniqueness namespace and reassignment/correction behavior affect account ambiguity. |
| Complete versus partial academic profile | Complete storage can prevent provisioning until academic data exists; nullable academic fields allow incomplete profiles but require explicit submission validation and null DTO rules. The current contract treats five academic/reason fields as submission data, not approved profile fields. Do not silently make them profile prerequisites. |
| Submission validation | Decide requiredness, blank/trim/length/format handling, program text versus controlled identifier, semester representation/meaning, reason wire literals and whether values must match authoritative data. Exact comparison versus approved canonical comparison must be specified; neither is implied by examples. |
| Snapshot versus live history | Snapshots preserve what was submitted/resolved and avoid changing old requests when profiles change. Live joins display corrections immediately but rewrite the apparent historical identity. Recommend immutable submission/identity snapshots after their source is approved. |
| Corrections | Specify who corrects identity/profile data, whether SAP changes are permitted, effects on login and future submissions, and whether history remains captured or receives explicit traceable amendments. Submission must not silently update the profile or change its user link. |

Owner selection and all request predicates must remain based on the verified shared user/profile relationship. SAP/name values in a request body do not prove ownership. **D01, D02 and D06 block the corresponding schema/validation choices.**

### E. References: safe mechanism proposed, business format still open

The contract requires a server reference distinct from the internal request UUID but approves no actual format, sequence or namespace. Phase 2 cannot promise global uniqueness across independent Employee/Student tables.

**Technical recommendation for D05:** an accepted Student prefix plus a random UUID, persisted once under a named Student-table unique constraint. Keep it immutable in creation, detail, list and dashboard/history. Avoid a sequence unless a university numbering requirement exists; never allocate from row counts or `MAX + 1`.

For a recognized reference-constraint collision, retry the **whole rolled-back transaction**, with a new reference, at most three total attempts, following the bounded retry pattern in [employee.service.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.service.ts). Handle approved serialization retries separately from active-request conflicts and unrelated database failures. Exhaustion returns a generic server failure; it must not masquerade as `ACTIVE_REQUEST_EXISTS`. Ibad must accept format/namespace/allocation, the bounded retry rule and stable-history policy. Cross-module uniqueness or a university sequence needs a coordinated design.

Server transaction retries do not solve a client timeout after a successful commit. That requires D08's separate idempotency/recovery contract.

### F. API contract: extensions and mixed conventions require acceptance

Phase 2 adds academic fields to the proposed two-field profile and lifecycle `status` to provisional summaries. **Neither extension is approved.** Their inclusion is a contract change requiring Ibad/Afaq review, not an implementation detail.

[employee.routes.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.routes.ts) uses explicit allowlisted DTOs, `{ data: ... }`, 201 creation, module errors and 422 Zod validation. Shared [validateBody.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/validateBody.ts) uses 400; [errorHandler.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/errorHandler.ts) returns 400 for malformed JSON and generic 500 for unexpected errors. Shared auth has `{ user }`/token responses and 401 `UNAUTHORIZED`. Preserve these existing paths and resolve Student behavior explicitly rather than changing shared middleware or Employee.

D08 must accept one endpoint/DTO/error package: exact profile/request/summary fields and nulls; lifecycle `status` if D04 approves it; five submission keys/reason literals; validation versus configuration/domain errors; missing-profile behavior; list order/pagination; unknown-query handling; and uncertain network retry behavior. A technical recommendation is Student-local strict validation with 422 for body/path/query semantic errors, shared malformed JSON 400, generic auth 401/role 403, owner-constrained 404, and a documented 409 active-request conflict. This is not an accepted error matrix.

For queries, recommend rejecting unknown keys through Student-local validators; do not manufacture errors for parameterless GETs without an actual rule. Explicitly accept unpaginated Phase 4 history with a documented limitation or specify page/cursor fields and ordering before coding; Employee's unpaginated list does not settle Student pagination.

For network recovery, choose persistent idempotency with replay/key scope/expiry rules, or an explicit Phase 4 deferral with a documented fetch-active recovery flow. Do not claim exactly-once creation solely from the active-request index: a timed-out successful request could later close before a retry.

Dashboard progress must count required, cleared-required, action-required, exempt and unresolved applicability separately. Exemptions cannot inflate cleared counts; unresolved applicability prevents an authoritative percentage; no count automatically closes/approves a request. Preserve the proposed no-active shape (`activeRequest: null`, `departments: []`, `progress: null`) only on contract acceptance. Dashboard/history/detail queries need a consistent read snapshot and owner predicates. Student-visible remarks and recorded timestamp/null meanings also require approval; database initialization time is not evidence of a departmental decision.

## 3. Minimal decision register

**All rows are pending.** “Recommended” means a technical proposal for review, never an approval. Ibad obtains university/business approval where needed; Ahad owns changes to shared authentication; Afaq is consulted for Flutter compatibility. Explicit deferral is an answer only when its consequence and excluded behavior are documented.

### Business/university decisions — Ibad approval required

| ID | Decision | Available options | Recommended technical option | Why | Decision owner | Blocks implementation? |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | Authoritative Student name | Shared `users.fullName`; separate authoritative Student name | Reuse shared name only if confirmed authoritative; otherwise use the specified academic source | Avoid unexplained duplicate identity and incorrect snapshots | Ibad/business owner | **YES:** profile and identity snapshot |
| D02 | Academic completeness, validation and history corrections | Submission-only fields or approved profile storage; full/partial profile; snapshot/live history; exact/approved canonical comparisons | Keep academic submission data separate from profile unless approved; validate explicitly; capture immutable history with explicit correction rules | Avoid silent profile edits and changing historical submissions | Ibad/business owner | **YES:** fields, nullability, creation and history |
| D03 | Department applicability and initialization | Approved current source + captured request result, or request-only determination; unresolved accepted/rejected; approved initial pairs/writers | Request effective result; no duplicate derived profile Lab field absent a real source; explicit five-result resolver without fallback defaults | Missing configuration must not appear as a policy determination | Ibad/business owner | **YES:** department schema, insertion and progress |
| D04 | Minimal Phase 4 lifecycle | Approved initial/processing/terminal matrix; supported or explicitly deferred closure/reopening | One small state/transition matrix defining active partition, closure timestamps, slot release and future-request eligibility | Controls the enum, index and consistency rules | Ibad/business owner | **YES:** request schema and active enforcement |
| D05 | Reference policy | Student namespace or cross-module namespace; random reference or required sequence | Accepted Student prefix + random UUID; immutable unique value; three whole-transaction attempts; server failure on exhaustion | Simple concurrency-safe allocation without invented university numbering | Ibad; business input if numbering mandated | **YES:** reference column and creation contract |

Exact answers required:

- **D01:** name source/table/property, authoritative writer, and whether changes affect future requests only or require a separate historical amendment.
- **D02:** for each of registration number, father's name, program, semester and reason, return type, requiredness, canonicalization/validation and authoritative comparison rule; accept submission-only or specify profile storage/completeness; state snapshots/live history and correction authority/behavior. Include accepted reason literals or their exact replacements.
- **D03:** accept the five business codes; supply each department's applicability source/authority and exceptions; accept/revise enum/status pairs and initial results; state unresolved-submission policy, provenance, active reassessment, and Student-visible remarks/timestamp/evidence requirements or explicit deferrals. Say whether a profile Lab field has an approved source or is omitted.
- **D04:** return the matrix described in section 2C, including initial literal, all Phase 4 active/terminal literals, authorized transitions/conditions, `closedAt`, subsequent eligibility and reopening support/deferral. Explicitly state how Phase 4 represents outcomes whose writer functionality is deferred.
- **D05:** give the accepted format/prefix and uniqueness namespace, random versus mandated sequence, allocation owner, immutable-history rule, retry limit and exhaustion outcome.

### Shared authentication — Ahad agreement required

| ID | Decision | Available options | Recommended technical option | Why | Decision owner | Blocks implementation? |
| --- | --- | --- | --- | --- | --- | --- |
| D06 | SAP identity schema, canonical lookup and provisioning | Text exact/canonical SAP; agreed namespace; complete/incomplete provisioned profile links | Text preserving zeros; unique canonical SAP; one non-null unique profile FK to `users.id`, restrictive deletion; explicit missing-profile/provisioning rules | Ahad needs a real, unambiguous model and stable shared user identity | Ibad supplies schema; Ahad agrees consumption; business input on identity | **YES:** profile schema/SAP integration; completed SAP login is not a prerequisite to all schema development |
| D07 | Shared email/SAP login request | Retain email plus exclusive explicit `sapId`; or agreed `identifier` contract with backward compatibility | Preserve current email/password clients; add exclusive `sapId` only after written agreement; same password/JWT/public-user/error behavior | Avoid aliases, precedence ambiguity and Employee regressions | Ahad + Ibad | **YES:** SAP login/full #16; **NO:** standalone Student schema once D06 is settled |

Exact answers required:

- **D06:** approved schema commit/PR and exact Drizzle file/model/table; SAP property/column/type/format, whitespace/case/zero rules, uniqueness namespace/constraint name; user FK/property, cardinality, nullability/delete behavior; credential/profile provisioning owner; missing/duplicate links and permitted SAP corrections. A schema review may specify these before code exists; the actual Phase 4 schema must then be linked to Ahad before his lookup is integrated.
- **D07:** exact JSON keys and mutually exclusive identifier rule; password unchanged; accepted identifier formats/normalization and any approved email domains; examples for Employee email, Student email and Student SAP; generic invalid-credential behavior and compatibility guarantees. Current code has no domain restriction; none may be invented.

### Technical contract recommendation — acceptance still required

| ID | Decision | Available options | Recommended technical option | Why | Decision owner | Blocks implementation? |
| --- | --- | --- | --- | --- | --- | --- |
| D08 | One Student wire-contract package | Existing proposed DTOs or explicit revisions; 400/422 semantic validation; unpaginated/paginated history; idempotency or explicit recovery/deferral | Allowlisted `{ data }` DTOs, strict local validators, explicit error/null/query rules, stable owner-scoped ordering, consistent progress; decide pagination/idempotency explicitly | Stops schema/API examples from becoming incompatible requirements | Ibad, consulting Afaq; Ahad for shared-boundary compatibility | **YES:** APIs and route assertions; optional features may be explicitly deferred |

**Exact D08 answer:** accept/revise an endpoint-by-endpoint field/null/status/error matrix for the five APIs; approve any expanded profile or summary `status`; supply list ordering and pagination shape or accepted unpaginated limitation; unknown-query behavior; retry/idempotency recovery and exclusions; progress counts/nulls and remarks/timestamp exposure. Reconcile D01–D04 decisions with Issue #17 before implementation; no contract modification is performed in Phase 3.

### Integration — both owners must coordinate

| ID | Decision | Available options | Recommended technical option | Why | Decision owner | Blocks implementation? |
| --- | --- | --- | --- | --- | --- | --- |
| D09 | Base, migration ordering and staged integration | Role-first merge after blockers resolved; or explicitly reviewed coordinated/stacked development with staged merges | Reserve existing role migration ahead of Student business migration; generate from its agreed snapshot; use coordinated development if full SAP dependency prevents role-first merge | Avoid duplicate numbering/ancestry and a circular schema-versus-login merge dependency | Ibad + Ahad; Ibad approves order/merge plan | **YES:** migration generation and dependent integrated work |
| D10 | Separate demo compatibility ownership/upgrade scope | Ibad owns separate task; or separately authorizes another owner; reviewed upgrades or explicit supported-version limits | Ibad owns a separately scoped compatibility task with exact manifests and known-prefix upgrades; reject unknown/partial state | #16 excludes demo edits; changing a count does not support safe upgrades | Ibad approves/assigns; Ahad supplies exact role artifacts | **YES:** demo compatibility and current PR #20 readiness gate; **NO:** independent Student schema coding after an agreed base |

Exact answers required:

- **D09:** reserve `0001_student_role` before Student business SQL or supply an explicit alternative; name the approved starting commit/snapshot, generation owner, SAP development base, merge sequence and review gates. If role-only PR #20 can land before SAP completion, explicitly approve that staged acceptance; its current “do not merge until dependencies resolved” description cannot be silently relaxed by this report.
- **D10:** name the separately authorized owner/task, approved migration versions and whether verified old demos may upgrade; require reviewed SQL/raw ledger handling, fresh/old/unknown-state tests and data preservation. If upgrades are deferred, explicitly state that verified old demos remain blocked for manual review rather than being silently adopted.

## 4. Migration and integration dependency plan

### Actual migration chain

| Scope | SQL / journal | Snapshot ancestry |
| --- | --- | --- |
| Current local/main | [0000_employee_clearance.sql](E:/FYP/e-clearance-management-system/backend/drizzle/0000_employee_clearance.sql); journal version 7, `idx=0`, `when=1793031755049`, tag `0000_employee_clearance` | [0000_snapshot.json](E:/FYP/e-clearance-management-system/backend/drizzle/meta/0000_snapshot.json): ID `09037170-ad3f-4904-ad7b-50bc8e0f1726`, zero UUID parent. |
| PR #20 only | `0001_student_role.sql`; `idx=1`, `when=1794215907667`, tag `0001_student_role` | ID `125d33dc-8e97-4f69-bea5-49f09e7df513`; parent is the initial snapshot ID above. |
| Student business migration | **NOT CREATED.** Number/name/timestamp depend on D09 and the chain at generation time | Generate from the approved latest snapshot. Do not invent IDs or hand-edit ancestry. |

PR #20's entire new SQL is:

```sql
ALTER TYPE "public"."user_role" ADD VALUE 'STUDENT';
```

A recursive comparison of its generated snapshot with the current initial snapshot found only snapshot identifiers and the additional `STUDENT` role value differ. Employee table definitions, columns, indexes, constraints and other enum values are unchanged in that patch. Its LF-normalized SQL SHA-256 is `859e063b4fa3074afcd0802540af357eef9c08b97cb23020d537e38e9f4865ca`.

**Ordering recommendation pending D09:** preserve the reviewed initial/role artifacts, then generate Student business additions from the role-inclusive snapshot. If that remains the complete chain, the next generated business migration would ordinarily follow index 1; do not reserve a guessed filename or overwrite a separately generated migration. Verify journal ordering and increasing timestamps together: lexical filenames alone do not control the installed migrator's pending detection.

### PostgreSQL transaction constraint and installed Drizzle behavior

Directly read [installed migrator.js](E:/FYP/e-clearance-management-system/backend/node_modules/drizzle-orm/migrator.js) and [installed pg-core/dialect.js](E:/FYP/e-clearance-management-system/backend/node_modules/drizzle-orm/pg-core/dialect.js). They read SQL in journal order, hash raw SQL text, select the last ledger timestamp, and run **all pending migrations in one transaction**. Statement breakpoints do not create commits. The migration ledger schema/table is created before that DDL transaction. Existing ledger hashes are not automatically compared to source hashes by the generic migrator.

[PostgreSQL 18 ALTER TYPE documentation](https://www.postgresql.org/docs/18/sql-altertype.html) states that an enum value added inside a transaction cannot be used until after commit. Consequently, merely placing Student SQL after the role SQL does not establish a commit boundary.

**Technical recommendation:** make Student business DDL independent of consuming the newly added shared `'STUDENT'::user_role` value. A FK from the profile to `users.id` does not consume that enum value. Review defaults, checks, predicates, functions and data statements for such consumption. Shared authentication/service role checks remain necessary because a user FK alone does not enforce a Student role. If approved business constraints actually require the new value during migration, owners must agree and test a staged application/commit procedure; do not patch the migrator or add a new guard workaround in Phase 3.

Student-specific enums created with their complete values are a separate case from adding a value to the existing shared role enum. Their literals still require owner acceptance.

### Database scenarios and acceptance gates

| Scenario | Required future procedure / verification |
| --- | --- |
| Fresh isolated database | Apply the complete approved chain using the guarded test path. Test the combined transaction; no Student SQL or fixture insert may consume the newly added role before commit. Provision fictional Student users only after migration completion. Verify all expected Student objects and preservation of Employee definitions. |
| Existing Employee-only database | Rehearse upgrade from the exact initial migration with fictional Employee data and a verified ledger. Both role and business SQL may be pending in the same transaction, so the same enum restriction applies. Assert Employee rows, columns, constraints, indexes and enum values remain unchanged. |
| Already-role-migrated database | Verify the initial+role prefix and committed role value; apply only later approved Student SQL. Test preservation of both shared roles and Employee data. This path does not prove fresh-install safety. |
| Already fully migrated database | Rerun the approved runner and assert no duplicate ledger entries, schema changes or data mutations. Rerun safety depends on a correct ledger and unchanged artifacts. |
| Unknown/partial/mismatched history | Stop for explicit review. Never fabricate ledger entries, reset, silently adopt or assume timestamp skip proves compatibility. |

The role SQL has no `IF NOT EXISTS`; manually replaying it is not safe after the value already exists. The normal runner skips a correctly recorded migration, but timestamp-based skipping cannot validate a rewritten SQL file. Preserve applied artifacts byte-for-byte and keep deployment/ledger compatibility checks separate from a successful no-op rerun. Production/shared database migration execution is outside this phase and outside the repository's test-only runner authorization.

### Avoiding a circular dependency

**Student schema development can proceed without completed SAP login** once D01–D06/D09 establish the relevant approved schema and development base, and Phase 4 is authorized. Shared role/JWT support needs the existing `users` row; a Student service can resolve a profile by verified user UUID. SAP lookup needs the actual profile model and canonical SAP constraint, not completed clearance APIs.

PR #20 currently says not to merge until SAP, migration ordering and demo dependencies are resolved/reviewed. A simplistic “merge PR #20 first, then create its prerequisite profile” plan can deadlock. D09 must choose either an explicitly approved staged role-first acceptance or coordinated development from reviewed commits with an agreed eventual merge sequence. In the latter case, Ibad can expose the reviewed profile schema commit to Ahad before main integration; Ahad must validate against that real model. Do not loosen PR #20's blockers by implication, fabricate a temporary lookup or create competing auth/migration changes.

### Employee regression protection

Reuse technical conventions from [employee.service.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.service.ts): injected Drizzle executor, trusted principal, active-user/profile recheck, owner-constrained reads, repeatable-read transactions, profile/user locking, atomic writes and named-constraint handling with bounded retries. The existing [requests.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/requests.ts) demonstrates a database-enforced active-slot partial unique index; only its mechanism is reusable. Its predicate and workflow meanings are Employee-specific.

Student tables/enums should be separate business objects linked to the shared user identity. Avoid changing Employee tables, states, routes, FC restrictions, templates, stage/approval order or shared password/JWT behavior. Migration diff review must explain every shared-object change; the known role addition belongs to Ahad's existing PR.

[activity.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/activity.ts) links both `audit_logs.request_id` and `notifications.request_id` to **Employee** `clearance_requests`. Do not put Student request IDs in those columns or change the FK to accommodate them. If Student auditing is required, review a compatible use of existing generic entity fields/null Employee request link or separately scope the needed design; Employee's audit insert cannot be copied verbatim.

## 5. Separate demo compatibility task specification

**Proposed task; not created or authorized here:** review demo migration manifests and supported upgrades for the approved role+Student chain. Suggested owner **Ibad**, unless he explicitly assigns a separately scoped task to someone else. Ahad supplies PR #20's exact artifacts; demo changes do not belong to his current #16 scope. D10 assigns ownership and upgrade policy.

### Current assumptions directly verified

- [demo-migrations.ts](E:/FYP/e-clearance-management-system/backend/src/db/demo/demo-migrations.ts), `reviewedDemoMigrations()`, requires exactly one SQL file and journal entry, initial tag/index/timestamp and LF-normalized hash `4813e3c8f6d4365ff4a7404e6a90ef0176dcb8b730aa5f6f9971c960005eff52`.
- Its catalog allowlist expects the original **19 tables and six enum names/counts**, plus the Drizzle ledger and sequence. Unexpected relations/routines/triggers or missing objects are blocked. Object names/counts do not prove unchanged columns, constraints or enum values.
- Ledger rows must match migration timestamps and the hashes returned by `readMigrationFiles()`; those are **raw-byte SQL hashes**, unlike the LF-normalized source approval hash.
- `migrateDemoDatabase()` obtains an advisory lock, migrates only a verified **empty** target and leaves an already-ready target unchanged. An old known prefix is not an automatic upgrade path: it is currently blocked once expected history/catalog changes.
- [demo-migrations.test.ts](E:/FYP/e-clearance-management-system/backend/src/db/demo/demo-migrations.test.ts) calls `reviewedDemoMigrations()` at import time. PR #20's second file/entry therefore contradicts the guard before that suite collects. This incompatibility is directly evident from source; Phase 3 did not execute the suite.
- [demo-database.ts](E:/FYP/e-clearance-management-system/backend/src/db/demo/demo-database.ts) requires development mode, explicit confirmation, PostgreSQL 18, database/role `e_clearance_demo`, and loopback `127.0.0.1:55477`. Preserve these target/credential safeguards. Actual demo state is **UNKNOWN**.

### Required separately reviewed work

| Area | Task requirements |
| --- | --- |
| Expected additions | Capture the final accepted Student profile/request/department tables, enums, constraints, indexes and shared role change. Phase 2's candidate three tables/five Student enums would total 22 public tables/11 enums only **if accepted**. Do not hardcode draft counts or imply these objects already exist. |
| Migration allowlist | Maintain exact reviewed tag/index/timestamp/SQL hash entries for the initial, role and approved business migration(s), with correct journal/snapshot ancestry. Reject additional/reordered/missing/changed artifacts; widening the expected count to two or three is insufficient. |
| Version manifests | Specify reviewed catalog expectations for initial-only, role-only addition and final Student versions, including relevant definition/enum checks. Preserve original Employee expectations at every supported version. |
| Fresh demo | Verify unchanged target guards and explicit reviewed-migration confirmation, lock and full-chain enum safety. Validate final catalog/ledger before existing Employee seeding/verification. Student demo seeding is not implicitly included. |
| Existing demo | Only if D10 authorizes upgrades: recognize an exact known migration prefix and compatible catalog, apply only the reviewed suffix under the verified connection/lock, then validate final state. Preserve Employee/demo data and document supported source versions. A count/catalog-only patch cannot accomplish this. |
| SQL/ledger hashes | Distinguish LF-normalized approval hash from raw SQL ledger hash. Account explicitly for reviewed checkout line endings without rewriting old artifacts or silently adopting a mismatched ledger. Unknown raw hashes require review. |
| Unknown/partial database | Reject unknown objects, inconsistent definitions, missing/out-of-order ledger entries, unexpected raw hashes, and partial schema. Keep manual review behavior; no resets, automatic repair or ledger fabrication. |
| Failure/rerun | Verify lock release, known-state validation after failure and safe fully migrated rerun. Do not infer an empty database merely because the ledger is absent. |

Required future tests: exact allowlist acceptance/rejection including changed hash/order/timestamp; all approved source versions; empty full-chain setup; known-prefix upgrades; already-final rerun; preservation of fictional Employee rows and definitions; unknown/partial/mismatched state rejection without writes; target/confirmation guards; raw-versus-normalized hashing; lock release on failure. Unit doubles can verify refusal paths, but real fresh/upgrade semantics need a separately verified isolated PostgreSQL 18 environment. No demo code or database changed in this phase.

## 6. Ownership and dependencies

| Work | Owner | Prerequisites / handoff | Boundary |
| --- | --- | --- | --- |
| University/schema decisions D01–D05 | Ibad, obtaining business answers | Exact decisions/accepted deferrals | No model may approve policy on his behalf. |
| SAP schema contract D06 | Ibad supplies; Ahad agrees lookup | Accepted identity rules; reviewed schema commit before consuming actual model | Student profile belongs to #18; shared auth remains Ahad's work. |
| Shared login D07, #16/#22 | Ahad, coordinated with Ibad | D06/D07; real model; shared role integration | Preserve Employee email/password/JWT/public DTOs; no new auth stack. |
| Student API wire package D08 | Ibad, consulting Afaq | D01–D04 and consumer acceptance | Reconcile Issue #17 examples explicitly; no changes in Phase 3. |
| Base/migration sequence D09 | Ibad + Ahad | Exact commits, role-first or coordinated plan, owner review | No competing role migration, guessed numbering or manual snapshot repair. |
| Student business schema/migration/APIs | Ibad | Relevant accepted D01–D09 answers and explicit Phase 4 authorization | Separate Student business objects; necessary schema export/app mounting only. |
| Separate demo compatibility D10 | Ibad or explicitly assigned owner | Approved role artifacts; final Student manifest for final-version support | Separate scope; not silently added to #16/#18 implementation. |
| Cross-module acceptance | Ibad + Ahad; Afaq for payloads | Reviewed integrated chain, real regression evidence and resolved merge gates | Report author claims separately from reproduced checks. |

After contracts/base are settled, Ibad's profile/clearance work and Ahad's shared SAP validator/query/tests can develop in parallel. Ahad needs Ibad's real profile model before integration, but Ibad does not need completed SAP login to create that model. A demo owner can review role-only compatibility first and extend the manifest once business SQL is final. Migration generation and shared integration remain coordinated, not independently competing tasks.

## 7. Readiness assessment and critical path

### Ready — reusable foundations, subject to technical review and Phase 4 authorization

- Shared PostgreSQL/Drizzle UUID identity, auth/role middleware, injected services, owner filters, explicit DTO serialization and module error handling are established patterns.
- Separate Student ownership queries and the five-row atomic insertion mechanism can use those patterns after their fields, resolver results and contract are accepted.
- Repeatable-read dashboard/detail/history reads, database active-slot enforcement, collision/serialization handling and fixture-isolation patterns have working Employee examples. Their Student meanings and concurrency evidence still need design/validation.
- Fresh/upgrade migration rehearsals and explicit Employee regression coverage can be planned without guessing university policy.

“Ready” is technical readiness for reviewed work, not permission to implement during Phase 3. The approved five-department roster and ownership requirement do not independently settle enums, lifecycle or eligibility.

### Blocked

Full Student schema/API implementation is blocked by D01–D06/D08/D09's unresolved schema/business/contract choices. Student routes cannot use `requireRole("STUDENT")` on current main's enum. SAP login/full #16 acceptance is blocked by D06/D07 and actual schema integration. Migration generation is blocked by D09's base/order; demo compatibility/current PR #20 merge gate is blocked by D10 and its reviewed implementation. Business policy outside the repository remains unknown until Ibad supplies it.

No requirement to finish SAP login before every Student development task is inferred. Conversely, independent development does not mean the final integrated feature or PR #20 is ready to merge.

### Exact critical path

1. **Ibad supplies D01–D05 and D06's schema identity contract; Ahad/Ibad agree D07.** Accept explicit deferrals only with excluded behavior. These answers may be collected together; no code is written to discover policy.
2. **Ibad/Afaq accept D08**, reconciled with the approved business fields/lifecycle, rather than treating Phase 2 examples as final wire requirements.
3. **Ibad/Ahad resolve D09 and assign D10.** Record the approved base commit/snapshot and staged merge plan. Assignment alone does not resolve demo compatibility or authorize a premature PR #20 merge.
4. **Obtain explicit Phase 4 authorization** for Student-only implementation on that base. With relevant contracts settled, Ibad can create the reviewed schema and publish its exact model/constraint commit for Ahad; Ahad can independently complete SAP integration against it. Any temporary stacked development must be explicitly covered by D09.
5. **Generate/review Student business migration only from the agreed chain.** Rehearse fresh, initial-only and already-role-migrated upgrades and reruns in approved isolated test environments; preserve Employee behavior/data. The separate demo owner implements the reviewed compatibility scope.
6. **Review actual evidence and integrate in the approved order.** Resolve PR #20/#22 merge gates or explicitly approve staged acceptance, run the affected shared/Employee/Student/demo checks, and confirm consumer DTOs before claiming end-to-end readiness.

Steps 1–4 are the prerequisites for starting Student implementation; steps 5–6 are implementation acceptance/integration gates. Partial schema work can start only when its own decisions and the development base are settled, not by assuming all pending rows are approved.

### Recommended Phase 4 scope and prerequisites

After explicit authorization, Phase 4 should cover **Student-only Drizzle schema, reviewed business migration, services, validation, five APIs and focused tests**, on the agreed dependency base:

1. `GET /api/v1/student/profile`
2. `GET /api/v1/student/dashboard`
3. `POST /api/v1/student/requests`
4. `GET /api/v1/student/requests`
5. `GET /api/v1/student/requests/:requestId`

Implement only accepted fields/enums/nulls/lifecycle capabilities; create the linked profile/request/department objects, named constraints/indexes, trusted-user ownership predicates, atomic five-row submission, immutable reference/snapshots as approved, active conflict handling and consistent dashboard/history reads. No Student endpoint may write departmental outcomes/applicability based on client identity or state fields.

[app.ts](E:/FYP/e-clearance-management-system/backend/src/app.ts) currently orders Helmet, CORS, JSON parser, health, `/api/v1/auth`, protected `/api/v1/employee`, not-found then global error handler. The future `/api/v1/student` mount belongs **before not-found**, using shared `requireAuth`, shared `requireRole("STUDENT")` and explicit trusted principal mapping. The Employee mount and shared auth behavior must remain intact. Its current router comment saying “unmounted” is stale; the actual app mount is authoritative.

Preconditions: accepted relevant decision rows or explicit scoped deferrals, role-capable reviewed base, agreed migration ancestry/order, consumer contract acceptance, independently verified isolated PostgreSQL test environment, explicit regression commands, and separate demo ownership/merge-gate plan. Completed SAP login is required for the final promised email-or-SAP experience, but need not block schema development under the approved coordinated plan.

Shared SAP login changes stay with Ahad; demo compatibility stays separately scoped. Phase 4 does not automatically include Student signup, account provisioning endpoints, department writer/approval APIs, certificates/transcripts, sequential workflows, lifecycle operations or idempotency storage unless specifically accepted and authorized. No Phase 4 work has begun.

## 8. Verification plan and exact supporting files

### Scripts and coverage limitations

Directly inspected [backend/package.json](E:/FYP/e-clearance-management-system/backend/package.json), [vitest.config.mts](E:/FYP/e-clearance-management-system/backend/vitest.config.mts) and [backend-ci.yml](E:/FYP/e-clearance-management-system/.github/workflows/backend-ci.yml):

| Script | Actual purpose / limitation |
| --- | --- |
| `npm run lint` | `eslint src` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc`; writes compiled output, not run here |
| `npm test` | Six explicit app/guard/middleware/auth-schema test files; excludes Employee module tests |
| `npm run test:integration` | Three explicit connection/migration/auth files; excludes Employee module tests |
| `npm run test:demo` | Demo tests plus safe-error tests; not invoked by current CI |
| `npm run db:generate` | Drizzle generation-only configuration; not run here |
| `npm run db:migrate:test` | Guarded test-only migration application; not run here |
| `npm run demo:migrate` | Reviewed guarded demo path; not run here |

There is no general production `db:migrate` script or dedicated Employee test script. Vitest configuration includes `src/**/*.test.ts`, but npm's explicit file selections narrow default execution. Current CI invokes neither Employee's four test files nor the demo suite. Passing its existing commands alone would not establish Employee or demo regression safety, or include new Student tests automatically.

For future explicit Employee regression, from `backend`:

```text
npm exec --no -- vitest run src/modules/employee
```

This command uses installed dependencies and includes PostgreSQL-backed Employee tests. It was **not run in Phase 3**. Adding Student checks to the effective validation/CI plan must be separately reviewed within authorized implementation scope.

[test-database.ts](E:/FYP/e-clearance-management-system/backend/src/db/test-database.ts) requires explicit `TEST_DATABASE_URL`, verifies database `e_clearance_test` and PostgreSQL 18, and uses the verified client for subsequent work. It has a single-client pool. That guard verifies identity/version; it does not prove that the server is disposable or contains only fictional data. Future migrations/fixtures require an independently established isolated environment.

[migrate-test-database.ts](E:/FYP/e-clearance-management-system/backend/src/db/migrate-test-database.ts) verifies the target before invoking the installed migrator. [migration.integration.test.ts](E:/FYP/e-clearance-management-system/backend/src/db/migration.integration.test.ts) currently expects exactly 19 tables/six enums; future coordinated assertions must include accepted Student additions while preserving detailed Employee checks. Draft table/enum counts are not acceptance criteria.

### Meaningful future tests

- Unit/route tests: strict accepted fields, unknown/query/path validation, DTO allowlists/nulls, auth/role spoof rejection, missing profile, owner-only access to profile/dashboard/list/detail/history counts, active conflict, no-active dashboard, reference retries/exhaustion and resolver completeness. Use injected services and Supertest, following [employee.routes.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.routes.test.ts) and [employee.service.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.service.test.ts).
- Database services: atomic parent/five-department insertion and rollback on failure, accepted applicability/state checks, unique profile/SAP/reference constraints, approved active-slot predicate, owner isolation, immutable captured data and consistent progress/history.
- Real concurrent submission: use independent verified connections and committed fictional fixtures. Assert one success and one approved active-request conflict, exactly one parent and five child rows, and no orphan effects. Same-client savepoints and rollback-only nested transactions do not prove this race behavior.
- Cleanup: [employee.integration.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.integration.test.ts) uses rollback-only fixture transactions; [auth.integration.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.integration.test.ts) uses ID-scoped fictional rows/cleanup. Reuse rollback where suitable; committed concurrency fixtures require ID-scoped **child-first** cleanup in `finally`, independently verified clients and no broad truncation/reset. Restrictive FKs determine deletion order.
- Migrations: approved chain/source/snapshot checks; fresh and both upgrade paths; fully applied rerun; preserved Employee definitions/fictional data; enum transaction safety. Separate demo tests are specified in section 5.

### File map for implementation review

All paths below exist in the current checkout. No new Student source filename is claimed to exist.

| Exact file(s) | Current role / reusable evidence |
| --- | --- |
| [backend/src/db/schema/identity.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/identity.ts) | Shared user and Employee identity/FK conventions. |
| [backend/src/db/schema/enums.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/enums.ts), [schema/index.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/index.ts) | Existing shared/Employee enums and schema exports; PR #20 owns shared Student role. |
| [backend/src/db/schema/requests.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/requests.ts), [workflow.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/workflow.ts) | Employee request constraints, captured workflow data and configuration relationships; policy not reusable by default. |
| [backend/src/db/schema/activity.ts](E:/FYP/e-clearance-management-system/backend/src/db/schema/activity.ts) | Audit/notification request FKs are Employee-specific; curated generic entity metadata conventions. |
| [backend/drizzle.config.ts](E:/FYP/e-clearance-management-system/backend/drizzle.config.ts), [drizzle/meta/_journal.json](E:/FYP/e-clearance-management-system/backend/drizzle/meta/_journal.json), [0000_snapshot.json](E:/FYP/e-clearance-management-system/backend/drizzle/meta/0000_snapshot.json), [0000_employee_clearance.sql](E:/FYP/e-clearance-management-system/backend/drizzle/0000_employee_clearance.sql) | Actual generation entry, journal, ancestry and immutable initial DDL. |
| [backend/src/db/index.ts](E:/FYP/e-clearance-management-system/backend/src/db/index.ts), [test-database.ts](E:/FYP/e-clearance-management-system/backend/src/db/test-database.ts), [migrate-test-database.ts](E:/FYP/e-clearance-management-system/backend/src/db/migrate-test-database.ts), [run-test-migrations.ts](E:/FYP/e-clearance-management-system/backend/src/db/run-test-migrations.ts) | Application connection and separate guarded test execution. |
| [backend/src/middleware/requireAuth.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/requireAuth.ts), [requireRole.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/requireRole.ts) | Trusted database-backed principal and role boundary. |
| [backend/src/modules/auth/auth.schemas.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.schemas.ts), [auth.service.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.service.ts), [auth.tokens.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.tokens.ts), [auth.routes.ts](E:/FYP/e-clearance-management-system/backend/src/modules/auth/auth.routes.ts) | Ahad's existing shared email/password/JWT stack and public DTOs. |
| [backend/src/modules/employee/employee.auth.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.auth.ts), [employee.schemas.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.schemas.ts), [employee.types.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.types.ts), [employee.errors.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.errors.ts) | Principal parsing, strict validation, typed service boundary and module errors. |
| [backend/src/modules/employee/employee.routes.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.routes.ts), [employee.service.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.service.ts) | Mounted router factory, DTO allowlists, transactional ownership/configuration checks and retries. |
| [backend/src/modules/employee/employee.schemas.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.schemas.test.ts), [employee.routes.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.routes.test.ts), [employee.service.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.service.test.ts), [employee.integration.test.ts](E:/FYP/e-clearance-management-system/backend/src/modules/employee/employee.integration.test.ts) | Four existing Employee regression files, including isolated database fixtures. |
| [backend/src/app.ts](E:/FYP/e-clearance-management-system/backend/src/app.ts), [middleware/validateBody.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/validateBody.ts), [middleware/errorHandler.ts](E:/FYP/e-clearance-management-system/backend/src/middleware/errorHandler.ts) | Actual mounts/middleware order and shared validation/error behavior. |
| [backend/src/db/demo/demo-migrations.ts](E:/FYP/e-clearance-management-system/backend/src/db/demo/demo-migrations.ts), [demo-migrations.test.ts](E:/FYP/e-clearance-management-system/backend/src/db/demo/demo-migrations.test.ts), [demo-database.ts](E:/FYP/e-clearance-management-system/backend/src/db/demo/demo-database.ts) | Reviewed initial-only source/catalog/ledger guard, test import assumptions, strict demo target. |
| [backend/package.json](E:/FYP/e-clearance-management-system/backend/package.json), [vitest.config.mts](E:/FYP/e-clearance-management-system/backend/vitest.config.mts), [.github/workflows/backend-ci.yml](E:/FYP/e-clearance-management-system/.github/workflows/backend-ci.yml) | Real scripts, test discovery and effective CI coverage. |
| [docs/implementation/student-api-contract.md](E:/FYP/e-clearance-management-system/docs/implementation/student-api-contract.md), [student-flutter-handoff.md](E:/FYP/e-clearance-management-system/docs/implementation/student-flutter-handoff.md), [docs/references/openapi_employee_v1.yaml](E:/FYP/e-clearance-management-system/docs/references/openapi_employee_v1.yaml) | Canonical Student proposals/consumer examples and unresolved decisions; not executable schema or policy approval. |

## 9. Phase 3 execution verification

No tests, builds, package installation, migration generation/execution, seeds, resets or database queries were run. No source/schema/migration/configuration or remote-record mutation was performed; no branch, commit, PR or issue was created or changed. Only read-only Git/source/GitHub/documentation inspection and this report's creation were performed.

Final filesystem/Git verification:

- `git status --short --untracked-files=all` showed only `?? docs/implementation/issue-18-phase-3-readiness.md`.
- Tracked and staged diffs were empty. SHA-256 hashes of all **84 tracked files** matched the pre-report baseline; no tracked files were added or removed.
- Branch remained `docs/issue-17-student-api-handoff`; HEAD remained `92c8aafd778f6ceabd25ecbf8483bfa1eb172a4c`.
- All local file-link targets in this report existed. PR-only files are explicitly labeled and linked through the remote PR, not represented as local files.
- Database/remote records were not changed: no database access or remote mutation tool/command was invoked. Actual database state remains unknown.

Phase 3 does not claim any test passed. The backend remains blocked for full Student implementation until the decision register and integration prerequisites are resolved; Phase 4 requires a new explicit instruction.

