# Issue #17: Student API handoff for Flutter

Status: proposed contract for Afaq's review, not a live Student API or a frozen
university policy. The existing [decision register](student-api-contract.md)
contains U01-U18; the [OpenAPI document](../references/openapi_employee_v1.yaml)
labels Student operations `proposed-unimplemented`. Implementation belongs to
Issue #18. Shared authentication and SAP-ID lookup belong to Issue #16.

These examples support contract review and mock screens. They do not resolve the
open decisions or claim live Student endpoints.

## Current authentication versus proposed Student endpoints

Base path is `/api/v1`. Use a reachable host on the Flutter device; `localhost`
on a device refers to that device. Use HTTPS when deployed. Admin pre-creates
accounts; no signup. Store the token securely and avoid logging passwords/tokens.

Current `POST /auth/login` accepts **exactly** `email` and `password`:

```json
{
  "email": "fictional.student@example.invalid",
  "password": "fictional-example-password"
}
```

This is a payload illustration, not a provisioned Student account or a live
Student-login claim. Email is validated and lowercased for lookup, without
trimming or domain restrictions; password is not trimmed. Extra fields such as
`identifier` and `sapId` fail with 400. The local role enum currently has only
`EMPLOYEE`, `HR_OFFICER`, `APPROVER`, `SYSTEM_ADMIN`.

A structurally accurate current login response uses a fictional Employee:

```json
{
  "accessToken": "fictional-token-placeholder",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "5c61708f-3c29-47f8-a20b-cf85b3ceea41",
    "email": "fictional.employee@example.invalid",
    "fullName": "Fictional Employee",
    "role": "EMPLOYEE"
  }
}
```

Login has no `data` wrapper. `GET /api/v1/auth/me` returns the same four public
account fields, not the academic profile. This standalone 200 response uses the
same fictional Employee as the login example and matches the current backend
envelope; it is not a captured response or a provisioned Student account:

```json
{
  "user": {
    "id": "5c61708f-3c29-47f8-a20b-cf85b3ceea41",
    "email": "fictional.employee@example.invalid",
    "fullName": "Fictional Employee",
    "role": "EMPLOYEE"
  }
}
```

Send
`Authorization: Bearer <accessToken>` on protected calls. Token TTL defaults to
900 seconds; the configured range is 60-3600. No refresh-token endpoint is
defined here. On 401, return to authentication; handle 403 as lack of permission.

Student login by university email **or SAP ID** is the product direction, but its
exact input, lookup source, normalization, leading-zero handling, uniqueness,
user mapping, domain rules and backward compatibility remain U12/U13. Do not
invent a second auth stack or ship an assumed SAP-ID login body. PR #20 evidence
in the saved contract is a point-in-time review, not a local merge or approval.

## Proposed calls and parsing

| Operation | Proposed success body | Consumer behavior |
| --- | --- | --- |
| `GET /student/profile` | `{ "data": StudentProfile }` | Read server-derived `sapId` and `studentName`; do not substitute `/auth/me` |
| `GET /student/dashboard` | `{ "data": StudentDashboard }` | Render active summary, department rows, separate progress counts and closed history |
| `POST /student/requests` | 201 `{ "data": StudentRequest }` | Submit only five request fields; read server UUID/reference and identity from response |
| `GET /student/requests` | `{ "data": StudentRequestSummary[] }` | Render own active/history summaries; empty array is success |
| `GET /student/requests/{requestId}` | `{ "data": StudentRequest }` | Use the internal UUID, not the display reference |

All five are unavailable in the current app. They require future shared
`STUDENT` role integration and server-enforced ownership. UUIDs are locators,
not authorization. No owner query/body/header field is part of this proposal.
Department states and applicability are read-only for Students.

The five proposed submission fields are all required strings. Final requiredness,
blank/trim/length/format rules, program choices and semester type/range remain
U14. Only the two confirmed reason meanings are allowed; their proposed wire
literals await U15 acceptance:

```json
{
  "registrationNumber": "Fictional registration A",
  "fatherName": "Fictional Parent",
  "program": "Fictional Program",
  "semester": "8",
  "reason": "degree completed"
}
```

The other proposed reason literal is `discontinuing studies`. Do not submit
`sapId`, `studentName`, `studentId`, `userId`, `role`, `id`, `requestReference`,
`departments`, statuses or lifecycle fields. The proposed strict body rejects
extra properties. The example establishes no registration/program/semester rule.

## Proposed examples for Flutter models and mock screens

