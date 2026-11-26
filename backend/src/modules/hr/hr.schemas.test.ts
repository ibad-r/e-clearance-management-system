import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  confirmDepartmentsSchema,
  hrListSchema,
  hrEmptyQuerySchema,
} from "./hr.schemas";

const id = randomUUID();

describe("HR request validation", () => {
  it("accepts valid department selection", () => {
    expect(confirmDepartmentsSchema.safeParse({
      departmentIds: [id],
      expectedSelectionRevision: 0,
    }).success).toBe(true);
  });

  it("rejects invalid or duplicate department IDs", () => {
    for (const departmentIds of [
      [],
      ["invalid"],
      [id, id],
      [id, id.toUpperCase()],
      Array.from({ length: 15 }, () => randomUUID()),
    ]) {
      expect(confirmDepartmentsSchema.safeParse({
        departmentIds,
        expectedSelectionRevision: 0,
      }).success).toBe(false);
    }
  });

  it("rejects invalid revisions", () => {
    for (const revision of [-1, 0.5, "0", null, undefined]) {
      expect(confirmDepartmentsSchema.safeParse({
        departmentIds: [id],
        expectedSelectionRevision: revision,
      }).success).toBe(false);
    }
  });

  it("rejects client-supplied clearance results", () => {
    for (const field of [
      "status", "results", "cleared", "actorUserId",
      "employeeId", "templateId", "ruleSnapshot",
    ]) {
      expect(confirmDepartmentsSchema.safeParse({
        departmentIds: [id],
        expectedSelectionRevision: 0,
        [field]: "forged",
      }).success).toBe(false);
    }
  });

  it("validates the HR queue filter", () => {
    expect(hrListSchema.safeParse({
      status: "PENDING_HR_VERIFICATION",
    }).success).toBe(true);

    expect(hrListSchema.safeParse({
      employeeId: id,
    }).success).toBe(false);
  });

  it("rejects extra detail query fields", () => {
    expect(hrEmptyQuerySchema.safeParse({
      role: "SYSTEM_ADMIN",
    }).success).toBe(false);
  });
});
