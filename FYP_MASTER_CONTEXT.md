# FYP MASTER CONTEXT — E-CLEARANCE MANAGEMENT SYSTEM

**Updated:** 22 November 2026  
**Institution:** Riphah International University — Faculty of Computing (current FYP scope)  
**Purpose:** Authoritative project handover. Read before planning, coding, changing scope, or assigning sprint work.

> This version replaces the stale 30 October 2026 implementation snapshot. GitHub merged code and test evidence are the implementation source of truth. This document is the continuity and planning record. Never mark a feature complete merely because a screen, contract, schema, or PR exists.

## 1. Project goal

Build one **E-Clearance Management System** for **Students** and **Employees**, using one shared backend/database with separate role-based workflows where business needs differ. The system aims to digitize paper clearance, make progress visible, apply appropriate department requirements, preserve action history, and support authorized review and final clearance.

### Product modules

- **Student Clearance:** students sign in, submit a request, view department-wise status, and access request history.
- **Employee Clearance:** FC teachers/staff initiate or participate in an employee exit-clearance workflow, including applicability questions, department checks, outstanding items, and authorized approvals.
- **Shared platform:** shared authentication/JWT, PostgreSQL, API, and one Flutter application with separate Student/Employee access.
- **Web portal:** one role-based HR/Approver/System Admin portal is planned; a working web portal is not verified in the current repositories.
- **Later features:** e-stamp, certificate PDF, QR verification, notifications, and one AI-based feature are part of the wider FYP direction but are not verified as implemented.

### Scope guardrails

- This is an FYP implementation, not a production university-wide deployment.
- No real Riphah HR/Finance/Library/SAP/ERP integration is verified.
- Use fictional test data only.
- Do not claim legally certified digital signatures or real university approvals.
- Do not use mock data as if it came from the backend.

## 2. Business rules and workflow facts

### Student

- Student request payload uses registration number, father name, program, semester, and reason (degree completed / discontinuing studies).
- Student name and SAP ID are profile-derived; client-supplied identity must never establish ownership.
- One active request per Student; completed/cancelled requests remain in history.
- Five department records: Library, Fee & Dues, Student Service, Laboratory (conditional), Coordination Office.
- Department progress is independent in the current agreed implementation. Do not silently add sequential unlocking based on the older portal reference.
- Laboratory eligibility is conditional/configurable. Unknown must not be silently treated as CLEARED or NOT_REQUIRED.
- Student endpoints are read-only for department statuses; Students cannot approve their own clearance.
- Examination Department is the next step after clearance for transcript processing, not one of the five clearance departments.

### Employee

The uploaded Teacher Clearance Form describes a manual exit process: HR provides a physical form; the employee visits relevant departments; responsible staff check records and enter Nil/Outstanding/signature. Fields include employee number, designation, department, joining date, last working day, reason, and remarks.

The paper form lists 14 clearance areas:
1. HDS Department
2. Finance Department
3. Fees and Dues Department
4. Computer Services Department
5. Operations Department
6. CMS Representative
7. ORIC
8. Store Section
9. Warden / Hostel
10. Lab In-charge / Office
11. Information Services Department
12. Ward In-charge / Nursing Division
13. Pharmacy
14. Head of Department (HOD)

These 14 areas are **not confirmed mandatory for every employee/category**. Applicability must be configured from approved rules, not guessed. Authority/signature areas shown include Campus Director/SU Head, Manager HDS, Director Finance, and ED/VC for direct reportees; exact applicability/order remains subject to institutional confirmation.

The currently merged Employee API uses an employee-initiated request as its implemented MVP entry point. This does not prove the broader HR-initiated workflow is complete.

### Employee Option A — unresolved definition

Sprint 2 explicitly names an Employee applicability questionnaire and **Employee Option A**. The uploaded master context and the reviewed PR/issue descriptions do not define Option A's exact meaning, question wording, choices, decision conditions, or resulting workflow. **Do not invent Option A.** Obtain the agreed business rules from Ibad/supervisor before implementing its decision logic.

