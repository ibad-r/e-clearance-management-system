# Issue #26 — Student Department Updates and Employee Questionnaire API Planning

Project: E-Clearance Management System
Assigned to: AbdulAhad176
Related mobile issue: ibad-r/e-clearance-mobile#13
Mobile coordination: Afaq
Status: Proposed contract — awaiting project-lead review
Reviewed commit: c4d3a50a1676a2f67d3e43d574229c5ed3d0db07
Review date: 2026-11-24

## 1. Objective and Scope

This document plans the remaining Student and Employee API gaps for the current sprint.

The existing backend implementation was inspected using the current main branch source archive. Drizzle ORM and PostgreSQL are the authoritative persistence layer.

This issue covers:

- Student department status-update API planning.
- Student authorization, validation and audit logging.
- Student demo data strategy.
- Employee questionnaire submission contract.
- Pending HR Verification lifecycle.
- Database impact analysis.
- OpenAPI and Flutter handoff.

This issue does not implement endpoints, modify database schemas, create migrations or introduce backend business logic.

HR dashboards, HR verification actions, Employee department assignment, final approvals and certificate generation are excluded.

## 2. Existing Implementation Inventory

### Student APIs

| Method | Endpoint | Decision |
|---|---|---|
| GET | /api/v1/student/profile | Reuse |
| GET | /api/v1/student/dashboard | Reuse |
| POST | /api/v1/student/requests | Reuse |
| GET | /api/v1/student/requests | Reuse |
| GET | /api/v1/student/requests/:requestId | Reuse |
| PATCH | /api/v1/student/requests/:requestId/departments/:departmentCode | Proposed new operation |

The existing Student router uses requireAuth and requireRole("STUDENT").

Existing functionality includes verified identity, Zod validation, ownership checks, one-active-request protection, department persistence and dashboard progress calculation.

No duplicate Student read or submission endpoints are required.

### Employee APIs

| Method | Endpoint | Decision |
|---|---|---|
| GET | /api/v1/employee/profile | Reuse |
| POST | /api/v1/employee/cases | Extend |
| GET | /api/v1/employee/cases | Extend response |
| GET | /api/v1/employee/cases/:caseId | Extend response |

The existing Employee router uses requireAuth and requireRole("EMPLOYEE").

Existing functionality includes authenticated identity, profile retrieval, case creation, ownership checks, validation and audit logging.

No duplicate Employee case model or questionnaire submission endpoint is proposed.

## 3. Student Department Status Planning

### 3.1 Existing Database Structure

The existing student_request_departments table contains:

- id
- requestId
- departmentCode
- applicability
- applicabilitySource
- status
- remarks
- createdAt
- updatedAt

The requestId and departmentCode combination is unique.

Student request creation inserts five department rows in the same transaction.

| Department code | Initial applicability | Initial status |
|---|---|---|
| LIBRARY | REQUIRED | PENDING |
| FEE_DUES | REQUIRED | PENDING |
| STUDENT_SERVICE | REQUIRED | PENDING |
| LABORATORY | UNDETERMINED | PENDING |
| COORDINATION_OFFICE | REQUIRED | PENDING |

Existing applicability values:

- REQUIRED
- NOT_REQUIRED
- UNDETERMINED

Existing status values:

- PENDING
- IN_REVIEW
- CLEARED
- ACTION_REQUIRED
- NOT_REQUIRED

Database constraints allow REQUIRED departments to use PENDING, IN_REVIEW, CLEARED or ACTION_REQUIRED.

NOT_REQUIRED applicability permits only NOT_REQUIRED status.

UNDETERMINED applicability permits only PENDING status.

The existing Laboratory applicability rule must remain unchanged unless the project lead approves a new rule.

No additional Student department master table is required.

### 3.2 Identified Student API Gap

Student department records can already be created and retrieved.

However, the current Student router and service do not provide an authorized department status-update operation.

The existing departmentsFor() and departmentView() functions both return remarks as null.

There is no Student department status-change audit operation.

### 3.3 Proposed API Contract

Method: PATCH

Endpoint:

/api/v1/student/requests/:requestId/departments/:departmentCode

Authentication: Bearer JWT.

Authorization: Subject to project-lead approval.

