import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { app as productionApp } from "../../app";
import { errorHandler } from "../../middleware/errorHandler";
import type { VerifiedIdentityResolver } from "./employee.auth";
import { EmployeeApiError } from "./employee.errors";
import { createEmployeeRouter } from "./employee.routes";
import type { EmployeeCase, EmployeeCaseService, EmployeeProfile, VerifiedEmployeeIdentity } from "./employee.types";

const prefix = "/api/v1/employee";
const identity: VerifiedEmployeeIdentity = { userId: randomUUID(), role: "EMPLOYEE" };
const categoryId = randomUUID();
const employeeId = randomUUID();
const caseId = randomUUID();
const stageId = randomUUID();
const timestamp = "2026-10-30T09:00:00.000Z";
const submission = { lastWorkingDate: "2026-11-01", reasonForLeaving: "Fictional test reason" };

const profile: EmployeeProfile = {
  id: employeeId,
  employeeNumber: "FICTIONAL-EMPLOYEE",
  fullName: "Fictional Employee",
  designation: "Fictional Designation",
  facultyCode: "FC",
  departmentName: "Fictional Department",
  joiningDate: "2020-01-01",
  categoryId,
  category: { id: categoryId, code: "FICTIONAL", name: "Fictional Category" },
};

const employeeCase: EmployeeCase = {
  id: caseId,
  requestCode: "FICTIONAL-REQUEST",
  employeeId,
  status: "IN_PROGRESS",
  reasonForLeaving: submission.reasonForLeaving,
  lastWorkingDate: submission.lastWorkingDate,
  employeeRemarks: null,
  initiatedAt: timestamp,
  submittedAt: timestamp,
  completedAt: null,
  cancelledAt: null,
  stages: [{
    id: stageId,
    departmentId: randomUUID(),
    departmentCode: "FICTIONAL-DEPARTMENT",
    departmentName: "Fictional Department",
    stepOrder: 1,
    isRequired: true,
    status: "LOCKED",
    outstandingNote: null,
    startedAt: null,
    lastCheckedAt: null,
    clearedAt: null,
  }],
  approvals: [{
    id: randomUUID(),
    positionId: randomUUID(),
    positionTitle: "Fictional Authority",
    stepOrder: 1,
    isRequired: true,
    status: "WAITING",
  }],
  issues: [{
    id: randomUUID(),
    requestStageId: stageId,
    status: "OPEN",
    reason: "Fictional issue",
    openedAt: timestamp,
    resolvedAt: null,
  }],
  certificateId: null,
  progress: { totalStages: 1, clearedStages: 0, outstandingStages: 0, skippedStages: 0 },
};

function mockService() {
  return {
    getProfile: vi.fn<EmployeeCaseService["getProfile"]>().mockResolvedValue(profile),
    createCase: vi.fn<EmployeeCaseService["createCase"]>().mockResolvedValue(employeeCase),
    listCases: vi.fn<EmployeeCaseService["listCases"]>().mockResolvedValue([employeeCase]),
    getCase: vi.fn<EmployeeCaseService["getCase"]>().mockResolvedValue(employeeCase),
  } satisfies EmployeeCaseService;
}

function testApp(
  resolver: VerifiedIdentityResolver,
  service = mockService(),
) {
  const app = express();
  app.use(express.json());
  app.use(prefix, createEmployeeRouter(service, resolver));
  app.use(errorHandler);
  return { app, service };
}

function expectNoServiceCalls(service: ReturnType<typeof mockService>) {
  for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
}

