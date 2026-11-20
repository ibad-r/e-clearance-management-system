import { describe, expect, it } from "vitest";
import { createStudentRequestSchema } from "./student.schemas";
import { initialApplicability, studentProgress, validateDeterminations } from "./student.policy";
import type { StudentDepartment, StudentProfile } from "./student.types";

const submission = { registrationNumber: "001-FICTIONAL", fatherName: "Fictional Parent", program: "Fictional Program", semester: "08", reason: "degree completed" };
const profile: StudentProfile = { ...submission, sapId: "000001", studentName: "Fictional Student" };

describe("Student submission validation and applicability", () => {
  it("preserves opaque academic strings and accepts both approved reasons", () => {
    expect(createStudentRequestSchema.parse(submission)).toEqual(submission);
    expect(createStudentRequestSchema.parse({ ...submission, reason: "discontinuing studies" }).reason).toBe("discontinuing studies");
  });
  it.each(["registrationNumber", "fatherName", "program", "semester", "reason"])("rejects a missing, null or blank %s", (field) => {
    const missing = { ...submission } as Record<string, unknown>;
    delete missing[field];
    for (const input of [missing, { ...submission, [field]: null }, { ...submission, [field]: "  " }]) {
      expect(createStudentRequestSchema.safeParse(input).success).toBe(false);
    }
  });
  it.each(["sapId", "studentName", "studentId", "userId", "role", "status", "departments", "requestReference"])("rejects client-controlled %s", (field) => {
    expect(createStudentRequestSchema.safeParse({ ...submission, [field]: "spoofed" }).success).toBe(false);
  });
  it("rejects numeric semester and an invented reason", () => {
    expect(createStudentRequestSchema.safeParse({ ...submission, semester: 8 }).success).toBe(false);
    expect(createStudentRequestSchema.safeParse({ ...submission, reason: "other" }).success).toBe(false);
  });
  it("initializes exactly five departments and keeps Laboratory unresolved", async () => {
    const rows = validateDeterminations(await initialApplicability(profile));
    expect(rows.filter((row) => row.applicability === "REQUIRED")).toHaveLength(4);
    expect(rows.find((row) => row.departmentCode === "LABORATORY")?.applicability).toBe("UNDETERMINED");
  });
  it("rejects missing, duplicated, invalid or untraceable configuration", async () => {
    const rows = await initialApplicability(profile);
    for (const invalid of [rows.slice(1), [...rows.slice(1), rows[1]], rows.map((row) => ({ ...row, source: "" })), rows.map((row) => ({ ...row, applicability: "UNKNOWN" }))]) {
      expect(() => validateDeterminations(invalid)).toThrow("configuration");
    }
  });
  it("counts unresolved applicability, exemptions, outstanding work and recorded clearances separately", () => {
    const rows = [
      { applicability: "REQUIRED", status: "CLEARED" }, { applicability: "REQUIRED", status: "ACTION_REQUIRED" },
      { applicability: "REQUIRED", status: "PENDING" }, { applicability: "NOT_REQUIRED", status: "NOT_REQUIRED" },
      { applicability: "UNDETERMINED", status: "PENDING" },
    ] as StudentDepartment[];
    expect(studentProgress(rows)).toEqual({ requiredCount: 3, clearedRequiredCount: 1, actionRequiredCount: 1, notRequiredCount: 1, undeterminedCount: 1 });
  });
});
