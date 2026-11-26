import { describe, expect, it } from "vitest";
import { studentDepartmentCodeEnum } from "../../db/schema";
import { employeeAggregate, evidenceFingerprint, studentCanComplete, visibleText } from "./verification.policy";
import { buildClearanceOptions } from "./clearance.config";

describe("Verification aggregation and safe projection", () => {
  const rows = () => studentDepartmentCodeEnum.enumValues.map((departmentCode) => ({ departmentCode, applicability: "REQUIRED", status: "CLEARED" }));
  it("requires the complete unique Student roster with resolved applicability", () => {
    expect(studentCanComplete(rows())).toBe(true);
    expect(studentCanComplete(rows().slice(1))).toBe(false);
    expect(studentCanComplete([...rows().slice(1), rows()[1]!])).toBe(false);
    for (const state of ["PENDING", "IN_REVIEW", "ACTION_REQUIRED"]) {
      const list = rows(); list[0]!.status = state; expect(studentCanComplete(list)).toBe(false);
    }
    const list = rows(); list[3] = { ...list[3]!, applicability: "UNDETERMINED", status: "PENDING" };
    expect(studentCanComplete(list)).toBe(false);
    list[3] = { ...list[3]!, applicability: "NOT_REQUIRED", status: "NOT_REQUIRED" };
    expect(studentCanComplete(list)).toBe(true);
  });
  it("keeps zero, skipped, incomplete and unconfigured Employee cases active", () => {
    expect(employeeAggregate([], "DEPARTMENTS_ONLY")).toBe("IN_PROGRESS");
    expect(employeeAggregate([{ status: "CLEARED" }])).toBe("IN_PROGRESS");
    expect(employeeAggregate([{ status: "CLEARED" }], "DEPARTMENTS_ONLY")).toBe("COMPLETED");
    for (const state of ["CHECKING", "RECHECKING", "LOCKED", "SKIPPED"]) {
      expect(employeeAggregate([{ status: "CLEARED" }, { status: state }], "DEPARTMENTS_ONLY")).toBe("IN_PROGRESS");
    }
    expect(employeeAggregate([{ status: "CHECKING" }, { status: "OUTSTANDING" }], "DEPARTMENTS_ONLY")).toBe("ACTION_REQUIRED");
  });
  it("rejects markup, control characters and overlong reasons", () => {
    for (const value of [null, "", "<script>bad</script>", "a\nb", "a".repeat(501)]) expect(visibleText(value)).toBeNull();
    expect(visibleText(" Fictional approved reason. ")).toBe("Fictional approved reason.");
  });
  it("deduplicates evidence independent of object key order", () => {
    expect(evidenceFingerprint({ a: 1, b: { c: true, d: "x" } }))
      .toBe(evidenceFingerprint({ b: { d: "x", c: true }, a: 1 }));
    expect(evidenceFingerprint({ a: 1 })).not.toBe(evidenceFingerprint({ a: "1" }));
  });
  it("keeps completion, public wording and rechecks closed unless configured", () => {
    const options = buildClearanceOptions({});
    expect(options.student.allowAutomaticCompletion).toBe(false);
    expect(options.hr.finalPolicy).toBeUndefined();
    expect(options.hr.allowOutstandingRecheck).toBe(false);
    expect(options.student.visibleReasons).toEqual({});
    expect(() => buildClearanceOptions({ studentCompletionPolicy: "invented" })).toThrow();
    expect(() => buildClearanceOptions({ studentVisibleReasons: { v1: { failed: "<b>bad</b>" } } })).toThrow();
  });
});
