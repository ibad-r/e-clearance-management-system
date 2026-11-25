import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Express } from "express";
import argon2 from "argon2";
import request from "supertest";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "../../db/schema";
import { connectTestDatabase, type TestDatabaseConnection } from "../../db/test-database";
import { questionnaireKeys } from "../employee/employee.questionnaire";
import { retryEmployeeVerification } from "../employee/employee.verification";

describe("Configured mounted HTTP workflows with real shared authentication", { concurrent: false }, () => {
  const password = randomBytes(24).toString("base64url");
  const categoryId = randomUUID(), templateId = randomUUID();
  const departmentIds = Array.from({ length: 14 }, () => randomUUID());
  const ruleIds = Array.from({ length: 14 }, () => randomUUID());
  const roles = ["STUDENT", "STUDENT", "EMPLOYEE", "EMPLOYEE", "EMPLOYEE", "EMPLOYEE", "HR_OFFICER", "HR_OFFICER", "APPROVER", "SYSTEM_ADMIN"] as const;
  const accounts = roles.map((role) => ({ id: randomUUID(), email: randomUUID() + "@example.invalid", role }));
  const profileIds = [randomUUID(), randomUUID()];
  const employeeIds = Array.from({ length: 4 }, () => randomUUID());
  const sapIds = ["FICTIONAL-" + randomUUID(), "FICTIONAL-" + randomUUID()];
  const studentInput = { registrationNumber: "FICTIONAL-001", fatherName: "Fictional Parent", program: "Fictional Program", semester: "8", reason: "degree completed" };
  const employeeInput = { lastWorkingDate: "2026-12-31", reasonForLeaving: "Fictional resignation",
    questionnaireAnswers: Object.fromEntries(questionnaireKeys.map((key) => [key, "NOT_SURE"])) };
  const original = { database: process.env.DATABASE_URL, config: process.env.CLEARANCE_CONFIG_PATH, secret: process.env.JWT_SECRET };
  let directory: string;
  let connection: TestDatabaseConnection;
  let database: NodePgDatabase<typeof s>;
  let app: Express;
  let appPool: { end(): Promise<void> } | undefined;
  let tokens: string[];

  beforeAll(async () => {
    connection = await connectTestDatabase();
    database = drizzle({ client: connection.client, schema: s });
    const hash = await argon2.hash(password);
    await database.insert(s.users).values(accounts.map((account) => ({ ...account, passwordHash: hash, fullName: "Fictional HTTP User" })));
    await database.insert(s.employeeCategories).values({ id: categoryId, code: "FICTIONAL-" + randomUUID(), name: "Fictional HTTP Category" });
    await database.insert(s.studentProfiles).values(profileIds.map((id, index) => ({ id, userId: accounts[index]!.id, sapId: sapIds[index]!,
      registrationNumber: studentInput.registrationNumber, fatherName: studentInput.fatherName, program: studentInput.program, semester: studentInput.semester })));
    await database.insert(s.employees).values(employeeIds.map((id, index) => ({ id, userId: accounts[index + 2]!.id, categoryId,
      employeeNumber: "FICTIONAL-" + randomUUID(), fullName: "Fictional HTTP Employee", designation: "Fictional Teacher", facultyCode: "FC", departmentName: "Fictional Department" })));
    await database.insert(s.clearanceDepartments).values(departmentIds.map((id, index) => ({ id, code: "FICTIONAL-" + randomUUID(), name: `Fictional Area ${index + 1}` })));
    await database.insert(s.clearanceRules).values(ruleIds.map((id) => ({ id, code: "FICTIONAL-" + randomUUID(), metricKey: "fictional_ready", operator: "EQ" as const, expectedValue: true, failMessage: "PRIVATE SOURCE RULE MESSAGE" })));
    await database.insert(s.workflowTemplates).values({ id: templateId, categoryId, name: "Fictional HTTP Workflow", version: 1, isActive: true });
    await database.insert(s.workflowStageTemplates).values(departmentIds.map((departmentId, index) => ({ templateId, departmentId, ruleId: ruleIds[index]!, stepOrder: index + 1, isRequired: true })));
    for (const employeeId of employeeIds) {
      await database.insert(s.departmentDemoRecords).values([
        { employeeId, departmentId: departmentIds[0]!, values: { fictional_ready: true } },
        { employeeId, departmentId: departmentIds[1]!, values: { fictional_ready: false } },
      ]);
    }
    directory = await mkdtemp(join(tmpdir(), "issue26-http-"));
    const configPath = join(directory, "fictional-clearance.json");
    await writeFile(configPath, JSON.stringify({ questionnaireVersion: "v1", catalogVersion: "fictional-http-v1",
      allowIndependentVerification: true, studentCompletionPolicy: "DEPARTMENTS_ONLY", employeeFinalPolicy: "DEPARTMENTS_ONLY",
      hrScopes: { [accounts[6]!.id]: [categoryId] }, departmentCatalog: { [categoryId]: departmentIds },
      studentApplicability: [{ sapId: sapIds[0], determinations: s.studentDepartmentCodeEnum.enumValues.map((departmentCode) => ({ departmentCode,
        applicability: departmentCode === "LABORATORY" ? "NOT_REQUIRED" : "REQUIRED", source: "fictional-http-applicability-v1" })) }],
      studentVisibleReasons: { "fictional-http-rule-v1": { failed: "Fictional approved Student obligation.", incomplete: "Fictional Student evidence is incomplete." } },
      employeeVisibleReasons: { [ruleIds[1]!]: { failed: "Fictional approved Employee obligation." }, [ruleIds[2]!]: { incomplete: "Fictional Employee evidence is incomplete." } },
      studentFixtures: profileIds.flatMap((profileId, index) => s.studentDepartmentCodeEnum.enumValues.filter((code) => code !== "LABORATORY").map((departmentCode) => ({ profileId, departmentCode,
        evidence: { rule: { metricKey: "fictional_ready", operator: "EQ", expectedValue: true }, metrics: { fictional_ready: index === 0 || departmentCode !== "FEE_DUES" },
          ruleVersion: "fictional-http-rule-v1", datasetVersion: "fictional-http-data-v1", datasetUpdatedAt: "2026-11-25T00:00:00Z" } }))),
      recommendationPolicies: [{ categoryId, ruleVersion: "fictional-http-recommendations-v1", rules: questionnaireKeys.flatMap((answerKey) => ["YES", "NO", "NOT_SURE"].map((answer) => ({ answerKey, answer,
        departments: answerKey === "hdsDepartment" && answer === "NOT_SURE" ? [{ departmentId: departmentIds[0], reason: "Fictional explicitly configured suggestion." }] : [] }))) }],
    }));
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.CLEARANCE_CONFIG_PATH = configPath;
    process.env.JWT_SECRET = randomBytes(32).toString("base64url");
    vi.resetModules();
    app = (await import("../../app.js")).app;
    appPool = (await import("../../db/index.js")).pool;
    tokens = [];
    for (const account of accounts) {
      const response = await request(app).post("/api/v1/auth/login").send({ email: account.email, password });
      expect(response.status).toBe(200); expect(response.body.user.role).toBe(account.role);
      tokens.push(response.body.accessToken);
    }
  }, 30000);

  afterAll(async () => {
    try {
      if (database) {
        await database.transaction(async (tx) => {
          const studentRequests = await tx.select({ id: s.studentRequests.id }).from(s.studentRequests).where(inArray(s.studentRequests.studentProfileId, profileIds));
          const studentIds = studentRequests.map((item) => item.id);
          if (studentIds.length) {
            const departments = await tx.select({ id: s.studentRequestDepartments.id }).from(s.studentRequestDepartments).where(inArray(s.studentRequestDepartments.requestId, studentIds));
            await tx.delete(s.auditLogs).where(inArray(s.auditLogs.entityId, [...studentIds, ...departments.map((item) => item.id)]));
            await tx.delete(s.studentRequestDepartments).where(inArray(s.studentRequestDepartments.requestId, studentIds));
            await tx.delete(s.studentRequests).where(inArray(s.studentRequests.id, studentIds));
          }
          const cases = await tx.select({ id: s.clearanceRequests.id }).from(s.clearanceRequests).where(inArray(s.clearanceRequests.employeeId, employeeIds));
          const caseIds = cases.map((item) => item.id);
          if (caseIds.length) {
            await tx.delete(s.auditLogs).where(inArray(s.auditLogs.requestId, caseIds));
            await tx.delete(s.requestStages).where(inArray(s.requestStages.requestId, caseIds));
            await tx.delete(s.clearanceRequests).where(inArray(s.clearanceRequests.id, caseIds));
          }
          await tx.delete(s.departmentDemoRecords).where(inArray(s.departmentDemoRecords.employeeId, employeeIds));
          await tx.delete(s.workflowStageTemplates).where(eq(s.workflowStageTemplates.templateId, templateId));
          await tx.delete(s.workflowTemplates).where(eq(s.workflowTemplates.id, templateId));
          await tx.delete(s.clearanceRules).where(inArray(s.clearanceRules.id, ruleIds));
          await tx.delete(s.clearanceDepartments).where(inArray(s.clearanceDepartments.id, departmentIds));
          await tx.delete(s.studentProfiles).where(inArray(s.studentProfiles.id, profileIds));
          await tx.delete(s.employees).where(inArray(s.employees.id, employeeIds));
          await tx.delete(s.employeeCategories).where(eq(s.employeeCategories.id, categoryId));
          await tx.delete(s.users).where(inArray(s.users.id, accounts.map((item) => item.id)));
        });
      }
    } finally {
      await appPool?.end(); await connection?.close();
      for (const [name, value] of Object.entries({ DATABASE_URL: original.database, CLEARANCE_CONFIG_PATH: original.config, JWT_SECRET: original.secret })) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
      if (directory) {
        if (resolve(directory).startsWith(resolve(tmpdir(), "issue26-http-"))) await rm(directory, { recursive: true, force: true });
      }
    }
  });
  const auth = (index: number) => "Bearer " + tokens[index];
  const submit = async (index: number) => {
    const response = await request(app).post("/api/v1/employee/cases").set("Authorization", auth(index)).send(employeeInput);
    expect(response.status).toBe(201); return response.body.data;
  };
  const confirm = (id: string, ids: string[], revision = 0) => request(app).post(`/api/v1/hr/cases/${id}/confirm-departments`)
    .set("Authorization", auth(6)).send({ departmentIds: ids, expectedSelectionRevision: revision });

  it("returns saved Student completion, history and identical safe hold reasons through extended HTTP reads", async () => {
    const complete = await request(app).post("/api/v1/student/requests").set("Authorization", auth(0)).send(studentInput);
    expect(complete.status).toBe(201); expect(complete.body.data.status).toBe("COMPLETED");
    expect(complete.body.data.departments).toHaveLength(5);
    const closedDashboard = await request(app).get("/api/v1/student/dashboard").set("Authorization", auth(0));
    expect(closedDashboard.body.data.activeRequest).toBeNull();
    expect(closedDashboard.body.data.history.latestClosedRequest.id).toBe(complete.body.data.id);
    expect((await request(app).get(`/api/v1/student/requests/${complete.body.data.id}`).set("Authorization", auth(0))).body.data).toEqual(complete.body.data);
    const hold = await request(app).post("/api/v1/student/requests").set("Authorization", auth(1)).send(studentInput);
    expect(hold.status).toBe(201); expect(hold.body.data.status).toBe("IN_PROGRESS");
    expect(hold.body.data.departments[1]).toMatchObject({ status: "ACTION_REQUIRED", remarks: "Fictional approved Student obligation." });
    expect(hold.body.data.departments[3]).toMatchObject({ applicability: "UNDETERMINED", status: "PENDING", remarks: null });
    await database.update(s.studentRequestDepartments).set({ remarks: "PRIVATE HISTORICAL STUDENT NOTE" }).where(eq(s.studentRequestDepartments.requestId, hold.body.data.id));
    const dashboard = await request(app).get("/api/v1/student/dashboard").set("Authorization", auth(1));
    const detail = await request(app).get(`/api/v1/student/requests/${hold.body.data.id}`).set("Authorization", auth(1));
    expect(dashboard.body.data.departments).toEqual(detail.body.data.departments);
    expect(dashboard.body.data.progress).toEqual({ requiredCount: 4, clearedRequiredCount: 3, actionRequiredCount: 1, notRequiredCount: 0, undeterminedCount: 1 });
    expect(JSON.stringify(detail.body)).not.toMatch(/PRIVATE|verificationSnapshot|studentVisibleRemarks/);
    expect((await request(app).patch(`/api/v1/student/requests/${hold.body.data.id}/departments/LIBRARY`).set("Authorization", auth(1)).send({ status: "CLEARED" })).status).toBe(404);
  });
  it("persists pending answers and advice, then verifies only HR-selected departments and safely replays", async () => {
    const pending = await submit(2);
    expect(pending.status).toBe("PENDING_HR_VERIFICATION"); expect(pending.stages).toEqual([]); expect(pending.approvals).toEqual([]);
    expect(pending.questionnaireAnswers).toEqual(employeeInput.questionnaireAnswers);
    expect(pending.departmentRecommendation.status).toBe("AVAILABLE");
    expect(pending.departmentRecommendation.departments.map((item: { departmentId: string }) => item.departmentId)).toEqual([departmentIds[0]]);
    const queue = await request(app).get("/api/v1/hr/cases?status=PENDING_HR_VERIFICATION").set("Authorization", auth(6));
    expect(queue.status).toBe(200); expect(queue.body.data.some((item: { case: { id: string } }) => item.case.id === pending.id)).toBe(true);
    const review = await request(app).get(`/api/v1/hr/cases/${pending.id}`).set("Authorization", auth(6));
    expect(review.body.data.selectionRevision).toBe(0); expect(review.body.data.case.questionnaireAnswers).toEqual(employeeInput.questionnaireAnswers);
    const selected = [departmentIds[1]!, departmentIds[2]!];
    const response = await confirm(pending.id, selected);
    expect(response.status).toBe(200); expect(response.body.data.case.status).toBe("ACTION_REQUIRED");
    expect(response.body.data.case.stages.map((item: { status: string }) => item.status)).toEqual(["OUTSTANDING", "CHECKING"]);
    expect(response.body.data.case.stages.map((item: { outstandingNote: string }) => item.outstandingNote)).toEqual(["Fictional approved Employee obligation.", "Fictional Employee evidence is incomplete."]);
    expect(response.body.data.case.confirmedDepartmentIds).toEqual(selected);
    expect(response.body.data.case.departmentRecommendation).toEqual(pending.departmentRecommendation);
    expect(response.body.data.case.hrSelection.hrVerifiedById).toBe(accounts[6]!.id);
    const publicDetail = await request(app).get(`/api/v1/employee/cases/${pending.id}`).set("Authorization", auth(2));
    expect(publicDetail.status).toBe(200); expect(publicDetail.body.data.hrSelection).toEqual({ verifiedAt: response.body.data.case.hrSelection.verifiedAt, selectionRevision: 1 });
    expect(JSON.stringify(publicDetail.body)).not.toMatch(/PRIVATE|hrVerifiedById|verificationSnapshot|ruleSnapshot|checkedValue/);
    const list = await request(app).get("/api/v1/employee/cases?status=ACTION_REQUIRED").set("Authorization", auth(2));
    expect(list.body.data).toEqual([publicDetail.body.data]);
    const before = await database.select().from(s.auditLogs).where(eq(s.auditLogs.requestId, pending.id));
    expect((await confirm(pending.id, [...selected].reverse())).body).toEqual(response.body);
    expect(await database.select().from(s.auditLogs).where(eq(s.auditLogs.requestId, pending.id))).toEqual(before);
    expect((await confirm(pending.id, [departmentIds[0]!])).status).toBe(409);
    const stages = await database.select().from(s.requestStages).where(eq(s.requestStages.requestId, pending.id));
    expect(stages).toHaveLength(2); expect(stages.every((stage) => Array.isArray(stage.verificationSnapshot?.attempts))).toBe(true);
    expect(await database.select().from(s.requestStages).where(and(eq(s.requestStages.requestId, pending.id), eq(s.requestStages.departmentId, departmentIds[0]!)))).toEqual([]);
  });
  it("completes only a nonempty cleared selection under explicit final policy", async () => {
    const pending = await submit(3);
    const result = await confirm(pending.id, [departmentIds[0]!]);
    expect(result.status).toBe(200); expect(result.body.data.case.status).toBe("COMPLETED");
    expect(result.body.data.case.completedAt).not.toBeNull(); expect(result.body.data.case.approvals).toEqual([]);
    expect((await request(app).get(`/api/v1/employee/cases/${pending.id}`).set("Authorization", auth(3))).body.data.status).toBe("COMPLETED");
    expect((await submit(3)).status).toBe("PENDING_HR_VERIFICATION");
  });
  it("serializes different concurrent confirmations and deduplicates same-set confirmation", async () => {
    const pending = await submit(4);
    const results = await Promise.all([confirm(pending.id, [departmentIds[0]!]), confirm(pending.id, [departmentIds[1]!])]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const audits = await database.select().from(s.auditLogs).where(eq(s.auditLogs.requestId, pending.id));
    expect(audits.filter((audit) => audit.action === "EMPLOYEE_DEPARTMENTS_CONFIRMED")).toHaveLength(1);
    expect(audits.filter((audit) => audit.action === "EMPLOYEE_DEPARTMENT_VERIFIED")).toHaveLength(1);
    const samePending = await submit(5);
    const same = await Promise.all([confirm(samePending.id, [departmentIds[2]!]), confirm(samePending.id, [departmentIds[2]!])]);
    expect(same.map((result) => result.status)).toEqual([200, 200]); expect(same[0]!.body).toEqual(same[1]!.body);
    expect(same[0]!.body.data.case.status).toBe("IN_PROGRESS");
    const saved = await database.select().from(s.auditLogs).where(eq(s.auditLogs.requestId, samePending.id));
    expect(saved.filter((audit) => audit.action === "EMPLOYEE_DEPARTMENTS_CONFIRMED")).toHaveLength(1);
    expect(saved.filter((audit) => audit.action === "EMPLOYEE_DEPARTMENT_VERIFIED")).toHaveLength(1);
    await database.insert(s.departmentDemoRecords).values({ employeeId: employeeIds[3]!, departmentId: departmentIds[2]!, values: { fictional_ready: false } });
    const firstConnection = await connectTestDatabase(), secondConnection = await connectTestDatabase();
    try {
      const first = drizzle({ client: firstConnection.client, schema: s });
      const second = drizzle({ client: secondConnection.client, schema: s });
      const retries = await Promise.all([retryEmployeeVerification(first, samePending.id), retryEmployeeVerification(second, samePending.id)]);
      expect(retries.map((result) => result.status)).toEqual(["ACTION_REQUIRED", "ACTION_REQUIRED"]);
      const retryAudits = await database.select().from(s.auditLogs).where(and(eq(s.auditLogs.requestId, samePending.id), eq(s.auditLogs.action, "EMPLOYEE_DEPARTMENT_VERIFIED")));
      expect(retryAudits).toHaveLength(2);
    } finally { await firstConnection.close(); await secondConnection.close(); }
  });
  it("enforces roles, scope, ownership and strict HR inputs through the configured app", async () => {
    for (const index of [0, 2, 8, 9]) expect((await request(app).get("/api/v1/hr/cases").set("Authorization", auth(index))).status).toBe(403);
    expect((await request(app).get("/api/v1/hr/cases").set("Authorization", auth(7))).status).toBe(403);
    expect((await request(app).get("/api/v1/hr/cases?employeeId=" + employeeIds[0]).set("Authorization", auth(6))).status).toBe(422);
    expect((await request(app).get("/api/v1/hr/cases/" + randomUUID()).set("Authorization", auth(6))).status).toBe(404);
    expect((await request(app).get("/api/v1/hr/cases/not-a-uuid").set("Authorization", auth(6))).status).toBe(422);
    const owned = await request(app).get("/api/v1/employee/cases").set("Authorization", auth(2));
    const id = owned.body.data[0].id;
    expect((await request(app).get(`/api/v1/employee/cases/${id}`).set("Authorization", auth(3))).status).toBe(404);
    for (const body of [{ departmentIds: [], expectedSelectionRevision: 0 }, { departmentIds: [departmentIds[0], departmentIds[0]], expectedSelectionRevision: 0 },
      { departmentIds: [departmentIds[0]], expectedSelectionRevision: 0, status: "CLEARED" }]) {
      expect((await request(app).post(`/api/v1/hr/cases/${id}/confirm-departments`).set("Authorization", auth(6)).send(body)).status).toBe(422);
    }
    await database.update(s.users).set({ isActive: false }).where(eq(s.users.id, accounts[6]!.id));
    expect((await request(app).get("/api/v1/hr/cases").set("Authorization", auth(6))).status).toBe(401);
  });
});
