# Issue #26 configuration and unresolved Section 16 decisions

The full [contract plan](issue-26-api-contract-plan.md) remains the planning/source record. See [acceptance](issue-26-acceptance.md) and [Student](student-flutter-handoff.md)/[Employee-HR](employee-flutter-handoff.md) handoffs for delivered behavior. No institutional rules, thresholds, Laboratory eligibility, questionnaire wording, HR scope or final approval rules are inferred.

## Server-only activation

`CLEARANCE_CONFIG_PATH` optionally names an absolute trusted JSON file. The app validates it once at construction. Invalid JSON, unknown fields, malformed values, duplicate mappings/fixtures or incomplete recommendation policy abort startup with a curated error. Do not expose configuration to clients. Approved restart/reload applies changed configuration; saved snapshots remain historical.

Unset path or `{}` is valid and fail-closed: Student evidence remains incomplete and Laboratory undetermined; Employee submission needs explicit v1 activation; HR has no scope; recommendations are unavailable; completion and obligation rechecks are disabled.

| Key | Contract / default |
|---|---|
| `questionnaireVersion` | Optional literal `v1`; explicitly activates the retained fourteen-required-answer contract after review |
| `hrScopes` | Actual HR UUID → nonempty unique category UUIDs; default `{}`. SQL also enforces FC and self-case exclusion |
| `departmentCatalog` | Category UUID → 1–14 unique actual department UUIDs; default `{}`. Permissions, never assignment |
| `catalogVersion` | Explicit version identifier; required at HR confirmation |
| `allowIndependentVerification` | Boolean false by default; confirmation requires true for explicitly selected ordering/execution policy |
| `recommendationPolicies` | Default `[]`; one category/version policy, exact 42 unique key/literal combinations (14 × 3), each mapping to 0–14 permitted IDs with configured safe reasons |
| `studentFixtures` | Default `[]`; unique `{profileId,departmentCode,evidence}`; provider clones input/output |
| `studentApplicability` | Default `[]`; unique `{sapId,determinations}` containing exactly five distinct `{departmentCode,applicability,source}`. Absent exact SAP match uses existing four-required/unknown-Laboratory baseline |
| `studentVisibleReasons` | Pinned Student rule version → optional `{failed,incomplete}` approved text; default `{}` |
| `employeeVisibleReasons` | Pinned Employee rule UUID → optional `{failed,incomplete}` approved text; default `{}` |
| `studentCompletionPolicy` | Optional literal `DEPARTMENTS_ONLY`; five resolved valid rows, all required CLEARED and exemptions NOT_REQUIRED |
| `employeeFinalPolicy` | Optional literal `DEPARTMENTS_ONLY`; nonempty all-selected-CLEARED completion. Otherwise all-clear stays IN_PROGRESS |
| `allowOutstandingRecheck` | Boolean false by default; internal corrected-data obligation rechecks also require explicit mode; cleared/terminal records never reopen |

Versions/sources use 1–100 letters/digits/`.`/`_`/`-`; config UUIDs are lowercase. Evidence is `{rule:{metricKey,operator,expectedValue},metrics,ruleVersion,datasetVersion,datasetUpdatedAt}`. Values are finite numbers, nonblank strings or booleans. Supported operators: EQ/NEQ/GT/GTE/LT/LTE; ordered comparisons require numbers. No coercion or empty/missing-data success. Dataset timestamp is ISO with timezone. Missing/invalid/incompatible rules, metrics or provenance persist incomplete results, never clearance/exemption/financial holds.

Student uses immutable versioned file fixtures and explicit applicability records, not an invented eligibility algorithm or Employee dummy FK. Employee catalog/templates/rules/metrics use existing PostgreSQL tables; HR binds one active category template and only selected mappings. Future tooling must version used rules/templates rather than rewrite them.

Visible wording is separately configured, trimmed, technically limited to 500 characters and rejects markup/control characters. Keep it approved and curated. Student stores it separately from private historical remarks; new Employee notes never use raw rule failMessage. Missing wording is null. Legacy Employee stage information remains historical. The technical response limit does not establish an institutional visibility rule.

## Provenance and internal retry/recheck foundation

Submission/confirmation evaluate bounded synchronous local data inside the mutation/audit transaction. No external calls, fire-and-forget promises, GET evaluation or asynchronous jobs are registered. Audit/infrastructure failure rolls back all mutations; genuine holds/incomplete evidence are persisted.

