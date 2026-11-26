# Employee and HR Flutter handoff — delivered Issue #26 backend

Use [canonical OpenAPI v1.4](../references/openapi_employee_v1.yaml), [Student handoff](student-flutter-handoff.md), [configuration](issue-26-configuration.md) and [acceptance](issue-26-acceptance.md). This branch implements the APIs; deployment, real institutional configuration and real-device acceptance are separate steps. Exact paper/Figma wording remains unverified.

Base path is `/api/v1` exactly once, on a reachable device host. Use HTTPS when deployed and secure tokens. Shared login accepts exactly one of `{email,password}`, `{sapId,password}`, `{identifier,password}`; login returns a top-level token/user object and `/auth/me` returns `{user}`. Clearance successes use `{data:...}`; failures use `{error:{code,message}}`, with optional validation `details`. Render reasons with plain Flutter `Text`; avoid logging sensitive payloads.

## All extended and new operations

| API | Status / consumer |
|---|---|
| `POST /student/requests` | Extended 1/6; Student automatic submission, 201 |
| `GET /student/dashboard` | Extended 2/6; saved Student reasons/progress, 200 |
| `GET /student/requests/{requestId}` | Extended 3/6; saved owned Student detail, 200 |
| `POST /employee/cases` | Extended 4/6; questionnaire submission, 201 pending HR |
| `GET /employee/cases` | Extended 5/6; owned full cases, strict optional status |
| `GET /employee/cases/{caseId}` | Extended 6/6; owned saved detail, UUID path |
| `GET /hr/cases` | New 1/3; scoped HR queue, strict optional status |
| `GET /hr/cases/{caseId}` | New 2/3; scoped HR detail, UUID path, empty query |
| `POST /hr/cases/{caseId}/confirm-departments` | New 3/3; explicit selection/revision, empty query |

Student behavior is detailed in its handoff. `GET /employee/profile` is reused: active linked FC `EMPLOYEE`, active category. Profile is `{id,employeeNumber,fullName,designation,facultyCode,departmentName,joiningDate,categoryId,category:{id,code,name}}`; joiningDate is nullable. No client owner selectors are accepted.

## Employee submission and saved DTO

Submit a real ISO `lastWorkingDate` (years 0001–9999), trimmed `reasonForLeaving` (3–500), optional nullable trimmed `employeeRemarks` (maximum 1000), and `questionnaireAnswers`. No institutional date cutoff is imposed.

The explicitly activated `v1` wire contract requires all fourteen keys: `hdsDepartment`, `financeDepartment`, `feesAndDuesDepartment`, `computerServicesDepartment`, `operationsDepartment`, `cmsRepresentative`, `oric`, `storeSection`, `wardenHostel`, `labInchargeOffice`, `informationServicesDepartment`, `wardInchargeNursingDivision`, `pharmacy`, `headOfDepartment`. Values are exactly `YES`, `NO`, `NOT_SURE` (display Yes/No/Not Sure). Never fill missing answers silently. These keys are not department codes or verified question wording. Server activation requires approved wording/requiredness/rollout.

Body is `{lastWorkingDate,reasonForLeaving,employeeRemarks?,questionnaireAnswers:{<all fourteen explicit answers>}}`. Server assigns the version. Identity, status, recommendations, confirmed departments, results, actor IDs, rule/template IDs and timestamps are rejected. Old bodies without answers return 422; valid bodies return controlled 503 while questionnaire activation is absent.

201 returns full `EmployeeCase` with `PENDING_HR_VERIFICATION`, `stages:[]`, `approvals:[]`, zero progress, `hrSelection:null`, `confirmedDepartmentIds:[]`. No template, selected stages or checks exist before HR. Template availability no longer blocks submission.

Existing case fields remain: `id`, `requestCode`, `employeeId`, `status`, form fields, `initiatedAt`, nullable `submittedAt/completedAt/cancelledAt`, `stages`, `approvals`, `issues`, nullable `certificateId`, and `progress:{totalStages,clearedStages,outstandingStages,skippedStages}`. Added fields:

| Field | Meaning |
|---|---|
| `questionnaireVersion` | `v1` for configured new cases; null for legacy |
| `questionnaireAnswers` | Immutable explicit answers; null for legacy |
| `departmentRecommendation` | Immutable advice; null for legacy |
| `hrSelection` | Null before HR/for legacy; Employee sees `{verifiedAt,selectionRevision}` |
| `confirmedDepartmentIds` | Selected stage FKs plus genuine HR confirmation; empty for pending/legacy |

