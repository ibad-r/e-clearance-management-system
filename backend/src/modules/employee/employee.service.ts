import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { parsePrincipal } from "./employee.auth";
import { EmployeeApiError } from "./employee.errors";
import { caseIdSchema, createCaseSchema, listCasesQuerySchema } from "./employee.schemas";
import type {
  EmployeeCase,
  EmployeeCaseService,
  EmployeeProfile,
  VerifiedEmployeeIdentity,
} from "./employee.types";

// Dependency injection keeps the application pool/.env out of tests and modules.
// Drizzle transactions also satisfy this type and nest using savepoints.
export type EmployeeDatabase = Pick<NodePgDatabase<typeof schema>, "select" | "insert" | "transaction">;
type Executor = Pick<EmployeeDatabase, "select" | "insert">;
type CaseRow = typeof schema.clearanceRequests.$inferSelect;

export interface EmployeeServiceOptions {
  generateRequestCode?: () => string;
}

const { users, employees, employeeCategories, workflowTemplates, workflowStageTemplates,
  workflowApprovalTemplates, clearanceDepartments, clearanceRules, authorityPositions,
  clearanceRequests, requestStages, requestApprovals, clearanceIssues, certificates, auditLogs } = schema;

function configurationError(): EmployeeApiError {
  return new EmployeeApiError(503, "WORKFLOW_CONFIGURATION_INVALID", "Clearance workflow configuration needs administrator attention");
}

async function loadProfile(
  database: Executor,
  principal: VerifiedEmployeeIdentity,
  lock = false,
): Promise<EmployeeProfile> {
  const identity = parsePrincipal(principal);
  const userQuery = database.select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users).where(eq(users.id, identity.userId)).limit(1);
  const [user] = lock ? await userQuery.for("share") : await userQuery;
  if (!user) throw new EmployeeApiError(401, "UNAUTHENTICATED", "Authentication required");
  if (!user.isActive || user.role !== "EMPLOYEE") {
    throw new EmployeeApiError(403, "FORBIDDEN", "Employee access required");
  }

  const profileQuery = database.select({
    id: employees.id,
    employeeNumber: employees.employeeNumber,
    fullName: employees.fullName,
    designation: employees.designation,
    facultyCode: employees.facultyCode,
    departmentName: employees.departmentName,
    joiningDate: employees.joiningDate,
    categoryId: employees.categoryId,
    category: { id: employeeCategories.id, code: employeeCategories.code, name: employeeCategories.name },
    categoryActive: employeeCategories.isActive,
  }).from(employees)
    .innerJoin(employeeCategories, eq(employeeCategories.id, employees.categoryId))
    .where(eq(employees.userId, identity.userId)).limit(1);
  const [row] = lock ? await profileQuery.for("update", { of: employees }) : await profileQuery;
  if (!row) throw new EmployeeApiError(404, "NOT_FOUND", "Employee profile not found");
  if (row.facultyCode !== "FC") {
    throw new EmployeeApiError(403, "FORBIDDEN", "Faculty of Computing employee access required");
  }
  if (!row.categoryActive) throw configurationError();
  // No password hashes, user rows or other authentication fields are selected.
  const { categoryActive: _categoryActive, ...profile } = row;
  void _categoryActive;
  return profile;
}

const timestamp = (value: Date | null): string | null => value?.toISOString() ?? null;