Student and Employee stage verification snapshots retain latest outcome plus bounded append-only `attempts`. Each attempt keeps exact pinned rule, dataset identity/version/time, check time, primitive checked value, outcome/reason and canonical SHA-256 fingerprint. Employee rule/data content hashes identify exact versions; catalog/template version provenance is retained. Audits record curated IDs/versions/statuses/fingerprints, never raw questionnaire/profile/remarks/metric bodies. Existing single Student snapshots become the first history entry on retry without changing that evidence.

Internal exports: `retryStudentVerification(database,requestId,provider,options)` and `retryEmployeeVerification(database,caseId,options)`. Both lock the parent. Default `RETRY_INCOMPLETE` skips identical evidence fingerprints, creating no new attempts/audits even concurrently. Changed evidence can add attempts up to a technical maximum of three per department, including initial evaluation. `RECHECK_OUTSTANDING` also requires `allowOutstandingRecheck:true`. Rules stay pinned across corrected datasets; cleared/terminal results, pre-HR cases and legacy Employee cases are not reopened/evaluated.

No schedule, runner CLI, public recheck or durable outbox is promised. Operational triggers, exhaustion/reset/escalation and approved corrected-data events remain decisions. Async execution would require durable transactional jobs/claims/deduplication; it is not this synchronous implementation.

## Migrations, compatibility and isolated checks

Preserve migrations `0000`–`0004`. Append `0005_verification_attempts_and_safe_reasons` (Employee attempt snapshot and separate Student-visible remarks) and `0006_questionnaire_shape_and_legacy_cancellation` (v1 JSON shape and nullable template for legacy cancelled cases). SQL/snapshot/journal ancestry and reviewed demo hashes stay aligned. `0003` enum-dependent lifecycle checks compare text; new enum values are consumed only after migrator commit. No startup migration, schema push or reset.

Legacy answers/advice/HR metadata stay null; actual stages/approvals remain. Pending cases have null template and zero children; new processing requires genuine HR/template. Active-slot indexes and closure/cancellation/FK constraints are preserved. JSONB is justified by fixed immutable questionnaire/advice and at most three attempt records, complemented by runtime and DB shape/object checks. Normalized reporting/storage remains a decision.

For this task use only PostgreSQL 18 `e_clearance_test` at `127.0.0.1:55478`. Provide process-local `TEST_DATABASE_URL`, matching `DATABASE_URL` for mounted app tests, and test-only `JWT_SECRET`. Guards verify URL/database/version; the execution wrapper verifies exact container/port before writes. Real fixture logins use Argon2/shared JWT; no credentials appear in docs.

Run typecheck, lint, unit tests, guarded `db:migrate:test`, integration tests, build and repository `git diff --check`. Integration selects every `*.integration.test.ts` plus connection check. Fresh/prefix rehearsals use the installed migrator/ledger in unique temporary schemas inside the same isolated database, verify every prefix and reruns, then remove only their own schema/temp directory. Fixtures use rollback or exact owned UUID cleanup. Demo guards are tested with mocks; no demo database is touched.

## Section 16 decisions still open

| Decision | Confirmation / interim constraint |
|---|---|
| Original Teacher Form/Figma | Original assets absent; exact wording/extra fields remain unverified |
| Questionnaire version/rollout | Confirm fourteen required answers and old-client transition; activation is explicit, omitted answers fail 422, historical nulls retained |
| Recommendation policy | Supply complete answer meaning/profile-input/mapping/reason/version policy; default unavailable |
| Catalog/template coverage | Supply real fourteen-area IDs/codes/category permissions/selected mappings and optional/order semantics; fictional fixtures are test-only |
| HR policy | Confirm FC/category/case scope, provisioning, self-selection/empty-set interim restrictions and return/delegation/reassignment; no default scope |
| Student applicability/rules | Supply approved department metrics/thresholds and Laboratory eligibility; missing evidence never clearance/exemption |
| Dummy execution/storage | File Student fixtures and synchronous execution implemented; approve deployment provider/data and operational retry schedule |
| Visibility/audit | Approve curated wording/technical 500-character boundary and retention; Student audit uses null Employee requestId and curated Student entity IDs, no added Student audit FK |
| Completion/rechecks | Confirm extra Student conditions, Employee downstream authority/final policy, correction triggers, cleared reopening and attempts exhaustion; gates default closed |
| Persistence | Review JSONB retention/reporting and immutable versions/nullable legacy constraints |
| Broader Option A | Earlier wording remains undefined; submit → HR explicit selection → automatic checks is implemented direction |
| Contract/release acceptance | Lead/mobile review, deployment, enum/DTO coordination and real Student/Employee device acceptance remain external |

Automatic Student checks, HR-only Employee applicable selection, automatic selected checks and no human/client department-result writes are implemented. No removed Student PATCH exists. These institutional decisions block real activation; they are not permission to fabricate policy.
