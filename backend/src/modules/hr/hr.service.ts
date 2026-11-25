import {
  and, asc, desc, eq, inArray, isNull, ne, or,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "../../db/schema";
import { EmployeeApiError } from "../employee/employee.errors";
import { caseViews } from "../employee/employee.service";
import type { EmployeeCase, EmployeeProfile } from "../employee/employee.types";
import { questionnaireSnapshotSchema } from "../employee/employee.questionnaire";
import { evaluateRule } from "../verification/rule-evaluator";
import {
  confirmDepartmentsSchema,
  hrCaseIdSchema,
  hrIdentitySchema,
  hrListSchema,
} from "./hr.schemas";

type Database = Pick<
  NodePgDatabase<typeof s>,
  "select" | "insert" | "update" | "transaction"
>;

type Executor = Pick<Database, "select" | "insert" | "update">;
type RequestRow = typeof s.clearanceRequests.$inferSelect;

export interface HrCase {
  employee: EmployeeProfile;
  case: EmployeeCase;
  selectionRevision: number;
}

export interface HrOptions {
  categoryScopeByUser?: ReadonlyMap<string, readonly string[]>;
  catalogByCategory?: ReadonlyMap<string, readonly string[]>;
  catalogVersion?: string;
  allowIndependentVerification?: boolean;
}

const forbidden = () => new EmployeeApiError(
  403, "FORBIDDEN", "HR clearance access required",
);

const notFound = () => new EmployeeApiError(
  404, "NOT_FOUND", "Clearance case not found",
);

const invalidConfig = () => new EmployeeApiError(
  503, "WORKFLOW_CONFIGURATION_INVALID",
  "Clearance workflow configuration needs administrator attention",
);

const stale = () => new EmployeeApiError(
  409, "STALE_HR_SELECTION", "Department selection revision is stale",
);

const invalidTransition = () => new EmployeeApiError(
  409, "INVALID_STATUS_TRANSITION",
  "The clearance case cannot be confirmed in its current state",
);

export function createHrService(
  database: Database,
  options: HrOptions = {},
) {
  // No default HR scope or automatic catalog assignment.
  const scope = new Map(
    [...(options.categoryScopeByUser ?? new Map<string, readonly string[]>())]
      .map(([id, categories]) => [id, [...categories]]),
  );

  const catalog = new Map(
    [...(options.catalogByCategory ?? new Map<string, readonly string[]>())]
      .map(([id, departments]) => [id, [...departments]]),
  );

  const catalogVersion = options.catalogVersion;
  const independentChecks = options.allowIndependentVerification === true;

  async function authorize(
    tx: Executor,
    rawIdentity: unknown,
    lock = false,
  ) {
    const parsed = hrIdentitySchema.safeParse(rawIdentity);

    if (!parsed.success) {
      throw new EmployeeApiError(
        401, "UNAUTHENTICATED", "Authentication required",
      );
    }

    const identity = parsed.data;

    if (identity.role !== "HR_OFFICER") throw forbidden();

    const query = tx.select({
      id: s.users.id,
      role: s.users.role,
      active: s.users.isActive,
    }).from(s.users)
      .where(eq(s.users.id, identity.userId));

    const [user] = lock ? await query.for("share") : await query;

    if (!user || !user.active || user.role !== "HR_OFFICER") {
      throw forbidden();
    }

    const categories = scope.get(user.id);

    if (!categories?.length) throw forbidden();

    return { userId: user.id, categories };
  }

  function scopedQuery(
    tx: Executor,
    identity: { userId: string; categories: string[] },
    caseId?: string,
    status?: RequestRow["status"],
  ) {
    return tx.select({
      request: s.clearanceRequests,
      employee: {
        id: s.employees.id,
        employeeNumber: s.employees.employeeNumber,
        fullName: s.employees.fullName,
        designation: s.employees.designation,
        facultyCode: s.employees.facultyCode,
        departmentName: s.employees.departmentName,
        joiningDate: s.employees.joiningDate,
        categoryId: s.employees.categoryId,
      },
      category: {
        id: s.employeeCategories.id,
        code: s.employeeCategories.code,
        name: s.employeeCategories.name,
      },
      categoryActive: s.employeeCategories.isActive,
    }).from(s.clearanceRequests)
      .innerJoin(s.employees,
        eq(s.employees.id, s.clearanceRequests.employeeId))
      .innerJoin(s.employeeCategories,
        eq(s.employeeCategories.id, s.employees.categoryId))
      .where(and(
        eq(s.employees.facultyCode, "FC"),
        inArray(s.employees.categoryId, identity.categories),
        or(
          isNull(s.employees.userId),
          ne(s.employees.userId, identity.userId),
        ),
        caseId ? eq(s.clearanceRequests.id, caseId) : undefined,
        status ? eq(s.clearanceRequests.status, status) : undefined,
      ));
  }

  async function view(
    tx: Executor,
    row: RequestRow,
    employee: EmployeeProfile,
  ): Promise<HrCase> {
    const [item] = await caseViews(tx, [row]);

    if (!item) throw notFound();

    return {
      employee,
      case: item,
      selectionRevision: row.selectionRevision,
    };
  }

  return {
    async listCases(rawIdentity: unknown, rawFilter: unknown = {}) {
      const filter = hrListSchema.parse(rawFilter);

      return database.transaction(async (tx) => {
        const identity = await authorize(tx, rawIdentity);

        const rows = await scopedQuery(
          tx, identity, undefined, filter.status,
        ).orderBy(
          desc(s.clearanceRequests.initiatedAt),
          desc(s.clearanceRequests.id),
        );

        const result: HrCase[] = [];

        for (const row of rows) {
          result.push(await view(tx, row.request, { ...row.employee, category: row.category }));
        }

        return result;
      }, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },

    async getCase(rawIdentity: unknown, rawCaseId: unknown) {
      const caseId = hrCaseIdSchema.parse(rawCaseId);

      return database.transaction(async (tx) => {
        const identity = await authorize(tx, rawIdentity);

        const [row] = await scopedQuery(tx, identity, caseId);

        if (!row) throw notFound();

        return view(tx, row.request, { ...row.employee, category: row.category });
      }, {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },

    async confirmDepartments(
      rawIdentity: unknown,
      rawCaseId: unknown,
      rawInput: unknown,
    ) {
      const caseId = hrCaseIdSchema.parse(rawCaseId);
      const input = confirmDepartmentsSchema.parse(rawInput);

      return database.transaction(async (tx) => {
        const identity = await authorize(tx, rawIdentity, true);

        const [row] = await scopedQuery(tx, identity, caseId)
          .for("update", {
            of: [s.clearanceRequests, s.employees],
          });

        if (!row) throw notFound();

        const request = row.request;

        const existingStages = await tx.select()
          .from(s.requestStages)
          .where(eq(s.requestStages.requestId, caseId));

        // Safe replay: return persisted results without new checks or audits.
        if (request.hrVerifiedAt && request.selectionRevision > 0) {
          const existing = existingStages.map(
            (stage) => stage.departmentId,
          ).sort();

          const requested = [...input.departmentIds].sort();

          if (
            input.expectedSelectionRevision === request.selectionRevision - 1
            && existing.length === requested.length
            && existing.every((id, index) => id === requested[index])
          ) {
            return view(tx, request, { ...row.employee, category: row.category });
          }

          throw stale();
        }

        if (input.expectedSelectionRevision !== request.selectionRevision) {
          throw stale();
        }

        if (
          request.status !== "PENDING_HR_VERIFICATION"
          || request.selectionRevision !== 0
          || request.templateId !== null
        ) {
          throw invalidTransition();
        }

        if (
          !row.categoryActive
          || existingStages.length !== 0
          || !questionnaireSnapshotSchema.safeParse(
            request.questionnaireSnapshot,
          ).success
        ) {
          throw invalidConfig();
        }

        const approvals = await tx.select()
          .from(s.requestApprovals)
          .where(eq(s.requestApprovals.requestId, caseId));

        if (approvals.length !== 0) throw invalidConfig();

        // Explicit approved configuration is required.
        const permitted = catalog.get(row.employee.categoryId);

        if (
          !permitted?.length
          || !catalogVersion
          || !independentChecks
        ) {
          throw invalidConfig();
        }

        if (!input.departmentIds.every((id) => permitted.includes(id))) {
          throw new EmployeeApiError(
            422, "VALIDATION_ERROR",
            "One or more selected departments are not permitted",
          );
        }

        const templates = await tx.select()
          .from(s.workflowTemplates)
          .where(and(
            eq(s.workflowTemplates.categoryId, row.employee.categoryId),
            eq(s.workflowTemplates.isActive, true),
          )).limit(2).for("share");

        const template = templates[0];

        if (!template || templates.length !== 1) {
          throw invalidConfig();
        }

        const mappings = await tx.select({
          departmentId: s.workflowStageTemplates.departmentId,
          stepOrder: s.workflowStageTemplates.stepOrder,
          isRequired: s.workflowStageTemplates.isRequired,
          departmentActive: s.clearanceDepartments.isActive,
          ruleActive: s.clearanceRules.isActive,
          ruleId: s.clearanceRules.id,
          code: s.clearanceRules.code,
          metricKey: s.clearanceRules.metricKey,
          operator: s.clearanceRules.operator,
          expectedValue: s.clearanceRules.expectedValue,
          failMessage: s.clearanceRules.failMessage,
        }).from(s.workflowStageTemplates)
          .innerJoin(s.clearanceDepartments,
            eq(s.clearanceDepartments.id, s.workflowStageTemplates.departmentId))
          .innerJoin(s.clearanceRules,
            eq(s.clearanceRules.id, s.workflowStageTemplates.ruleId))
          .where(and(
            eq(s.workflowStageTemplates.templateId, template.id),
            inArray(s.workflowStageTemplates.departmentId, input.departmentIds),
          )).orderBy(
            asc(s.workflowStageTemplates.stepOrder),
          ).for("share");

        if (
          mappings.length !== input.departmentIds.length
          || mappings.some((m) => !m.departmentActive || !m.ruleActive)
        ) {
          throw invalidConfig();
        }

        const now = new Date();

        const [confirmed] = await tx.update(s.clearanceRequests)
          .set({
            templateId: template.id,
            hrVerifiedById: identity.userId,
            hrVerifiedAt: now,
            selectionRevision: request.selectionRevision + 1,
            status: "IN_PROGRESS",
            updatedAt: now,
          }).where(eq(s.clearanceRequests.id, caseId))
          .returning();

        if (!confirmed) throw invalidConfig();

        const stages = await tx.insert(s.requestStages).values(
          mappings.map((mapping) => ({
            requestId: caseId,
            departmentId: mapping.departmentId,
            stepOrder: mapping.stepOrder,
            isRequired: mapping.isRequired,
            status: "CHECKING" as const,
            startedAt: now,
            ruleSnapshot: {
              id: mapping.ruleId,
              code: mapping.code,
              metricKey: mapping.metricKey,
              operator: mapping.operator,
              expectedValue: mapping.expectedValue,
              failMessage: mapping.failMessage,
            },
          })),
        ).returning();

        await tx.insert(s.auditLogs).values({
          actorUserId: identity.userId,
          requestId: caseId,
          action: "EMPLOYEE_DEPARTMENTS_CONFIRMED",
          entityType: "clearance_request",
          entityId: caseId,
          details: {
            previousStatus: request.status,
            newStatus: confirmed.status,
            selectionRevision: confirmed.selectionRevision,
            departmentIds: mappings.map((m) => m.departmentId),
            templateId: template.id,
            templateVersion: template.version,
            catalogVersion,
          },
        });

        // Backend verification: HR never supplies clearance outcomes.
        let hasOutstanding = false;

        for (const stage of stages) {
          const [evidence] = await tx.select()
            .from(s.departmentDemoRecords)
            .where(and(
              eq(s.departmentDemoRecords.employeeId, request.employeeId),
              eq(s.departmentDemoRecords.departmentId, stage.departmentId),
            )).for("share");

          const result = evaluateRule(
            stage.ruleSnapshot,
            evidence?.values,
          );

          const status = result.outcome === "PASS"
            ? "CLEARED"
            : result.outcome === "FAIL"
              ? "OUTSTANDING"
              : "CHECKING";

          if (status === "OUTSTANDING") hasOutstanding = true;

          const [savedStage] = await tx.update(s.requestStages)
            .set({
              status,
              checkedValue: result.outcome === "INCOMPLETE"
                ? null : result.checkedValue,
              outstandingNote: null,
              lastCheckedAt: now,
              clearedAt: status === "CLEARED" ? now : null,
            }).where(eq(s.requestStages.id, stage.id))
            .returning();

          if (!savedStage) throw invalidConfig();

          await tx.insert(s.auditLogs).values({
            actorUserId: null,
            requestId: caseId,
            action: "EMPLOYEE_DEPARTMENT_VERIFIED",
            entityType: "request_stage",
            entityId: stage.id,
            details: {
              source: "AUTOMATED_VERIFICATION",
              departmentId: stage.departmentId,
              previousStatus: stage.status,
              newStatus: status,
              templateVersion: template.version,
              ruleId: stage.ruleSnapshot.id,
              datasetRecordId: evidence?.id ?? null,
              datasetUpdatedAt: evidence?.updatedAt.toISOString() ?? null,
              reason: result.outcome === "INCOMPLETE"
                ? result.reason : null,
            },
          });
        }

        // Never fabricate final completion or authority approvals.
        const finalStatus = hasOutstanding
          ? "ACTION_REQUIRED"
          : "IN_PROGRESS";

        const [saved] = await tx.update(s.clearanceRequests)
          .set({
            status: finalStatus,
            updatedAt: now,
          }).where(eq(s.clearanceRequests.id, caseId))
          .returning();

        if (!saved) throw invalidConfig();

        if (saved.status !== confirmed.status) {
          await tx.insert(s.auditLogs).values({
            actorUserId: null,
            requestId: caseId,
            action: "EMPLOYEE_REQUEST_STATUS_CHANGED",
            entityType: "clearance_request",
            entityId: caseId,
            details: {
              source: "AUTOMATED_VERIFICATION",
              previousStatus: confirmed.status,
              newStatus: saved.status,
            },
          });
        }

        return view(tx, saved, { ...row.employee, category: row.category });
      });
    },
  };
}

export type HrService = ReturnType<typeof createHrService>;
