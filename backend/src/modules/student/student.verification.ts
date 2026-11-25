import { eq } from "drizzle-orm";
import { z } from "zod";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { evaluateRule } from "../verification/rule-evaluator";
import type { DepartmentCode } from "./student.types";
import { StudentApiError } from "./student.errors";

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

const retainedRuleSchema = z.object({
  metricKey: z.string().min(1),
  operator: z.enum(schema.ruleOperatorEnum.enumValues),
  expectedValue: z.union([
    z.number(),
    z.string(),
    z.boolean(),
  ]),
});

export async function verifyStudentRequest(
  tx: Executor,
  request: RequestRow,
  provider: StudentEvidenceProvider,
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

  for (const row of rows) {
    if (row.applicability !== "REQUIRED"
      || row.status !== "PENDING") {
      continue;
    }

    const evidence = provider(
      request.studentProfileId,
      row.departmentCode,
    );

    const valid = evidence !== undefined
      && validVersion(evidence.ruleVersion)
      && validVersion(evidence.datasetVersion)
      && typeof evidence.datasetUpdatedAt === "string"
      && Number.isFinite(Date.parse(evidence.datasetUpdatedAt));

    const result = valid
      ? evaluateRule(evidence.rule, evidence.metrics)
      : null;

    const status: DepartmentRow["status"] =
      result?.outcome === "PASS" ? "CLEARED"
        : result?.outcome === "FAIL" ? "ACTION_REQUIRED"
          : "PENDING";

    const reason = !evidence ? "RULE_UNAVAILABLE"
      : !valid ? "PROVENANCE_MISSING"
        : result?.outcome === "INCOMPLETE"
          ? result.reason : null;

    const retainedRule = retainedRuleSchema.safeParse(
      valid ? evidence.rule : undefined,
    );

    const verificationSnapshot = {
      source: "AUTOMATED_VERIFICATION",
      checkedAt: now.toISOString(),
      outcome: result?.outcome ?? "INCOMPLETE",
      reason,
      ruleVersion: valid ? evidence.ruleVersion : null,
      datasetVersion: valid ? evidence.datasetVersion : null,
      datasetUpdatedAt: valid ? evidence.datasetUpdatedAt : null,
      rule: retainedRule.success ? retainedRule.data : null,
      checkedValue: result && result.outcome !== "INCOMPLETE"
        ? result.checkedValue : null,
    };

    const [saved] = await tx.update(
      schema.studentRequestDepartments,
    ).set({
      status,
      updatedAt: now,
      verificationSnapshot,
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
        ruleVersion: valid ? evidence.ruleVersion : null,
        datasetVersion: valid ? evidence.datasetVersion : null,
        datasetUpdatedAt: valid
          ? evidence.datasetUpdatedAt : null,
        reason,
      },
    });
  }

  // Final completion remains subject to approved policy.
  const [saved] = await tx.update(schema.studentRequests)
    .set({ updatedAt: now })
    .where(eq(schema.studentRequests.id, request.id))
    .returning();

  if (!saved) {
    throw new Error("Student request update failed");
  }

  return saved;
}
