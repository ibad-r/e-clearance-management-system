import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { connectTestDatabase, type TestDatabaseConnection } from "../../db/test-database";
import { createEmployeeCaseService } from "./employee.service";
import type { RequestStatus, VerifiedEmployeeIdentity } from "./employee.types";

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface Fixture {
  identity: VerifiedEmployeeIdentity;
  otherIdentity: VerifiedEmployeeIdentity;
  employeeId: string;
  otherEmployeeId: string;
  categoryId: string;
  templateId: string;
  departmentIds: [string, string];
  ruleIds: [string, string];
  positionIds: [string, string];
}

const submission = {
  lastWorkingDate: "2026-11-05",
  reasonForLeaving: "Fictional integration reason",
  employeeRemarks: "Fictional integration remarks",
};

async function createFixture(tx: Transaction): Promise<Fixture> {
  const fixture: Fixture = {
    identity: { userId: randomUUID(), role: "EMPLOYEE" },
    otherIdentity: { userId: randomUUID(), role: "EMPLOYEE" },
    employeeId: randomUUID(),
    otherEmployeeId: randomUUID(),
    categoryId: randomUUID(),
    templateId: randomUUID(),
    departmentIds: [randomUUID(), randomUUID()],
    ruleIds: [randomUUID(), randomUUID()],
    positionIds: [randomUUID(), randomUUID()],
  };

  await tx.insert(schema.users).values([
    {
      id: fixture.identity.userId,
      email: `${randomUUID()}@example.invalid`,
      passwordHash: "fictional-unusable-integration-hash",
      fullName: "Fictional Employee One",
      role: "EMPLOYEE",
    },
    {
      id: fixture.otherIdentity.userId,
      email: `${randomUUID()}@example.invalid`,
      passwordHash: "fictional-unusable-integration-hash",
      fullName: "Fictional Employee Two",
      role: "EMPLOYEE",
    },
  ]);
  await tx.insert(schema.employeeCategories).values({
    id: fixture.categoryId,
    code: `FICTIONAL-${randomUUID()}`,
    name: "Fictional Integration Category",
  });
  await tx.insert(schema.employees).values([
    {
      id: fixture.employeeId,
      userId: fixture.identity.userId,
      employeeNumber: `FICTIONAL-${randomUUID()}`,
      categoryId: fixture.categoryId,
      fullName: "Fictional Employee One",
      designation: "Fictional Teacher",
      facultyCode: "FC",
      departmentName: "Fictional Computing Department",
      joiningDate: "2020-01-15",
    },
    {
      id: fixture.otherEmployeeId,
      userId: fixture.otherIdentity.userId,
      employeeNumber: `FICTIONAL-${randomUUID()}`,
      categoryId: fixture.categoryId,
      fullName: "Fictional Employee Two",
      designation: "Fictional Teacher",
      facultyCode: "FC",
      departmentName: "Fictional Computing Department",
    },
  ]);
  await tx.insert(schema.clearanceDepartments).values(fixture.departmentIds.map((id, index) => ({
    id,
    code: `FICTIONAL-${randomUUID()}`,
    name: `Fictional Department ${index + 1}`,
  })));
  await tx.insert(schema.clearanceRules).values(fixture.ruleIds.map((id, index) => ({
    id,
    code: `FICTIONAL-${randomUUID()}`,
    metricKey: `fictional_metric_${index + 1}`,
    operator: "EQ" as const,
    expectedValue: index,
    failMessage: `Fictional rule ${index + 1} failed`,
  })));
  await tx.insert(schema.authorityPositions).values(fixture.positionIds.map((id, index) => ({
    id,
    code: `FICTIONAL-${randomUUID()}`,
    title: `Fictional Authority ${index + 1}`,
  })));
  await tx.insert(schema.workflowTemplates).values({
    id: fixture.templateId,
    categoryId: fixture.categoryId,
    name: "Fictional Integration Workflow",
    version: 1,
    isActive: true,
  });
  await tx.insert(schema.workflowStageTemplates).values([
    {
      templateId: fixture.templateId,
      departmentId: fixture.departmentIds[0],
      ruleId: fixture.ruleIds[0],
      stepOrder: 1,
      isRequired: true,
    },
    {
      templateId: fixture.templateId,
      departmentId: fixture.departmentIds[1],
      ruleId: fixture.ruleIds[1],
      stepOrder: 2,
      isRequired: false,
    },
  ]);
  await tx.insert(schema.workflowApprovalTemplates).values([
    { templateId: fixture.templateId, positionId: fixture.positionIds[0], stepOrder: 1, isRequired: true },
    { templateId: fixture.templateId, positionId: fixture.positionIds[1], stepOrder: 2, isRequired: false },
  ]);
  return fixture;
}

