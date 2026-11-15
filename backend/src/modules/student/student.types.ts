import type { studentApplicabilityEnum, studentDepartmentCodeEnum, studentDepartmentStatusEnum,
  studentRequestStatusEnum } from "../../db/schema/student";
import type { StudentSubmission } from "./student.schemas";

export interface StudentIdentity { userId: string; role: string }
export type DepartmentCode = typeof studentDepartmentCodeEnum.enumValues[number];
export type Applicability = typeof studentApplicabilityEnum.enumValues[number];
export interface StudentProfile {
  sapId: string;
  studentName: string;
  registrationNumber: string;
  fatherName: string;
  program: string;
  semester: string;
}
export interface StudentDepartment {
  departmentCode: DepartmentCode;
  displayName: string;
  applicability: Applicability;
  status: typeof studentDepartmentStatusEnum.enumValues[number];
  remarks: string | null;
  updatedAt: string | null;
}
export interface StudentRequestSummary {
  id: string;
  requestReference: string;
  reason: StudentSubmission["reason"];
  status: typeof studentRequestStatusEnum.enumValues[number];
  isActive: boolean;
  submittedAt: string;
  closedAt: string | null;
}
export interface StudentRequest extends StudentRequestSummary, StudentProfile { departments: StudentDepartment[] }
export interface StudentProgress {
  requiredCount: number;
  clearedRequiredCount: number;
  actionRequiredCount: number;
  notRequiredCount: number;
  undeterminedCount: number;
}
export interface StudentDashboard {
  profile: StudentProfile;
  activeRequest: StudentRequestSummary | null;
  departments: StudentDepartment[];
  progress: StudentProgress | null;
  history: { closedRequestCount: number; latestClosedRequest: StudentRequestSummary | null };
}
export interface StudentService {
  getProfile(identity: StudentIdentity): Promise<StudentProfile>;
  getDashboard(identity: StudentIdentity): Promise<StudentDashboard>;
  createRequest(identity: StudentIdentity, input: StudentSubmission): Promise<StudentRequest>;
  listRequests(identity: StudentIdentity): Promise<StudentRequestSummary[]>;
  getRequest(identity: StudentIdentity, requestId: string): Promise<StudentRequest>;
}
