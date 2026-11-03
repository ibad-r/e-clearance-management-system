import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { caseIdSchema, createCaseSchema, listCasesQuerySchema } from "./employee.schemas";

describe("employee case submission validation", () => {
  const validSubmission = {
    lastWorkingDate: "2026-11-01",
    reasonForLeaving: "Fictional reason",
  };

  it("returns date-only input and trimmed employee-supplied text", () => {
    expect(createCaseSchema.parse({
      ...validSubmission,
      reasonForLeaving: "  Fictional reason  ",
      employeeRemarks: "  Fictional remarks  ",
    })).toEqual({ ...validSubmission, employeeRemarks: "Fictional remarks" });
  });

  it("preserves omitted, null and empty optional remarks", () => {
    expect(createCaseSchema.parse(validSubmission)).toEqual(validSubmission);
    expect(createCaseSchema.parse({ ...validSubmission, employeeRemarks: null }).employeeRemarks).toBeNull();
    expect(createCaseSchema.parse({ ...validSubmission, employeeRemarks: "   " }).employeeRemarks).toBe("");
  });

  it.each(["2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])("accepts calendar date %s without a policy cutoff", (lastWorkingDate) => {
    expect(createCaseSchema.safeParse({ ...validSubmission, lastWorkingDate }).success).toBe(true);
  });

  it.each([
    "2026-02-29", "1900-02-29", "2026-04-31", "2026-02-30", "2026-13-01",
    "2026-00-01", "2026-10-00", "0000-01-01", "2026-1-01", "26-11-01",
    "2026-11-01T00:00:00Z", "2026-11-01T00:00:00+05:00", " 2026-11-01", "2026-11-01 ", "",
  ])("rejects invalid or non-date-only value %j", (lastWorkingDate) => {
    expect(createCaseSchema.safeParse({ ...validSubmission, lastWorkingDate }).success).toBe(false);
  });

  it("accepts both reason length boundaries after trimming", () => {
    for (const reasonForLeaving of ["abc", "a".repeat(500)]) {
      expect(createCaseSchema.safeParse({ ...validSubmission, reasonForLeaving: ` ${reasonForLeaving} ` }).success).toBe(true);
    }
  });

  it.each(["", "   ", "ab", "a".repeat(501)])("rejects reason outside the trimmed bounds", (reasonForLeaving) => {
    expect(createCaseSchema.safeParse({ ...validSubmission, reasonForLeaving }).success).toBe(false);
  });

  it("enforces the remark length after trimming", () => {
    const employeeRemarks = "r".repeat(1000);
    expect(createCaseSchema.parse({ ...validSubmission, employeeRemarks: ` ${employeeRemarks} ` }).employeeRemarks)
      .toBe(employeeRemarks);
    expect(createCaseSchema.safeParse({ ...validSubmission, employeeRemarks: "r".repeat(1001) }).success)
      .toBe(false);
  });

  it.each([
    { reasonForLeaving: "Fictional reason" },
    { lastWorkingDate: "2026-11-01" },
    { ...validSubmission, lastWorkingDate: null },
    { ...validSubmission, lastWorkingDate: new Date("2026-11-01") },
    { ...validSubmission, reasonForLeaving: null },
    { ...validSubmission, reasonForLeaving: 123 },
    { ...validSubmission, employeeRemarks: false },
    null,
    [],
  ])("rejects missing or incorrectly typed submission fields", (input) => {
    expect(createCaseSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    "employeeId", "initiatedBy", "initiatedById", "userId", "role", "status",
    "templateId", "requestCode", "submittedAt", "stages", "approvals", "unexpected",
  ])("rejects client-controlled field %s", (field) => {
    expect(createCaseSchema.safeParse({ ...validSubmission, [field]: randomUUID() }).success).toBe(false);
  });
});

describe("employee case path and query validation", () => {
  it("accepts a UUID case ID", () => {
    const id = randomUUID();
    expect(caseIdSchema.parse(id)).toBe(id);
  });

  it.each(["not-a-uuid", "123", "", 123, null, [], {}])("rejects malformed case ID %j", (value) => {
    expect(caseIdSchema.safeParse(value).success).toBe(false);
  });

  it("allows an omitted status filter", () => {
    expect(listCasesQuerySchema.parse({})).toEqual({});
  });

  it.each([
    "PENDING_SUBMISSION", "IN_PROGRESS", "ACTION_REQUIRED", "AWAITING_APPROVAL",
    "RETURNED_FOR_CORRECTION", "COMPLETED", "CANCELLED",
  ])("accepts status %s", (status) => {
    expect(listCasesQuerySchema.parse({ status })).toEqual({ status });
  });

  it.each([
    { status: "in_progress" }, { status: "NOT_VALID" }, { status: "" }, { status: null },
    { status: ["IN_PROGRESS", "COMPLETED"] }, { status: { value: "IN_PROGRESS" } },
    { employeeId: randomUUID() }, { userId: randomUUID() }, { role: "EMPLOYEE" }, { limit: "10" },
  ])("rejects invalid status representations and extra query controls", (query) => {
    expect(listCasesQuerySchema.safeParse(query).success).toBe(false);
  });
});
