import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "EMPLOYEE",
  "HR_OFFICER",
  "APPROVER",
  "SYSTEM_ADMIN",
]);

export const clearanceRequestStatusEnum = pgEnum("clearance_request_status", [
  "PENDING_SUBMISSION",
  "IN_PROGRESS",
  "ACTION_REQUIRED",
  "AWAITING_APPROVAL",
  "RETURNED_FOR_CORRECTION",
  "COMPLETED",
  "CANCELLED",
]);

export const clearanceStageStatusEnum = pgEnum("clearance_stage_status", [
  "LOCKED",
  "CHECKING",
  "CLEARED",
  "OUTSTANDING",
  "RECHECKING",
  "SKIPPED",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "WAITING",
  "PENDING",
  "APPROVED",
  "RETURNED",
  "SKIPPED",
]);

export const ruleOperatorEnum = pgEnum("rule_operator", [
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
]);

export const issueStatusEnum = pgEnum("issue_status", ["OPEN", "RESOLVED"]);
