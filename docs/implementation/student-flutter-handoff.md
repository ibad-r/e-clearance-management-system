# Student Flutter handoff — delivered Issue #26 backend

This supersedes this file's historical Issue #17 proposal. Five Student APIs and shared SAP/email login are implemented. Use [canonical OpenAPI v1.4](../references/openapi_employee_v1.yaml), [configuration](issue-26-configuration.md), [acceptance](issue-26-acceptance.md) and [Employee/HR handoff](employee-flutter-handoff.md). Local backend verification does not establish deployed institutional configuration or real-device acceptance.

Earlier implementation and verification are recorded in the [Issue #18 handoff](issue-18-implementation.md) and [Sprint 1 report](student-sprint-1-verification.md).

Use a reachable host with `/api/v1` exactly once. A device's localhost is the device itself. Use HTTPS when deployed, secure token storage and plain Flutter `Text` for reasons. Do not log sensitive payloads or credentials.

## Shared authentication

`POST /auth/login` accepts exactly one of `{email,password}`, `{sapId,password}` or `{identifier,password}`. Send `identifier` for a single Email or SAP ID input. Explicit `sapId` is Student-only. Email lookup lowercases the address, and SAP matching preserves case and leading zeros. The backend trims surrounding whitespace from `sapId` and `identifier` and preserves the password as entered. Combined identifiers must resolve to one account, and Student sign-in requires a linked profile. Employee, HR and Student accounts use the same sign-in endpoint.

Login returns `{accessToken,tokenType:"Bearer",expiresIn,user:{id,email,fullName,role}}` without `data`. `GET /auth/me` returns `{user}`. Protected Student APIs require an active linked STUDENT account and `Authorization: Bearer <accessToken>`. No refresh-token API is added.

## All six extended and three new APIs

| API | Status / client behavior |
|---|---|
| `POST /student/requests` | Extended 1/6; 201 saved automatic results |
| `GET /student/dashboard` | Extended 2/6; 200 saved reasons/progress/history |
| `GET /student/requests/{requestId}` | Extended 3/6; 200 saved owned current/history detail |
| `POST /employee/cases` | Extended 4/6; 201 pending HR with questionnaire |
| `GET /employee/cases` | Extended 5/6; owned saved full cases |
| `GET /employee/cases/{caseId}` | Extended 6/6; owned saved full detail |
| `GET /hr/cases` | New 1/3; scoped HR queue |
| `GET /hr/cases/{caseId}` | New 2/3; scoped HR review |
| `POST /hr/cases/{caseId}/confirm-departments` | New 3/3; HR explicit selected set/revision |

Employee/HR schemas, authorization and replay are detailed in the companion handoff. HR never reads/writes Student clearance. No removed Student PATCH or generic result-write endpoint exists.

Reused Student APIs are `GET /student/profile` (six profile fields) and `GET /student/requests` (owned summaries, newest submission then UUID; empty array valid). Student GET/POST query keys must be empty.

## Student form and DTO

Parse all six fields returned by `GET /student/profile`. Populate `registrationNumber`, `fatherName`, `program` and `semester` from that profile, then submit those four fields with `reason`.

```json
{
  "registrationNumber": "FICTIONAL-001",
  "fatherName": "Fictional Parent",
  "program": "Fictional Program",
  "semester": "8",
  "reason": "degree completed"
}
```

Academic strings must be nonblank and match the stored profile exactly. Reasons are only `degree completed` or `discontinuing studies`. Never send owner, status, applicability, rule, HR or decision fields. Extra fields/query keys fail validation.

Profile is `{sapId,studentName,registrationNumber,fatherName,program,semester}`, all strings. Summary is `{id,requestReference,reason,status,isActive,submittedAt,closedAt}`. Full request adds the captured six profile values and `departments`; snapshots survive later profile edits. Use UUID, not display reference, in detail URLs. Foreign/missing UUID both return 404.

Each department is `{departmentCode,displayName,applicability,status,remarks,updatedAt}`. Always display all five codes: LIBRARY, FEE_DUES, STUDENT_SERVICE, LABORATORY, COORDINATION_OFFICE. Checks are independent; no sequential unlock/human approval controls.

| Applicability / status | Meaning |
|---|---|
| REQUIRED / CLEARED | Saved positive verification |
| REQUIRED / ACTION_REQUIRED | Verified obligation; display approved reason when present |
| REQUIRED / PENDING or IN_REVIEW | Incomplete/ongoing verification, never an invented financial hold |
| UNDETERMINED / PENDING | Applicability unresolved; Laboratory defaults here and blocks completion |
| NOT_REQUIRED / NOT_REQUIRED | Explicit backend exemption; separate from cleared |

`remarks` is nullable approved configured plain text, technically limited to 500 characters, from separate Student-visible storage. It is null without wording or after clearance. Private historical remarks, metrics, snapshots and audits never appear in the DTO. `updatedAt` is null until an actual department update.

Parent enums stay IN_PROGRESS, COMPLETED, CANCELLED; holds keep IN_PROGRESS. Automatic completion requires explicitly configured policy, exactly five resolved valid rows and all required rows cleared. No Laboratory eligibility or extra institutional completion rule is inferred.

Dashboard is `{profile,activeRequest,departments,progress,history}`. Progress is `{requiredCount,clearedRequiredCount,actionRequiredCount,notRequiredCount,undeterminedCount}`. History is `{closedRequestCount,latestClosedRequest}`. No active request means null activeRequest/progress and empty departments, while history remains available.

Immediate completion can remove the POST result from activeRequest. Keep its returned UUID and fetch detail, or use history.latestClosedRequest. The POST response, detail and dashboard reflect saved results and consistent safe reasons.

## Refresh, errors and rollout

Refresh on load, foreground and user refresh. GET never evaluates, retries or corrects evidence. Synchronous local verification is delivered; no polling schedule, notification or public recheck is promised. Department results remain read-only.

| HTTP | Client handling |
|---|---|
| 400 | Malformed JSON; Auth body validation |
| 401 | Reauthenticate; invalid/expired token or inactive account |
| 403 | Wrong role/access |
| 404 | Owned request/profile unavailable |
| 409 | ACTIVE_REQUEST_EXISTS; reload own dashboard/list |
| 422 | VALIDATION_ERROR / PROFILE_MISMATCH; correct form |
| 503 | Configuration/reference/creation unavailable; preserve form and offer appropriate retry |
| 500 | Safe generic unexpected failure |

After uncertain POST, fetch owned list/dashboard before repeating. Clearance successes use `{data:...}`; errors use `{error:{code,message}}`, with optional validation details. Decode nullable timestamps/reasons and all existing states. Coordinate deployment, strict DTO/enum updates, lead/mobile visibility and completion approval. Section 16 institutional decisions and real Student/Employee Flutter device acceptance remain external blockers.
