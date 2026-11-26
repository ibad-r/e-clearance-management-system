import { eq } from "drizzle-orm";
import { z } from "zod";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { evaluateRule } from "../verification/rule-evaluator";
import type { DepartmentCode } from "./student.types";
import { StudentApiError } from "./student.errors";
import { evidenceFingerprint, MAX_VERIFICATION_ATTEMPTS, pinnedRuleSchema, previousAttempts,
  studentCanComplete, visibleText, type VerificationMode, type VisibleReasons } from "../verification/verification.policy";

type Executor = Pick<NodePgDatabase<typeof schema>,
  "select" | "insert" | "update">;

type RequestRow = typeof schema.studentRequests.$inferSelect;
type DepartmentRow = typeof schema.studentRequestDepartments.$inferSelect;

export interface StudentEvidence {
  rule: unknown;
  metrics: unknown;
  ruleVersion: string;
  datasetVersion: string;
  datasetUpdatedAt: string;
}

export type StudentEvidenceProvider = (
  profileId: string,
  departmentCode: DepartmentCode,
) => StudentEvidence | undefined;

export const unavailableStudentEvidence:
  StudentEvidenceProvider = () => undefined;

export function createStudentFixtureProvider(
  fixtures: readonly {
    profileId: string;
    departmentCode: DepartmentCode;
    evidence: StudentEvidence;
  }[],
): StudentEvidenceProvider {
  const records = structuredClone(fixtures);

  return (profileId, departmentCode) => {
    const matches = records.filter(
      (row) => row.profileId === profileId
        && row.departmentCode === departmentCode,
    );
    return matches.length === 1
      ? structuredClone(matches[0]!.evidence)
      : undefined;
  };
}

function validVersion(value: unknown): boolean {
  return typeof value === "string"
    && /^[A-Za-z0-9._-]{1,100}$/.test(value);
}
const provenanceTimestamp = z.iso.datetime({ offset: true });

export interface StudentVerificationOptions {
  allowAutomaticCompletion?: boolean;
  visibleReasons?: VisibleReasons;
  allowOutstandingRecheck?: boolean;
  mode?: VerificationMode;
}