This operation must be registered separately from the existing Student-only router.

If the same URL prefix is retained, the exact protected PATCH route must be mounted before the broad Student-only router in app.ts.

The STUDENT role must never be allowed to approve its own clearance.

Path parameters:

- requestId: Valid UUID.
- departmentCode: One of the five existing department codes.

Proposed request body:

```json
{
  "status": "ACTION_REQUIRED",
  "remarks": "Please return the outstanding library book.",
  "expectedUpdatedAt": "2026-11-24T06:00:00.000Z"
}
```

Proposed validation:

- status must be IN_REVIEW, CLEARED or ACTION_REQUIRED.
- remarks are optional and nullable.
- A nonblank student-visible reason is required for ACTION_REQUIRED, subject to approval.
- Proposed maximum remarks length is 500 characters.
- expectedUpdatedAt must match the stored update timestamp.
- expectedUpdatedAt may be null for an untouched department row.
- Unknown fields must be rejected.
- The request and department row must exist.
- The parent Student request must be active.
- The actor must have permission for the specific department.
- The client cannot supply actor identity or change applicability.

The expectedUpdatedAt field is a proposed concurrency safeguard. If timestamp precision cannot reliably distinguish updates, an approved revision token should be evaluated.

Proposed HTTP 200 response:

```json
{
  "data": {
    "departmentCode": "LIBRARY",
    "displayName": "Library",
    "applicability": "REQUIRED",
    "status": "ACTION_REQUIRED",
    "remarks": "Please return the outstanding library book.",
    "updatedAt": "2026-11-24T06:05:00.000Z"
  }
}
```

The response returns the updated department using the existing StudentDepartment structure.

It does not expose the Student's entire personal profile to the actor.

The Student dashboard and request detail APIs will retrieve the updated department through their existing read contracts.

### 3.4 Authorization Matrix

The responsible role has not been confirmed by the project lead.

| Existing role | Proposed permission |
|---|---|
| STUDENT | Denied |
| EMPLOYEE | Denied |
| HR_OFFICER | Denied by default |
| APPROVER | Recommended, subject to approved department scope |
| SYSTEM_ADMIN | Denied by default; alternative requires approval |

Recommendation:

Reuse the existing APPROVER role with department-specific authorization.

An APPROVER must not automatically gain access to every Student department.

The existing authority membership records are position-based and do not establish a direct mapping to the Student department enum.

A trusted server-side mapping between approved authority positions and Student departments must be confirmed.

The authorization policy must validate:

- Active authenticated account.
- Approved role.
- Active authority membership.
- Department-specific permission.
- Applicable campus, program or request context.
- No self-approval.

Authorization must be enforced by the backend, not Flutter.

No new Department Officer role is proposed.

Until the role and scope mapping are approved, the operation must remain denied.

### 3.5 Proposed Status Transition Matrix

The following transitions require project-lead approval.

| Current status | Allowed next status |
|---|---|
| PENDING | IN_REVIEW |
| IN_REVIEW | CLEARED, ACTION_REQUIRED |
| ACTION_REQUIRED | IN_REVIEW |
| CLEARED | None |
| NOT_REQUIRED | None |

All other transitions are denied.

Additional conditions:

- Only REQUIRED departments may use this operation.
- UNDETERMINED departments remain PENDING.
- NOT_REQUIRED departments cannot be changed through this operation.
- Completed or cancelled Student requests cannot be updated.
- Same-status submissions return a conflict without a duplicate audit event.
- Direct PENDING to CLEARED is not proposed without approval.
- Reopening a cleared department requires a separate approved policy.

This operation does not automatically finalize the Student clearance request.

### 3.6 Student Remarks Handling

The existing service and response view deliberately suppress stored remarks.

Existing integration tests protect private staff remarks from being exposed.

Therefore, the existing remarks column must not be returned directly without a visibility policy.

Recommended approach:

- Store approved student-visible reasons separately.
- Consider a nullable studentVisibleRemarks column in a future implementation.
- Map the proposed API remarks field to student-visible content only.
- Update departmentsFor() and departmentView() during implementation.
- Preserve private historical remarks.
- Reject sensitive information in student-visible comments.
- Render remarks as plain text.

