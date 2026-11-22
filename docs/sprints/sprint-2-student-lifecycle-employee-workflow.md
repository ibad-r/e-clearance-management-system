# Sprint 2 — Student & Employee Workflow Recovery Sprint

**Priority:** P1 — High  
**Execution dates:** 23–28 November 2026 (proposed recovery schedule)  
**Module:** Leave blank (cross-module goal)

> This is a recovery/re-baselined execution sprint combining the unfinished Sprint 2 work with the core workflow and verification scope originally planned for Sprint 3. The original Sprint 2 dates (13–19 November) and Sprint 3 dates (20–26 November) are preserved in the master context as historical plan dates; they are not being represented as completed.

## Sprint Goal

Complete and verify the core Student and Employee clearance workflows, including applicability handling, department processing, status tracking, and real frontend/backend/database integration.

## Combined Expected Deliverables

- Student lifecycle verification and improvements
- Student department clearance workflow and authorized status transitions
- Employee applicability questionnaire UI and backend persistence
- Employee Option A workflow, only after its exact agreed meaning/rules are supplied
- Dynamic Employee applicability handling
- Initial HR verification workflow placeholder
- Department clearance state machine and progress/status APIs
- Required backend API and database updates
- Student and Employee frontend/backend integration
- Basic functional, authorization, and regression testing

## Definition of Done

The core Student and Employee workflow transitions function correctly, their progress is persisted and trackable through the application, and the agreed main paths pass basic end-to-end testing using the real backend and PostgreSQL.

## Six-day execution plan

### Day 1 — Monday 23 November: scope lock + integration baseline
- Confirm which Sprint 2 items are already implemented versus only merged as code.
- Run backend and Flutter checks; record current failures.
- Run Student and Employee login/profile/request flows against the running API.
- Verify local demo DB migration state safely; do not reset an existing database.
- Confirm Option A definition, questionnaire rules, and department actor permissions. If unavailable, raise a blocker and do not invent logic.

### Day 2 — Tuesday 24 November: Student lifecycle + department transitions
- Complete Student submit/list/detail/dashboard real API flow.
- Implement only approved department status transitions.
- Add backend authorization, valid transition checks, audit record, and tests.
- Verify Laboratory remains conditional/undetermined until a rule is confirmed.

### Day 3 — Wednesday 25 November: Employee applicability
- Implement the approved questionnaire UI in the existing Employee app.
- Add validated backend payload/schema persistence.
- Map answers to applicable departments only from confirmed policy/rules.
- Store a per-request applicability/workflow snapshot.

### Day 4 — Thursday 26 November: Employee Option A + HR placeholder
- Implement Option A only if its definition has been confirmed.
- Add the initial HR verification placeholder and permission checks.
- Add status/progress API updates for the implemented workflow.
- If Option A remains undefined, use this day for E2E fixes and other agreed core workflow work; do not fabricate a workflow.

### Day 5 — Friday 27 November: cross-module integration
- Test Student/Employee role separation and request ownership.
- Test unauthorized roles, invalid/expired JWT, duplicate active requests, invalid questionnaire payloads, and invalid state transitions.
- Connect all implemented Flutter screens to live APIs; remove mock behavior from acceptance paths.

### Day 6 — Saturday 28 November: acceptance and sprint review
- Run backend lint/typecheck/build/unit/integration/demo checks.
- Run Flutter analyze/test/build.
- Perform Student and Employee app → API → PostgreSQL → app read-back tests.
- Fix critical/high-priority blockers; document remaining low-priority work.
- Record actual evidence, fictional demo accounts, and Sprint Review outcome.

## Must-have acceptance checklist

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

## Scope control

Do not attempt to finish the entire Admin portal, AI feature, e-stamp/QR certificate, push notifications, or live university integrations in this six-day window. Those are separate scope items. The recovery sprint succeeds by delivering reliable Student and Employee workflow slices, not by accumulating unfinished screens.

## Carry-over / known blockers

1. Exact Employee Option A definition and decision rules.
2. Exact Employee applicability questionnaire questions and department mapping.
3. Authorized actor/role for Student department status updates.
4. Allowed Student request completion/cancellation transitions.
5. Confirmation that local demo PostgreSQL has been upgraded safely through Student migrations.
6. Student Flutter PR #11 says live API tests were not run; rerun real integration checks.

## Sprint history context

- **Sprint 0:** Employee technical foundation — Drizzle/PostgreSQL, Employee auth/JWT, Employee request APIs, Employee Flutter MVP and integration.
- **Sprint 1:** Student foundation — Student role/auth, API contract, schema/APIs, Flutter UI and initial API integration.
- **Recovery Sprint 2:** combines unfinished original Sprint 2 with core original Sprint 3 scope.
- Original Sprint 4 (Admin Module & System Integration) and Sprint 5 (Stabilization, Testing & Final Demo) should be re-dated after the 28 November review, based on remaining FYP deadline.