### Roles and authorization

Intended role model:
- `EMPLOYEE`
- `STUDENT`
- `HR_OFFICER`
- `APPROVER`
- `SYSTEM_ADMIN`

HR, Approver, and System Admin are separate responsibilities. Backend authorization is mandatory; UI route guards are not security. Do not add a Department Officer role without an explicit decision. Before Student department status-write endpoints are built, agree which authorized role performs those actions.

### Approval and certificate safety

- Authorized human approval must be authenticated and audit-recorded.
- An e-stamp is a system-backed visual approval marker, not automatically a legally certified signature.
- Do not issue a certificate until all applicable department and approval requirements are satisfied.
- Do not claim a full approval engine simply because request/stage/approval snapshots exist.

## 3. Repositories and technology

- **Backend:** https://github.com/ibad-r/e-clearance-management-system
- **Flutter mobile:** https://github.com/ibad-r/e-clearance-mobile
- **Figma Make:** https://www.figma.com/make/IqT7p5dXW3RhLNpn3Me0u5/E-Clearance-Management-System

| Layer | Active choice / status |
|---|---|
| Backend | Node.js, Express, TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Auth | Shared email/password + JWT; Student role supported |
| Mobile | Flutter / Dart |
| Web portal | React + TypeScript planned; implementation not verified |
| API contract | OpenAPI in backend repository |

**Legacy warning:** uploaded `schema.prisma` is reference material only. Drizzle is the active ORM. Do not create a second Prisma stack or migration chain.

## 4. Verified GitHub status — checked 22 November 2026

### Backend repository

Default branch: `main`  
Latest observed main commit: `4b3f14a12556ebd247000056b86f9863b1aabe0c` (20 Nov 2026).

| PR | Work | Status | Evidence/limits |
|---|---|---|---|
| #13 | Employee PostgreSQL login, JWT, shared auth and /auth/me | Merged | Backend auth implementation exists |
| #15 | Employee clearance APIs integrated with JWT | Merged | Employee profile/case APIs mounted behind auth |
| #19 | Isolated PostgreSQL demo setup | Merged | Demo inspect/migrate/seed/verify tooling added; PR reports setup verification |
| #20 | Student shared role/auth | Merged | STUDENT role and email/password login support |
| #21 | Student API contract and Flutter handoff | Merged | Contract/docs complete |
| #23 | Student schema, migration and APIs | Merged 20 Nov | Student schema and five Student endpoints |
| #12 | Earlier Employee API preparation | Closed, not merged | Superseded by Employee integration PR #15 |

#### Employee backend

- Shared PostgreSQL-backed login and JWT.
- `GET /api/v1/auth/me`.
- Employee profile and clearance case endpoints integrated behind auth.
- PR #15 reports new cases start `IN_PROGRESS`, stages `LOCKED`, approvals `WAITING`.
- Full department checking, outstanding resolution, approval transitions, and certificate lifecycle are **not** proven complete by this API integration.

#### Student backend

PR #23 adds:
- Separate `student_profiles`, `student_requests`, `student_request_departments` tables.
- Migration `0002_student_clearance` after the Student role migration.
- `GET /api/v1/student/profile`
- `GET /api/v1/student/dashboard`
- `POST /api/v1/student/requests`
- `GET /api/v1/student/requests`
- `GET /api/v1/student/requests/:requestId`
- JWT + `STUDENT` role and verified database identity for ownership.
- One-active-request enforcement including concurrency protection.
- Five department records initialized with honest statuses; Laboratory remains undetermined/configurable.

PR #23 explicitly leaves department automation/status writers, closure endpoints, certificates, and account provisioning as follow-up work. Student APIs currently expose persisted state; they do not automatically approve/complete requests.

#### Backend test evidence

PR #23 reports on isolated PostgreSQL 18:
- `npm ci`, lint, typecheck, build passed.
- 314 unit tests passed.
- 124 PostgreSQL integration tests passed.
- Migration/ownership/concurrency/rollback tests described in the PR.

