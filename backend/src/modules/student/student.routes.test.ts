import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/errorHandler";
import { createStudentRouter } from "./student.routes";
import { StudentApiError } from "./student.errors";
import type { StudentRequest, StudentService } from "./student.types";

const identity = { userId: randomUUID(), role: "STUDENT" };
const input = { registrationNumber: "001", fatherName: "Fictional Parent", program: "Fictional Program", semester: "8", reason: "degree completed" as const };
const profile = { sapId: "0001", studentName: "Fictional Student", registrationNumber: input.registrationNumber, fatherName: input.fatherName, program: input.program, semester: input.semester };
const item: StudentRequest = { ...profile, id: randomUUID(), requestReference: "FICTIONAL-REFERENCE", reason: input.reason, status: "IN_PROGRESS", isActive: true, submittedAt: new Date().toISOString(), closedAt: null, departments: [] };
function setup(principal: unknown = identity) {
  const service = {
    getProfile: vi.fn().mockResolvedValue({ ...profile, passwordHash: "private", userId: randomUUID() }),
    getDashboard: vi.fn().mockResolvedValue({ profile, activeRequest: null, departments: [], progress: null, history: { closedRequestCount: 0, latestClosedRequest: null } }),
    createRequest: vi.fn().mockResolvedValue({ ...item, passwordHash: "private", studentProfileId: randomUUID() }),
    listRequests: vi.fn().mockResolvedValue([item]), getRequest: vi.fn().mockResolvedValue(item),
  };
  const app = express();
  app.use(express.json());
  app.use("/student", createStudentRouter(service as StudentService, () => principal));
  app.use(errorHandler);
  return { app, service };
}
describe("Student HTTP contract", () => {
  it("returns an allowlisted profile from verified identity despite custom identity headers", async () => {
    const { app, service } = setup();
    const response = await request(app).get("/student/profile").set("x-user-id", randomUUID()).set("x-role", "SYSTEM_ADMIN");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: profile });
    expect(service.getProfile).toHaveBeenCalledWith(identity);
  });
  it("submits only validated fields and returns a persisted request with HTTP 201", async () => {
    const { app, service } = setup();
    const response = await request(app).post("/student/requests").send(input);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: item });
    expect(service.createRequest).toHaveBeenCalledWith(identity, input);
  });
  it.each([undefined, { ...identity, role: "EMPLOYEE" }])("requires a verified Student principal", async (principal) => {
    const { app, service } = setup(principal ?? null);
    const response = await request(app).get("/student/profile");
    expect(response.status).toBe(principal ? 403 : 401);
    expect(service.getProfile).not.toHaveBeenCalled();
  });
  it("rejects client identity, invalid JSON, missing fields, UUIDs and query selectors", async () => {
    const { app, service } = setup();
    expect((await request(app).post("/student/requests").send({ ...input, sapId: "spoofed" })).status).toBe(422);
    expect((await request(app).post("/student/requests").send({})).status).toBe(422);
    expect((await request(app).post("/student/requests").set("Content-Type", "application/json").send("{")).status).toBe(400);
    expect((await request(app).get("/student/requests/not-a-uuid")).status).toBe(422);
    for (const path of ["/profile", "/dashboard", "/requests", "/requests/" + item.id]) {
      expect((await request(app).get("/student" + path).query({ userId: randomUUID() })).status).toBe(422);
    }
    expect(service.createRequest).not.toHaveBeenCalled();
    expect(service.getRequest).not.toHaveBeenCalled();
  });
  it("returns request summaries and an empty dashboard", async () => {
    const { app } = setup();
    const response = await request(app).get("/student/requests");
    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data[0]).sort()).toEqual(["id", "requestReference", "reason", "status", "isActive", "submittedAt", "closedAt"].sort());
    expect((await request(app).get("/student/dashboard")).body.data).toEqual({ profile, activeRequest: null, departments: [], progress: null, history: { closedRequestCount: 0, latestClosedRequest: null } });
  });
  it("hides internal fields and remarks even if the service returns them", async () => {
    const { app, service } = setup();
    service.getRequest.mockResolvedValue({ ...item, departments: [{ departmentCode: "LIBRARY", displayName: "Library", applicability: "REQUIRED", status: "PENDING", remarks: "private staff remark", updatedAt: null, applicabilitySource: "private source" }] });
    const response = await request(app).get("/student/requests/" + item.id);
    expect(response.body.data.departments[0]).toEqual({ departmentCode: "LIBRARY", displayName: "Library", applicability: "REQUIRED", status: "PENDING", remarks: null, updatedAt: null });
  });
  it("returns a controlled conflict and missing-profile error", async () => {
    const { app, service } = setup();
    service.createRequest.mockRejectedValue(new StudentApiError(409, "ACTIVE_REQUEST_EXISTS", "An active clearance request already exists"));
    expect((await request(app).post("/student/requests").send(input)).body.error.code).toBe("ACTIVE_REQUEST_EXISTS");
    service.getProfile.mockRejectedValue(new StudentApiError(404, "STUDENT_PROFILE_NOT_FOUND", "Student profile not found"));
    expect((await request(app).get("/student/profile")).status).toBe(404);
  });
  it("sanitizes unexpected service errors", async () => {
    const { app, service } = setup();
    service.getProfile.mockRejectedValue(new Error("postgres://private:secret"));
    const logging = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await request(app).get("/student/profile");
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } });
    } finally { logging.mockRestore(); }
  });
  it("provides no Student status or approval write endpoint", async () => {
    const { app } = setup();
    expect((await request(app).patch("/student/requests/" + item.id).send({ status: "COMPLETED" })).status).toBe(404);
  });
});
