const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const file = path.resolve(__dirname, "../../docs/references/openapi_employee_v1.yaml");
const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
const rawSetIn = doc.setIn.bind(doc);
doc.setIn = (keys, value) => rawSetIn(keys, doc.createNode(value));
const original = doc.toJS();
const ref = (name) => ({ $ref: "#/components/schemas/" + name });
const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const uuid = { type: "string", format: "uuid" };
const text = { type: "string" };
const timestamp = { type: "string", format: "date-time" };
const revision = { type: "integer", minimum: 0, maximum: 2147483647 };
const statuses = ["PENDING_SUBMISSION", "PENDING_HR_VERIFICATION", "IN_PROGRESS", "ACTION_REQUIRED", "AWAITING_APPROVAL", "RETURNED_FOR_CORRECTION", "COMPLETED", "CANCELLED"];
const implemented = new Set([
  "POST /auth/login", "GET /auth/me", "GET /student/profile", "GET /student/dashboard", "POST /student/requests", "GET /student/requests", "GET /student/requests/{requestId}",
  "GET /employee/profile", "POST /employee/cases", "GET /employee/cases", "GET /employee/cases/{caseId}", "GET /hr/cases", "GET /hr/cases/{caseId}", "POST /hr/cases/{caseId}/confirm-departments",
]);
for (const [route, item] of Object.entries(original.paths)) {
  for (const method of ["get", "post", "patch", "put", "delete"]) {
    if (!item[method]) continue;
    const live = implemented.has(method.toUpperCase() + " " + route);
    doc.setIn(["paths", route, method, "x-implementation-status"], live ? "implemented" : "legacy-planned-unimplemented");
    doc.setIn(["paths", route, method, "x-production-mounted"], live);
    if (!live) doc.setIn(["paths", route, method, "description"], "Unimplemented legacy design. " + (item[method].description ?? "").replace(/^Unimplemented legacy design\. /, ""));
  }
}
doc.setIn(["info", "title"], "E-Clearance API - Student automation and Employee HR selection");
doc.setIn(["info", "version"], "1.4.0");
doc.setIn(["info", "description"], "Implemented shared email/SAP/combined-identifier JWT authentication, five Student APIs, four Employee APIs and three scoped HR APIs. Automated verification uses explicit server configuration and synthetic evidence; missing policy or evidence never implies clearance. Section 16 institutional decisions remain unresolved. Legacy designs are individually marked unimplemented. No Student department PATCH exists.");
doc.setIn(["info", "x-issue-26-implementation"], "../implementation/issue-26-acceptance.md");
doc.setIn(["info", "x-employee-flutter-handoff"], "../implementation/employee-flutter-handoff.md");
doc.setIn(["paths", "/auth/login", "post", "description"], "Exactly one strict body alternative: {email,password}, {sapId,password}, or {identifier,password}. Email lookup lowercases; SAP is opaque and case-sensitive; sapId/identifier are trimmed. Combined identifiers must resolve uniquely. Password is not trimmed. Active shared accounts only; no signup or second HR auth stack.");
doc.setIn(["components", "schemas", "LoginRequest"], { oneOf: ["email", "sapId", "identifier"].map((key) => object({ [key]: { type: "string", ...(key === "email" ? { format: "email" } : { minLength: 1 }) }, password: { type: "string", minLength: 1 } })) });
// Keep existing anchors that older planned schemas reference.
doc.setIn(["components", "schemas", "CurrentUser", "description"], "Verified active shared account. Role comes from the signed token and database agreement.");
doc.setIn(["components", "schemas", "CurrentUser", "properties", "role", "enum"], ["EMPLOYEE", "HR_OFFICER", "APPROVER", "SYSTEM_ADMIN", "STUDENT"]);
doc.setIn(["paths", "/employee/cases", "get", "parameters", 0, "schema", "enum"], statuses);
doc.getIn(["paths", "/employee/cases", "get", "parameters", 0, "schema", "enum"]).anchor = "id001";
doc.setIn(["components", "schemas", "CaseDetail", "properties", "status", "enum"], statuses);
doc.setIn(["components", "schemas", "EmployeeRequestStatus"], { type: "string", enum: statuses });
const keys = ["hdsDepartment", "financeDepartment", "feesAndDuesDepartment", "computerServicesDepartment", "operationsDepartment", "cmsRepresentative", "oric", "storeSection", "wardenHostel", "labInchargeOffice", "informationServicesDepartment", "wardInchargeNursingDivision", "pharmacy", "headOfDepartment"];
doc.setIn(["components", "schemas", "QuestionnaireAnswers"], { ...object(Object.fromEntries(keys.map((key) => [key, { type: "string", enum: ["YES", "NO", "NOT_SURE"] }]))), description: "Fourteen explicit answers for the configured v1 contract. Keys are not institutional department codes or verified question wording; never default omitted answers. Server activation requires approved configuration." });
const recommendation = object({ status: { type: "string", enum: ["AVAILABLE", "UNAVAILABLE"] }, ruleVersion: { type: "string", nullable: true }, departments: { type: "array", maxItems: 14,
  items: object({ departmentId: uuid, departmentCode: text, departmentName: text, reason: text }) } });
