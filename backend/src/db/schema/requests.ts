import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  approvalStatusEnum,
  clearanceRequestStatusEnum,
  clearanceStageStatusEnum,
} from "./enums";
import { employees, users } from "./identity";
import { authorityPositions, clearanceDepartments, workflowTemplates } from "./workflow";

export const clearanceRequests = pgTable(
  "clearance_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestCode: text("request_code").notNull().unique("clearance_requests_code_unique"),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict", onUpdate: "no action" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    initiatedById: uuid("initiated_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "no action" }),
    status: clearanceRequestStatusEnum("status").default("PENDING_SUBMISSION").notNull(),
    reasonForLeaving: text("reason_for_leaving").notNull(),
    lastWorkingDate: date("last_working_date", { mode: "string" }).notNull(),
    employeeRemarks: text("employee_remarks"),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    cancelledById: uuid("cancelled_by_id").references(() => users.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    // ORM-only update hook; direct SQL must set updated_at explicitly.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("clearance_requests_employee_status_idx").on(table.employeeId, table.status),
    index("clearance_requests_status_initiated_at_idx").on(table.status, table.initiatedAt),
    index("clearance_requests_template_id_idx").on(table.templateId),
    index("clearance_requests_initiated_by_id_idx").on(table.initiatedById),
    index("clearance_requests_cancelled_by_id_idx").on(table.cancelledById),
    // Only COMPLETED and CANCELLED release the employee's active-case slot.
    uniqueIndex("clearance_requests_one_active_employee_idx")
      .on(table.employeeId)
      .where(sql`${table.status} not in ('COMPLETED', 'CANCELLED')`),
    check(
      "clearance_requests_cancellation_consistency_check",
      sql`(
        ${table.status} = 'CANCELLED'
        and ${table.cancelledAt} is not null
        and ${table.cancelledById} is not null
        and ${table.cancellationReason} is not null
        and length(btrim(${table.cancellationReason})) >= 3
      ) or (
        ${table.status} <> 'CANCELLED'
        and ${table.cancelledAt} is null
        and ${table.cancelledById} is null
        and ${table.cancellationReason} is null
      )`,
    ),
    check(
      "clearance_requests_completion_consistency_check",
      sql`(${table.status} = 'COMPLETED' and ${table.completedAt} is not null)
        or (${table.status} <> 'COMPLETED' and ${table.completedAt} is null)`,
    ),
  ],
);

// These rows retain the submitted configuration, not live template references.
// Future submission/recheck services must preserve snapshots and audit each attempt.
export const requestStages = pgTable(
  "request_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => clearanceRequests.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => clearanceDepartments.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    stepOrder: integer("step_order").notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    status: clearanceStageStatusEnum("status").default("LOCKED").notNull(),
    ruleSnapshot: jsonb("rule_snapshot").$type<Record<string, unknown>>().notNull(),
    checkedValue: jsonb("checked_value"),
    outstandingNote: text("outstanding_note"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (table) => [
    unique("request_stages_request_order_unique").on(table.requestId, table.stepOrder),
    unique("request_stages_request_department_unique").on(table.requestId, table.departmentId),
    index("request_stages_department_id_idx").on(table.departmentId),
    check("request_stages_step_order_positive_check", sql`${table.stepOrder} > 0`),
    check("request_stages_rule_snapshot_object_check", sql`jsonb_typeof(${table.ruleSnapshot}) = 'object'`),
  ],
);

export const requestApprovals = pgTable(
  "request_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => clearanceRequests.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => authorityPositions.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    decidedById: uuid("decided_by_id").references(() => users.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    stepOrder: integer("step_order").notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    status: approvalStatusEnum("status").default("WAITING").notNull(),
    remarks: text("remarks"),
    approvalCode: text("approval_code").unique("request_approvals_code_unique"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    unique("request_approvals_request_order_unique").on(table.requestId, table.stepOrder),
    unique("request_approvals_request_position_unique").on(table.requestId, table.positionId),
    index("request_approvals_assigned_user_status_idx").on(table.assignedUserId, table.status),
    index("request_approvals_position_id_idx").on(table.positionId),
    index("request_approvals_decided_by_id_idx").on(table.decidedById),
    check("request_approvals_step_order_positive_check", sql`${table.stepOrder} > 0`),
    check(
      "request_approvals_assignment_consistency_check",
      sql`(${table.assignedUserId} is null and ${table.assignedAt} is null)
        or (${table.assignedUserId} is not null and ${table.assignedAt} is not null)`,
    ),
    check(
      "request_approvals_pending_assignment_check",
      sql`${table.status} <> 'PENDING' or ${table.assignedUserId} is not null`,
    ),
    // Only the assigned human authority can supply an approval or return decision.
    // Position membership, role checks and sequential transitions belong to services.
    check(
      "request_approvals_decision_consistency_check",
      sql`(
        ${table.status} in ('APPROVED', 'RETURNED')
        and ${table.assignedUserId} is not null
        and ${table.decidedById} is not null
        and ${table.decidedAt} is not null
        and ${table.decidedById} = ${table.assignedUserId}
        and ${table.decidedAt} >= ${table.assignedAt}
      ) or (
        ${table.status} not in ('APPROVED', 'RETURNED')
        and ${table.decidedById} is null
        and ${table.decidedAt} is null
      )`,
    ),
    check(
      "request_approvals_return_remarks_check",
      sql`${table.status} <> 'RETURNED'
        or (${table.remarks} is not null and length(btrim(${table.remarks})) >= 3)`,
    ),
  ],
);
