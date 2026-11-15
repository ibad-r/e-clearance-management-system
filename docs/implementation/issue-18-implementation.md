# Issue #18: Student clearance backend

Implemented and verified on 15 November 2026 (Asia/Karachi). This describes the current feature branch; deployment and merging require review. The earlier Phase 3 readiness report is a historical inspection, superseded for this implementation.

## Scope and accepted initial behavior

The owner instructed implementation in this chat and accepted these initial rules on 13 November 2026: four ordinary departments are REQUIRED/PENDING; Laboratory is UNDETERMINED/PENDING; submission is allowed with unresolved Laboratory applicability; request states are IN_PROGRESS, COMPLETED and CANCELLED. Students cannot change statuses.

The implementation reuses shared PostgreSQL users, JWT verification and requireRole("STUDENT") from PR #20. There is no second auth stack. SAP-ID login remains Issue #16/Ahad's work; the existing strict email/password login is unchanged.

## Persistence and migration order

- student_profiles: one mandatory unique user_id FK to users.id; unique case-sensitive text sap_id, preserving leading zeros; registration_number, father_name, program and semester are nonblank text. No duplicate Student-name column: current name comes from users.full_name.
- student_requests: Student-only parent records, unique stable reference, academic/name/SAP submission snapshots, reason, lifecycle and recorded timestamps. A partial unique index permits exactly one IN_PROGRESS record per profile. COMPLETED and CANCELLED require a closed_at at or after submission and release that slot.
- student_request_departments: five independent records per service-created request, unique request/department pair, explicit applicability and source, digital status and optional update timestamp. PostgreSQL rejects inconsistent applicability/status pairs.

Foreign keys use restrictive deletes; no Employee table or workflow is repurposed. ORM updatedAt hooks do not update direct SQL automatically. All future SQL writers must maintain timestamps explicitly.

The generated migration is 0002_student_clearance.sql with its generated snapshot/journal entry. It follows unchanged 0000_employee_clearance and Ahad's unchanged 0001_student_role. It adds three tables, five Student enums, three foreign keys and Student constraints/indexes. It does not alter Employee tables or the shared role enum.

Fresh migration and both initial/shared-role upgrade paths were tested on isolated PostgreSQL 18. Existing migrations were not renumbered, rewritten, or applied to development/demo data.

## API contract

The canonical OpenAPI document is ../references/openapi_employee_v1.yaml. All five routes are mounted under /api/v1/student after shared requireAuth and requireRole("STUDENT"):

| Method/path | Behavior |
| --- | --- |
| GET /profile | Six profile fields: sapId, studentName, registrationNumber, fatherName, program, semester |
| GET /dashboard | Profile, active summary or null, independent departments/progress, closed count and latest closed summary |
| POST /requests | Exactly registrationNumber, fatherName, program, semester and reason; 201 with persisted detail |
| GET /requests | Own summaries, newest submittedAt then UUID first; initially unpaginated; empty array is 200 |
| GET /requests/:requestId | Own detail, captured profile values and five persisted department states |

All responses use { data: ... }; safe errors use { error: { code, message } }. Summaries/details include status, isActive, submittedAt and closedAt. Status is explicit; isActive is true exactly for IN_PROGRESS. No request completion is inferred from progress.

Academic strings remain exact strings, without guessed program lists, registration formats or semester ranges. They must be nonblank and match the stored profile exactly. No profile edit happens during submission. Reason wire literals are "degree completed" and "discontinuing studies". Extra fields, invalid UUIDs and query parameters return 422 VALIDATION_ERROR; differing academic details return 422 PROFILE_MISMATCH. Malformed JSON is 400 under the existing parser.

Ownership always comes from verified users.id. Absent profile is 404 STUDENT_PROFILE_NOT_FOUND; missing and foreign request UUIDs both return identical 404 NOT_FOUND. Missing/invalid JWT is 401; Employee/other role is 403. Client body/query/custom-header identity never selects an owner.

## Submission, history and Laboratory configuration

The service locks the Student profile, validates input against it, resolves all five explicit determinations, then writes the parent and all children in one transaction. The database unique index independently enforces the active slot. A concurrent/duplicate submission becomes 409 ACTIVE_REQUEST_EXISTS. Reference collisions retry the whole transaction at most three times; exhaustion returns 503 REQUEST_REFERENCE_UNAVAILABLE, without partial writes. Deadlock/serialization retries are also bounded.

References are SC- plus 32 uppercase UUID hex characters, unique within Student requests and stable through history. They are not sequential and encode no academic identifier.

Applicability is persisted per request with its source. The server-owned resolveApplicability option receives a read-only profile and must return exactly one explicit result for each department. Missing/duplicate/invalid/source-free output fails with 503 STUDENT_CONFIGURATION_INVALID. This seam supports a later approved eligibility source without inventing an ERP rule or trusting a client flag.

NOT_REQUIRED pairs with NOT_REQUIRED; UNDETERMINED pairs with PENDING; REQUIRED permits PENDING/IN_REVIEW/CLEARED/ACTION_REQUIRED. No request is automatically approved, completed or sequentially unlocked. Remarks remain null in Student responses until visibility is agreed; updatedAt remains null until an update is recorded.

Read operations use repeatable-read transactions so dashboard and department/history data describe one owner snapshot. Later profile updates affect the current profile but never rewrite submitted request identity.

No idempotency-key contract is introduced. After a network timeout, clients should reload dashboard/list before repeating POST; a committed active request will yield 409 on a repeat. Pagination, department status writers, closure authority, eligibility automation, certificate generation, account provisioning and SAP login remain separate follow-up scopes. Tests create closed fictional requests directly; no closure endpoint is added.

## Demo compatibility

The demo guard recognizes only the exact reviewed three-migration chain (normalized source hashes and exact journal identity). It checks actual ledger hashes against raw SQL file bytes. Unknown/mismatched/partial objects or history are refused without reset or adoption.

Known initial/shared-role prefixes are inspectable; seeding requires the full chain. An explicit demo:migrate -- --confirm-reviewed may upgrade an exact verified prefix. This change does not itself migrate or seed the existing demo database.

## Verification

Actual results, against a dedicated PostgreSQL 18 container bound only to 127.0.0.1:55478 with database e_clearance_test:

- npm ci: passed.
- npm run lint: passed.
- npm run typecheck: passed.
- npm run build: passed.
- npm test: 314 passed across 17 files, including Employee and demo regressions.
- npm run db:migrate:test: passed on an empty isolated database.
- npm run test:integration: 124 passed across six files, including Employee/auth regressions.
- Migration tests verified unchanged Employee definitions/data for both upgrade paths, generated snapshot ancestry, exact schemas/constraints and no-op reruns.
- Student tests exercised real signed JWTs on all mounted endpoints, ownership safety, missing profiles, invalid input, snapshots, Laboratory unknown/configured states, history, reference collisions, atomic rollback and real committed concurrency on two independently verified connections.
- git diff --check: passed.

The test commands now include Student and previously omitted Employee tests. Unit tests also include demo guard coverage. Test fixtures are fictional, rollback-scoped where possible; committed concurrency/JWT fixtures use ID-scoped child-first cleanup. No shared development database was reset or modified.

## Integration review

This branch starts at PR #20 head c4008df and reserves that existing role migration before Student 0002. A focused stacked PR can target feature/student-auth; it must be retargeted/rebased onto main after PR #20 is reviewed and merged. Neither PR is self-merged. The branch's successful local tests establish implementation correctness, not deployment or merge approval.