Caveats:
- PR #20 reported `npm run test:demo` failing because the demo migration guard expected one migration. PR #23 says demo migration compatibility was updated, but its verification list does not explicitly show a fresh demo-suite pass. Re-run `npm run test:demo` before claiming it is green.
- CI PostgreSQL is not the same as the local demo database. PR #23 says development/demo databases were not migrated/reset as part of that PR.

### Flutter repository

| PR / Issue | Work | Status | Evidence/limits |
|---|---|---|---|
| PR #2 | Employee 7-screen Flutter MVP | Merged | Employee UI/navigation code merged |
| PR #6 | Employee API integration/session handling | Merged | API client, auth/session, profile and case repository code merged |
| Issue #3 | Employee Flutter API integration | Closed completed | Task closed; physical-device E2E evidence not recorded here |
| Issue #7 | Student UI and role selection | Closed completed | Student UI task closed |
| PR #11 | Student API integration Phase 2 | Closed | Code exists; PR body says live API tests not run |

Observed commits:
- Employee API integration: `637dd702a17dc59c23c970f4e072d2c747ad0a69` (6 Nov).
- Student UI: `9068ad6d0b8a127224428e36b3b3171997983047` (13 Nov).
- Student API integration: `c91bae0c606085855771dca7a4d32db8a51093f9` (15 Nov).

**Mobile caveat:** Student PR #11 explicitly says live backend login and Student endpoint tests were not run. Its analyzer/test/build lines contain placeholders rather than recorded outputs. Verify PR #11's merge-to-main state and run Flutter checks before claiming Student mobile integration is complete.

## 5. Overall completion assessment

### Implemented in GitHub

- Backend foundation and Drizzle schema.
- Shared Employee authentication/JWT.
- Employee profile/request API integration.
- Employee Flutter UI and API integration code.
- Isolated demo PostgreSQL tooling.
- Student shared role and email/password auth support.
- Student API contract.
- Student database schema and five Student APIs.
- Student Flutter UI and Student API integration code.

### Not yet verified as complete

- Full Student login → live backend → PostgreSQL → Flutter E2E.
- Full Employee login → live backend → PostgreSQL → Flutter E2E.
- Local demo DB safely upgraded through all migrations.
- Fresh demo test-suite pass after migration compatibility changes.
- Student SAP-ID login; current documented Student login is email/password.
- Authorized Student department status processing.
- Full Employee department lifecycle and status transitions.
- Employee applicability questionnaire and Option A decision logic.
- Working HR/Approver/System Admin web portal.
- E-stamp, certificate PDF, QR verification, notifications, AI feature.
- Real Riphah HR/Finance/Library/SAP/ERP integration.

Do not invent a completion percentage. Foundation and core module code are substantially implemented, but workflow operations, admin web, E2E proof, and later FYP features remain.

## 6. Academic plan — original five sprints

The academic plan contains **five sprints**. Sprint 0 in GitHub was initial technical groundwork and is not one of these five academic sprints.

### Sprint 1 — Student Module Foundation