Alternatively, the existing remarks column may be reused only after an approved provenance and visibility policy.

If remarks are omitted, preserve the current visible remarks except when leaving ACTION_REQUIRED, where stale hold text should be cleared.

Explicit null clears visible remarks except when ACTION_REQUIRED requires a reason.

No schema or service changes are made in this planning issue.

### 3.7 Audit Logging

Reuse the existing audit_logs table in activity.ts.

Verified audit fields:

- actorUserId
- requestId
- action
- entityType
- entityId
- details
- createdAt

Important database constraint:

audit_logs.requestId references clearanceRequests.id, which belongs to the existing Employee request model.

Student requests use a separate studentRequests table.

A Student request ID must not be inserted into this Employee foreign key.

Recommended approach:

- Set audit requestId to null.
- Set entityId to the Student department row ID.
- Store the Student request ID in curated JSONB details.
- Use the existing actorUserId field.

Proposed audit event:

```json
{
  "actorUserId": "<authenticated-user-id>",
  "requestId": null,
  "action": "STUDENT_DEPARTMENT_STATUS_CHANGED",
  "entityType": "STUDENT_REQUEST_DEPARTMENT",
  "entityId": "<department-row-id>",
  "details": {
    "studentRequestId": "<student-request-id>",
    "departmentCode": "LIBRARY",
    "previousStatus": "IN_REVIEW",
    "newStatus": "ACTION_REQUIRED"
  },
  "createdAt": "2026-11-24T06:05:00.000Z"
}
```

Transaction requirements:

1. Authenticate and validate the actor.
2. Verify the target request and department.
3. Lock the relevant request and department records or perform an equivalent conditional update.
4. Verify department scope and current status.
5. Validate the expectedUpdatedAt value.
6. Persist the new status and approved visible remarks.
7. Update the timestamp.
8. Append the curated audit event.
9. Commit the transaction.
10. Return the persisted department response.

If the audit operation fails, roll back the status update.

Do not store authentication tokens, passwords, full request bodies, private remarks or unnecessary personal information in audit details.

The proposed JSONB association has no Student foreign-key integrity. A dedicated nullable Student request foreign key and index can be evaluated later if required.

### 3.8 Student Demo Data Plan

The existing demo seed provisions fictional Employee workflow data.

It does not currently provision Student login accounts, Student profiles or Student requests.

Student integration tests use isolated fixtures, not login-ready demo accounts.

Proposed demonstration approach:

- Use the existing isolated demo PostgreSQL database.
- Provision a fictional Student account and linked academic profile using approved authentication procedures.
- Provision a separate fictional authorized APPROVER after role approval.
- Use stable fixture identifiers.
- Keep seed operations repeatable.
- Verify existing fixture ownership before reuse.
- Never seed fake production users.
- Never store real credentials in documentation.
- Submit the Student request through the existing POST endpoint.

Demonstration scenarios after implementation:

| Department | Demonstration |
|---|---|
| LIBRARY | PENDING -> IN_REVIEW -> CLEARED |
| FEE_DUES | PENDING -> IN_REVIEW -> ACTION_REQUIRED |
| STUDENT_SERVICE | PENDING |
| LABORATORY | UNDETERMINED / PENDING |
| COORDINATION_OFFICE | PENDING |

Test cases must verify:

- Exactly five department rows are created.
- Duplicate active requests are rejected.
- Students cannot update their own status.
- Out-of-scope approvers are rejected.
- Invalid transitions are rejected.
- Concurrent stale updates are rejected.
- Laboratory remains unchanged.
- Audit failure rolls back the update.
- Private remarks remain protected.
- Existing Student dashboard and detail responses reflect persisted updates.

No seed scripts are modified or executed in this issue.

## 4. Employee Questionnaire Planning

### 4.1 Existing Employee Case Behavior

The current Employee createCase implementation:

- Resolves authenticated Employee identity.
- Rejects a second active case.
- Requires exactly one active workflow template.
- Creates a clearance request with IN_PROGRESS status.
- Sets submittedAt immediately.
- Creates department stages with LOCKED status.
- Creates approval rows with WAITING status.
- Writes an EMPLOYEE_CASE_SUBMITTED audit event.
- Returns case details and progress.

This behavior does not satisfy the current sprint requirement.