Unavailable advice is `{status:"UNAVAILABLE",ruleVersion:null,departments:[]}`. Available advice is `{status:"AVAILABLE",ruleVersion,departments:[{departmentId,departmentCode,departmentName,reason}]}`. Recommendation rules must be configured; NOT_SURE never implies exclusion. Advice is never assignment and remains unchanged after HR chooses a different permitted set.

Legacy cases preserve actual historical stages/approvals/results and null new metadata. Do not infer HR confirmation from historical stages. List accepts only optional status, including pending HR, and sorts newest initiatedAt then UUID. Detail preserves its existing query behavior. Foreign and missing Employee cases both return 404. GET never verifies.

## HR review, authorization and confirmation

Use a separately provisioned active `HR_OFFICER` account and explicitly configured FC/category scope. Admin/Approver do not inherit HR access. Self-linked Employee cases are excluded. Missing scope returns 403; missing/out-of-scope/non-FC/self-linked case UUID returns 404. UI guards do not replace server authorization.

Queue is `GET /hr/cases?status=PENDING_HR_VERIFICATION`; pagination/extra query fields are rejected. List returns `{data:HrCase[]}`, detail `{data:HrCase}`, empty list valid. `HrCase` is `{employee:EmployeeProfile,case:EmployeeCase,selectionRevision}`. Staff `case.hrSelection` additionally includes actual `hrVerifiedById` when confirmed; Employee DTO omits that identity. HR reads form/all answers/advice/current results, never auth rows, raw metrics or private audits.

Confirmation body is exactly `{departmentIds:[<actual approved UUIDs>],expectedSelectionRevision:0}` initially. Require 1–14 unique UUIDs (case-insensitive uniqueness) and a nonnegative integer revision. Empty sets/extras fail 422. IDs must belong to the configured category catalog and selected active template/rule mappings; array order does not control stage order.

200 returns saved HrCase with revision incremented once, actual HR actor/time, only selected stages and automatic results. HR confirms applicability and cannot submit clearance results. Genuine failed checks yield `OUTSTANDING` / parent `ACTION_REQUIRED`; incomplete evidence stays `CHECKING` and active. Progress denominator is selected rows, not fourteen/advice. Unselected departments have no rows. `outstandingNote` is nullable configured safe text for a hold or incomplete evidence, never raw rule failMessage for new checks. Legacy historical stage data is retained.

Zero stages never means complete. All-clear completion requires explicitly configured `DEPARTMENTS_ONLY` final policy; otherwise parent stays `IN_PROGRESS`. No invented downstream approvals/certificates or human department approvers are added.

After an uncertain confirmation, reload detail. Same set (order independent) plus original revision returns current saved result without new stages/checks/audits, including after completion. Different set or unrelated revision returns 409 `STALE_HR_SELECTION`; invalid lifecycle returns 409 `INVALID_STATUS_TRANSITION`. Reload before any further action; reassignment/return/delegation are not delivered endpoints.

Missing selected mappings/ordering approval yields 503 `WORKFLOW_CONFIGURATION_INVALID` and atomically retains pending HR without partial confirmation/results/audits. 401 means reauthenticate; 403 forbidden; 404 unavailable; 422 correct input; 500 generic unexpected failure. Employee duplicate POST returns 409 `ACTIVE_CASE_EXISTS`; fetch own list/detail after an uncertain POST before repeating.

## Release behavior

Decode pending HR and all existing stage states, nullable legacy fields/reasons/timestamps and strict DTO additions. Employee UI may display OUTSTANDING as “Action required” without changing the wire value. Hide processing before HR; preserve form on errors. Refresh existing Employee list/detail and HR list/detail on load, foreground, user refresh and after confirmation.

No extra Employee dashboard/questionnaire-submit/refresh, public recheck, notification or generic department-write API is added. No Student PATCH exists. Synchronous verification is delivered; GET does not retry. Coordinate lead/mobile approval of wording, requiredness, catalog/scope/final policy and old enum clients. Backend HTTP tests do not establish real Student/Employee Flutter device acceptance.