describe("employee clearance database services", { concurrent: false }, () => {
  let connection: TestDatabaseConnection | undefined;
  let database: Database | undefined;

  beforeAll(async () => {
    connection = await connectTestDatabase();
    // CI must apply the accepted migrations first. Tests never bootstrap schema.
    const history = await connection.client.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM drizzle."__drizzle_migrations"',
    );
    expect(history.rows[0]?.count).toBeGreaterThan(0);
    database = drizzle({ client: connection.client, schema });
  });

  afterAll(async () => {
    await connection?.close();
  });

  async function withFixture(run: (tx: Transaction, fixture: Fixture) => Promise<void>): Promise<void> {
    if (!database) throw new Error("Guarded integration database is unavailable");
    const rollback = new Error("Roll back fictional integration fixture");
    try {
      await database.transaction(async (tx) => {
        const fixture = await createFixture(tx);
        await run(tx, fixture);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }

  async function employeeRequestCount(tx: Transaction, employeeId: string): Promise<number> {
    const rows = await tx.select({ count: sql<number>`count(*)::integer` })
      .from(schema.clearanceRequests)
      .where(eq(schema.clearanceRequests.employeeId, employeeId));
    return rows[0]?.count ?? 0;
  }

  it("loads only the linked FC employee profile without authentication fields", async () => {
    await withFixture(async (tx, fixture) => {
      const profile = await createEmployeeCaseService(tx).getProfile(fixture.identity);
      expect(profile).toMatchObject({
        id: fixture.employeeId,
        fullName: "Fictional Employee One",
        facultyCode: "FC",
        categoryId: fixture.categoryId,
        joiningDate: "2020-01-15",
        category: { id: fixture.categoryId, name: "Fictional Integration Category" },
      });
      expect(profile).not.toHaveProperty("passwordHash");
      expect(profile).not.toHaveProperty("email");
      expect(profile).not.toHaveProperty("userId");
    });
  });

  it("creates a submitted case, frozen workflow rows and a safe audit event in one transaction", async () => {
    await withFixture(async (tx, fixture) => {
      const created = await createEmployeeCaseService(tx).createCase(fixture.identity, submission);
      expect(created).toMatchObject({
        employeeId: fixture.employeeId,
        status: "IN_PROGRESS",
        submittedAt: expect.any(String),
        employeeRemarks: submission.employeeRemarks,
        progress: { totalStages: 2, clearedStages: 0, outstandingStages: 0, skippedStages: 0 },
      });
      expect(created.requestCode.length).toBeGreaterThan(0);
      expect(created.stages.map((stage) => [stage.stepOrder, stage.isRequired, stage.status]))
        .toEqual([[1, true, "LOCKED"], [2, false, "LOCKED"]]);
      expect(created.approvals.map((approval) => [approval.stepOrder, approval.isRequired, approval.status]))
        .toEqual([[1, true, "WAITING"], [2, false, "WAITING"]]);

      const [stored] = await tx.select().from(schema.clearanceRequests)
        .where(eq(schema.clearanceRequests.id, created.id));
      expect(stored).toMatchObject({
        initiatedById: fixture.identity.userId,
        employeeId: fixture.employeeId,
        templateId: fixture.templateId,
        status: "IN_PROGRESS",
        submittedAt: expect.any(Date),
      });
      const stages = await tx.select().from(schema.requestStages)
        .where(eq(schema.requestStages.requestId, created.id)).orderBy(asc(schema.requestStages.stepOrder));
      const rules = await tx.select().from(schema.clearanceRules)
        .where(eq(schema.clearanceRules.id, fixture.ruleIds[0]));
      const rule = rules[0];
      if (!rule) throw new Error("Fictional rule is missing");
      expect(stages[0]?.ruleSnapshot).toEqual({
        id: rule.id,
        code: rule.code,
        metricKey: rule.metricKey,
        operator: rule.operator,
        expectedValue: rule.expectedValue,
        failMessage: rule.failMessage,
      });
      for (const stage of stages) {
        expect(stage.status).toBe("LOCKED");
        expect(stage.checkedValue).toBeNull();
        expect(stage.startedAt).toBeNull();
        expect(stage.clearedAt).toBeNull();
      }
      const approvals = await tx.select().from(schema.requestApprovals)
        .where(eq(schema.requestApprovals.requestId, created.id));
      for (const approval of approvals) {
        expect(approval.status).toBe("WAITING");
        expect(approval.assignedUserId).toBeNull();
        expect(approval.decidedById).toBeNull();
        expect(approval.decidedAt).toBeNull();
      }
      const audits = await tx.select().from(schema.auditLogs)
        .where(eq(schema.auditLogs.requestId, created.id));
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorUserId: fixture.identity.userId, entityId: created.id });
      const safeDetails = JSON.stringify(audits[0]?.details);
      expect(safeDetails).not.toContain(submission.reasonForLeaving);
      expect(safeDetails).not.toContain(submission.employeeRemarks);
      expect(safeDetails).not.toContain("fictional-unusable-integration-hash");
      const publicResult = JSON.stringify(created);
      expect(publicResult).not.toContain("passwordHash");
      expect(publicResult).not.toContain("ruleSnapshot");
      expect(publicResult).not.toContain("verificationToken");
    });
  });

  it("lists and retrieves only the authenticated employee's cases", async () => {
    await withFixture(async (tx, fixture) => {
      const service = createEmployeeCaseService(tx);
      const owned = await service.createCase(fixture.identity, submission);
      const foreign = await service.createCase(fixture.otherIdentity, submission);
      expect((await service.listCases(fixture.identity)).map((item) => item.id)).toEqual([owned.id]);
      expect(await service.listCases(fixture.identity, { status: "COMPLETED" })).toEqual([]);
      expect((await service.getCase(fixture.identity, owned.id)).id).toBe(owned.id);
      await expect(service.getCase(fixture.identity, foreign.id))
        .rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
      await expect(service.getCase(fixture.identity, randomUUID()))
        .rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    });
  });

  it("returns stored department progress without running a rule engine", async () => {
    await withFixture(async (tx, fixture) => {
      const service = createEmployeeCaseService(tx);
      const created = await service.createCase(fixture.identity, submission);
      await tx.update(schema.requestStages).set({ status: "OUTSTANDING", outstandingNote: "Fictional outstanding item" })
        .where(and(eq(schema.requestStages.requestId, created.id), eq(schema.requestStages.stepOrder, 1)));
      await tx.update(schema.requestStages).set({ status: "CLEARED", clearedAt: new Date() })
        .where(and(eq(schema.requestStages.requestId, created.id), eq(schema.requestStages.stepOrder, 2)));
      const result = await service.getCase(fixture.identity, created.id);
      expect(result.progress).toEqual({ totalStages: 2, clearedStages: 1, outstandingStages: 1, skippedStages: 0 });
      expect(result.stages[0]).toMatchObject({
        departmentId: fixture.departmentIds[0], status: "OUTSTANDING", outstandingNote: "Fictional outstanding item",
      });
      expect(result.approvals.every((approval) => approval.status === "WAITING")).toBe(true);
    });
  });

  it.each<RequestStatus>([
    "PENDING_SUBMISSION", "IN_PROGRESS", "ACTION_REQUIRED", "AWAITING_APPROVAL", "RETURNED_FOR_CORRECTION",
  ])("rejects a second case when the existing case is %s", async (status) => {
    await withFixture(async (tx, fixture) => {
      const service = createEmployeeCaseService(tx);
      const created = await service.createCase(fixture.identity, submission);
      await tx.update(schema.clearanceRequests).set({ status }).where(eq(schema.clearanceRequests.id, created.id));
      await expect(service.createCase(fixture.identity, submission))
        .rejects.toMatchObject({ status: 409, code: "ACTIVE_CASE_EXISTS" });
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(1);
    });
  });

  it.each(["COMPLETED", "CANCELLED"] as const)("allows a new case after a %s case", async (status) => {
    await withFixture(async (tx, fixture) => {
      const service = createEmployeeCaseService(tx);
      const first = await service.createCase(fixture.identity, submission);
      await tx.update(schema.clearanceRequests).set(status === "COMPLETED"
        ? { status, completedAt: new Date() }
        : { status, cancelledAt: new Date(), cancelledById: fixture.identity.userId, cancellationReason: "Fictional cancellation" })
        .where(eq(schema.clearanceRequests.id, first.id));
      const second = await service.createCase(fixture.identity, submission);
      expect(second.id).not.toBe(first.id);
      expect(second.requestCode).not.toBe(first.requestCode);
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(2);
    });
  });

  it("returns a controlled missing-template error without creating records", async () => {
    await withFixture(async (tx, fixture) => {
      await tx.update(schema.workflowTemplates).set({ isActive: false })
        .where(eq(schema.workflowTemplates.id, fixture.templateId));
      await expect(createEmployeeCaseService(tx).createCase(fixture.identity, submission))
        .rejects.toMatchObject({ status: 503, code: "WORKFLOW_NOT_CONFIGURED" });
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(0);
    });
  });

  it("rejects an active workflow with no stage mappings instead of manufacturing stages", async () => {
    await withFixture(async (tx, fixture) => {
      await tx.update(schema.workflowTemplates).set({ isActive: false })
        .where(eq(schema.workflowTemplates.id, fixture.templateId));
      await tx.insert(schema.workflowTemplates).values({
        categoryId: fixture.categoryId, name: "Fictional Empty Workflow", version: 2, isActive: true,
      });
      await expect(createEmployeeCaseService(tx).createCase(fixture.identity, submission))
        .rejects.toMatchObject({ status: 503, code: "WORKFLOW_CONFIGURATION_INVALID" });
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(0);
    });
  });

  it.each(["category", "department", "rule", "authority"])("rejects inactive %s configuration", async (kind) => {
    await withFixture(async (tx, fixture) => {
      if (kind === "category") {
        await tx.update(schema.employeeCategories).set({ isActive: false })
          .where(eq(schema.employeeCategories.id, fixture.categoryId));
      } else if (kind === "department") {
        await tx.update(schema.clearanceDepartments).set({ isActive: false })
          .where(eq(schema.clearanceDepartments.id, fixture.departmentIds[0]));
      } else if (kind === "rule") {
        await tx.update(schema.clearanceRules).set({ isActive: false })
          .where(eq(schema.clearanceRules.id, fixture.ruleIds[0]));
      } else {
        await tx.update(schema.authorityPositions).set({ isActive: false })
          .where(eq(schema.authorityPositions.id, fixture.positionIds[0]));
      }
      await expect(createEmployeeCaseService(tx).createCase(fixture.identity, submission))
        .rejects.toMatchObject({ status: 503, code: "WORKFLOW_CONFIGURATION_INVALID" });
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(0);
    });
  });

  it.each(["inactive-account", "database-role", "principal-role", "faculty"])("rejects ineligible %s access", async (kind) => {
    await withFixture(async (tx, fixture) => {
      let identity = fixture.identity;
      if (kind === "inactive-account") {
        await tx.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, identity.userId));
      } else if (kind === "database-role") {
        await tx.update(schema.users).set({ role: "APPROVER" }).where(eq(schema.users.id, identity.userId));
      } else if (kind === "principal-role") {
        identity = { ...identity, role: "HR_OFFICER" };
      } else {
        await tx.update(schema.employees).set({ facultyCode: "OTHER" }).where(eq(schema.employees.id, fixture.employeeId));
      }
      const service = createEmployeeCaseService(tx);
      await expect(service.getProfile(identity)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      await expect(service.createCase(identity, submission)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(0);
    });
  });

  it("returns a controlled error when an authenticated user has no employee profile", async () => {
    await withFixture(async (tx) => {
      const userId = randomUUID();
      await tx.insert(schema.users).values({
        id: userId, email: `${randomUUID()}@example.invalid`, passwordHash: "fictional-unusable-integration-hash",
        fullName: "Fictional Unlinked Employee", role: "EMPLOYEE",
      });
      await expect(createEmployeeCaseService(tx).getProfile({ userId, role: "EMPLOYEE" }))
        .rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    });
  });

  it("preserves rule and required-step snapshots after live configuration changes", async () => {
    await withFixture(async (tx, fixture) => {
      const service = createEmployeeCaseService(tx);
      const created = await service.createCase(fixture.identity, submission);
      const before = await tx.select().from(schema.requestStages)
        .where(eq(schema.requestStages.requestId, created.id)).orderBy(asc(schema.requestStages.stepOrder));
      await tx.update(schema.clearanceRules).set({ expectedValue: 999, failMessage: "Changed fictional rule" })
        .where(eq(schema.clearanceRules.id, fixture.ruleIds[0]));
      await tx.update(schema.workflowStageTemplates).set({ isRequired: false })
        .where(and(eq(schema.workflowStageTemplates.templateId, fixture.templateId), eq(schema.workflowStageTemplates.stepOrder, 1)));
      await tx.update(schema.workflowApprovalTemplates).set({ isRequired: false })
        .where(and(eq(schema.workflowApprovalTemplates.templateId, fixture.templateId), eq(schema.workflowApprovalTemplates.stepOrder, 1)));
      const after = await tx.select().from(schema.requestStages)
        .where(eq(schema.requestStages.requestId, created.id)).orderBy(asc(schema.requestStages.stepOrder));
      expect(after.map((stage) => [stage.ruleSnapshot, stage.isRequired])).toEqual(before.map((stage) => [stage.ruleSnapshot, stage.isRequired]));
      const read = await service.getCase(fixture.identity, created.id);
      expect(read.stages.map((stage) => stage.isRequired)).toEqual([true, false]);
      expect(read.approvals.map((approval) => approval.isRequired)).toEqual([true, false]);
    });
  });

  it("rolls back exhausted request-code collisions without another employee's partial case", async () => {
    await withFixture(async (tx, fixture) => {
      const requestCode = `FICTIONAL-${randomUUID()}`;
      const service = createEmployeeCaseService(tx, { generateRequestCode: () => requestCode });
      const first = await service.createCase(fixture.identity, submission);
      await expect(service.createCase(fixture.otherIdentity, submission))
        .rejects.toMatchObject({ status: 409, code: "REQUEST_CODE_CONFLICT" });
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(1);
      expect(await employeeRequestCount(tx, fixture.otherEmployeeId)).toBe(0);
      const audits = await tx.select().from(schema.auditLogs).where(eq(schema.auditLogs.actorUserId, fixture.otherIdentity.userId));
      expect(audits).toEqual([]);
      const storedFirst = await service.getCase(fixture.identity, first.id);
      expect(storedFirst.stages).toHaveLength(2);
      expect(storedFirst.approvals).toHaveLength(2);
    });
  });

  it("rolls back request and workflow writes if the final audit write fails", async () => {
    await withFixture(async (tx, fixture) => {
      const failure = new Error("Fictional audit storage failure");
      // Fault injection stays inside this test; all preceding inserts use PostgreSQL.
      // Wrap nested callbacks too, so the service still uses a real Drizzle savepoint.
      function failAuditWrite(transaction: Transaction): Transaction {
        return new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "transaction") {
              return (callback: (nested: Transaction) => Promise<unknown>) =>
                target.transaction((nested) => callback(failAuditWrite(nested)));
            }
            if (property === "insert") {
              return (table: unknown) => {
                if (table === schema.auditLogs) throw failure;
                return Reflect.apply(target.insert, target, [table]);
              };
            }
            const value: unknown = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      }

      const countStages = async () => (await tx.select({ count: sql<number>`count(*)::integer` })
        .from(schema.requestStages))[0]?.count;
      const countApprovals = async () => (await tx.select({ count: sql<number>`count(*)::integer` })
        .from(schema.requestApprovals))[0]?.count;
      const stagesBefore = await countStages();
      const approvalsBefore = await countApprovals();
      await expect(createEmployeeCaseService(failAuditWrite(tx)).createCase(fixture.identity, submission))
        .rejects.toBe(failure);
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(0);
      expect(await countStages()).toBe(stagesBefore);
      expect(await countApprovals()).toBe(approvalsBefore);
      expect(await tx.select().from(schema.auditLogs).where(eq(schema.auditLogs.actorUserId, fixture.identity.userId)))
        .toEqual([]);
    });
  });

  it("revalidates direct service submissions before writing anything", async () => {
    await withFixture(async (tx, fixture) => {
      const service = createEmployeeCaseService(tx);
      await expect(service.createCase(fixture.identity, { ...submission, lastWorkingDate: "2026-02-30" }))
        .rejects.toBeDefined();
      await expect(service.createCase(fixture.identity, { ...submission, employeeId: fixture.otherEmployeeId } as typeof submission))
        .rejects.toBeDefined();
      expect(await employeeRequestCount(tx, fixture.employeeId)).toBe(0);
      expect(await employeeRequestCount(tx, fixture.otherEmployeeId)).toBe(0);
    });
  });
});