The current createCaseSchema accepts:

| Field | Existing validation |
|---|---|
| lastWorkingDate | ISO date, year 0001-9999 |
| reasonForLeaving | Required, trimmed, 3-500 characters |
| employeeRemarks | Optional, nullable, maximum 1000 characters |

Questionnaire answers are not currently accepted or persisted.

### 4.2 Proposed Questionnaire Fields

The following field keys are proposed for mobile/backend coordination.

| Department or questionnaire area | JSON field |
|---|---|
| HDS Department | hdsDepartment |
| Finance Department | financeDepartment |
| Fees and Dues Department | feesAndDuesDepartment |
| Computer Services Department | computerServicesDepartment |
| Operations Department | operationsDepartment |
| CMS Representative | cmsRepresentative |
| ORIC | oric |
| Store Section | storeSection |
| Warden / Hostel | wardenHostel |
| Lab In-charge / Office | labInchargeOffice |
| Information Services Department | informationServicesDepartment |
| Ward In-charge / Nursing Division | wardInchargeNursingDivision |
| Pharmacy | pharmacy |
| Head of Department (HOD) | headOfDepartment |

Proposed answer enum:

- YES
- NO
- NOT_SURE

Mobile display labels:

- Yes
- No
- Not Sure

The questionnaire is submitted for later HR review.

Answers must not directly determine departmental assignment.

Recommendation: Require all 14 explicit answers if confirmed by the project lead and prototype.

The exact Figma question wording and requiredness must be confirmed from Mobile.tsx before final approval.

Missing answers must not be silently converted to NO or NOT_SURE.

### 4.3 Employee Profile and Form Mapping

Employee Number, name, designation, department and joining date must be obtained from the authenticated Employee profile.

The client must not provide authoritative Employee identity or ownership values.

Existing request fields remain:

- lastWorkingDate
- reasonForLeaving
- employeeRemarks

The Teacher Clearance Form was not supplied with the reviewed source archive.

Additional form fields and differences remain an open decision until the actual form is inspected.

### 4.4 Proposed Employee Submission API

Reuse and extend:

POST /api/v1/employee/cases

Authentication: Bearer JWT.

Required role: EMPLOYEE.

Ownership: Derived from the authenticated Employee profile.

Proposed JSON request:

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

