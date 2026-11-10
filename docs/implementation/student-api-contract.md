# Issue #17: Student API contract and integration decisions

Status: contract documentation only; Student endpoint implementation belongs to
Issue #18. STEP 1 and the corrected STEP 2 proposal are the starting point.
This document records STEP 3 onward without approving unresolved business rules.

The machine-readable contract is documented in
[`openapi_employee_v1.yaml`](../references/openapi_employee_v1.yaml). The separate
[Flutter handoff](student-flutter-handoff.md) provides consumer examples.
The active persistence implementation is Drizzle; the legacy Prisma reference is
not a schema or integration dependency.
Fresh remediation checks and their scope are recorded in the
[Issue #17 verification note](issue-17-verification.md).

## STEP 3: shared authentication direction and evidence

The project lead requires Student login by university email **or SAP ID** using
the existing shared `users` identity and JWT mechanism. This is the product
direction; the SAP-ID technical request/lookup contract is **TBD** and is not
implemented by this issue. Students have role `STUDENT`, use only their own
profile/requests, and have Admin-pre-created accounts. There is no Student signup.

### Verified current local behavior

- [`auth.schemas.ts`](../../backend/src/modules/auth/auth.schemas.ts) accepts a
  strict `{ email, password }` body. Email uses Zod email validation; password is
  a nonempty string. Extra body fields, including `sapId` or `identifier`, fail.
- [`authenticateUser`](../../backend/src/modules/auth/auth.service.ts) lowercases
  email for an exact `users.email` lookup, checks activity, and uses
  `argon2.verify`. It does not trim email/password or impose university domains.
- [`auth.routes.ts`](../../backend/src/modules/auth/auth.routes.ts) returns login
  `{ accessToken, tokenType: "Bearer", expiresIn, user }`, not `{ data: ... }`.
  `GET /api/v1/auth/me` returns `{ user }`. Public account fields are exactly
  `id`, `email`, `fullName`, `role`; this is not the Student academic profile.
- [`requireAuth`](../../backend/src/middleware/requireAuth.ts) verifies the Bearer
  JWT, reloads the active shared user, requires signed/database role agreement,
  and publishes `req.auth = { userId, role, user }`.
- [`auth.tokens.ts`](../../backend/src/modules/auth/auth.tokens.ts) uses HS256,
  issuer `e-clearance-backend`, audience `e-clearance-api`, UUID user identity in
  `sub`, and the shared role enum. TTL defaults to 900 seconds (60-3600 allowed).
- [`requireRole`](../../backend/src/middleware/requireRole.ts) checks trusted
  `req.auth.role`, never a client role. The local
  [`userRoleEnum`](../../backend/src/db/schema/enums.ts) has `EMPLOYEE`,
  `HR_OFFICER`, `APPROVER`, `SYSTEM_ADMIN`; it does **not** yet have `STUDENT`.

The future Student boundary is shared `requireAuth`, then shared
`requireRole("STUDENT")`, then Student profile lookup by verified `req.auth.userId`.
Client user/SAP/profile IDs, query parameters, custom identity headers and decoded
unverified JWTs never select the owner. A request UUID is a locator, not authority.
Lists, dashboard history/counts and details must all constrain the Student owner.

### Read-only PR #20 coordination evidence

[PR #20](https://github.com/ibad-r/e-clearance-management-system/pull/20),
`feature/student-auth`, was read through GitHub metadata and its changed-file
patch on 2026-11-10. Observed head:
`06c110227f0248e4175def7d381b1df1ab1d0f30`; state: open, unmerged.
This is a point-in-time observation, not approval or a merge-readiness decision.

Its code patch appends `STUDENT` to the shared enum and registers the narrow
`0001_student_role.sql` migration. Shared JWT/context types reuse that enum.
Authorization/auth tests cover Student identity and Employee/Student boundaries.
The PR's `docs/implementation/student-auth.md` explicitly says SAP-ID login and
Student profile/business APIs are not implemented. Existing email login and
public auth response shapes are preserved. No final SAP-ID request shape has
been approved by this evidence. PR-body test results are author-reported; they
are not this issue's executed verification results.

No branch was fetched, checked out, pulled, merged, cherry-picked or modified.
No messages/comments were sent to Ahad; the questions below remain pending.

### Exact confirmations required from Ahad and Ibad

| Decision | Required confirmation | Owner |
| --- | --- | --- |
| SAP-ID lookup source | Student profile table/column, authoritative source and actual Drizzle lookup/join | Ibad supplies; Ahad confirms consumption |
| Normalization | String representation, leading zeros, whitespace/case rules, canonical storage and lookup consistency | Ahad + Ibad; business input where needed |
| Uniqueness | SAP-ID uniqueness namespace and database constraint; no ambiguous account match | Ibad + Ahad |
| User mapping | Exact foreign key to `users.id`, cardinality, provisioning and unlinked-profile handling | Ibad + Ahad |
| Shared login input | Exact identifier field(s), email/SAP combinations and precedence; preserve `{ email, password }` clients | Ahad, coordinated with Ibad |
| Email domains | Whether university-domain validation is required and the approved domains; current login has none | Business owner + Ahad |
| Failure behavior | Unknown/ambiguous identifiers, absent profile and inactive users; preserve generic credential errors | Ahad |
| Role authorization | `STUDENT` uses shared verifier, active-user reload and matching role; Employee boundary remains intact | Ahad |
| Public identity | Preserve `/auth/me` shared account fields and decide any future response extension explicitly | Ahad |
| Ownership/provisioning | Who creates credentials/profile links and how duplicate or missing links are handled | Ahad + Ibad |
| Implementation boundary | Who implements auth lookup after Ibad supplies the profile schema; no duplicate auth stack | Ahad + Ibad |
| Migration order | Coordinate the proposed role migration before Student schema migrations without duplicate numbering | Ibad + Ahad |

### Migration/demo dependency

The local journal contains only `0000_employee_clearance`.
[`reviewedDemoMigrations()`](../../backend/src/db/demo/demo-migrations.ts) requires
exactly one journal entry, one SQL file, and the reviewed tag/timestamp/hash.
PR #20's second migration conflicts with that guard. Its handoff also reports
this dependency. Ibad must coordinate a future guard review/update and migration
ordering; this issue neither changes the guard nor applies any migration.
The dependency is **not fixed** by documentation.

STEP 3 checkpoint: authentication direction and available PR evidence saved;
technical confirmations remain pending. Shared authentication is unchanged.

## STEP 4: profile identity, submitted fields and request reference

The profile endpoint provides SAP ID and Student name from the server-resolved
authenticated profile. Registration number, father's name, program, semester and
reason belong to a particular submission. `/auth/me` provides shared account
information; it must not be substituted for the academic profile.

| JSON field | Proposed type | Source | Requiredness | Known rule / unresolved validation |
| --- | --- | --- | --- | --- |
| `sapId` | string | Authenticated profile | Required profile identity, proposed | Never trust submitted SAP ID; authoritative column, format, normalization and uniqueness TBD |
| `studentName` | string | Authenticated profile | Required profile identity, proposed | Never trust submitted name; profile field versus `users.fullName` and synchronization TBD |
| `registrationNumber` | string | Student request body | Required, proposed | Format, length, whitespace/blank handling, verification and final requiredness TBD |
| `fatherName` | string | Student request body | Required, proposed | Character/length/whitespace rules and final requiredness TBD |
| `program` | string | Student request body | Required, proposed | Free text versus controlled program identifier/list TBD |
| `semester` | string | Student request body | Required, proposed | String versus integer, meaning, academic range/allowed values TBD |
| `reason` | string enum | Student request body | Required, proposed | Only meanings Degree completed / Discontinuing studies; proposed wire literals `degree completed`, `discontinuing studies` require acceptance |
| `id` | UUID string | Server | Required request response | Internal locator; request-detail path uses this UUID |
| `requestReference` | string | Server | Required request response/summary, proposed | Unique human-readable reference; name, namespace, allocation and format/sequence TBD |
| Owner identity | Server-resolved shared UUID/profile relationship | Verified `req.auth.userId` | Required internally | Never client-selected; exact Student profile mapping TBD |

String representations avoid assuming numeric SAP/registration semantics or
discarding leading zeros. No field lengths, SAP/registration patterns, academic
semester ranges, program lists or domain policies are established here.
Required fields mean presence/non-null correct JSON types in the proposed schema;
blank-string, trim/normalization and academic validation remain explicit TBDs.

Proposed creation accepts exactly the five submitted fields and rejects extra
properties, including `sapId`, `studentName`, `studentId`, `userId`, `role`, `id`,
`requestReference`, department states and lifecycle metadata. Submission/UUID
validation uses proposed 422 errors; parameterless GETs have no blanket 422 rule.

`requestReference` is distinct from the internal UUID, is allocated by the server
before 201, and is recommended to remain stable in history. Include it in request
details, creation, lists, dashboard active summaries and latest closed summaries.
Examples use `Example reference A/B` as fictional placeholders, not an approved
prefix, length, sequence, date encoding or allocation algorithm. Namespace across
Student versus all clearance modules requires confirmation. Reference allocation
failure is a server failure, not an `ACTIVE_REQUEST_EXISTS` conflict.

The corrected proposal recommends server-copied identity snapshots in request
responses. Snapshot versus live profile/applicability and correction behavior
remain TBD; clients never supply the profile identity either way.

STEP 4 checkpoint: field ownership and reference requirements saved. No schema,
validator or Student service was created.

## STEP 5: official form, discrepancy and proposed digital department states

The project lead's confirmed official University Clearance Form is authoritative
for its printed roster. The form has Signature & Stamp and optional Remarks
columns; it defines **no exact digital status labels**. Exact labels from the
screen recording are **unverified**. The API values below are proposals, not
observed labels, approved university policy or existing Student database enums.

| Proposed business code (not a database UUID) | Official printed/display name |
| --- | --- |
| `LIBRARY` | Library |
| `FEE_DUES` | Fee & Dues Department |
| `STUDENT_SERVICE` | Student Service Department |
| `LABORATORY` | Laboratory (If required); display label Laboratory |
| `COORDINATION_OFFICE` | Coordination Office |

The reported overview instead listed Coordination, Transport, Library, Fee and
Student Service. Laboratory is not silently replaced by Transport, nor are the
two lists merged into six required stages. The working examples follow the
official form. The business owner must confirm whether Transport is another
process, obsolete UI, an omission or an additional requirement. Proposed mappings
Coordination -> Coordination Office, Fee -> Fee & Dues Department and Student
Service -> Student Service Department require confirmation. Display order carries
no sequential processing or unlocking meaning.

Examination Department is informational for the transcript next step, not a
clearance stage, status entry, approval or progress denominator. No transcript
eligibility or automatic transition is asserted.

### Proposed department DTO and consistency

Every entry has `departmentCode`, `displayName`, `applicability`, `status`,
`remarks` (string or null) and `updatedAt` (recorded UTC timestamp or null).
The five form entries remain visible, including an explicitly exempt Lab.

| Proposed API status | Proposed digital meaning |
| --- | --- |
| `PENDING` | No departmental determination recorded yet |
| `IN_REVIEW` | Authorized review-in-progress state explicitly recorded |
| `CLEARED` | Authorized clearance determination recorded |
| `ACTION_REQUIRED` | Outstanding matter requiring Student action recorded |
| `NOT_REQUIRED` | Explicit determination that the department is unnecessary |

Applicability is separate: `REQUIRED`, `NOT_REQUIRED`, `UNDETERMINED` are proposed
values. `REQUIRED` permits the first four statuses; `NOT_REQUIRED` pairs with
status `NOT_REQUIRED`; `UNDETERMINED` pairs with `PENDING` until determination.
An unresolved Lab has no invented eligibility rule and is never counted as
cleared or exempt. `NOT_REQUIRED` is not `CLEARED`.

Remarks visibility is **TBD** despite the form's remarks column. Examples with
text illustrate approved Student-visible remarks only; until visibility/source
is agreed, return null. `updatedAt` is null if no recorded update is available.
Signature/stamp capture and any digital evidence requirements remain TBD; no
digital signature or approval DTO is invented.

Students cannot update department states or applicability. The authorized writers,
initial states and permitted transitions require business/backend coordination.
No automatic clearance, sequential approvals or unlocking are introduced.

### Dashboard progress and provisional lifecycle

Dashboard fields are `profile`, `activeRequest` (summary or null), `departments`,
`progress` (or null), and `history` (`closedRequestCount`, `latestClosedRequest`).
No active request means `activeRequest: null`, `departments: []`, `progress: null`;
historical requests/counts remain independently available. An empty list is 200
`{ data: [] }`; an absent linked profile is proposed 404, not a fabricated profile.

Progress counts required entries, cleared required entries, required
action-required entries, exemptions and unresolved applicability separately.
Counts never assert request approval/completion. Do not compute an authoritative
completion percentage while applicability is unresolved. A dashboard and its
active detail must describe a consistent owner/request state.

One active request per Student and retention of historical requests are confirmed
requirements. Concurrent creation needs database-backed enforcement in Issue #18;
a UI button or standalone check-then-insert is insufficient.

`isActive`, `submittedAt`, `closedAt` are **provisional summary fields**, not a
complete lifecycle. They cannot describe processing state, terminal outcome,
closure reason/actor, completion eligibility or reopening. `closedAt` is a
recorded closure time when available; null does not independently prove activity.
No request-status enum or completion/rejection/cancellation/reopening/closure
rule is invented. The confirmed terminal classifications must eventually define
the active slot. Submission alone does not approve, clear or complete a request.
Historical examples with `isActive: false` do not claim a specific outcome.

### Explicit assumptions in examples

- Official-form roster is the working scope; the overview discrepancy stays open.
- Four ordinary departments are shown as required only to illustrate configured
  applicability; exceptions are unconfirmed.
- Lab applicability is unresolved. Examples allow submission in that state;
  whether it must block submission is a business decision, not approved policy.
- Initial `PENDING` and later status snapshots illustrate proposed digital values.
- Five submitted fields are provisionally required; semester is provisionally a
  string. No academic format/length rules are inferred from fictional examples.
- Profile identity snapshots, stable references, DTO layouts/nulls, ordering and
  an initially unpaginated list are recommendations awaiting acceptance.

### Decision register: acceptance and implementation follow-up

| State | Meaning and evidence requirement |
| --- | --- |
| UNRESOLVED | An owner decision is still required; no final answer or authorized deferral is recorded. |
| PROPOSED | A candidate contract choice is documented, but owner acceptance and any remaining details are pending. |
| ACCEPTED | An authorized owner accepted the specific decision; cite the acceptance evidence before assigning this state. |
| ACCEPTED-DEFERRED | An authorized owner accepted a specific deferral, its scope and interim behavior; cite that evidence before assigning this state. |

No U01-U18 decision has authorized acceptance or an accepted deferral recorded
here. PROPOSED does not mean approved. Each row retains the required owner/action;
only acceptance evidence can move it to ACCEPTED or ACCEPTED-DEFERRED.

Documentation completion, contract freeze and implementation readiness are
separate checks. [Issue #17](https://github.com/ibad-r/e-clearance-management-system/issues/17)
explicitly permits Laboratory eligibility to remain configurable/unresolved.
The unresolved Lab policy in U03 therefore does not itself block documentation
completion. This scope allowance is not acceptance of the proposed applicability
enum, authority or a particular eligibility rule, and does not mark U03 deferred.
The five displayed departments are fixed in Issue #17; U01 tracks the older
overview discrepancy without reopening that agreed scope. U18 tracks coordination
for Issues #16/#18, not a requirement to modify/apply migrations in Issue #17.

The documented proposals can be reviewed and handed off with these limitations.
Final stakeholder acceptance of the handoff and wire contract remains pending;
the issue is not claimed accepted or closed. Before production client generation
or dependent implementation, the owners must accept the relevant contract choices
or record an authorized deferral with explicit interim behavior.

| ID | State | Required owner action / remaining work | Responsible person |
| --- | --- | --- | --- |
| U01 | UNRESOLVED | Explain the older Transport overview versus the agreed conditional Laboratory roster and screen/form relationship; preserve Issue #17's five-department scope | Business owner, coordinated by Ibad |
| U02 | PROPOSED | Confirm shortened-name mappings and accept the proposed business codes | Business owner + Ibad |
| U03 | UNRESOLVED | Confirm ordinary-department exceptions and Lab eligibility/configuration/decision authority; Lab policy may remain configurable/unresolved for this documentation handoff | Business owner + Ibad |
| U04 | UNRESOLVED | Decide whether unresolved Lab applicability blocks submission; the example's allowance is not approved behavior | Business owner + Ibad |
| U05 | PROPOSED | Accept or revise digital enums and illustrative initial states; define permitted transitions and authorized writers | Business owner + Ibad |
| U06 | UNRESOLVED | Confirm Student-visible remarks, timestamps and any signature/stamp evidence requirements | Business owner + Ibad |
| U07 | PROPOSED | Accept or revise requestReference and recommended stability; decide uniqueness namespace, allocation/format/sequence | Ibad with business owner |
| U08 | UNRESOLVED | Define processing/terminal states and classification of the one-active-request slot | Business owner + Ibad |
| U09 | UNRESOLVED | Define completion/closure authority and conditions; rejection/cancellation/reopening only if required | Business owner + Ibad |
| U10 | UNRESOLVED | Define outcomes that permit a subsequent request | Business owner + Ibad |
| U11 | UNRESOLVED | Decide historical outcome/actor/reason/timestamps, missing timestamps, snapshots and correction behavior | Business owner + Ibad |
| U12 | UNRESOLVED | Confirm authoritative Student SAP/name fields, user mapping/cardinality, uniqueness and provisioning | Ibad + Ahad |
| U13 | UNRESOLVED | Agree shared university-email/SAP-ID login shape/lookup/normalization/domains/errors and backward compatibility | Ahad + Ibad; business input |
| U14 | PROPOSED | Accept or revise the five provisionally required strings; define blank/whitespace/length/format handling and program/semester representation/rules | Business owner + Ibad |
| U15 | PROPOSED | Accept or revise the exact reason wire literals | Business owner + Ibad |
| U16 | PROPOSED | Accept or revise DTOs/nulls, proposed Student 422/409 conventions and dashboard history; decide list order/pagination | Ibad + Afaq |
| U17 | UNRESOLVED | Decide creation retry/idempotency contract for uncertain network outcomes | Ibad + Afaq |
| U18 | UNRESOLVED | Coordinate PR #20 role migration order and future demo-guard review before dependent implementation; neither is fixed here | Ibad + Ahad |

STEP 5 checkpoint: official roster, discrepancy, digital proposals, lifecycle
limits and all unresolved decisions saved. No department rule was implemented.
