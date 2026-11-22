# Sprint 2 — Student Lifecycle & Employee Workflow

**Priority:** P1 — High  
**Dates:** 13–19 November 2026  
**Module:** Leave blank (cross-module goal)

## Sprint Goal

Expand the Student clearance lifecycle and implement the initial Employee clearance workflow.

## Expected Deliverables

- Student clearance lifecycle improvements
- Department workflow implementation
- Employee applicability questionnaire UI
- Employee Option A workflow
- Required backend API and database updates
- Student and Employee frontend/backend integration

## Definition of Done

Student lifecycle features and the initial Employee workflow are integrated and pass basic functional testing.

---

## Recommended task breakdown

### 1. Student lifecycle improvements
- Test Student login, profile, dashboard, request submission, request details, and history against the real backend.
- Verify one-active-request enforcement and duplicate-submit behavior.
- Verify ownership isolation: one Student cannot access another Student's profile or requests.
- Verify initial department statuses are persisted and displayed correctly.
- Define and implement only the next approved lifecycle transitions.
- Keep Laboratory applicability configurable/undetermined until an approved rule is supplied.

### 2. Department workflow implementation
- Agree which authorized role can update Student department statuses before creating write APIs.
- Implement allowed department status transitions with backend authorization and audit history.
- Reject invalid transitions, duplicate actions, and unauthorized users.
- Preserve independent department progress; do not add sequential unlocking without explicit approval.
- Add service, route, and PostgreSQL integration tests.

### 3. Employee applicability questionnaire UI
- Add the questionnaire to the existing Employee Flutter flow without unnecessary redesign.
- Confirm the exact questions, answer choices, required/optional fields, and validation.
- Map each answer to the departments it makes applicable, conditional, or not applicable only after policy approval.
- Persist answers through the backend where they affect workflow decisions.
- Test the questionnaire on the Employee app and ensure values survive navigation/reload as required.

### 4. Employee Option A workflow
- Obtain the precise Option A definition from the project owner/supervisor.
- Document its input, decision conditions, output, and exceptions before coding.
- Implement the approved path using the questionnaire answers.
- Persist the decision and per-request workflow snapshot.
- Do not assume all 14 paper-form departments apply to every employee.
- Do not invent Option A behavior if the agreed rule is unavailable.

### 5. Cross-module integration and testing
- Verify Student and Employee role separation.
- Test invalid/expired JWT, wrong role, missing profile, duplicate active request, invalid questionnaire answers, and unauthorized department updates.
- Backend: run lint, typecheck, build, unit tests, PostgreSQL integration tests, and demo tests.
- Flutter: run analyze, tests, and build.
- Record whether each test ran in CI, isolated test PostgreSQL, local demo PostgreSQL, emulator, or physical device.

## Acceptance checklist

- [ ] Student request lifecycle can be exercised through the real Flutter app and backend.
- [ ] Student request, department records, and history are persisted and retrieved from PostgreSQL.
- [ ] Student ownership and one-active-request constraints are verified.
- [ ] Authorized department workflow actor/permissions are documented.
- [ ] Department status transitions are validated and audit-recorded.
- [ ] Employee applicability questionnaire is implemented in Flutter.
- [ ] Questionnaire answers are validated and persisted where required.
- [ ] Employee Option A is implemented from an explicitly approved rule definition.
- [ ] Student and Employee flows are integrated without role leakage or regressions.
- [ ] Backend and Flutter test commands pass with actual results recorded.
- [ ] Basic end-to-end functional testing is demonstrated.

## Carry-over / status note (22 November 2026)

Sprint dates have elapsed. GitHub shows Student backend schema/APIs merged in backend PR #23 and Student Flutter integration code in mobile PR #11. However, the Student mobile PR explicitly says live API tests were not run. Employee questionnaire/Option A implementation is not evidenced in the reviewed PRs. Therefore, do not mark the full Sprint 2 Definition of Done complete until the missing acceptance items are tested and closed.

## Blockers requiring a decision

1. Exact Employee Option A definition and decision rules.
2. Exact Employee applicability questionnaire questions and department mapping.
3. Authorized actor/role for Student department status updates.
4. Allowed Student request completion/cancellation transitions.
5. Confirmation that local demo PostgreSQL has been upgraded safely through Student migrations.