async function caseViews(database: Executor, rows: CaseRow[]): Promise<EmployeeCase[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const stages = await database.select({
    requestId: requestStages.requestId,
    id: requestStages.id,
    departmentId: requestStages.departmentId,
    departmentCode: clearanceDepartments.code,
    departmentName: clearanceDepartments.name,
    stepOrder: requestStages.stepOrder,
    isRequired: requestStages.isRequired,
    status: requestStages.status,
    outstandingNote: requestStages.outstandingNote,
    startedAt: requestStages.startedAt,
    lastCheckedAt: requestStages.lastCheckedAt,
    clearedAt: requestStages.clearedAt,
  }).from(requestStages)
    .innerJoin(clearanceDepartments, eq(clearanceDepartments.id, requestStages.departmentId))
    .where(inArray(requestStages.requestId, ids)).orderBy(asc(requestStages.stepOrder), asc(requestStages.id));
  const approvals = await database.select({
    requestId: requestApprovals.requestId,
    id: requestApprovals.id,
    positionId: requestApprovals.positionId,
    positionTitle: authorityPositions.title,
    stepOrder: requestApprovals.stepOrder,
    isRequired: requestApprovals.isRequired,
    status: requestApprovals.status,
  }).from(requestApprovals)
    .innerJoin(authorityPositions, eq(authorityPositions.id, requestApprovals.positionId))
    .where(inArray(requestApprovals.requestId, ids)).orderBy(asc(requestApprovals.stepOrder), asc(requestApprovals.id));
  const issues = await database.select({
    requestId: requestStages.requestId,
    id: clearanceIssues.id,
    requestStageId: clearanceIssues.requestStageId,
    status: clearanceIssues.status,
    reason: clearanceIssues.reason,
    openedAt: clearanceIssues.openedAt,
    resolvedAt: clearanceIssues.resolvedAt,
  }).from(clearanceIssues)
    .innerJoin(requestStages, eq(requestStages.id, clearanceIssues.requestStageId))
    .where(inArray(requestStages.requestId, ids)).orderBy(asc(clearanceIssues.openedAt), asc(clearanceIssues.id));
  const certificateRows = await database.select({ id: certificates.id, requestId: certificates.requestId })
    .from(certificates).where(inArray(certificates.requestId, ids));

  return rows.map((row) => {
    const caseStages = stages.filter((stage) => stage.requestId === row.id).map((stage) => ({
      id: stage.id,
      departmentId: stage.departmentId,
      departmentCode: stage.departmentCode,
      departmentName: stage.departmentName,
      stepOrder: stage.stepOrder,
      isRequired: stage.isRequired,
      status: stage.status,
      outstandingNote: stage.outstandingNote,
      startedAt: timestamp(stage.startedAt),
      lastCheckedAt: timestamp(stage.lastCheckedAt),
      clearedAt: timestamp(stage.clearedAt),
    }));
    return {
      id: row.id,
      requestCode: row.requestCode,
      employeeId: row.employeeId,
      status: row.status,
      reasonForLeaving: row.reasonForLeaving,
      lastWorkingDate: row.lastWorkingDate,
      employeeRemarks: row.employeeRemarks,
      initiatedAt: row.initiatedAt.toISOString(),
      submittedAt: timestamp(row.submittedAt),
      completedAt: timestamp(row.completedAt),
      cancelledAt: timestamp(row.cancelledAt),
      stages: caseStages,
      approvals: approvals.filter((approval) => approval.requestId === row.id).map((approval) => ({
        id: approval.id,
        positionId: approval.positionId,
        positionTitle: approval.positionTitle,
        stepOrder: approval.stepOrder,
        isRequired: approval.isRequired,
        status: approval.status,
      })),
      issues: issues.filter((issue) => issue.requestId === row.id).map((issue) => ({
        id: issue.id,
        requestStageId: issue.requestStageId,
        status: issue.status,
        reason: issue.reason,
        openedAt: issue.openedAt.toISOString(),
        resolvedAt: timestamp(issue.resolvedAt),
      })),
      certificateId: certificateRows.find((certificate) => certificate.requestId === row.id)?.id ?? null,
      progress: {
        totalStages: caseStages.length,
        clearedStages: caseStages.filter((stage) => stage.status === "CLEARED").length,
        outstandingStages: caseStages.filter((stage) => stage.status === "OUTSTANDING").length,
        skippedStages: caseStages.filter((stage) => stage.status === "SKIPPED").length,
      },
    };
  });
}

function databaseFailure(error: unknown): { code?: unknown; constraint?: unknown } {
  let current = error;
  // Drizzle wraps PostgreSQL errors in a cause; never inspect/log their parameters.
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current) {
      return { code: current.code, constraint: "constraint" in current ? current.constraint : undefined };
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return {};
}