Proposed HTTP 201 response:

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
    "initiatedAt": "2026-11-24T06:10:00.000Z",
    "submittedAt": "2026-11-24T06:10:00.000Z",
    "completedAt": null,
    "cancelledAt": null,
    "stages": [],
    "approvals": [],
    "issues": [],
    "certificateId": null,
    "progress": {
      "totalStages": 0,
      "clearedStages": 0,
      "outstandingStages": 0,
      "skippedStages": 0
    }
  }
}
```

The identifiers above are illustrative examples.

All existing Employee case response fields are preserved.

### 4.5 Pending HR Verification Lifecycle

Proposed submission workflow:

1. Employee authenticates.
2. Existing Employee profile is retrieved.
3. Employee completes the clearance form and questionnaire.
4. The server validates the submission.
5. Existing active-case protection is checked.
6. A request reference is generated.
7. The request and questionnaire answers are persisted.
8. The request status becomes PENDING_HR_VERIFICATION.
9. EMPLOYEE_CASE_SUBMITTED audit event is recorded.
10. The saved case is returned.

Request creation, questionnaire persistence and audit logging must occur in one database transaction.

The current sprint ends at Pending HR Verification.

The submission must not:

- Assign departments.
- Instantiate department stages.
- Create approval rows.
- Start HR verification.
- Execute clearance rules.
- Generate certificates.

HR processing is next-sprint work.

### 4.6 Request Status Enum Impact

Existing clearance request statuses:

- PENDING_SUBMISSION
- IN_PROGRESS
- ACTION_REQUIRED
- AWAITING_APPROVAL
- RETURNED_FOR_CORRECTION
- COMPLETED
- CANCELLED

Proposed additional status:

PENDING_HR_VERIFICATION

IN_PROGRESS must not be reused for questionnaire-only submission because it implies that department clearance has started.

PENDING_SUBMISSION is also not appropriate because the questionnaire has already been submitted.

The new status requires a future PostgreSQL enum migration and corresponding validation, TypeScript, OpenAPI and Flutter updates.

No enum changes or migrations are implemented in this issue.

### 4.7 Questionnaire Persistence

Recommendation:

Add a nullable JSONB questionnaireSnapshot field to the existing clearance_requests model during implementation.

Proposed stored structure:

```json
{
  "version": "v1",
  "answers": {
    "hdsDepartment": "YES",
    "financeDepartment": "NO"
  }
}
```

The example is abbreviated. Actual new submissions must preserve all approved questionnaire answers.

The server assigns the questionnaire version.

Versioning must preserve the original wording and meaning of submitted answers.

The submitted snapshot must remain immutable.

Existing cases without a questionnaire remain readable with null questionnaireAnswers and questionnaireVersion.

Historical answers must not be fabricated.

Alternative:

A normalized questionnaire-answer table with a unique request and question combination may support advanced reporting.

JSONB is recommended because it is less disruptive for a fixed 14-question snapshot.

No duplicate Employee request or case model is required.

### 4.8 Workflow Template Dependency

The existing clearance_requests.templateId is non-nullable and references workflowTemplates.id.

Current submission selects a template and immediately instantiates workflow stages and approvals.

This conflicts with the proposed Pending HR Verification lifecycle.

Recommended solution:

- Defer template binding until the next-sprint HR review.
- Permit null templateId for new pending-HR submissions.
- Require a valid template for applicable processing states.
- Do not create a placeholder workflow template.
- Preserve all existing workflow cases.

Alternative:

Use an explicitly approved pending-request design that preserves the existing case model and defers workflow initialization.

Implementation impact requiring review:

- Template foreign-key constraints.
- Request lifecycle consistency checks.
- Queries that assume a non-null templateId.
- Shared enum consumers.
- Migration compatibility.
- Existing stage and approval projections.
- Reporting and background processing assumptions.

The current request read logic retrieves child rows by request ID. Empty stages and approvals can be represented using existing arrays and zero progress counts.

A zero-stage case must never be interpreted as completed.

### 4.9 Duplicate Active Case Protection

Reuse the existing active-case protection.

The existing database index is:

clearance_requests_one_active_employee_idx

Only COMPLETED and CANCELLED release an Employee's active-case slot.

PENDING_HR_VERIFICATION must remain an active status.

A second submission returns:

HTTP 409 ACTIVE_CASE_EXISTS

Concurrency protection must remain enforced at database level.

### 4.10 Employee Audit Event

Reuse EMPLOYEE_CASE_SUBMITTED.

The proposed curated audit details should record:

- Initial status: PENDING_HR_VERIFICATION.
- Questionnaire version.
- Submitted answer count.
- Stage count: 0.
- Approval count: 0.

Do not record raw questionnaire answers, free-text remarks, tokens or full request bodies in the audit log.

Do not record a fabricated template ID.

### 4.11 Employee Read API Extensions

GET /api/v1/employee/cases

Returns owned Employee cases with their persisted status, form fields and questionnaire answers.

Existing response envelope:

```json
{
  "data": []
}
```

GET /api/v1/employee/cases/:caseId

Returns the saved Employee case using the same CaseDetail response structure as the proposed POST operation.

Both operations must return the same submitted questionnaire after app reload.

The existing status query filter should accept the proposed pending-HR status after implementation.

Existing Employee profile and ownership rules remain unchanged.

caseViews(), caseResponse() and EmployeeCase types require future extensions to project questionnaireVersion and questionnaireAnswers.

These read operations must not start workflow processing.

## 5. Validation and Error Responses

Reuse the existing API response conventions.

| HTTP status | Error code | Purpose |
|---|---|---|
| 400 | VALIDATION_ERROR | Malformed JSON |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | Role or department scope denied |
| 404 | NOT_FOUND | Missing or inaccessible resource |
| 409 | INVALID_STATUS_TRANSITION | Proposed invalid Student transition |
| 409 | STALE_DEPARTMENT_UPDATE | Proposed concurrent update conflict |
| 409 | ACTIVE_CASE_EXISTS | Existing active Employee case |
| 409 | ACTIVE_REQUEST_EXISTS | Existing active Student request |
| 422 | VALIDATION_ERROR | Invalid body, path or query |
| 503 | STUDENT_CONFIGURATION_INVALID | Existing invalid Student configuration |
| 503 | WORKFLOW_CONFIGURATION_INVALID | Existing applicable configuration error |
| 500 | INTERNAL_SERVER_ERROR | Unexpected server error |

Preserve existing module-specific error codes where applicable.

Example:

```json
{
  "error": {
    "code": "ACTIVE_CASE_EXISTS",
    "message": "An active clearance case already exists"
  }
}
```

Do not expose internal database errors, stack traces, credentials or sensitive request data.

Employee tests must cover:

- All three questionnaire answer values.
- Invalid and unknown questionnaire fields.
- Missing approved required answers.
- Existing form validation.
- Client-supplied identity rejection.
- Duplicate and concurrent active submissions.
- Pending submission without workflow template selection.
- Zero department stage and approval records.
- Transaction rollback.
- Persisted answers after reload.
- Foreign Employee case access rejection.
- Compatibility with historical cases.

## 6. Database and Service Mapping

| Component | Existing file or table | Proposed action |
|---|---|---|
| Student department | db/schema/student.ts | Reuse existing rows |
| Student routes | student.routes.ts / app.ts | Plan separately protected PATCH operation |
| Student service | student.service.ts | Plan transactional update |
| Student policy | student.policy.ts | Preserve initialization; approve transitions |
| Student views | student.views.ts | Plan safe remarks projection |
| Student validation | student.schemas.ts | Plan update validation |
| Shared audit | db/schema/activity.ts | Reuse with Student-safe association |
| Employee routes | employee.routes.ts | Extend existing POST contract |
| Employee service | employee.service.ts | Plan pending submission lifecycle |
| Employee validation | employee.schemas.ts | Plan questionnaire validation |
| Employee response | employee.types.ts | Extend case response fields |
| Request persistence | db/schema/requests.ts | Plan JSONB and template deferral |
| Request enum | db/schema/enums.ts | Plan pending-HR status |
| Demo data | db/demo/seed-demo.ts | Plan fictional Student fixtures |

All changes in this table are planning recommendations only.

## 7. OpenAPI Documentation Plan

Canonical OpenAPI file:

docs/references/openapi_employee_v1.yaml

The file openapi_employee_v1_updated.yaml is a legacy non-canonical reference.

The canonical documentation must eventually reflect:

- Separately authorized Student PATCH endpoint.
- Existing Student department enums.
- Student update request and response examples.
- Department scope and validation rules.
- Status-transition and concurrency errors.
- Student remarks visibility policy.
- Employee questionnaire request schema.
- YES, NO and NOT_SURE answer enum.
- PENDING_HR_VERIFICATION status.
- Questionnaire version and answers in CaseDetail.
- Existing Employee list and detail response structures.
- Pending submission with empty stages and approvals.

Reuse existing bearer authentication and response/error components.

This linked implementation-planning document contains the proposed contract changes.

The live OpenAPI specification should not advertise unimplemented operations as available.

## 8. Flutter Handoff — Afaq

Related issue: ibad-r/e-clearance-mobile#13

### Student Mobile Flow

- Retain existing Student screens and API integration.
- Do not rebuild the Student clearance workflow.
- Refresh the existing Student dashboard or request detail after department updates.
- Display the saved department status.
- Display remarks only after approved student-visible remarks support is implemented.
- Never call the proposed department PATCH operation using Student credentials.

Refresh endpoints:

GET /api/v1/student/dashboard

GET /api/v1/student/requests/:requestId

### Employee Mobile Flow

Add only the missing questionnaire and Pending HR Verification UI.

Use the 14 proposed questionnaire keys in section 4.2.

Map display answers as follows:

| Display value | API value |
|---|---|
| Yes | YES |
| No | NO |
| Not Sure | NOT_SURE |

Reuse existing Employee profile and case form.

Use mock data until the backend implementation is complete.

Use the proposed request and response examples in section 4.4.

The mobile application must display:

Pending HR Verification

when the server or agreed mock contract returns:

PENDING_HR_VERIFICATION

After backend integration:

1. Submit through the existing Employee POST API.
2. Read the returned request ID and status.
3. Display Pending HR Verification.
4. Refresh using the existing case list or detail endpoint.
5. Display the same persisted questionnaire answers.
6. Handle duplicate active case conflicts.
7. Hide departmental processing progress while pending HR.

Empty stages must not be displayed as successful completion.

The current backend POST must not be treated as supporting the new lifecycle until implementation is complete.

## 9. Open Decisions for Project-Lead Review

- Confirm the responsible Student department actor role.
- Confirm trusted department-to-authority scope mapping.
- Approve the proposed Student transition matrix.
- Confirm whether cleared departments can be reopened.
- Confirm student-visible remarks storage and validation.
- Approve the concurrency control approach.
- Approve Student audit association strategy.
- Confirm fictional Student and APPROVER provisioning for demo use.
- Provide the exact Figma Mobile.tsx questionnaire wording.
- Confirm the requiredness of all 14 questions.
- Provide the Teacher Clearance Form for field reconciliation.
- Approve questionnaire JSONB snapshot design.
- Approve PENDING_HR_VERIFICATION enum addition.
- Approve workflow template deferral and lifecycle constraints.
- Confirm backward compatibility and mobile release coordination.

The exact prototype wording and Teacher Clearance Form comparison remain unverified and are blocking final contract approval.

## 10. Acceptance Criteria Checklist

- [x] Current main branch source archive inspected.
- [x] Existing Student API inventory documented.
- [x] Existing Student department persistence verified.
- [x] Existing Student applicability rules documented.
- [x] No duplicate Student department model proposed.
- [x] Student status-update API proposed.
- [x] Student authorization alternatives documented.
- [x] Student transition matrix proposed.
- [x] Student audit foreign-key constraint identified.
- [x] Student demo data strategy documented.
- [x] Existing Employee case behavior verified.
- [x] All 14 questionnaire areas included.
- [x] Proposed questionnaire JSON contract documented.
- [x] Pending HR Verification lifecycle proposed.
- [x] Template dependency and migration impact documented.
- [x] Proposed OpenAPI changes documented.
- [x] Flutter handoff draft prepared.
- [x] HR-side features excluded.
- [x] No backend implementation or migrations introduced.
- [ ] Exact Figma questionnaire wording verified.
- [ ] Teacher Clearance Form reconciled.
- [ ] Project-lead contract approval received.
- [ ] Mobile handoff reviewed with Afaq.
- [ ] Documentation pull request reviewed.

## 11. Source Files Reviewed

- backend/src/app.ts
- backend/src/modules/student/student.routes.ts
- backend/src/modules/student/student.service.ts
- backend/src/modules/student/student.schemas.ts
- backend/src/modules/student/student.policy.ts
- backend/src/modules/student/student.views.ts
- backend/src/modules/student/student.types.ts
- backend/src/modules/student/student.integration.test.ts
- backend/src/modules/employee/employee.routes.ts
- backend/src/modules/employee/employee.service.ts
- backend/src/modules/employee/employee.schemas.ts
- backend/src/modules/employee/employee.types.ts
- backend/src/db/schema/student.ts
- backend/src/db/schema/enums.ts
- backend/src/db/schema/requests.ts
- backend/src/db/schema/activity.ts
- backend/src/db/schema/workflow.ts
- backend/src/db/schema/identity.ts
- backend/src/db/demo/demo-data.ts
- backend/src/db/demo/seed-demo.ts
- backend/src/db/demo/demo-database.ts
- backend/src/db/demo/verify-demo.ts
- Existing authentication and authorization middleware.
- docs/references/openapi_employee_v1.yaml
- docs/references/openapi_employee_v1_updated.yaml

Review method: Static source inspection at the recorded commit.

No tests, migrations, seed operations or implementation changes were executed as part of this planning document.

Before publishing, reconcile the document against the latest origin/main.

## 12. Conclusion

The existing Student and Employee APIs should be reused.

The Student gap requires a separately authorized department status-update operation with scoped permissions, safe remarks, valid transitions and transactional audit logging.

The Employee gap requires extending the existing case submission and read contracts to persist questionnaire answers and return Pending HR Verification without initiating department processing.

The proposed contracts remain subject to project-lead review.

No backend implementation is included in Issue #26.