The user reports Sprint 1 complete. GitHub evidence supports closure/merging of most Student foundation work:
- Student shared auth/role (#16, supporting #22, PR #20).
- Student API contract (#17 / PR #21).
- Student Flutter UI (#7).
- Student database schema and APIs (#18 / PR #23).
- Student Flutter API integration work (mobile PR #11).

Residual caveats: SAP-ID login is not verified; Student live mobile-to-backend E2E is not recorded. Mark development tasks as completed/merged, but retain integration acceptance caveats.

### Sprint 2 — Student Lifecycle & Employee Workflow

**Priority:** P1 — High  
**Dates:** 13–19 November 2026  
**Module:** Blank (cross-module goal)

**Sprint Goal**
Expand the Student clearance lifecycle and implement the initial Employee clearance workflow.

**Expected Deliverables**
- Student clearance lifecycle improvements.
- Department workflow implementation.
- Employee applicability questionnaire UI.
- Employee Option A workflow.
- Required backend API and database updates.
- Student and Employee frontend/backend integration.

**Definition of Done**
Student lifecycle features and the initial Employee workflow are integrated and pass basic functional testing.

**Recommended implementation backlog**
1. Student lifecycle: verify submit → dashboard → details → history against the real API; test ownership, duplicate active request, persisted initial statuses; define approved next transitions.
2. Student department workflow: agree the authorized actor/role first; add guarded status transitions and audit events; test invalid transitions. Preserve independent progress and conditional Laboratory.
3. Employee applicability questionnaire: build the UI in the existing Flutter flow; confirm exact questions/options and which answers change department requirements; validate and persist answers through backend.
4. Employee Option A: obtain the exact approved Option A definition; map answers to applicable departments; persist questionnaire answers and per-request workflow snapshots.
5. Cross-module integration: test role separation, invalid/expired JWT, wrong role, missing profile, duplicate requests, invalid questionnaire answers, and unauthorized status updates. Run backend lint/typecheck/build/unit/integration/demo tests and Flutter analyze/test/build. Record CI vs local DB vs emulator/device evidence separately.

**Sprint 2 status on 22 Nov:** dates have elapsed. GitHub shows Student backend work merged 20 Nov and Student Flutter integration code committed 15 Nov, but live Student E2E remains unverified. Employee applicability/Option A work is not evidenced in the PRs reviewed. Do not mark the full Sprint 2 Definition of Done as passed based on merged Student APIs alone.

### Sprint 3 — Clearance Workflow & Verification

**Priority:** P1 — High  
**Dates:** 20–26 November 2026  
**Module:** Blank (cross-module goal)

**Sprint Goal**
Advance the Student and Employee clearance workflows with dynamic applicability, department processing, and verification.

**Expected Deliverables**
- Dynamic Employee applicability handling.
- HR verification workflow placeholder.
- Department clearance state machine.
- Student department clearance workflow.
- Clearance status and progress APIs.
- Frontend/backend integration and testing.

**Definition of Done**
Core Student and Employee workflow transitions function correctly and their progress can be tracked through the application.

### Sprint 4 — Admin Module & System Integration

**Priority:** P1 — High  
**Dates:** 27 November–3 December 2026  
**Module:** Admin

**Sprint Goal**
Implement the initial Admin Module and integrate Admin operations with Student and Employee clearance workflows.

**Expected Deliverables**
- Admin authentication and role permissions.
- Admin dashboard.
- Student and Employee request visibility.
- Initial Admin request actions.
- Integration with existing backend APIs.
- Role-based access testing.

**Definition of Done**
Admin can access the dashboard, view relevant requests, and perform the implemented authorized actions.

### Sprint 5 — Stabilization, Testing & Final Demo

**Priority:** P1 — High  
**Dates:** 4–7 December 2026  
**Module:** Integration & Quality

**Sprint Goal**
Stabilize the integrated E-Clearance Management System and prepare a reliable project demonstration.

**Expected Deliverables**
- Fix critical and high-priority bugs.
- Test Student, Employee, and Admin workflows.
- Verify role-based permissions.
- Perform end-to-end regression testing.
- Prepare demo accounts and test data.
- Update project documentation.
- Prepare final demonstration.

**Definition of Done**
Main application workflows are integrated, critical bugs are resolved, permissions are verified, and the system is ready for demonstration.

### Schedule reality

As of 22 November, Sprint 3 (20–26 November) is in progress and Sprint 2 dates (13–19 November) have elapsed. Decide explicitly whether to close Sprint 2 with carry-over tasks or re-baseline Sprint 3. Do not silently alter the original dates; record supervisor-approved changes separately.

## 7. Decisions required before coding remaining Sprint 2 work

1. What exactly is Employee Option A? Provide the precise question wording, choices, decision conditions, and resulting workflow.
2. Which of the 14 employee clearance areas apply to each category/answer? Which are mandatory, conditional, or skipped?
3. Who is allowed to update Student department status in the demo — HR, Approver, System Admin, or a separately approved role?
4. Which actor can complete/cancel Student requests, and what transitions are allowed?
5. Is SAP-ID login still required? Current backend contract is email/password.
6. Has the local demo DB been upgraded through Student migrations? Do not assume so.

## 8. Immediate next actions

1. Reconcile Sprint 2 carry-over with the original deliverables.
2. Run real Employee and Student login/API E2E tests on the actual Flutter app.
3. Inspect the local demo DB target/migration state; use only guarded commands on the isolated demo DB.
4. Agree Student department status actor, permissions, and lifecycle transitions.
5. Obtain the exact Employee Option A definition and applicability questionnaire.
6. Implement Employee questionnaire + Option A with backend persistence and per-request workflow snapshots.
7. Implement Student department workflow transitions with authorization, audit records, and tests.
8. Deliver Sprint 3 dynamic applicability, HR verification placeholder, progress tracking, and integration tests.
9. Build the Admin module in Sprint 4; Figma prototype is not a working portal.
10. Reserve Sprint 5 for regression, permissions, demo accounts, documentation, and final demo.

## 9. Team ownership (confirm if changed)

- **Ibad:** Project Lead / Backend Lead; scope, Employee/Student backend, API contracts, integration decisions, acceptance.
- **Abdul Ahad:** shared authentication/JWT/role work.
- **Afaq:** Flutter mobile implementation and integration.

Use GitHub issues/PRs for actual assignments and confirm current ownership before moving tasks.

## 10. Rules for future FYP sessions

- Read this file first; do not restart requirements discovery.
- Be direct and realistic. Never claim feature/test completion without evidence.
- Distinguish designed, implemented, merged, CI-tested, locally tested, and end-to-end verified.
- GitHub merged code/PRs and actual test output take precedence over stale summaries.
- Drizzle is active; Prisma file is legacy/reference.
- Never commit `.env`, credentials, JWT secrets, tokens, password hashes, or real personal data.
- Do not invent institutional policy, Option A rules, department applicability, approver order, or role permissions.
- Keep Student and Employee profiles/workflows separate where business needs differ while reusing shared infrastructure.
- Record every approved scope or schedule change.
- Update this document after major merged work, sprint review, test checkpoint, or supervisor decision.

**End of master context — 22 November 2026.**


---

# 11. Sprint history and revised execution schedule — added 22 November 2026

This section records the earlier Sprint 0/Sprint 1 groundwork and the team's decision to combine the missed Sprint 2 scope with Sprint 3 scope into one recovery sprint. It supersedes the original Sprint 2/Sprint 3 calendar dates above for execution planning. The original scope descriptions remain preserved as historical planning context.

## Sprint 0 — Employee Technical Foundation (GitHub setup sprint; not one of the five academic sprints)

**Purpose:** establish the shared technical foundation and deliver the first Employee mobile/API vertical slice.

### Original GitHub tasks shown in the project board

- [W10-02] Implement Drizzle Database Schema and Initial Migration — Issue #5.
- [W10-04] Real Employee Login API + JWT /auth/me (PostgreSQL) — Issue #10.
- [W10-05] Flutter Employee Clearance MVP — 7 Screens — Issue #1.
- [W10-06] Implement Employee Clearance Request APIs — Issue #11.
- Flutter Employee App — Integrate with Employee Clearance API — Issue #3.

### Result recorded from current repository evidence

- Employee shared authentication/JWT and `/auth/me` work is merged in backend PR #13.
- Employee clearance API integration is merged in backend PR #15.
- Employee Flutter 7-screen UI is merged in mobile PR #2.
- Employee Flutter API/session integration is merged in mobile PR #6; the corresponding integration task #3 is closed.
- Drizzle schema and initial database foundation are present in the backend repository; the current backend uses Drizzle + PostgreSQL, not the uploaded legacy Prisma schema.
- Isolated demo database tooling was added in backend PR #19.

**Sprint 0 assessment:** technical foundation and Employee MVP code were delivered and merged. Do not interpret this as proof that every real-device Employee workflow or full HR/department process is complete. The actual Employee mobile → API → PostgreSQL → mobile read-back flow still needs a recorded end-to-end smoke test.

## Sprint 1 — Student Module Foundation

**Purpose:** add Student role/auth, Student data model/API contract, Student Flutter screens, and the initial Flutter/API handoff.

### Original GitHub tasks shown in the project board

- [STUDENT-AUTH] Extend shared login, JWT and role authorization for STUDENT — Issue #16.
- [STUDENT-AUTH-SUB] Finish dependencies: SAP-ID contract, migration order, etc. — Issue #22.
- [STUDENT-API-01] Finalize Student API contract and Flutter integration handoff — Issue #17.
- Student Flutter Module — Implement Figma UI Screens and Navigation — Issue #7.
- [STUDENT-API-02] Implement Student Drizzle schema, migrations and clearance APIs — Issue #18.
- [STUDENT-FLUTTER-02] Final UI fixes first, then Student API integration — Issue #9.

### Result recorded from current repository evidence

- Student role and shared email/password auth support merged in backend PR #20.
- Student API contract/handoff merged in backend PR #21.
- Student Drizzle schema, migration and five Student endpoints merged in backend PR #23.
- Student Flutter UI task #7 is closed; Student UI commit is present in the mobile repository.
- Student Flutter API integration work is represented by mobile PR #11, which is closed. Its PR description explicitly says live API tests were not run; therefore, code/task closure must not be described as a fully verified real-device integration.
- Student SAP-ID login is not verified as implemented. The current backend contract uses email/password. Confirm whether SAP-ID login remains a requirement before scheduling it.

**Sprint 1 assessment:** Student foundation work is substantially implemented/merged. The development tasks can be recorded as completed, with live integration and SAP-ID caveats retained as acceptance follow-ups.

## Revised recovery sprint — Sprint 2: Student & Employee Workflow Completion

**Decision date:** 22 November 2026  
**Recommended execution:** Monday 23 November – Saturday 28 November 2026  
**Duration:** 6 calendar days  
**Priority:** P1 — High  
**Module:** Leave blank (cross-module goal)

**Why combine?** The original Sprint 2 window (13–19 November) was missed/partly delivered, while Sprint 3 was scheduled for 20–26 November. Starting a separate Sprint 3 tomorrow while Sprint 2 acceptance work remains open would fragment the team. Combine the remaining Sprint 2 deliverables with the core Sprint 3 workflow/verification deliverables into one controlled recovery sprint. Preserve the original sprint history; do not pretend the old Sprint 2 was completed.

### Sprint Goal

Complete and verify the core Student and Employee clearance workflows, including applicability handling, department processing, status tracking, and real frontend/backend/database integration.

### Combined Expected Deliverables

- Student lifecycle verification and improvements.
- Student department clearance workflow and authorized status transitions.
- Employee applicability questionnaire UI and backend persistence.
- Employee Option A workflow, but only after its exact agreed meaning/rules are supplied.
- Dynamic Employee applicability handling.
- Initial HR verification workflow placeholder.
- Department clearance state machine and progress/status APIs.
- Required backend API and database updates.
- Student and Employee frontend/backend integration.
- Basic functional, authorization, and regression testing.

### Definition of Done

The core Student and Employee workflow transitions function correctly, their progress is persisted and trackable through the application, and the agreed main paths pass basic end-to-end testing using the real backend and PostgreSQL.

### Six-day execution plan

**Day 1 — Monday 23 Nov: scope lock + integration baseline**
- Confirm which Sprint 2 items are already implemented versus only merged as code.
- Run backend and Flutter checks; record current failures.
- Run Student and Employee login/profile/request flows against the running API.
- Verify local demo DB migration state safely; do not reset an existing database.
- Confirm Option A definition, questionnaire rules, and department actor permissions. If these are unavailable, raise a blocker and do not invent the logic.

**Day 2 — Tuesday 24 Nov: Student lifecycle + department transitions**
- Complete Student submit/list/detail/dashboard real API flow.
- Implement only approved department status transitions.
- Add backend authorization, valid transition checks, audit record, and tests.
- Verify Laboratory remains conditional/undetermined until a rule is confirmed.

**Day 3 — Wednesday 25 Nov: Employee applicability**
- Implement the approved questionnaire UI in the existing Employee app.
- Add validated backend payload/schema persistence.
- Map answers to applicable departments only from confirmed policy/rules.
- Store a per-request applicability/workflow snapshot.

**Day 4 — Thursday 26 Nov: Employee Option A + HR placeholder**
- Implement Option A only if its definition has been confirmed.
- Add the initial HR verification placeholder and permission checks.
- Add status/progress API updates for the implemented workflow.
- If Option A remains undefined, use this day for E2E fixes and other agreed core workflow work; do not fabricate a workflow.

**Day 5 — Friday 27 Nov: cross-module integration**
- Test Student/Employee role separation and request ownership.
- Test unauthorized roles, invalid/expired JWT, duplicate active requests, invalid questionnaire payloads, and invalid state transitions.
- Connect all implemented Flutter screens to live APIs; remove mock behavior from acceptance paths.

**Day 6 — Saturday 28 Nov: acceptance and sprint review**
- Run backend lint/typecheck/build/unit/integration/demo checks.
- Run Flutter analyze/test/build.
- Perform Student and Employee app → API → PostgreSQL → app read-back tests.
- Fix critical/high-priority blockers; document remaining low-priority work.
- Record actual evidence, demo accounts using fictional data, and Sprint Review outcome.

### Must-have acceptance checklist

- [ ] Student login and profile work through the running backend.
- [ ] Student can submit a request; it is stored in PostgreSQL and reappears from API after app reload.
- [ ] Student request ownership and one-active-request rules are verified.
- [ ] Student department status transitions are performed only by an authorized actor.
- [ ] Employee login/profile/request flow works through the running backend.
- [ ] Employee applicability answers are validated and persisted.
- [ ] Employee Option A is implemented only from an approved definition; otherwise explicitly blocked and carried forward.
- [ ] Department applicability and status/progress are returned by APIs.
- [ ] Student and Employee roles cannot access each other's protected data.
- [ ] Backend and Flutter checks pass, with actual outputs recorded.
- [ ] Both main flows pass app → API → PostgreSQL → API → app read-back testing.

### Scope control for this six-day recovery sprint

Do not attempt to finish the entire Admin portal, AI feature, e-stamp/QR certificate, push notifications, or live university integrations in this six-day window. Those are separate scope items. The recovery sprint succeeds by delivering reliable Student and Employee workflow slices, not by accumulating unfinished screens.

### Schedule impact on remaining academic sprints

- The original Sprint 3 scope is absorbed into the revised recovery Sprint 2; it is not silently marked as a separately completed sprint.
- Original Sprint 4 (Admin Module & System Integration) and Sprint 5 (Stabilization, Testing & Final Demo) must be re-dated after the 28 November sprint review.
- Proposed next planning checkpoint: 28 November sprint review. Only then set realistic dates for the remaining Admin and final stabilization work, taking the actual FYP submission/demo deadline into account.
- If the supervisor requires the original sprint numbering/dates, keep the academic record and label this as a recovery/re-baselined execution sprint rather than rewriting past dates.

## 12. End-to-end verification — plain definition

For this project, a real end-to-end test means:
1. Open the actual Flutter app on an emulator or physical device.
2. Sign in with a test account stored in the test PostgreSQL database.
3. Submit a clearance request from the app.
4. Confirm the backend validates the JWT and saves the request/related records in PostgreSQL.
5. Reload/reopen the app and fetch the same request from the API.
6. Confirm the saved request/status appears in the app without relying on local mock data.

A merged PR, passing unit test, or passing CI integration test alone does not prove this complete app-to-database-to-app path. Record Employee and Student E2E results separately.

**End of 22 November 2026 schedule amendment.**