describe("prepared employee routes with test-only verified principals", () => {
  it("returns the authenticated employee profile", async () => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).get(`${prefix}/profile`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: profile });
    expect(service.getProfile).toHaveBeenCalledExactlyOnceWith(identity);
  });

  it("creates a submitted case with only validated employee fields and server identity", async () => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).post(`${prefix}/cases`).send({
      ...submission,
      reasonForLeaving: ` ${submission.reasonForLeaving} `,
      employeeRemarks: "  Fictional remarks  ",
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: employeeCase });
    expect(service.createCase).toHaveBeenCalledExactlyOnceWith(identity, {
      ...submission,
      employeeRemarks: "Fictional remarks",
    });
  });

  it("lists cases using the authenticated employee and validated status filter", async () => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).get(`${prefix}/cases?status=IN_PROGRESS`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [employeeCase] });
    expect(service.listCases).toHaveBeenCalledExactlyOnceWith(identity, { status: "IN_PROGRESS" });
  });

  it("allows an empty owned-case history without creating sample cases", async () => {
    const { app, service } = testApp(() => identity);
    service.listCases.mockResolvedValue([]);
    const response = await request(app).get(`${prefix}/cases`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(service.listCases).toHaveBeenCalledExactlyOnceWith(identity, {});
    expect(service.createCase).not.toHaveBeenCalled();
  });

  it("passes trusted identity and the validated case ID to the ownership-enforcing service", async () => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).get(`${prefix}/cases/${caseId}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: employeeCase });
    expect(service.getCase).toHaveBeenCalledExactlyOnceWith(identity, caseId);
  });

  it("does not take identity from HTTP body, query or headers", async () => {
    const { app, service } = testApp(() => identity);
    const forgedId = randomUUID();
    const response = await request(app)
      .get(`${prefix}/profile?userId=${forgedId}&role=SYSTEM_ADMIN`)
      .set("x-user-id", forgedId)
      .set("x-role", "SYSTEM_ADMIN")
      .send({ userId: forgedId, employeeId: randomUUID(), role: "SYSTEM_ADMIN" });
    expect(response.status).toBe(200);
    expect(service.getProfile).toHaveBeenCalledExactlyOnceWith(identity);
  });

  it.each([
    undefined,
    null,
    {},
    { userId: "not-a-uuid", role: "EMPLOYEE" },
    { userId: identity.userId },
    { userId: identity.userId, role: "employee" },
    { userId: identity.userId, role: "EMPLOYEE", unverified: true },
  ])("rejects missing or malformed verified identity before any service call (%#)", async (principal) => {
    const { app, service } = testApp(() => principal);
    const response = await request(app).post(`${prefix}/cases`).send(submission);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    expectNoServiceCalls(service);
  });

  it.each(["HR_OFFICER", "APPROVER", "SYSTEM_ADMIN"])("rejects a verified %s role", async (role) => {
    const { app, service } = testApp(() => ({ userId: identity.userId, role }));
    const response = await request(app).get(`${prefix}/cases`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expectNoServiceCalls(service);
  });

  it("cannot turn an unverified header or token into a principal", async () => {
    const { app, service } = testApp(() => undefined);
    const response = await request(app).get(`${prefix}/profile`)
      .set("x-user-id", identity.userId)
      .set("Authorization", "Bearer FICTIONAL_UNVERIFIED_TOKEN");
    expect(response.status).toBe(401);
    expectNoServiceCalls(service);
  });

  it.each(["employeeId", "initiatedById", "userId", "role", "status", "templateId"])(
    "rejects client-controlled %s during submission",
    async (field) => {
      const { app, service } = testApp(() => identity);
      const response = await request(app).post(`${prefix}/cases`).send({ ...submission, [field]: randomUUID() });
      expect(response.status).toBe(422);
      expect(response.body).toEqual({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } });
      expect(service.createCase).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...submission, lastWorkingDate: "2026-02-29" },
    { ...submission, lastWorkingDate: "2026-11-01T00:00:00Z" },
    { ...submission, reasonForLeaving: "  " },
    { ...submission, employeeRemarks: "r".repeat(1001) },
    {},
    [],
  ])("returns a controlled 422 for invalid submission data (%#)", async (body) => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).post(`${prefix}/cases`).send(body);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(service.createCase).not.toHaveBeenCalled();
  });

  it.each([
    "status=unknown",
    "status=IN_PROGRESS&status=COMPLETED",
    "employeeId=forged",
    "userId=forged",
  ])("rejects invalid or identity-controlling case-list query %s", async (query) => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).get(`${prefix}/cases?${query}`);
    expect(response.status).toBe(422);
    expect(service.listCases).not.toHaveBeenCalled();
  });

  it("rejects malformed case IDs before querying ownership", async () => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).get(`${prefix}/cases/not-a-uuid`);
    expect(response.status).toBe(422);
    expect(service.getCase).not.toHaveBeenCalled();
  });

  it("returns the same controlled not-found response for inaccessible case IDs", async () => {
    const { app, service } = testApp(() => identity);
    service.getCase.mockRejectedValue(new EmployeeApiError(404, "NOT_FOUND", "Clearance case not found"));
    const response = await request(app).get(`${prefix}/cases/${randomUUID()}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "Clearance case not found" } });
  });

  it.each([
    [403, "FORBIDDEN", "Employee access required"],
    [409, "ACTIVE_CASE_EXISTS", "An active clearance case already exists"],
    [503, "WORKFLOW_NOT_CONFIGURED", "No active clearance workflow is configured"],
    [503, "WORKFLOW_CONFIGURATION_INVALID", "The clearance workflow configuration is incomplete"],
  ] as const)("preserves controlled service error %i/%s", async (status, code, message) => {
    const { app, service } = testApp(() => identity);
    service.createCase.mockRejectedValue(new EmployeeApiError(status, code, message));
    const response = await request(app).post(`${prefix}/cases`).send(submission);
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: { code, message } });
  });

  it("hides unexpected service failures and database details", async () => {
    const { app, service } = testApp(() => identity);
    service.createCase.mockRejectedValue(new Error("PRIVATE_DATABASE_AND_AUTH_DETAILS"));
    const response = await request(app).post(`${prefix}/cases`).send(submission);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } });
    expect(response.text).not.toContain("PRIVATE_DATABASE_AND_AUTH_DETAILS");
  });

  it("sanitizes resolver failures without invoking the service", async () => {
    const { app, service } = testApp(() => { throw new Error("PRIVATE_VERIFIER_DETAILS"); });
    const response = await request(app).get(`${prefix}/profile`);
    expect(response.status).toBe(500);
    expect(response.text).not.toContain("PRIVATE_VERIFIER_DETAILS");
    expectNoServiceCalls(service);
  });

  it("whitelists profile fields even if a future service accidentally returns internal fields", async () => {
    const { app, service } = testApp(() => identity);
    const internalProfile = {
      ...profile,
      passwordHash: "PRIVATE_HASH",
      category: { ...profile.category, internalNotes: "PRIVATE_CATEGORY" },
    };
    service.getProfile.mockResolvedValue(internalProfile);
    const response = await request(app).get(`${prefix}/profile`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: profile });
    expect(response.text).not.toContain("PRIVATE_");
  });

  it("whitelists nested case fields and excludes auth, rule internals and private approval data", async () => {
    const { app, service } = testApp(() => identity);
    const internalCase = {
      ...employeeCase,
      passwordHash: "PRIVATE_HASH",
      verificationToken: "PRIVATE_CERTIFICATE_TOKEN",
      stages: employeeCase.stages.map((stage) => ({ ...stage, ruleSnapshot: { internal: "PRIVATE_RULE" } })),
      approvals: employeeCase.approvals.map((approval) => ({ ...approval, remarks: "PRIVATE_DECISION" })),
      issues: employeeCase.issues.map((issue) => ({ ...issue, internalNotes: "PRIVATE_RESOLUTION" })),
      progress: { ...employeeCase.progress, internalNotes: "PRIVATE_PROGRESS" },
    };
    service.getCase.mockResolvedValue(internalCase);
    const response = await request(app).get(`${prefix}/cases/${caseId}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: employeeCase });
    expect(response.text).not.toContain("PRIVATE_");
  });

  it("requires an explicit verified identity resolver at construction", () => {
    expect(() => createEmployeeRouter(mockService(), undefined as unknown as VerifiedIdentityResolver))
      .toThrow("An explicit verified identity resolver is required");
  });

  it("preserves the existing malformed-JSON behavior", async () => {
    const { app, service } = testApp(() => identity);
    const response = await request(app).post(`${prefix}/cases`)
      .set("Content-Type", "application/json").send('{"invalid":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expectNoServiceCalls(service);
  });
});

describe("production employee route mounting remains disabled", () => {
  it.each([`${prefix}/profile`, `${prefix}/cases`, `${prefix}/cases/${caseId}`])(
    "does not expose GET %s before verified authentication integration",
    async (path) => {
      const response = await request(productionApp).get(path);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    },
  );

  it("does not expose employee creation in the production app", async () => {
    const response = await request(productionApp).post(`${prefix}/cases`).send(submission);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