export function createEmployeeCaseService(
  database: EmployeeDatabase,
  options: EmployeeServiceOptions = {},
): EmployeeCaseService {
  const generateRequestCode = options.generateRequestCode ?? (() => `EC-${randomUUID()}`);

  return {
    async getProfile(identity) {
      return database.transaction((transaction) => loadProfile(transaction, identity), {
        isolationLevel: "repeatable read", accessMode: "read only",
      });
    },

    async createCase(identity, submission) {
      const principal = parsePrincipal(identity);
      const input = createCaseSchema.parse(submission);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await database.transaction(async (transaction) => {
            const employee = await loadProfile(transaction, principal, true);
            const [existing] = await transaction.select({ id: clearanceRequests.id }).from(clearanceRequests)
              .where(and(eq(clearanceRequests.employeeId, employee.id),
                notInArray(clearanceRequests.status, ["COMPLETED", "CANCELLED"]))).limit(1);
            if (existing) throw new EmployeeApiError(409, "ACTIVE_CASE_EXISTS", "An active clearance case already exists");

            const templates = await transaction.select().from(workflowTemplates)
              .where(and(eq(workflowTemplates.categoryId, employee.categoryId), eq(workflowTemplates.isActive, true)))
              .limit(2).for("share");
            const template = templates[0];
            if (!template) {
              throw new EmployeeApiError(503, "WORKFLOW_NOT_CONFIGURED", "No active clearance workflow is configured for this employee category");
            }
            if (templates.length !== 1) throw configurationError();

            const stages = await transaction.select({
              departmentId: workflowStageTemplates.departmentId,
              stepOrder: workflowStageTemplates.stepOrder,
              isRequired: workflowStageTemplates.isRequired,
              departmentActive: clearanceDepartments.isActive,
              ruleActive: clearanceRules.isActive,
              ruleId: clearanceRules.id,
              code: clearanceRules.code,
              metricKey: clearanceRules.metricKey,
              operator: clearanceRules.operator,
              expectedValue: clearanceRules.expectedValue,
              failMessage: clearanceRules.failMessage,
            }).from(workflowStageTemplates)
              .innerJoin(clearanceDepartments, eq(clearanceDepartments.id, workflowStageTemplates.departmentId))
              .innerJoin(clearanceRules, eq(clearanceRules.id, workflowStageTemplates.ruleId))
              .where(eq(workflowStageTemplates.templateId, template.id))
              .orderBy(asc(workflowStageTemplates.stepOrder)).for("share");
            const approvals = await transaction.select({
              positionId: workflowApprovalTemplates.positionId,
              stepOrder: workflowApprovalTemplates.stepOrder,
              isRequired: workflowApprovalTemplates.isRequired,
              positionActive: authorityPositions.isActive,
            }).from(workflowApprovalTemplates)
              .innerJoin(authorityPositions, eq(authorityPositions.id, workflowApprovalTemplates.positionId))
              .where(eq(workflowApprovalTemplates.templateId, template.id))
              .orderBy(asc(workflowApprovalTemplates.stepOrder)).for("share");
            if (stages.length === 0 || stages.some((stage) => !stage.departmentActive || !stage.ruleActive)
              || approvals.some((approval) => !approval.positionActive)) {
              throw configurationError();
            }

            const now = new Date();
            const [created] = await transaction.insert(clearanceRequests).values({
              requestCode: generateRequestCode(),
              employeeId: employee.id,
              templateId: template.id,
              initiatedById: principal.userId,
              status: "IN_PROGRESS",
              reasonForLeaving: input.reasonForLeaving,
              lastWorkingDate: input.lastWorkingDate,
              employeeRemarks: input.employeeRemarks ?? null,
              initiatedAt: now,
              submittedAt: now,
              updatedAt: now,
            }).returning();
            if (!created) throw new Error("Clearance request insert did not return a row");
            await transaction.insert(requestStages).values(stages.map((stage) => ({
              requestId: created.id,
              departmentId: stage.departmentId,
              stepOrder: stage.stepOrder,
              isRequired: stage.isRequired,
              status: "LOCKED" as const,
              ruleSnapshot: {
                id: stage.ruleId, code: stage.code, metricKey: stage.metricKey,
                operator: stage.operator, expectedValue: stage.expectedValue, failMessage: stage.failMessage,
              },
            })));
            if (approvals.length > 0) {
              await transaction.insert(requestApprovals).values(approvals.map((approval) => ({
                requestId: created.id,
                positionId: approval.positionId,
                stepOrder: approval.stepOrder,
                isRequired: approval.isRequired,
                status: "WAITING" as const,
              })));
            }
            // Allowlisted operational metadata only: no free text, tokens or auth rows.
            await transaction.insert(auditLogs).values({
              actorUserId: principal.userId,
              requestId: created.id,
              action: "EMPLOYEE_CASE_SUBMITTED",
              entityType: "clearance_request",
              entityId: created.id,
              details: {
                employeeId: employee.id, templateId: template.id, templateVersion: template.version,
                stageCount: stages.length, approvalCount: approvals.length, initialStatus: "IN_PROGRESS",
              },
            });
            const [view] = await caseViews(transaction, [created]);
            if (!view) throw new Error("Created clearance case could not be read");
            return view;
          }, { isolationLevel: "repeatable read" });
        } catch (error) {
          const failure = databaseFailure(error);
          if (failure.code === "23505" && failure.constraint === "clearance_requests_one_active_employee_idx") {
            throw new EmployeeApiError(409, "ACTIVE_CASE_EXISTS", "An active clearance case already exists");
          }
          if (failure.code === "23505" && failure.constraint === "clearance_requests_code_unique") {
            if (attempt < 2) continue;
            throw new EmployeeApiError(409, "REQUEST_CODE_CONFLICT", "Unable to allocate a unique clearance reference; retry submission");
          }
          if (failure.code === "40001") {
            if (attempt < 2) continue;
            throw new EmployeeApiError(409, "CASE_CREATION_CONFLICT", "Clearance data changed during submission; retry submission");
          }
          throw error;
        }
      }
      throw new Error("Clearance submission attempts exhausted");
    },

    async listCases(identity, filter = {}) {
      const validated = listCasesQuerySchema.parse(filter);
      return database.transaction(async (transaction) => {
        const employee = await loadProfile(transaction, identity);
        const rows = await transaction.select().from(clearanceRequests)
          .where(and(eq(clearanceRequests.employeeId, employee.id),
            validated.status ? eq(clearanceRequests.status, validated.status) : undefined))
          .orderBy(desc(clearanceRequests.initiatedAt), desc(clearanceRequests.id));
        return caseViews(transaction, rows);
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },

    async getCase(identity, rawCaseId) {
      const caseId = caseIdSchema.parse(rawCaseId);
      return database.transaction(async (transaction) => {
        const employee = await loadProfile(transaction, identity);
        const [row] = await transaction.select().from(clearanceRequests)
          .where(and(eq(clearanceRequests.id, caseId), eq(clearanceRequests.employeeId, employee.id))).limit(1);
        if (!row) throw new EmployeeApiError(404, "NOT_FOUND", "Clearance case not found");
        const [view] = await caseViews(transaction, [row]);
        if (!view) throw new Error("Clearance case could not be read");
        return view;
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
  };
}
