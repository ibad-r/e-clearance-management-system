import { z } from "zod";
import { studentApplicabilityEnum, studentDepartmentCodeEnum } from "../../db/schema/student";
import { StudentApiError } from "./student.errors";
import type { Applicability, DepartmentCode, StudentDepartment, StudentProfile, StudentProgress } from "./student.types";

export const departmentNames: Record<DepartmentCode, string> = {
  LIBRARY: "Library", FEE_DUES: "Fee & Dues Department", STUDENT_SERVICE: "Student Service Department",
  LABORATORY: "Laboratory", COORDINATION_OFFICE: "Coordination Office",
};
export interface DepartmentDetermination {
  departmentCode: DepartmentCode;
  applicability: Applicability;
  source: string;
}
export type ApplicabilityResolver = (profile: Readonly<StudentProfile>) =>
  DepartmentDetermination[] | Promise<DepartmentDetermination[]>;

// Initial rules approved by the project owner in this chat on 13 November 2026.
// Replace this server-owned resolver when an eligibility source is agreed.
export const initialApplicability: ApplicabilityResolver = () => studentDepartmentCodeEnum.enumValues.map((departmentCode) => ({
  departmentCode,
  applicability: departmentCode === "LABORATORY" ? "UNDETERMINED" : "REQUIRED",
  source: "owner-approved-initial-rules-2026-11-13",
}));

const determinationSchema = z.array(z.strictObject({
  departmentCode: z.enum(studentDepartmentCodeEnum.enumValues),
  applicability: z.enum(studentApplicabilityEnum.enumValues),
  source: z.string().trim().min(1),
})).length(5);

export function validateDeterminations(value: unknown): DepartmentDetermination[] {
  const result = determinationSchema.safeParse(value);
  if (!result.success || new Set(result.data.map((item) => item.departmentCode)).size !== 5) {
    throw new StudentApiError(503, "STUDENT_CONFIGURATION_INVALID", "Student clearance configuration needs administrator attention");
  }
  return result.data;
}

export function studentProgress(departments: StudentDepartment[]): StudentProgress {
  return {
    requiredCount: departments.filter((item) => item.applicability === "REQUIRED").length,
    clearedRequiredCount: departments.filter((item) => item.applicability === "REQUIRED" && item.status === "CLEARED").length,
    actionRequiredCount: departments.filter((item) => item.applicability === "REQUIRED" && item.status === "ACTION_REQUIRED").length,
    notRequiredCount: departments.filter((item) => item.applicability === "NOT_REQUIRED").length,
    undeterminedCount: departments.filter((item) => item.applicability === "UNDETERMINED").length,
  };
}