recommendation.description = "Immutable advice, never assignment. UNAVAILABLE has null ruleVersion and empty departments; AVAILABLE has the configured rule version and safe reasons. Legacy cases have null recommendation.";
doc.setIn(["components", "schemas", "DepartmentRecommendation"], recommendation);
const hrSelection = { ...object({ verifiedAt: timestamp, selectionRevision: { type: "integer", minimum: 1 } }), nullable: true };
const added = {
  questionnaireVersion: { type: "string", enum: ["v1", null], nullable: true },
  questionnaireAnswers: { ...doc.toJS().components.schemas.QuestionnaireAnswers, nullable: true },
  departmentRecommendation: { ...recommendation, nullable: true },
  hrSelection,
  confirmedDepartmentIds: { type: "array", items: uuid, uniqueItems: true, description: "Only selected persisted stages accompanied by genuine HR confirmation. Empty before HR and for legacy cases, irrespective of historical stages." },
};
for (const [key, schema] of Object.entries(added)) doc.setIn(["components", "schemas", "CaseDetail", "properties", key], schema);
doc.setIn(["components", "schemas", "CaseDetail", "required"], [...new Set([...original.components.schemas.CaseDetail.required, ...Object.keys(added)])]);
doc.setIn(["components", "schemas", "CaseDetail", "description"], "Owned full Employee case. Pending questionnaire cases have zero stages and approvals. Confirmed cases contain only selected stages; legacy cases preserve historical children and null questionnaire/HR fields. Employee DTO never includes selecting HR identity or verification evidence.");
doc.setIn(["components", "schemas", "CreateEmployeeCaseRequest", "properties", "questionnaireAnswers"], ref("QuestionnaireAnswers"));
doc.setIn(["components", "schemas", "CreateEmployeeCaseRequest", "required"], ["lastWorkingDate", "reasonForLeaving", "questionnaireAnswers"]);
doc.setIn(["components", "schemas", "CreateEmployeeCaseRequest", "description"], "Strict Employee submission. Server assigns v1 and saves immutable answers/advice; no client identity, results, template or HR metadata. Old payloads without answers return 422; unconfigured questionnaire version returns 503. No institutional date cutoff is assumed.");
const studentDescriptions = {
  "POST /student/requests": "Preserves strict five-field body, verified ownership, academic snapshots and active/reference safeguards. Creates exactly five rows and synchronously persists independently computed configured results, safe reasons, pinned attempt provenance and audits. Missing rules/evidence stay pending; Laboratory stays undetermined until explicit approved applicability configuration. Completion requires the configured DEPARTMENTS_ONLY policy and five resolved valid rows; closedAt and audit are atomic.",
  "GET /student/dashboard": "Reads saved own results, safe configured remarks and progress; never evaluates or retries. Private historical remarks and evidence remain hidden. Immediate completion removes activeRequest; use the POST UUID or history.latestClosedRequest for detail.",
  "GET /student/requests/{requestId}": "Reads the saved owned current or historical snapshot and five independently projected rows. Foreign and missing IDs return identical 404. Safe remarks match dashboard; GET never verifies.",
};
for (const [key, description] of Object.entries(studentDescriptions)) {
  const [method, route] = key.split(" "); doc.setIn(["paths", route, method.toLowerCase(), "description"], description);
}
doc.setIn(["components", "schemas", "StudentDepartment", "properties", "remarks", "description"], "Nullable approved configured plain text (up to 500 characters) from separate student-visible storage. Never historical private remarks or raw evidence. Null when wording is not configured or for cleared rows.");
doc.setIn(["components", "schemas", "StudentDepartment", "properties", "remarks", "maxLength"], 500);
doc.setIn(["components", "schemas", "Stage", "properties", "outstandingNote", "description"], "For new automated cases, safe configured plain text only: obligation or incomplete evidence. Null without approved wording. Preserve existing historical stage data.");
doc.setIn(["paths", "/employee/cases", "post", "description"], "Verified active linked FC Employee with active category submits fourteen explicit configured answers. Atomically saves PENDING_HR_VERIFICATION, submittedAt, immutable questionnaire/recommendation and audit; templateId is null and no stages/approvals/checks exist before HR. No template is required at submission. Recommendations remain unavailable without explicit rules. Only COMPLETED/CANCELLED release the active slot.");
doc.setIn(["paths", "/employee/cases", "post", "responses", "201", "description"], "Persisted pending HR case, zero stages/approvals, answers and advice");
doc.setIn(["paths", "/employee/cases", "get", "description"], "Strict optional status filter, including PENDING_HR_VERIFICATION. Owned full cases ordered newest initiatedAt then UUID. Returns saved answers, advice, public HR time/revision and selected results; legacy nulls and historical children are preserved. Never verifies.");
doc.setIn(["paths", "/employee/cases/{caseId}", "get", "description"], "Owned full persisted case; foreign/missing IDs both 404. Includes immutable questionnaire/advice, public confirmation and selected results, with null legacy fields. Existing detail query behavior is retained; no GET-triggered check or new refresh endpoint.");
const staff = structuredClone(doc.toJS().components.schemas.CaseDetail);
staff.properties.hrSelection = { ...object({ ...hrSelection.properties, hrVerifiedById: uuid }), nullable: true };
staff.description = "Staff case projection. Only authenticated scoped HR receives actual selecting HR user ID.";
doc.setIn(["components", "schemas", "HrEmployeeCase"], staff);
doc.setIn(["components", "schemas", "HrCase"], object({ employee: ref("EmployeeProfile"), case: ref("HrEmployeeCase"), selectionRevision: revision }));
doc.setIn(["components", "schemas", "ConfirmDepartmentsRequest"], object({ departmentIds: { type: "array", items: uuid, minItems: 1, maxItems: 14, uniqueItems: true, description: "Case-insensitive UUID uniqueness; explicit selected set. Empty sets rejected. Server configuration controls valid catalog and category coverage." }, expectedSelectionRevision: revision }));
const error = (description) => ({ description, content: { "application/json": { schema: ref("Error") } } });
const errors = {
  "401": error("UNAUTHORIZED: missing/invalid/expired token, inactive account, or signed/database role disagreement"),
  "403": error("FORBIDDEN: only HR_OFFICER with explicitly configured category scope; Admin/Approver do not inherit access"),
  "404": error("NOT_FOUND: missing, non-FC, out-of-scope or self-linked case; no existence disclosure"),
  "422": error("VALIDATION_ERROR: invalid UUID, status, body, query, duplicate/empty/oversized selection or disallowed catalog IDs"),
  "500": error("INTERNAL_SERVER_ERROR: safe unexpected failure; mutations and audits roll back together"),
};
function hrOperation(summary, description, list = false, confirmation = false) {
  return { tags: ["HR"], summary, description, "x-implementation-status": "implemented", "x-production-mounted": true, "x-required-roles": ["HR_OFFICER"],
    ...(list ? { parameters: [{ name: "status", in: "query", schema: ref("EmployeeRequestStatus") }] } : { parameters: [{ $ref: "#/components/parameters/caseId" }] }),
    ...(confirmation ? { requestBody: { required: true, content: { "application/json": { schema: ref("ConfirmDepartmentsRequest") } } } } : {}),
    responses: { "200": { description: "Saved scoped case projection; data envelope", content: { "application/json": { schema: object({ data: list ? { type: "array", items: ref("HrCase") } : ref("HrCase") }) } } }, ...errors,
      ...(confirmation ? { "400": error("VALIDATION_ERROR: malformed JSON"), "409": error("STALE_HR_SELECTION or INVALID_STATUS_TRANSITION: reload; no reassignment endpoint"), "503": error("WORKFLOW_CONFIGURATION_INVALID: missing catalog, ordering approval, selected active template/rule/category mappings; retain pending HR with no partial children") } : {}) },
  };
}
doc.setIn(["paths", "/hr/cases", "get"], { ...hrOperation("List scoped Employee clearance cases", "Strict optional status only; queue uses PENDING_HR_VERIFICATION. Unpaginated data array. FC/category scope and self-case exclusions constrain database reads. Includes form, all answers, saved advice and selected results. Empty array is valid; GET never checks.", true), operationId: "get_hr_cases" });
doc.setIn(["paths", "/hr/cases/{caseId}", "get"], { ...hrOperation("Read scoped Employee case for HR review", "UUID locator with empty query. Same scoped projection as list, including selecting HR identity when present. Missing/out-of-scope/self-linked cases return 404. Never reads Student data or evaluates rules."), operationId: "get_hr_case" });
doc.setIn(["paths", "/hr/cases/{caseId}/confirm-departments"], { post: { ...hrOperation("Confirm applicable Employee departments", "Strict UUID set plus expected revision; empty query. Lock parent/profile, validate scope/category/questionnaire/catalog and selected active mappings, persist HR actor/time/revision and only selected rule snapshots, then synchronously verify and aggregate with transactional audits. HR may deviate from advice and cannot supply results. Same set (order independent) plus original revision safely returns current saved result without checks/rows/audits, including after completion. Other sets/stale revisions conflict. Missing evidence stays CHECKING; failures OUTSTANDING/ACTION_REQUIRED. All-clear completion requires explicit DEPARTMENTS_ONLY policy; otherwise stays IN_PROGRESS. Internal retry/recheck foundations add no public APIs.", false, true), operationId: "post_hr_confirm_departments" } });
fs.writeFileSync(file, doc.toString({ lineWidth: 120 }));
console.log("Updated canonical OpenAPI for six extended and three new APIs.");
