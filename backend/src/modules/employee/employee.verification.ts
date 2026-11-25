import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "../../db/schema";
import { EmployeeApiError } from "./employee.errors";
import { evaluateRule } from "../verification/rule-evaluator";
import { employeeAggregate, evidenceFingerprint, MAX_VERIFICATION_ATTEMPTS,
  previousAttempts, visibleText, type VerificationMode, type VisibleReasons } from "../verification/verification.policy";

type Executor = Pick<NodePgDatabase<typeof s>, "select" | "insert" | "update">;
type RequestRow = typeof s.clearanceRequests.$inferSelect;
export interface EmployeeVerificationOptions {
  finalPolicy?: "DEPARTMENTS_ONLY";
  visibleReasons?: VisibleReasons;
  allowOutstandingRecheck?: boolean;
  mode?: VerificationMode;
}
export async function verifyEmployeeCase(tx: Executor, request: RequestRow, options: EmployeeVerificationOptions = {}) {
  if (!request.hrVerifiedAt || !request.questionnaireSnapshot || !request.templateId
    || !["IN_PROGRESS", "ACTION_REQUIRED"].includes(request.status)) return request;
  const stages = await tx.select().from(s.requestStages).where(eq(s.requestStages.requestId, request.id));
  if (stages.length === 0) throw new EmployeeApiError(503, "WORKFLOW_CONFIGURATION_INVALID", "Selected workflow is unavailable");
  const mode = options.mode ?? "INITIAL";
  const [template] = await tx.select({ version: s.workflowTemplates.version }).from(s.workflowTemplates)
    .where(eq(s.workflowTemplates.id, request.templateId)).for("share");
  if (!template) throw new EmployeeApiError(503, "WORKFLOW_CONFIGURATION_INVALID", "Selected workflow is unavailable");
  const now = new Date(Math.max(Date.now(), request.hrVerifiedAt.getTime()));
  for (const stage of stages) {
    const outstandingRecheck = mode === "RECHECK_OUTSTANDING" && options.allowOutstandingRecheck === true
      && stage.status === "OUTSTANDING";
    if (stage.status !== "CHECKING" && stage.status !== "RECHECKING" && !outstandingRecheck) continue;
    const attempts = previousAttempts(stage.verificationSnapshot);
    if (attempts.length >= MAX_VERIFICATION_ATTEMPTS || (mode === "INITIAL" && attempts.length > 0)) continue;
    const [evidence] = await tx.select().from(s.departmentDemoRecords).where(and(
      eq(s.departmentDemoRecords.employeeId, request.employeeId),
      eq(s.departmentDemoRecords.departmentId, stage.departmentId),
    )).for("share");
    const fingerprint = evidenceFingerprint({ rule: stage.ruleSnapshot, recordId: evidence?.id ?? null,
      datasetUpdatedAt: evidence?.updatedAt.toISOString() ?? null, metrics: evidence?.values ?? null });
    if (attempts.some((attempt) => attempt.fingerprint === fingerprint)) continue;
    const result = evaluateRule(stage.ruleSnapshot, evidence?.values);
    const status = result.outcome === "PASS" ? "CLEARED" : result.outcome === "FAIL" ? "OUTSTANDING" : "CHECKING";
    const ruleId = typeof stage.ruleSnapshot.id === "string" ? stage.ruleSnapshot.id : null;
    const publicReasons = ruleId ? options.visibleReasons?.[ruleId] : undefined;
    const note = visibleText(status === "OUTSTANDING" ? publicReasons?.failed
      : status === "CHECKING" ? publicReasons?.incomplete : null);
    const attempt = {
      source: "AUTOMATED_VERIFICATION", attempt: attempts.length + 1, fingerprint,
      checkedAt: now.toISOString(), outcome: result.outcome,
      reason: result.outcome === "INCOMPLETE" ? result.reason : null,
      rule: stage.ruleSnapshot, ruleId, templateId: request.templateId,
      ruleVersion: evidenceFingerprint(stage.ruleSnapshot), templateVersion: template.version,
      datasetRecordId: evidence?.id ?? null, datasetUpdatedAt: evidence?.updatedAt.toISOString() ?? null,
      datasetVersion: evidence ? evidenceFingerprint(evidence.values) : null,
      checkedValue: result.outcome === "INCOMPLETE" ? null : result.checkedValue,
    };
    const [savedStage] = await tx.update(s.requestStages).set({ status, outstandingNote: note,
      checkedValue: attempt.checkedValue, lastCheckedAt: now, clearedAt: status === "CLEARED" ? now : null,
      verificationSnapshot: { ...attempt, attempts: [...attempts, attempt] },
    }).where(eq(s.requestStages.id, stage.id)).returning();
    if (!savedStage) throw new EmployeeApiError(503, "WORKFLOW_CONFIGURATION_INVALID", "Selected workflow is unavailable");
    await tx.insert(s.auditLogs).values({ actorUserId: null, requestId: request.id,
      action: "EMPLOYEE_DEPARTMENT_VERIFIED", entityType: "request_stage", entityId: stage.id, createdAt: now,
      details: { source: "AUTOMATED_VERIFICATION", departmentId: stage.departmentId,
        previousStatus: stage.status, newStatus: status, ruleId, ruleVersion: attempt.ruleVersion,
        templateId: request.templateId, templateVersion: template.version,
        datasetRecordId: attempt.datasetRecordId, datasetUpdatedAt: attempt.datasetUpdatedAt,
        datasetVersion: attempt.datasetVersion, fingerprint, attempt: attempt.attempt, reason: attempt.reason } });
  }
  const savedStages = await tx.select().from(s.requestStages).where(eq(s.requestStages.requestId, request.id));
  const status = employeeAggregate(savedStages, options.finalPolicy);
  const [saved] = await tx.update(s.clearanceRequests).set({ status, updatedAt: now,
    completedAt: status === "COMPLETED" ? now : null,
  }).where(eq(s.clearanceRequests.id, request.id)).returning();
  if (!saved) throw new Error("Employee aggregate update failed");
  if (saved.status !== request.status) {
    await tx.insert(s.auditLogs).values({ actorUserId: null, requestId: request.id,
      action: "EMPLOYEE_REQUEST_STATUS_CHANGED", entityType: "clearance_request", entityId: request.id,
      createdAt: now, details: { source: "AUTOMATED_VERIFICATION", previousStatus: request.status, newStatus: saved.status,
        completionPolicy: saved.status === "COMPLETED" ? options.finalPolicy : null } });
  }
  return saved;
}

export async function retryEmployeeVerification(database: Pick<NodePgDatabase<typeof s>, "transaction">,
  caseId: string, options: EmployeeVerificationOptions = {}) {
  return database.transaction(async (tx) => {
    const [request] = await tx.select().from(s.clearanceRequests).where(eq(s.clearanceRequests.id, caseId)).for("update");
    if (!request) throw new EmployeeApiError(404, "NOT_FOUND", "Clearance case not found");
    return verifyEmployeeCase(tx, request, { ...options, mode: options.mode ?? "RETRY_INCOMPLETE" });
  });
}