export async function verifyStudentRequest(
  tx: Executor,
  request: RequestRow,
  provider: StudentEvidenceProvider,
  options: StudentVerificationOptions = {},
): Promise<RequestRow> {
  if (request.status !== "IN_PROGRESS") {
    return request;
  }

  const rows = await tx.select()
    .from(schema.studentRequestDepartments)
    .where(eq(
      schema.studentRequestDepartments.requestId,
      request.id,
    ));

  if (rows.length !== 5
    || new Set(rows.map((row) => row.departmentCode)).size !== 5) {
    throw new StudentApiError(
      503,
      "STUDENT_CONFIGURATION_INVALID",
      "Student clearance configuration needs administrator attention",
    );
  }

  const now = new Date(
    Math.max(Date.now(), request.submittedAt.getTime()),
  );

  const mode = options.mode ?? "INITIAL";
  for (const row of rows) {
    if (row.applicability !== "REQUIRED"
      || (row.status !== "PENDING" && !(row.status === "ACTION_REQUIRED"
        && mode === "RECHECK_OUTSTANDING" && options.allowOutstandingRecheck === true))) {
      continue;
    }
    const attempts = previousAttempts(row.verificationSnapshot);
    if ((mode === "INITIAL" && attempts.length > 0) || attempts.length >= MAX_VERIFICATION_ATTEMPTS) continue;

    const evidence = provider(
      request.studentProfileId,
      row.departmentCode,
    );

    const valid = evidence !== undefined
      && validVersion(evidence.ruleVersion)
      && validVersion(evidence.datasetVersion)
      && provenanceTimestamp.safeParse(evidence.datasetUpdatedAt).success;

    // Rechecks use the original rule, never a newly edited policy.
    const priorRule = row.verificationSnapshot?.rule;
    const priorVersion = row.verificationSnapshot?.ruleVersion;
    const rule = priorRule ?? (valid ? evidence.rule : undefined);
    const ruleVersion = typeof priorVersion === "string" ? priorVersion : valid ? evidence.ruleVersion : null;
    const result = valid
      ? evaluateRule(rule, evidence.metrics)
      : null;
    const fingerprint = evidenceFingerprint({ rule: rule ?? null, ruleVersion,
      metrics: evidence?.metrics ?? null, datasetVersion: evidence?.datasetVersion ?? null,
      datasetUpdatedAt: evidence?.datasetUpdatedAt ?? null });
    if (attempts.some((attempt) => attempt.fingerprint === fingerprint)) continue;

    const status: DepartmentRow["status"] =
      result?.outcome === "PASS" ? "CLEARED"
        : result?.outcome === "FAIL" ? "ACTION_REQUIRED"
          : "PENDING";

    const reason = !evidence ? "RULE_UNAVAILABLE"
      : !valid ? "PROVENANCE_MISSING"
        : result?.outcome === "INCOMPLETE"
          ? result.reason : null;

    const retainedRule = pinnedRuleSchema.safeParse(
      rule,
    );

    const verificationSnapshot = {
      source: "AUTOMATED_VERIFICATION",
      checkedAt: now.toISOString(),
      outcome: result?.outcome ?? "INCOMPLETE",
      reason,
      attempt: attempts.length + 1,
      fingerprint,
      ruleVersion,
      datasetVersion: valid ? evidence.datasetVersion : null,
      datasetUpdatedAt: valid ? evidence.datasetUpdatedAt : null,
      rule: retainedRule.success ? retainedRule.data : null,
      checkedValue: result && result.outcome !== "INCOMPLETE"
        ? result.checkedValue : null,
    };
    const publicReasons = ruleVersion ? options.visibleReasons?.[ruleVersion] : undefined;
    const studentVisibleRemarks = visibleText(status === "ACTION_REQUIRED" ? publicReasons?.failed
      : status === "PENDING" ? publicReasons?.incomplete : null);

    const [saved] = await tx.update(
      schema.studentRequestDepartments,
    ).set({
      status,
      updatedAt: now,
      verificationSnapshot: { ...verificationSnapshot, attempts: [...attempts, verificationSnapshot] },
      studentVisibleRemarks,
    }).where(eq(
      schema.studentRequestDepartments.id,
      row.id,
    )).returning();

    if (!saved) {
      throw new Error("Student department update failed");
    }

    await tx.insert(schema.auditLogs).values({
      actorUserId: null,
      requestId: null,
      action: "STUDENT_DEPARTMENT_VERIFIED",
      entityType: "STUDENT_REQUEST_DEPARTMENT",
      entityId: row.id,
      createdAt: now,
      details: {
        studentRequestId: request.id,
        departmentCode: row.departmentCode,
        source: "AUTOMATED_VERIFICATION",
        previousStatus: row.status,
        newStatus: status,
        ruleVersion,
        attempt: verificationSnapshot.attempt,
        fingerprint,
        datasetVersion: valid ? evidence.datasetVersion : null,
        datasetUpdatedAt: valid
          ? evidence.datasetUpdatedAt : null,
        reason,
      },
    });
  }

  const savedRows = await tx.select().from(schema.studentRequestDepartments)
    .where(eq(schema.studentRequestDepartments.requestId, request.id));
  const complete = options.allowAutomaticCompletion === true && studentCanComplete(savedRows);
  const [saved] = await tx.update(schema.studentRequests)
    .set({ updatedAt: now, status: complete ? "COMPLETED" : "IN_PROGRESS", closedAt: complete ? now : null })
    .where(eq(schema.studentRequests.id, request.id))
    .returning();

  if (!saved) {
    throw new Error("Student request update failed");
  }
  if (saved.status !== request.status) {
    await tx.insert(schema.auditLogs).values({ actorUserId: null, requestId: null,
      action: "STUDENT_REQUEST_STATUS_CHANGED", entityType: "STUDENT_REQUEST", entityId: request.id,
      createdAt: now, details: { studentRequestId: request.id, source: "AUTOMATED_VERIFICATION",
        previousStatus: request.status, newStatus: saved.status } });
  }

  return saved;
}

// Internal runner foundation only. No HTTP route or automatic schedule is registered.
export async function retryStudentVerification(
  database: Pick<NodePgDatabase<typeof schema>, "transaction">,
  requestId: string, provider: StudentEvidenceProvider,
  options: StudentVerificationOptions = {},
) {
  return database.transaction(async (tx) => {
    const [request] = await tx.select().from(schema.studentRequests)
      .where(eq(schema.studentRequests.id, requestId)).for("update");
    if (!request) throw new StudentApiError(404, "NOT_FOUND", "Student request not found");
    return verifyStudentRequest(tx, request, provider, { ...options, mode: options.mode ?? "RETRY_INCOMPLETE" });
  });
}
