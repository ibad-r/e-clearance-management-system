import type {
  approvalStatusEnum,
  clearanceRequestStatusEnum,
  clearanceStageStatusEnum,
  issueStatusEnum,
  userRoleEnum,
} from "../../db/schema";
import type { EmployeeCaseSubmission } from "./employee.schemas";

// This is an integration interface, not authentication or a client input DTO.
export interface VerifiedEmployeeIdentity {
  userId: string;
  role: (typeof userRoleEnum.enumValues)[number];
}

export type RequestStatus = (typeof clearanceRequestStatusEnum.enumValues)[number];

export interface EmployeeProfile {
  id: string;
  employeeNumber: string;
  fullName: string;
  designation: string;
  facultyCode: string;
  departmentName: string;
  joiningDate: string | null;
  categoryId: string;
  category: { id: string; code: string; name: string };
}

export interface EmployeeStage {
  id: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  stepOrder: number;
  isRequired: boolean;
  status: (typeof clearanceStageStatusEnum.enumValues)[number];
  outstandingNote: string | null;
  startedAt: string | null;
  lastCheckedAt: string | null;
  clearedAt: string | null;
}

export interface EmployeeApproval {
  id: string;
  positionId: string;
  positionTitle: string;
  stepOrder: number;
  isRequired: boolean;
  status: (typeof approvalStatusEnum.enumValues)[number];
}

export interface EmployeeIssue {
  id: string;
  requestStageId: string;
  status: (typeof issueStatusEnum.enumValues)[number];
  reason: string;
  openedAt: string;
  resolvedAt: string | null;
}

export interface EmployeeCase {
  id: string;
  requestCode: string;
  employeeId: string;
  status: RequestStatus;
  reasonForLeaving: string;
  lastWorkingDate: string;
  employeeRemarks: string | null;
  initiatedAt: string;
  submittedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  stages: EmployeeStage[];
  approvals: EmployeeApproval[];
  issues: EmployeeIssue[];
  certificateId: string | null;
  progress: {
    totalStages: number;
    clearedStages: number;
    outstandingStages: number;
    skippedStages: number;
  };
}

export interface EmployeeCaseService {
  getProfile(identity: VerifiedEmployeeIdentity): Promise<EmployeeProfile>;
  createCase(identity: VerifiedEmployeeIdentity, input: EmployeeCaseSubmission): Promise<EmployeeCase>;
  listCases(identity: VerifiedEmployeeIdentity, filter?: { status?: RequestStatus }): Promise<EmployeeCase[]>;
  getCase(identity: VerifiedEmployeeIdentity, caseId: string): Promise<EmployeeCase>;
}