Examples are fictional JSON shapes, not verified backend responses. The working
roster follows the official form; four required ordinary departments and initial
PENDING states are illustrative configuration. The older overview's Transport
versus the form's conditional Laboratory remains U01. Do not silently replace,
combine or finalize the lists. Shortened-name mappings and codes remain U02.

`GET /api/v1/student/profile` — proposed 200 response, contract-only and pending
Issue #18 implementation. Only server-derived academic identity is included:

```json
{
  "data": {
    "sapId": "00012345",
    "studentName": "Fictional Student"
  }
}
```

Proposed creation/detail payload, also illustrating submission with unresolved
Lab applicability (whether it should block submission remains U04):

```json
{
  "data": {
    "id": "a415c9cb-2617-49b3-825b-f6b2b1ed3ef1",
    "requestReference": "Example reference A",
    "sapId": "00012345",
    "studentName": "Fictional Student",
    "registrationNumber": "Fictional registration A",
    "fatherName": "Fictional Parent",
    "program": "Fictional Program",
    "semester": "8",
    "reason": "degree completed",
    "isActive": true,
    "submittedAt": "2026-11-10T09:00:00Z",
    "closedAt": null,
    "departments": [
      { "departmentCode": "LIBRARY", "displayName": "Library", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "FEE_DUES", "displayName": "Fee & Dues Department", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "STUDENT_SERVICE", "displayName": "Student Service Department", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "LABORATORY", "displayName": "Laboratory", "applicability": "UNDETERMINED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "COORDINATION_OFFICE", "displayName": "Coordination Office", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null }
    ]
  }
}
```

`StudentProfile` contains `sapId` and `studentName`. Keep SAP/registration
identifiers as strings. The example leading zeros are not a SAP format rule.
`StudentRequestSummary` contains `id`, `requestReference`, `reason`, `isActive`,
`submittedAt`, `closedAt`; creation/detail additionally contains the profile
identity, four other submission fields and `departments`. Server-copied identity
is recommended; snapshots versus live values and corrections remain U11/U12.

For the active example above, a dashboard uses that summary in `activeRequest`,
the same rows in `departments`, the profile in `profile`, and this proposed
`progress` object (exact count field names are U16 recommendations):

```json
{
  "requiredCount": 4,
  "clearedRequiredCount": 0,
  "actionRequiredCount": 0,
  "notRequiredCount": 0,
  "undeterminedCount": 1
}
```

Counts describe the active request only. Do not add exempt departments to the
cleared count, infer completion from counts, or show an authoritative percentage
with unresolved applicability. Examination Department is informational for the
transcript next step after clearance, not a stage or progress denominator.

`GET /api/v1/student/dashboard` — standalone proposed 200 response with an active
request, contract-only and pending Issue #18 implementation. Its active summary,
profile, department rows and counts agree with the creation/detail example above.
The closed summary is fictional history, not an approved terminal outcome or an
assertion about subsequent-request eligibility (U08-U11):

```json
{
  "data": {
    "profile": {
      "sapId": "00012345",
      "studentName": "Fictional Student"
    },
    "activeRequest": {
      "id": "a415c9cb-2617-49b3-825b-f6b2b1ed3ef1",
      "requestReference": "Example reference A",
      "reason": "degree completed",
      "isActive": true,
      "submittedAt": "2026-11-10T09:00:00Z",
      "closedAt": null
    },
    "departments": [
      { "departmentCode": "LIBRARY", "displayName": "Library", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "FEE_DUES", "displayName": "Fee & Dues Department", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "STUDENT_SERVICE", "displayName": "Student Service Department", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "LABORATORY", "displayName": "Laboratory", "applicability": "UNDETERMINED", "status": "PENDING", "remarks": null, "updatedAt": null },
      { "departmentCode": "COORDINATION_OFFICE", "displayName": "Coordination Office", "applicability": "REQUIRED", "status": "PENDING", "remarks": null, "updatedAt": null }
    ],
    "progress": {
      "requiredCount": 4,
      "clearedRequiredCount": 0,
      "actionRequiredCount": 0,
      "notRequiredCount": 0,
      "undeterminedCount": 1
    },
    "history": {
      "closedRequestCount": 1,
      "latestClosedRequest": {
        "id": "d7d58523-3a2c-4b7b-91be-d2e705348ddc",
        "requestReference": "Example reference B",
        "reason": "discontinuing studies",
        "isActive": false,
        "submittedAt": "2026-10-01T09:00:00Z",
        "closedAt": "2026-10-05T09:00:00Z"
      }
    }
  }
}
```

The no-active dashboard retains independent closed history. This hypothetical
historical summary does not assert approval, rejection or another terminal outcome:

