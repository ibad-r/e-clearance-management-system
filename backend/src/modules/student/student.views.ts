import type { StudentDashboard, StudentDepartment, StudentProfile, StudentRequest, StudentRequestSummary } from "./student.types";

export function profileView(profile: StudentProfile): StudentProfile {
  return { sapId: profile.sapId, studentName: profile.studentName, registrationNumber: profile.registrationNumber,
    fatherName: profile.fatherName, program: profile.program, semester: profile.semester };
}
export function summaryView(item: StudentRequestSummary): StudentRequestSummary {
  return { id: item.id, requestReference: item.requestReference, reason: item.reason, status: item.status,
    isActive: item.isActive, submittedAt: item.submittedAt, closedAt: item.closedAt };
}
export function departmentView(item: StudentDepartment): StudentDepartment {
  return { departmentCode: item.departmentCode, displayName: item.displayName, applicability: item.applicability,
    status: item.status, remarks: null, updatedAt: item.updatedAt };
}
export function requestView(item: StudentRequest): StudentRequest {
  return { ...summaryView(item), ...profileView(item), departments: item.departments.map(departmentView) };
}
export function dashboardView(item: StudentDashboard): StudentDashboard {
  return {
    profile: profileView(item.profile), activeRequest: item.activeRequest ? summaryView(item.activeRequest) : null,
    departments: item.departments.map(departmentView),
    progress: item.progress ? {
      requiredCount: item.progress.requiredCount, clearedRequiredCount: item.progress.clearedRequiredCount,
      actionRequiredCount: item.progress.actionRequiredCount, notRequiredCount: item.progress.notRequiredCount,
      undeterminedCount: item.progress.undeterminedCount,
    } : null,
    history: { closedRequestCount: item.history.closedRequestCount,
      latestClosedRequest: item.history.latestClosedRequest ? summaryView(item.history.latestClosedRequest) : null },
  };
}
