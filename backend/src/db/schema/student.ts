import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const studentRequestStatusEnum = pgEnum("student_request_status", ["IN_PROGRESS", "COMPLETED", "CANCELLED"]);
export const studentRequestReasonEnum = pgEnum("student_request_reason", ["degree completed", "discontinuing studies"]);
export const studentDepartmentCodeEnum = pgEnum("student_department_code", [
  "LIBRARY", "FEE_DUES", "STUDENT_SERVICE", "LABORATORY", "COORDINATION_OFFICE",
]);
export const studentApplicabilityEnum = pgEnum("student_applicability", ["REQUIRED", "NOT_REQUIRED", "UNDETERMINED"]);
export const studentDepartmentStatusEnum = pgEnum("student_department_status", [
  "PENDING", "IN_REVIEW", "CLEARED", "ACTION_REQUIRED", "NOT_REQUIRED",
]);

export const studentProfiles = pgTable("student_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique("student_profiles_user_id_unique")
    .references(() => users.id, { onDelete: "restrict", onUpdate: "no action" }),
  // Opaque, case-sensitive strings: retain leading zeros, never coerce to numbers.
  sapId: text("sap_id").notNull().unique("student_profiles_sap_id_unique"),
  registrationNumber: text("registration_number").notNull(),
  fatherName: text("father_name").notNull(),
  program: text("program").notNull(),
  semester: text("semester").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  check("student_profiles_nonblank_fields_check", sql`
    length(btrim(${table.sapId})) > 0 and ${table.sapId} = btrim(${table.sapId})
    and length(btrim(${table.registrationNumber})) > 0
    and length(btrim(${table.fatherName})) > 0 and length(btrim(${table.program})) > 0
    and length(btrim(${table.semester})) > 0`),
]);

export const studentRequests = pgTable("student_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestReference: text("request_reference").notNull().unique("student_requests_reference_unique"),
  studentProfileId: uuid("student_profile_id").notNull()
    .references(() => studentProfiles.id, { onDelete: "restrict", onUpdate: "no action" }),
  // Capture identity at submission; later profile changes must not rewrite history.
  sapId: text("sap_id").notNull(),
  studentName: text("student_name").notNull(),
  registrationNumber: text("registration_number").notNull(),
  fatherName: text("father_name").notNull(),
  program: text("program").notNull(),
  semester: text("semester").notNull(),
  reason: studentRequestReasonEnum("reason").notNull(),
  status: studentRequestStatusEnum("status").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("student_requests_one_active_profile_idx").on(table.studentProfileId)
    .where(sql`${table.status} = 'IN_PROGRESS'`),
  index("student_requests_profile_submitted_idx").on(table.studentProfileId, table.submittedAt, table.id),
  check("student_requests_closure_check", sql`
    (${table.status} = 'IN_PROGRESS' and ${table.closedAt} is null)
    or (${table.status} in ('COMPLETED', 'CANCELLED') and ${table.closedAt} is not null
      and ${table.closedAt} >= ${table.submittedAt})`),
  check("student_requests_nonblank_fields_check", sql`
    length(btrim(${table.requestReference})) > 0 and length(btrim(${table.sapId})) > 0
    and length(btrim(${table.studentName})) > 0 and length(btrim(${table.registrationNumber})) > 0
    and length(btrim(${table.fatherName})) > 0 and length(btrim(${table.program})) > 0
    and length(btrim(${table.semester})) > 0`),
]);

export const studentRequestDepartments = pgTable("student_request_departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull()
    .references(() => studentRequests.id, { onDelete: "restrict", onUpdate: "no action" }),
  departmentCode: studentDepartmentCodeEnum("department_code").notNull(),
  // Explicit per-request determination, without a guessed Laboratory rule.
  applicability: studentApplicabilityEnum("applicability").notNull(),
  applicabilitySource: text("applicability_source").notNull(),
  status: studentDepartmentStatusEnum("status").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Null until a departmental update is actually recorded.
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  unique("student_request_departments_request_code_unique").on(table.requestId, table.departmentCode),
  check("student_request_departments_source_check", sql`length(btrim(${table.applicabilitySource})) > 0`),
  check("student_request_departments_state_check", sql`
    (${table.applicability} = 'REQUIRED' and ${table.status} in ('PENDING', 'IN_REVIEW', 'CLEARED', 'ACTION_REQUIRED'))
    or (${table.applicability} = 'NOT_REQUIRED' and ${table.status} = 'NOT_REQUIRED')
    or (${table.applicability} = 'UNDETERMINED' and ${table.status} = 'PENDING')`),
]);
