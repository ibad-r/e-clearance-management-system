# Issue #26 — Automated Clearance and HR Department Selection API Contract Plan

Project: E-Clearance Management System
Original author: AbdulAhad176; correction requested by project lead Ibad
Related PR: [#32](https://github.com/ibad-r/e-clearance-management-system/pull/32)
Branch: `docs/issue-26-api-contract-planning`
Mobile coordination: Afaq; [mobile issue #13](https://github.com/ibad-r/e-clearance-mobile/issues/13)
Review date: 25 November 2026 (Asia/Karachi)
Implementation baseline: `origin/main` at `c4d3a50a1676a2f67d3e43d574229c5ed3d0db07`
Original document: `d0156d9685ddff395f7d58deb06a4e05f8284a5d`
Status: Corrected planning contract; additions below are unimplemented proposals.

## 1. Project Workflow Overview

Student clearance is automated for five fixed departments. Employee clearance starts with an Employee submission, then HR confirms which of fourteen possible departments apply, then the backend automatically verifies only those departments. HR selects departments; backend rules determine clearance results. Neither workflow requires a human department approver.

The project lead's 25 November correction request supersedes Issue #26's earlier Student manual status-write proposal and exclusion of HR work, and conflicting historical descriptions in [FYP_MASTER_CONTEXT.md](../../FYP_MASTER_CONTEXT.md), [the recovery sprint](../sprints/sprint-2-student-lifecycle-employee-workflow.md) and earlier handoffs. Those references remain unchanged. `PENDING_HR_VERIFICATION` is an intermediate Employee state, not the end of this plan.

This task changes this planning document only: no API implementation, schema/migration, seed, Flutter code or PR merge. Downstream authority approvals/certificates are separate decisions, not department verification.

### Verified implementation and source evidence

PR #32 was inspected as open/unmerged; its branch differs from reviewed main by this document only. Drizzle/PostgreSQL source and migrations are authoritative.

| Evidence inspected | Finding |
|---|---|
| `backend/src/app.ts`, `server.ts`, module routes | Auth, Employee and Student routers mounted; no HR/Approver/Admin/automated-verification router |
| Student routes/service/schemas/policy/views/types/auth and integration tests | Five implemented APIs, owned transactional creation, initialization, snapshots, progress and suppressed remarks |
| Employee routes/service/schemas/types/auth and integration tests | Four implemented APIs, FC/category eligibility, all-template stage creation, frozen rule snapshots, approval rows, audit and read projections |
| Shared auth routes/service/schema/tokens, `requireAuth`, `requireRole`, `validateBody`, error handler | Verified JWT identity, active account/role reload, validation and safe response envelopes |
| All `backend/src/db/schema/` models, SQL migrations `0000`, `0001`, `0002`, journal | Current enums/columns/indexes/FKs and completion/cancellation constraints |
| `backend/src/db/demo/` configuration/seed/verifier/guards | Employee-only synthetic records; no Student seed or running rules engine |
| Canonical/legacy OpenAPI, Student contract/handoff/Issue #18, Issue #11 dependency/demo notes, local-demo guide, master context and sprint | Current versus stale proposals, paper-form summary and client/migration dependencies |

There are no separate controllers: HTTP adapters are `*.routes.ts`, business operations are `*.service.ts`. No questionnaire persistence, HR selection, recommendation or automatic rule evaluator is implemented. Configuration tables alone do not implement checks.

The canonical [OpenAPI](../references/openapi_employee_v1.yaml) contains older planned HR/Approver/Admin/notification/certificate operations as well as actual APIs. Its HR list/detail paths are designs, not working routes. Its Auth description/`CurrentUser` schema also lag source: Student SAP/combined-identifier login and the `STUDENT` role already exist in reviewed code. The [updated OpenAPI](../references/openapi_employee_v1_updated.yaml) and [Prisma reference](../references/schema.prisma) are legacy references; neither establishes implementation or the active schema.

## 2. Student Clearance Workflow

| Fixed department | Existing code | Current initialization |
|---|---|---|
| Library | `LIBRARY` | `REQUIRED / PENDING` |
| Fee & Dues | `FEE_DUES` | `REQUIRED / PENDING` |
| Student Service | `STUDENT_SERVICE` | `REQUIRED / PENDING` |
| Laboratory | `LABORATORY` | `UNDETERMINED / PENDING` |
| Coordination Office | `COORDINATION_OFFICE` | `REQUIRED / PENDING` |

Current `createRequest()` locks the linked profile, checks the active slot and exact academic fields, resolves server-owned applicability, and writes the parent plus five rows transactionally. It does not read dummy records or determine clearance results.

Required flow:

1. Submit through existing `POST /api/v1/student/requests`; preserve verified ownership, profile snapshots, strict validation and reference/duplicate safeguards.
2. Create exactly five rows; invoke an internal Student verification service using explicit versioned rules and Student dummy data.
3. Determine Laboratory applicability through an approved backend rule. Until one exists retain `UNDETERMINED/PENDING`, keep it visible and block completion. A fixed five-row roster does not establish mandatory Laboratory applicability for every Student.
4. Check each required department independently. Complete positive evidence produces `CLEARED`; a verified obligation produces `ACTION_REQUIRED`. Missing data/rules never produce clearance or an inferred exemption.
5. Persist outcomes, timestamps, safe provenance/audits and overall lifecycle/progress. Existing dashboard/list/detail reads show saved results; GET never performs verification.

Remove the original `PATCH /api/v1/student/requests/:requestId/departments/:departmentCode` proposal and its APPROVER/mount-order alternatives. No public Student department-write route is needed. Students, HR and other human roles cannot approve Student department clearance; updates are internal backend logic.

## 3. Employee Clearance Workflow

Extend the existing Employee case submission to save form details, answers and server-owned recommendations with status `PENDING_HR_VERIFICATION`. Before HR confirmation there are zero stage/approval rows, no department checks, and no fabricated workflow selection.

HR reads Employee information, form details, all answers, recommendation status/reasons and current request status. HR confirms an explicit applicable set. The backend saves that confirmation, snapshots only selected stages/rules and automatically checks those departments. Employee dashboard screens refresh existing case list/detail APIs. Recommendations are advice, never assignments; HR is not restricted to blindly accepting them.

### Questionnaire contract retained from Ahad's document

| Possible department / area | Proposed answer key |
|---|---|
| HDS | `hdsDepartment` |
| Finance | `financeDepartment` |
| Fees and Dues | `feesAndDuesDepartment` |
| Computer Services | `computerServicesDepartment` |
| Operations | `operationsDepartment` |
| CMS Representative | `cmsRepresentative` |
| ORIC | `oric` |
| Store Section | `storeSection` |
| Warden / Hostel | `wardenHostel` |
| Lab In-charge / Office | `labInchargeOffice` |
| Information Services | `informationServicesDepartment` |
| Ward In-charge / Nursing Division | `wardInchargeNursingDivision` |
| Pharmacy | `pharmacy` |
| Head of Department | `headOfDepartment` |

Proposed answer literals: `YES`, `NO`, `NOT_SURE` (display Yes, No, Not Sure). These JSON keys are not existing database department codes. Bind approved questions to active `clearance_departments.id` through versioned trusted configuration. Do not map synthetic demo Library/Assets to the paper roster by name or invent a permanent fourteen-code enum.

The master context summarizes the Teacher Clearance Form: Employee number, designation, department, joining date, last working day, reason, remarks; fourteen areas with Nil/Outstanding/signature; separate authority areas. Existing profile fields cover number/name/designation/department/joining date; existing case fields cover date/reason/remarks. Paper signatures are not questionnaire answers or HR-generated department results.

The original Teacher Form and Figma `Mobile.tsx` are absent from the repository and supplied attachments. Exact wording, requiredness and extra fields remain unverified. Recommend fourteen explicit answers only if confirmed. Do not fill omitted answers with NO/NOT_SURE. Recommendation rules must define answer meaning/profile inputs; absent policy returns explicitly unavailable recommendations, not automatically assigned departments.

## 4. Existing APIs — Reuse

These operations are implemented and are not new API work. Student/Employee successes use `{data:...}`.

| Method / endpoint | Purpose / consumer | Authentication and authorization | Body / validation | Response / transitions |
|---|---|---|---|---|
| `GET /api/v1/student/profile` | Student academic profile | Bearer JWT; active STUDENT; linked profile | No body; empty query only | 200 `data:StudentProfile`: sapId, studentName, registrationNumber, fatherName, program, semester; no transition |
| `GET /api/v1/student/requests` | Student owned history/summaries | Same Student checks; profile-owned query | No body; empty query only | 200 `data:StudentRequestSummary[]`, newest submittedAt then UUID; empty []; saved status/activity/timestamps already supported; no transition |
| `GET /api/v1/employee/profile` | Employee form/profile values | Bearer JWT; active EMPLOYEE; linked FC profile; active category | No body; current handler has no empty-query validator | 200 `data:EmployeeProfile`: ID, number/name/designation/faculty/department/joining date/category ID+object; no transition |

Reuse supporting Auth APIs: `POST /api/v1/auth/login` accepts exactly one of `{email,password}`, `{sapId,password}`, `{identifier,password}` in current source. Email lookup lowercases, SAP is opaque/case-sensitive and Student-profile-linked; combined identifier must resolve to exactly one account. Password is not trimmed. Login validation uses `validateBody` (invalid body: 400); success is 200 `{accessToken,tokenType,expiresIn,user}`, generic invalid credentials 401. `GET /api/v1/auth/me` takes no body, requires Bearer JWT, and returns 200 `{user}` with ID/email/fullName/role; no clearance transition. HR uses an existing separately provisioned HR_OFFICER account; no new login or second auth stack.

## 5. Existing APIs — Extend

All six operations here are already implemented. Retain paths, envelopes, existing fields and security; section 13 defines proposed examples.

### `POST /api/v1/student/requests`

- Purpose/consumer: Student submission; internal automatic verification triggered by this existing write.
- Auth: Bearer JWT, active STUDENT, linked owned profile; no client owner/decision fields.
- Body: exactly registrationNumber, fatherName, program, semester, reason. Academic strings are nonblank and match stored profile exactly. Reason is `degree completed` or `discontinuing studies`; reject extras and nonempty queries.
- Response: existing 201 `{data:StudentRequest}` with summary, captured profile, five departments. Extend the service to evaluate/persist automated outcomes, safe audit/provenance and parent status, then return persisted detail.
- Transitions: new IN_PROGRESS; department PENDING to computed outcomes; valid automatic completion under section 11. Preserve 409 ACTIVE_REQUEST_EXISTS, 422 PROFILE_MISMATCH and bounded reference/deadlock/serialization retries and safe 503 failures.

### `GET /api/v1/student/dashboard`

- Purpose/consumer: Student reads persisted outcomes/progress. No body/query; same Student/profile ownership checks.
- Response: 200 `{data:{profile,activeRequest,departments,progress,history}}`; absent active request gives null activeRequest/progress and empty departments. Counts: requiredCount, clearedRequiredCount, actionRequiredCount, notRequiredCount, undeterminedCount.
- Extend safe automated-reason projection only after approval. Both `departmentsFor()` and `departmentView()` currently force remarks:null; change both for approved visible content and preserve private historical remarks.
- Transition: none. Completed requests move into history; use the POST-returned ID or latestClosedRequest to fetch completed details.

### `GET /api/v1/student/requests/:requestId`

- Purpose/consumer: Student own detail including history; UUID path, no body/query.
- Auth: same Student checks plus studentProfileId ownership; foreign/missing UUIDs both 404 NOT_FOUND.
- Response: 200 `{data:StudentRequest}` containing summary/profile snapshot/five rows; extend the same safe result projection as dashboard. Snapshot identity/private remarks remain protected.
- Transition: none; dashboard/detail must show consistent saved data. No duplicate department GET needed.

### `POST /api/v1/employee/cases`

- Purpose/consumer: Employee submits questionnaire for HR review.
- Auth: Bearer JWT; active EMPLOYEE; linked FC Employee; active category. Owner/initiatedById are verified-identity-derived.
- Existing body rules: lastWorkingDate is a real ISO date (year 0001–9999); trimmed reasonForLeaving 3–500 characters; optional nullable trimmed employeeRemarks maximum 1000. Do not invent institutional date cutoffs.
- Extend body with strictly validated questionnaireAnswers using section 3 keys/literals and approved version requiredness. Server assigns version; reject client IDs/role/status/recommendations/confirmed departments/template/rule/actor/timestamps. No silent answer defaults.
- Current behavior: requires one active category template, creates IN_PROGRESS, every template stage LOCKED, optional approval rows WAITING, rule snapshots and EMPLOYEE_CASE_SUBMITTED audit.
- Replace with pending-HR creation: save form/questionnaire/recommendation, templateId:null, submittedAt set, zero stages/approvals and transactional audit. Missing clearance template must no longer block initial submission; profile/category eligibility stays.
- Response: 201 `{data:EmployeeCase}` retaining existing fields and proposed questionnaire/recommendation/HR-selection fields below.
- Transition: new -> PENDING_HR_VERIFICATION only; preserve database-backed active protection and existing ACTIVE_CASE_EXISTS/code-allocation/serialization conflicts. No pre-HR verification.

### `GET /api/v1/employee/cases` and `GET /api/v1/employee/cases/:caseId`

- Purpose/consumer: Employee history/dashboard refresh and owned detail; no body.
- Auth: same Employee/FC/category checks; every query constrained to verified Employee ID. Detail foreign/missing ID is 404 NOT_FOUND.
- Validation: list accepts only optional status; extend Zod enum for PENDING_HR_VERIFICATION. Detail requires UUID. Preserve current newest initiatedAt then UUID ordering and current detail query behavior.
- Response: list 200 `{data:EmployeeCase[]}` (full cases today); detail 200 `{data:EmployeeCase}`. Extend EmployeeCase, caseViews() and caseResponse() together.
- Add questionnaireVersion, questionnaireAnswers, departmentRecommendation, hrSelection and confirmedDepartmentIds. hrSelection is null before confirmation, otherwise `{verifiedAt,selectionRevision}` for Employees. Staff projection may include actual selecting user ID. Confirmed IDs derive from assigned stage FKs plus recorded HR confirmation, never recommendations.
- Retain stages/approvals/issues/certificateId/form/progress. New pending cases have no stages; new confirmed cases show only selected stages. Legacy cases retain actual historical children and nullable unavailable questionnaire/HR fields.
- Transition: none; GET reload reproduces saved answers/selection/results and never executes rules. No new Employee dashboard, questionnaire-submit or department-refresh endpoint.

## 6. New APIs Required

No HR router/service exists. Reuse canonical OpenAPI's planned HR list/detail resource names as new implementation; do not label them implemented/reuse. Add only these three operations.

All require Bearer JWT, active HR_OFFICER, explicit approved FC/case scope. SYSTEM_ADMIN and APPROVER do not inherit HR rights from legacy role lists. HR scope mapping must be confirmed; fail closed until configured. No Student records through HR routes.

### `GET /api/v1/hr/cases`

- New implementation of already planned path; HR queue/dashboard.
- No body. Strict optional status query accepts Employee enum plus new pending state. Queue uses `?status=PENDING_HR_VERIFICATION`; reject extras. Proposed initial list unpaginated, consistent with Employee; legacy pagination description is not a working contract.
- 200 `{data:HrCase[]}`; empty [] valid. HrCase is `{employee:EmployeeProfile,case:EmployeeCase,selectionRevision:integer}`. Include current form/answers/recommendations/confirmed stages/status and staff confirmation metadata where applicable.
- No transition/checks. Scope predicates must constrain database reads and any later counts.

### `GET /api/v1/hr/cases/:caseId`

- New implementation of planned detail path; HR review. UUID path, no body or query keys.
- 200 `{data:HrCase}` with same projection as list, including answers/version, recommendation reasons/rule version/unavailable state, selection revision and current results.
- Scope-denied/missing case: 404 NOT_FOUND. No transition. Never reuse Employee-only handlers with HR credentials or expose auth rows/raw dummy datasets/private audit content.

### `POST /api/v1/hr/cases/:caseId/confirm-departments`

- New HR action; POST action convention matches planned recheck/cancel/resume-approval routes.
- UUID path; strict body `{departmentIds:UUID[],expectedSelectionRevision:integer}`. Proposed 1–14 distinct IDs, nonnegative revision. Empty-set policy unresolved; initially reject, never complete an empty case.
- Validate scoped pending-HR case, approved questionnaire, active departments in approved fourteen-area catalog, category permissions and valid selected template/rule mappings. HR may deviate from recommendations; reject client clearance statuses/results, actor/Employee/rule IDs and timestamps.
- Transaction: lock parent, compare revision, record selecting HR user/time, bind valid category template, snapshot only selected stages/rules, update to IN_PROGRESS, audit and invoke automatic verification. No unselected children/approval results.
- 200 `{data:HrCase}` with saved confirmation/selected stages/progress/current results. Synchronous rules may already have yielded CLEARED/OUTSTANDING; HR did not decide those outcomes.
- Proposed replay: same set plus original revision after confirmed save returns current saved result with no new rows/audits/check run; compare sets independent of order. Different set/unrelated stale revision/invalid lifecycle: 409 STALE_HR_SELECTION or INVALID_STATUS_TRANSITION. Reassignment after processing requires a separate policy.
- Missing/inactive selected template/rule mapping: 503 WORKFLOW_CONFIGURATION_INVALID, roll back confirmation/children and retain pending. Missing runtime metric is incomplete verification, not success (section 7).
- 422 VALIDATION_ERROR for invalid IDs/body; shared 400/401/403/404/500 conventions apply.

Employee list/detail already meet selected-department refresh needs. No public evaluator or generic department-status write endpoint. Planned HR initiation POST, metadata PATCH, recheck/final approvals/certificates remain separate unimplemented designs, not required duplicate entry points.

## 7. Internal Backend Services / Automated Verification

These are new internal responsibilities, not public endpoints or a new user role.

| Responsibility | Trigger/input | Persisted result |
|---|---|---|
| Student verification | Existing POST after five rows; profile snapshot, approved applicability/rules/Student fixtures | Department applicability/results/provenance/timestamps/audit and aggregate lifecycle |
| Employee recommendation | Employee submission; answers/version/profile/approved rules | Separate recommendation snapshot; unavailable rules explicitly marked |
| HR selection/snapshot | Confirmation action; trusted HR principal/scoped case/IDs/revision | HR metadata, only selected stage FKs/rule snapshots/template/audit |
| Employee verification | Only after HR confirmation; selected stages/pinned rules/Employee dummy records | CHECKING then CLEARED/OUTSTANDING, checked value/safe reason/timestamps, aggregate/audit |
| Shared evaluator | Typed metrics and explicit operator/expected value | Deterministic result; absent/malformed/incompatible/unsupported input fails verification |
| Aggregate/internal retry | Persisted verification attempt, never GET | Consistent progress/lifecycle; bounded idempotent retry with recorded evidence |

Reuse Employee clearance_rules operators EQ/NEQ/GT/GTE/LT/LTE and request_stages.ruleSnapshot. Current service only copies these rules. Student needs a department-code-to-rule adapter; Employee FK-based catalog/template data is not automatically applicable to Student enum rows.

Recommended FYP execution: synchronous bounded local dummy evaluation inside the submit/confirmation transaction, without external calls. Current injected Student/Employee database interfaces expose select/insert/transaction; future mutation services need update-capable transactions. Validate config, evaluate typed inputs, persist outcomes/aggregate/audit, then return saved state. Infrastructure/audit failure rolls back; genuine failed clearance is persisted, not an exception rolling back the request.

Missing evidence is different from an obligation: required Student rows remain PENDING (or IN_REVIEW for an ongoing attempt), unknown Lab remains UNDETERMINED/PENDING; Employee incomplete attempts stay CHECKING with an active parent. Record a safe operational reason internally. Never default to CLEARED/NOT_REQUIRED/SKIPPED or fabricate a user financial hold. Approved visible text may explain pending verification. Structurally invalid five-row applicability output retains existing 503 STUDENT_CONFIGURATION_INVALID.

If asynchronous checks are chosen instead, add a durable transactional outbox/job, dispatch after commit, claim/retry atomically and deduplicate by request/stage plus rule/data version. Fire-and-forget promises and GET-triggered recovery are insufficient. That option needs new storage/infrastructure; the synchronous option must not promise automatic retries until an internal retry runner/schedule is specified. Corrected-data rechecks and reopening cleared results require an approved policy; no client/HR-supplied replacement decision.

Reuse audit_logs. Employee events reference clearance_requests.id; automated events can use actorUserId:null plus explicit system source. Student IDs must never enter audit_logs.requestId (Employee FK): use requestId:null, Student request/department entityId and curated studentRequestId details. A dedicated nullable Student FK is optional for confirmed integrity/reporting needs.

Proposed events: STUDENT_DEPARTMENT_VERIFIED, STUDENT_REQUEST_STATUS_CHANGED, existing EMPLOYEE_CASE_SUBMITTED (pending/zero children), EMPLOYEE_DEPARTMENTS_CONFIRMED (actual HR actor), EMPLOYEE_DEPARTMENT_VERIFIED, EMPLOYEE_REQUEST_STATUS_CHANGED. Audit previous/new status, rule/dataset versions and safe IDs, not raw answers/remarks/profile/body/tokens/passwords. Roll back mutations on audit failure; replay cannot duplicate rows/audit attempts.

## 8. HR Verification and Department Selection

HR dashboard shows form/profile/all answers, recommendation reasons/version or unavailable state, current status and selection revision. NOT_SURE warrants consideration, not automatic exclusion. Exact recommendation/mandatory-category rules remain open.

Before confirmation selected list is empty and no checks have begun. After confirmation the authoritative list is selected stage rows with HR metadata. Do not overwrite recommendation snapshots with confirmed choices. Stage order comes from server configuration, not array order. Employee independent versus sequential processing remains unresolved; Student checks remain independent.

Use existing HR_OFFICER with approved scope and no self-selection on a case linked to that HR account's Employee profile (policy proposed for confirmation). Do not repurpose request_approvals: its assigned-human decision constraints describe a different process. HR return/rejection/delegation/reassignment and later authority approval policies are separate; none permits HR to set department outcomes.

## 9. Database Changes Required

Use existing Drizzle camelCase / SQL snake_case conventions. Every recommendation below is a future change, not an implemented field.

### Existing storage to reuse

| Table / field | Verified reuse/constraint |
|---|---|
| users/employees/categories/student_profiles | Identity/profile links, active/FC/category checks; restrictive FKs |
| student_requests | Snapshot/reference/lifecycle; one active IN_PROGRESS per profile; valid closedAt on terminal status |
| student_request_departments | Five enum-code rows; unique request/code; applicability/source/status/timestamps; private remarks |
| clearance_requests | Employee owner/form/reference/status/timestamps; no duplicate case table |
| clearance_departments/rules/templates/mappings | Existing catalog/category/order/rule configuration |
| request_stages | Selected department FKs; unique request/department and positive unique order; non-null object ruleSnapshot; checkedValue/outstandingNote/check timestamps |
| department_demo_records | Employee-only: non-null Employee FK, department FK, unique Employee/department, object of primitive metrics |
| audit_logs/issues/approvals/certificates | Preserve actual applicable rows/audit; Employee/stage-specific FKs cannot accept Student IDs |

### Necessary modifications and genuinely new data

1. Add PENDING_HR_VERIFICATION to Employee clearance_request_status. No new Student status enum is needed for core automation; Employee failures reuse OUTSTANDING rather than adding Student ACTION_REQUIRED to its stage enum.
2. Add nullable clearance_requests.questionnaireSnapshot JSONB `{version,answers}`. Fixed fourteen-answer immutable snapshots make this less disruptive than a new normalized answer table. Add object/shape checks and version-aware service validation; ORM `$type` is not runtime validation. Keep a versioned registry of exact wording/meaning. Normalize only if approved reporting/per-answer constraints require it.
3. Add separate nullable departmentRecommendationSnapshot JSONB `{status,ruleVersion,departments}` with AVAILABLE/UNAVAILABLE and IDs/safe reasons. Retain what HR saw; never use as assignment storage. JSON UUIDs have no FKs; validate catalog mapping in service, or normalize recommendations if hard FK/reporting needs justify that alternative.
4. Add nullable hrVerifiedById FK to users, hrVerifiedAt, nonnegative selectionRevision (initial 0). Pair actor/time; use revision for concurrency. Assigned stage FKs already persist confirmed departments, so no duplicate confirmed-ID JSONB list/table. Employee DTO omits HR identity; staff DTO can expose it.
5. Permit templateId:null before HR; preserve its FK when populated and legacy non-null values. Add lifecycle checks/service invariants distinguishing new questionnaire cases from legacy cases (null questionnaire snapshot). Pending and cancelled-before-HR cases can have null template; processing new cases require valid template/confirmation. Do not fabricate placeholder templates or require a template for every cancelled historical case.
6. At confirmation bind one active category template as configuration provenance and copy only selected mappings/rules. Template is the possible catalog, not automatic assignment. Missing selected mappings return controlled 503; never drop selected IDs or add other template stages. Confirm template coverage of all approved HR options. Do not create fake per-case active templates: category/version and one-active-template constraints apply, and used mappings/rules are immutable.
7. Student dummy data needs a provider. DB option: new student_department_demo_records with Student-profile FK, existing Student department-code enum, unique profile/code, typed JSON values, dataset version/update time. Existing Employee records cannot store Student IDs. Versioned file fixtures avoid this table; select one provider before implementation.
8. Student rows lack Employee-style ruleSnapshot/checkedValue. Recommend nullable verificationSnapshot for pinned rule/dataset/check provenance if audit plus immutable registry is insufficient. Safe visible reasons should use a separate nullable studentVisibleRemarks field, preserving historical private remarks; 500-character proposal needs approval. Until then return remarks:null. Do not add redundant snapshot fields without retention justification.

Employee outstandingNote already exists in public stage DTOs; only safe generated explanations go there. No new department-result table needed. HR applicability does not create human department approval rows. Preserve legacy approval rows; any downstream authority approvals are a separate confirmed requirement.

### Migration and compatibility requirements

- Append migrations after unchanged 0000_employee_clearance / 0001_student_role / 0002_student_clearance, with SQL/snapshot/journal ancestry preserved. No schema push/reset or startup migration.
- Commit enum additions before statements use new values; PostgreSQL cannot consume an added enum value in the same uncommitted transaction. Review Drizzle transaction boundaries and stage deployment accordingly.
- Add nullable questionnaire/recommendation/HR fields; never fabricate historical answers/actors/recommendations/selection. Legacy actual stages/approvals/status stay readable. Proposed new fields are null and confirmedDepartmentIds [] absent authentic HR metadata, even if legacy stages exist.
- Existing clearance_requests_one_active_employee_idx uses NOT IN (COMPLETED,CANCELLED), so pending HR already remains active under its predicate. Update service/status filters/types/clients; do not replace it with a narrow status set. Student active queries/index stay IN_PROGRESS.
- Preserve completion/cancellation metadata checks. Row constraints cannot enforce five children, approved scope or cross-row completion: lock parent and enforce transactional invariants/unique children.
- Employee read projections fetch children by request ID without joining template, so null templates/empty children are representable. Review every template/status assumption, seed/report/background query and old fixture before rollout.
- Demo tooling pins exact three-migration hashes/ledger/catalog. Future migrations need reviewed guard/manifest changes plus fresh/prefix-upgrade tests; do not bypass safety or reset existing data.
- Current strict Employee POST rejects questionnaire additions, and status query enum rejects pending HR. Coordinate backend/Flutter release and old-client submission policy explicitly; null historical snapshots do not authorize silently missing new answers.

## 10. Authorization and Validation Rules

| Actor | Allowed | Denied |
|---|---|---|
| Student | Existing own profile/dashboard/request submission/list/detail | Status/applicability writes, HR/Employee data, self-clearance |
| Employee | Own existing profile/case submit/list/detail | Recommendations/assignment/result writes, HR selection, other owners |
| HR Officer | New scoped Employee list/detail/department confirmation | Student clearance, result override, unscoped/self-case selection |
| Approver/System Admin | Separately authorized implemented scope only | Automatic inheritance of HR rights or department-result writes |
| Internal services | Validate pinned rules/data, save outcomes/audit | Client decisions or absent evidence treated as success |

Use shared JWT verifier/role middleware before routers and service-level identity/scope/lifecycle checks. requireAuth reloads active user with signed/database role agreement. Body/query/custom-header IDs and unverified JWT payloads never choose owner/scope; UUID and revision are locators/concurrency tokens, not authority. No development bypass.

Keep strict Student empty queries, Employee list status schema, exact Student academic matching, trimmed Employee limits and database-backed active-slot/concurrency checks. New HR contracts reject extras. Existing Employee profile/detail query behavior is preserved unless an explicit compatible validation extension is approved.

| HTTP | Code | Current/proposed meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Existing malformed JSON; Auth body-schema validation |
| 401 | UNAUTHORIZED | Shared authentication/credentials; preserve Employee principal/service UNAUTHENTICATED where emitted |
| 403 | FORBIDDEN | Wrong role/FC eligibility; proposed denied HR scope |
| 404 | NOT_FOUND / STUDENT_PROFILE_NOT_FOUND | Existing missing/inaccessible resource/profile |
| 409 | ACTIVE_REQUEST_EXISTS / ACTIVE_CASE_EXISTS | Existing duplicate active request |
| 409 | REQUEST_CODE_CONFLICT / CASE_CREATION_CONFLICT | Existing Employee allocation/serialization exhaustion |
| 409 | STALE_HR_SELECTION / INVALID_STATUS_TRANSITION | Proposed HR stale/different confirmation or invalid lifecycle |
| 422 | VALIDATION_ERROR / PROFILE_MISMATCH | Existing semantic checks; proposed approved questionnaire/HR validation |
| 503 | STUDENT_CONFIGURATION_INVALID / REQUEST_REFERENCE_UNAVAILABLE / REQUEST_CREATION_UNAVAILABLE | Existing Student configuration/reference/creation failure |
| 503 | WORKFLOW_NOT_CONFIGURED / WORKFLOW_CONFIGURATION_INVALID | Existing Employee config errors; move selected workflow check to HR gate |
| 500 | INTERNAL_SERVER_ERROR | Existing safe unexpected error; no driver messages/stacks/secrets |

Private Student remarks remain hidden in both service/view. Generated reasons require approved allowlisted templates/plain-text rendering; no raw dummy/private audit data. Direct SQL must explicitly set timestamps: Drizzle `$onUpdate` is not a SQL trigger. Selection/status/audit writes use one transaction with concurrency guards.

## 11. Request and Department Status Lifecycle

These are proposed service transitions, not an existing engine.

### Student

Existing parent enum: IN_PROGRESS, COMPLETED, CANCELLED. Department holds keep parent IN_PROGRESS; actionRequiredCount conveys the hold without changing the active index/history logic.

| Current applicability/state | Automatic next state | Condition |
|---|---|---|
| REQUIRED/PENDING | IN_REVIEW then CLEARED or ACTION_REQUIRED | Typed complete fixtures and approved rule; synchronous final result need not expose intermediate state |
| REQUIRED/ACTION_REQUIRED | IN_REVIEW then result | Approved internal corrected-data recheck; trigger remains open |
| UNDETERMINED/PENDING | REQUIRED/PENDING or NOT_REQUIRED/NOT_REQUIRED | Explicit applicability rule; source/applicability/status update together |
| NOT_REQUIRED/NOT_REQUIRED | No check | Proven exemption; never count as cleared |
| CLEARED or terminal parent | No ordinary mutation | Reopening/correction policy still to confirm |

Proposed automatic completion predicate: exactly five unique rows, no unresolved applicability, all required rows CLEARED, exempt rows explicitly NOT_REQUIRED, no incomplete check. Then atomically set COMPLETED and closedAt >= submittedAt with audit. No HR/human Student approval gate. Confirm any extra non-department conditions before implementation. CANCELLED exists in storage but no cancellation endpoint/policy is added.

### Employee

Existing parent enum: PENDING_SUBMISSION, IN_PROGRESS, ACTION_REQUIRED, AWAITING_APPROVAL, RETURNED_FOR_CORRECTION, COMPLETED, CANCELLED. New: PENDING_HR_VERIFICATION. Submitted questionnaire is neither PENDING_SUBMISSION nor department IN_PROGRESS.

| Transition | Actor/precondition |
|---|---|
| New -> PENDING_HR_VERIFICATION | Employee submission saved; no stages/approvals/checks |
| Pending HR -> IN_PROGRESS | Scoped HR confirms explicit set, metadata/stages/rules saved |
| IN_PROGRESS -> ACTION_REQUIRED | System verifies one or more selected stages OUTSTANDING |
| ACTION_REQUIRED -> IN_PROGRESS | Approved recheck clears holds while other checks remain |
| Active -> COMPLETED or AWAITING_APPROVAL | All confirmed stages cleared and confirmed final policy satisfied; later authority requirement remains unresolved |

Existing stage enum supports LOCKED -> CHECKING -> CLEARED/OUTSTANDING; approved recheck can use OUTSTANDING -> RECHECKING -> result. OUTSTANDING is Employee's action-required department outcome. Flutter can display “Action required” without changing its wire enum. SKIPPED exists for history but unselected departments have no rows, not fourteen skipped records. Stage ordering/sequential unlock/reopening need confirmation.

Progress denominator is selected rows, not fourteen/recommendations; existing fields count total/cleared/outstanding/skipped. Zero-stage pending cases never complete. Incomplete checks retain active processing state. HR confirmation alone never clears/completes a case; completion timestamps/final authority requirements must be satisfied without invented approvals.

## 12. Dummy/Test Data Requirements

Current fictional-fc-demo-v1 seeds two synthetic Employee departments (DEMO_LIBRARY_V1, DEMO_ASSETS_V1), EQ-zero rules, two initially unlinked Employees, stage/authority mappings and four metric records. It does not seed fourteen form departments, Student profiles/requests/logins, HR login or a rule engine. Integration test hashes are not demo credentials; existing metrics/thresholds are fictional.

| Scope | Required scenarios/data |
|---|---|
| Student | Five-code applicability/rule coverage; per-profile typed metrics; clear/hold/missing row/missing metric/absent rule/unknown Lab |
| Employee | Approved fourteen-area mapping; dummy/rule coverage for every HR-selectable area; selected subset, changed recommendation, NOT_SURE, hold/missing evidence |
| HR gate | Zero pre-confirmation children/attempts, exactly selected post-confirmation rows, no unselected checks; scoped fictional HR account |
| Compatibility | Legacy null questionnaires/HR metadata and actual children; hidden private Student remarks |

Fixture provider identifies subject, department, metric/type/value, dataset version/timestamp. Pin rules/data per attempt; later edits do not rewrite historical outcomes. Each area needs explicit approved rules; no generic empty-data success. Metric names, thresholds and safe fail messages need lead confirmation; no real university integration is claimed.

Reuse isolated e_clearance_demo guards/stable conflict-checked insert-missing fixtures; preserve used templates and authorized dummy corrections. Provision fictional Student/Employee/HR accounts separately using real auth hashing; no Student APPROVER account. No production seeds, identity bypass or shared-data reset.

Future tests: atomic submission/selection/audit rollback; five Student rows; subset-only Employee rows/no pre-HR checks; positive/negative/missing typed inputs; role/scope/ownership/self-selection; concurrent submissions/confirmation/replay; immutable snapshots/legacy cases; status/progress/closure; migration/guard upgrades and private remarks. This review is static/document validation, not executed backend or real-device E2E tests.

## 13. API Request and Response Examples

Fictional values/IDs only. New fields/endpoints are proposals, not captured live responses. DTO composition notation below references the exact defined objects rather than inventing alternate envelopes.

### Student submission

Existing strict POST body:

```json
{
  "registrationNumber": "DEMO-ST-001",
  "fatherName": "Fictional Parent",
  "program": "BS Computer Science",
  "semester": "8",
  "reason": "degree completed"
}
```

Proposed 201 StudentRequest (remarks stay null until approved visibility):

```json
{
  "data": {
    "id": "20000000-0000-4000-8000-000000000001",
    "requestReference": "SC-20000000000040008000000000000002",
    "reason": "degree completed",
    "status": "IN_PROGRESS",
    "isActive": true,
    "submittedAt": "2026-11-25T06:00:00.000Z",
    "closedAt": null,
    "sapId": "DEMO-SAP-001",
    "studentName": "Fictional Student",
    "registrationNumber": "DEMO-ST-001",
    "fatherName": "Fictional Parent",
    "program": "BS Computer Science",
    "semester": "8",
    "departments": [
      {"departmentCode":"LIBRARY","displayName":"Library","applicability":"REQUIRED","status":"CLEARED","remarks":null,"updatedAt":"2026-11-25T06:00:00.000Z"},
      {"departmentCode":"FEE_DUES","displayName":"Fee & Dues Department","applicability":"REQUIRED","status":"ACTION_REQUIRED","remarks":null,"updatedAt":"2026-11-25T06:00:00.000Z"},
      {"departmentCode":"STUDENT_SERVICE","displayName":"Student Service Department","applicability":"REQUIRED","status":"CLEARED","remarks":null,"updatedAt":"2026-11-25T06:00:00.000Z"},
      {"departmentCode":"LABORATORY","displayName":"Laboratory","applicability":"UNDETERMINED","status":"PENDING","remarks":null,"updatedAt":null},
      {"departmentCode":"COORDINATION_OFFICE","displayName":"Coordination Office","applicability":"REQUIRED","status":"CLEARED","remarks":null,"updatedAt":"2026-11-25T06:00:00.000Z"}
    ]
  }
}
```

GET detail returns the same saved DTO. Summary consists of id/requestReference/reason/status/isActive/submittedAt/closedAt; list returns `{data:[summary]}`. Dashboard is `{data:{profile,activeRequest:summary,departments,progress,history}}`, using the six profile fields and these five rows. This example progress is `{requiredCount:4,clearedRequiredCount:3,actionRequiredCount:1,notRequiredCount:0,undeterminedCount:1}`; history `{closedRequestCount:0,latestClosedRequest:null}`. No-active response keeps history, null activeRequest/progress and [] departments.

### Employee questionnaire submission

Proposed POST extension with all fourteen answers:

```json
{
  "lastWorkingDate": "2026-12-31",
  "reasonForLeaving": "Resignation",
  "employeeRemarks": "Please review my clearance submission.",
  "questionnaireAnswers": {
    "hdsDepartment": "YES",
    "financeDepartment": "NO",
    "feesAndDuesDepartment": "NOT_SURE",
    "computerServicesDepartment": "YES",
    "operationsDepartment": "NO",
    "cmsRepresentative": "NOT_SURE",
    "oric": "NO",
    "storeSection": "YES",
    "wardenHostel": "NO",
    "labInchargeOffice": "NOT_SURE",
    "informationServicesDepartment": "YES",
    "wardInchargeNursingDivision": "NO",
    "pharmacy": "NO",
    "headOfDepartment": "YES"
  }
}
```

Proposed 201 full EmployeeCase, with unavailable recommendations because no approved answer mapping is assumed:

```json
{
  "data": {
    "id": "10000000-0000-4000-8000-000000000001",
    "requestCode": "EC-10000000-0000-4000-8000-000000000002",
    "employeeId": "10000000-0000-4000-8000-000000000003",
    "status": "PENDING_HR_VERIFICATION",
    "reasonForLeaving": "Resignation",
    "lastWorkingDate": "2026-12-31",
    "employeeRemarks": "Please review my clearance submission.",
    "questionnaireVersion": "v1",
    "questionnaireAnswers": {
      "hdsDepartment": "YES",
      "financeDepartment": "NO",
      "feesAndDuesDepartment": "NOT_SURE",
      "computerServicesDepartment": "YES",
      "operationsDepartment": "NO",
      "cmsRepresentative": "NOT_SURE",
      "oric": "NO",
      "storeSection": "YES",
      "wardenHostel": "NO",
      "labInchargeOffice": "NOT_SURE",
      "informationServicesDepartment": "YES",
      "wardInchargeNursingDivision": "NO",
      "pharmacy": "NO",
      "headOfDepartment": "YES"
    },
    "departmentRecommendation": {"status":"UNAVAILABLE","ruleVersion":null,"departments":[]},
    "hrSelection": null,
    "confirmedDepartmentIds": [],
    "initiatedAt": "2026-11-25T06:10:00.000Z",
    "submittedAt": "2026-11-25T06:10:00.000Z",
    "completedAt": null,
    "cancelledAt": null,
    "stages": [],
    "approvals": [],
    "issues": [],
    "certificateId": null,
    "progress": {"totalStages":0,"clearedStages":0,"outstandingStages":0,"skippedStages":0}
  }
}
```

AVAILABLE recommendation shape: `{status:"AVAILABLE",ruleVersion:"<pinned-version>",departments:[{departmentId:"<catalog-uuid>",departmentCode:"<configured-code>",departmentName:"<catalog-name>",reason:"<safe-rule-reason>"}]}`. These are suggestions; IDs/rules are not inferred from the sample answers. Unavailable recommendation permits HR review; selection still needs approved catalog/template/rules.

Employee list is `{data:[EmployeeCase]}`, detail `{data:EmployeeCase}`, retaining all fields above plus selected stages/results after confirmation. Legacy questionnaireVersion/questionnaireAnswers/departmentRecommendation/hrSelection are null, confirmed IDs [] absent genuine confirmation; actual legacy stages/approvals remain.

### HR queue/detail/selection

Queue `GET /api/v1/hr/cases?status=PENDING_HR_VERIFICATION`: `{data:[HrCase]}`. Detail `GET /api/v1/hr/cases/10000000-0000-4000-8000-000000000001`: `{data:HrCase}`. HrCase combines `{employee:EmployeeProfile,case:EmployeeCase,selectionRevision:0}` before confirmation. EmployeeProfile exact fields:

```json
{
  "id": "10000000-0000-4000-8000-000000000003",
  "employeeNumber": "DEMO-FC-001",
  "fullName": "Fictional Employee",
  "designation": "Fictional Lecturer",
  "facultyCode": "FC",
  "departmentName": "Fictional Computing Department",
  "joiningDate": "2020-01-15",
  "categoryId": "10000000-0000-4000-8000-000000000004",
  "category": {"id":"10000000-0000-4000-8000-000000000004","code":"DEMO_FC_TEACHING_V1","name":"Fictional FC Teaching Demo"}
}
```

`POST /api/v1/hr/cases/10000000-0000-4000-8000-000000000001/confirm-departments` body (illustrative IDs must actually be approved active catalog mappings):

```json
{
  "departmentIds": [
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002"
  ],
  "expectedSelectionRevision": 0
}
```

200 returns `{data:HrCase}` with all unchanged case fields, outer revision 1, hrSelection `{verifiedAt:"2026-11-25T06:15:00.000Z",selectionRevision:1}`, both confirmed IDs and only their two stages. Proposed staff-only hrVerifiedById can accompany HR metadata; it is never accepted from the body or exposed in Employee DTO.

For a fictional one-clear/one-hold result, parent status ACTION_REQUIRED and progress `{totalStages:2,clearedStages:1,outstandingStages:1,skippedStages:0}`. Each stage uses existing DTO, for example:

```json
{
  "id": "40000000-0000-4000-8000-000000000001",
  "departmentId": "30000000-0000-4000-8000-000000000001",
  "departmentCode": "EXAMPLE_CONFIGURED_AREA",
  "departmentName": "Fictional Selected Area",
  "stepOrder": 1,
  "isRequired": true,
  "status": "OUTSTANDING",
  "outstandingNote": "A fictional checked obligation remains outstanding.",
  "startedAt": "2026-11-25T06:15:00.000Z",
  "lastCheckedAt": "2026-11-25T06:15:00.000Z",
  "clearedAt": null
}
```

Second row has its own ID/department/order, CLEARED, null outstandingNote and recorded clearedAt. isRequired:true for selected applicable rows is proposed; confirm optional-stage semantics. Employee GET detail now reads the same saved rows, without a new refresh endpoint.

### Errors and internal audit

Existing duplicate submission (409):

```json
{"error":{"code":"ACTIVE_CASE_EXISTS","message":"An active clearance case already exists"}}
```

Proposed stale selection (409):

```json
{"error":{"code":"STALE_HR_SELECTION","message":"Department selection changed; reload the case before confirming"}}
```

Internal Student audit event, not a public request/response:

```json
{
  "actorUserId": null,
  "requestId": null,
  "action": "STUDENT_DEPARTMENT_VERIFIED",
  "entityType": "STUDENT_REQUEST_DEPARTMENT",
  "entityId": "50000000-0000-4000-8000-000000000001",
  "details": {
    "studentRequestId": "20000000-0000-4000-8000-000000000001",
    "departmentCode": "LIBRARY",
    "source": "AUTOMATED_VERIFICATION",
    "previousStatus": "PENDING",
    "newStatus": "CLEARED",
    "ruleVersion": "fictional-library-v1",
    "datasetVersion": "fictional-student-v1"
  }
}
```

## 14. Flutter Integration Requirements

Keep existing Student screens/APIs and five-field submission. No department status controls or removed PATCH calls. Refresh dashboard/detail on load/foreground/user refresh; bounded polling only if asynchronous checks are chosen. GET does not recheck. Display all five rows, distinguish unresolved/exempt/cleared/action-required, use approved visible reasons. Immediate automatic completion may remove activeRequest: use POST ID/detail and dashboard history.

Extend existing Employee form with approved keys/literals (Yes -> YES, No -> NO, Not Sure -> NOT_SURE), pending-HR enum decoding/UI, immutable answers and null legacy handling. Recommendations are suggestions, confirmed stages are requirements. Hide processing before HR. Display Employee OUTSTANDING as “Action required” if desired without changing wire value. Refresh existing list/detail after HR; zero stages never means completion.

HR selection UI is a separate role-scoped client using three HR APIs and returned revision; reload on 409. UI guards are not server authorization. New fields/endpoints remain agreed mocks until backend rollout; current POST rejects questionnaire payloads.

Keep `/api/v1` once, reachable device host, secure tokens and shared Auth envelopes. Reauthenticate on 401; handle 403/404/409/422/503. After uncertain POST fetch existing list/detail before repeating; no new refresh-token/notification API assumed. Coordinate old enum decoders and strict DTOs before release.

Later canonical OpenAPI updates should extend existing schemas, document pending/HR selection with explicit implementation status, reconcile stale Auth/roles and legacy designs, and omit the removed Student PATCH. This linked document is a proposal; unchanged OpenAPI is not proof additions are live.

## 15. Implementation Sequence and Dependencies

1. Confirm exact form/questions, catalog mappings, dummy rules, HR scope, completion/ordering and compatibility decisions in section 16; core automated/HR-gated direction is already fixed.
2. Freeze versioned questionnaire/recommendation/result/visible-reason contracts with Afaq and old-client rollout; no code generation from stale OpenAPI.
3. Review additive Drizzle/SQL, nullable legacy behavior, enum commit boundaries, demo guards and isolated fresh/prefix-upgrade checks. Implement migrations only in a later task.
4. Implement typed evaluator, fixture providers, audit/provenance/aggregate helpers and explicit synchronous or durable asynchronous dispatch/retry.
5. Extend Student POST and safe dashboard/detail reads; test five independent results/unknown Lab/automatic completion. Reuse Student profile/list.
6. Extend Employee POST/list/detail for immutable answers/recommendations and pending HR without template/stages/approvals; verify active slot and legacy reads.
7. Implement scoped HR list/detail/confirmation with revision/replay guards, subset-only stage snapshots and automatic check trigger.
8. Confirm/implement Employee aggregation/recheck/completion rules and dashboard reads; no invented final approval/certificate requirement.
9. Update canonical OpenAPI/handoffs to delivered behavior; integrate Flutter/HR client after APIs exist.
10. Run meaningful auth/workflow/migration/compatibility checks and actual Student/Employee app -> API -> PostgreSQL -> API -> app acceptance separately; record real output.

This correction's validation is document/source review, sixteen-section/API inventory checks, JSON/link checks and final Git diff. Change only this file, commit and push the existing branch. No backend tests, migrations, seeds or E2E are claimed executed here.

## 16. Open Decisions / Items Requiring Project Lead Confirmation

| Decision | Required confirmation / interim constraint |
|---|---|
| Original Teacher Form/Figma wording | Reconcile actual assets with fourteen keys/requiredness/extra fields; master summary available, original assets not locally supplied; no invented wording |
| Questionnaire version/rollout | Required-answer policy, registry semantics and old-client transition; historical nulls retained |
| Recommendation rules | YES/NO/NOT_SURE meaning, profile inputs, mapping/reasons/version; unavailable until configured, never assignment |
| Catalog/template coverage | Actual fourteen-area IDs/codes, category permissions/selected rule mappings and optional/order semantics; synthetic demo catalog is not paper roster |
| HR policy | FC/case scope, provisioning/self-selection, empty set (initially reject), return/delegation/reassignment |
| Student applicability/rules | Approved per-department metrics/thresholds and Laboratory rule; missing evidence never clearance/exemption |
| Dummy storage/execution | Student DB versus file fixtures, pinned provenance, synchronous checks versus durable jobs, retry runner/schedule |
| Visibility/audit | Safe Student reason field/500-character proposal, provenance retention, optional Student audit FK and pending operational message; private notes stay hidden |
| Completion/rechecks | Extra Student automatic completion conditions; Employee downstream authority requirement if any; corrected-data triggers and cleared reopening; no human department approval |
| Persistence | Separate validated questionnaire/recommendation snapshots, HR actor/time/revision, nullable template lifecycle/legacy constraints; JSONB must be justified |
| Broader Option A | Earlier context undefined; explicit submit -> HR selection -> automatic checks governs this plan; confirm only additional rules |
| Contract acceptance | Revised plan and dependent implementation/releases; reconcile stale issue/sprint/OpenAPI separately; handoff review with Afaq |

Confirmed direction is not open: automatic Student checks, HR-only applicable Employee selection, automatic Employee checks after confirmation, no client/human department-result writes, no automatic assignment of fourteen, no duplicate endpoints, no backend changes or PR merge in this task.