```json
{
  "data": {
    "profile": { "sapId": "00012345", "studentName": "Fictional Student" },
    "activeRequest": null,
    "departments": [],
    "progress": null,
    "history": {
      "closedRequestCount": 1,
      "latestClosedRequest": {
        "id": "d7d58523-3a2c-4b7b-91be-d2e705348ddc",
        "requestReference": "Example reference B",
        "reason": "discontinuing studies",
        "isActive": false,
        "submittedAt": "2026-10-01T09:00:00Z",
        "closedAt": "2026-10-05T09:00:00Z"
      }
    }
  }
}
```

With no closed history use `closedRequestCount: 0` and
`latestClosedRequest: null`. An empty request list is `{ "data": [] }`.
Missing linked profile is proposed 404; do not render a fabricated profile.

`GET /api/v1/student/requests` — standalone proposed 200 response with non-empty
history, contract-only and pending Issue #18 implementation. The list contains
summaries, not detail DTOs, and agrees with the dashboard examples. The order shown
is illustrative; ordering/pagination remain U16. `isActive: false` asserts no
particular closure outcome:

```json
{
  "data": [
    {
      "id": "a415c9cb-2617-49b3-825b-f6b2b1ed3ef1",
      "requestReference": "Example reference A",
      "reason": "degree completed",
      "isActive": true,
      "submittedAt": "2026-11-10T09:00:00Z",
      "closedAt": null
    },
    {
      "id": "d7d58523-3a2c-4b7b-91be-d2e705348ddc",
      "requestReference": "Example reference B",
      "reason": "discontinuing studies",
      "isActive": false,
      "submittedAt": "2026-10-01T09:00:00Z",
      "closedAt": "2026-10-05T09:00:00Z"
    }
  ]
}
```

## State display, errors and implementation gates

`PENDING`, `IN_REVIEW`, `CLEARED`, `ACTION_REQUIRED`, `NOT_REQUIRED` are proposed
digital values, not confirmed university policy or verified screen labels.
`REQUIRED`, `NOT_REQUIRED`, `UNDETERMINED` are proposed applicability values.
The proposed pairings are REQUIRED with the first four statuses, NOT_REQUIRED
only with NOT_REQUIRED, and UNDETERMINED only with PENDING. Keep unresolved Lab
visible; never display it as cleared/exempt. NOT_REQUIRED is not CLEARED.
Initial states, transitions and authorized writers remain U03/U05.

`remarks` is nullable; return null while Student visibility/source is unresolved
(U06). `updatedAt` is a recorded UTC time or null. Do not infer a digital signature
or stamp from these fields. Parse nullable timestamps and preserve unknown future
values safely in UI handling pending contract freeze.

All error responses use `{ "error": { "code": "...", "message": "..." } }`.
Shared auth currently returns 400 VALIDATION_ERROR, 401 UNAUTHORIZED and generic
500 INTERNAL_SERVER_ERROR. Proposed Student 403 uses FORBIDDEN; proposed 404 uses
NOT_FOUND for missing profile or missing/foreign request. Proposed 422 applies
to submission validation or invalid request UUID, not parameterless GETs.
Proposed creation conflict is 409 ACTIVE_REQUEST_EXISTS. Reference allocation
failure is a server failure, not an active-slot conflict.

Only one active request is confirmed. Disable duplicate submission in the UI
for usability; Issue #18 still needs database-backed concurrency enforcement.
After an uncertain network result, refresh own list/dashboard before another
attempt. Do not promise idempotent retries until U17 is agreed.

`isActive`, `submittedAt`, `closedAt` are provisional; a null closure time does
not prove activity. No processing/terminal labels, completion/closure authority,
rejection/cancellation/reopening behavior or next-request eligibility are
approved (U08-U11). Reference examples prescribe no namespace/format/sequence
(U07). List ordering/pagination and exact DTOs/nulls/error conventions remain U16.

Before treating the contract as frozen or generating production clients, obtain
acceptance of the proposed wire contract and agree any implementation deferrals
with the owners in the decision register. Its UNRESOLVED and PROPOSED states are
not approvals; ACCEPTED or ACCEPTED-DEFERRED requires authorized evidence.
Issue #17 allows Laboratory eligibility to remain configurable/unresolved, so
that policy alone does not prevent documentation completion. Coordinate PR #20's
role migration and demo guard before the dependent implementation (U18); neither
is fixed here. Drizzle is the active ORM; Prisma is legacy reference material.
No ERP/SAP/HR/Finance integration is promised. Stakeholder handoff acceptance is
still pending.
