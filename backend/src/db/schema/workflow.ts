import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
import { ruleOperatorEnum } from "./enums";
import { employeeCategories, users } from "./identity";

export const clearanceDepartments = pgTable("clearance_departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique("clearance_departments_code_unique"),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const authorityPositions = pgTable("authority_positions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique("authority_positions_code_unique"),
  title: text("title").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const authorityMembers = pgTable(
  "authority_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => authorityPositions.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    unique("authority_members_user_position_unique").on(
      table.userId,
      table.positionId,
    ),
    index("authority_members_position_active_idx").on(
      table.positionId,
      table.isActive,
    ),
  ],
);

// Once a case uses a template, services must create a new version for changes,
// including changes to its stage/approval mappings or referenced rules.
export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => employeeCategories.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    name: text("name").notNull(),
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("workflow_templates_category_version_unique").on(
      table.categoryId,
      table.version,
    ),
    index("workflow_templates_category_active_idx").on(
      table.categoryId,
      table.isActive,
    ),
    uniqueIndex("workflow_templates_one_active_per_category_unique")
      .on(table.categoryId)
      .where(sql`${table.isActive} = true`),
    check("workflow_templates_version_positive", sql`${table.version} > 0`),
  ],
);

export const clearanceRules = pgTable("clearance_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique("clearance_rules_code_unique"),
  metricKey: text("metric_key").notNull(),
  operator: ruleOperatorEnum("operator").notNull(),
  expectedValue: jsonb("expected_value").notNull(),
  failMessage: text("fail_message").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const workflowStageTemplates = pgTable(
  "workflow_stage_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    departmentId: uuid("department_id").notNull(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => clearanceRules.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    stepOrder: integer("step_order").notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
  },
  (table) => [
    foreignKey({
      name: "workflow_stage_templates_department_fk",
      columns: [table.departmentId],
      foreignColumns: [clearanceDepartments.id],
    })
      .onDelete("restrict")
      .onUpdate("no action"),
    unique("workflow_stage_templates_template_order_unique").on(
      table.templateId,
      table.stepOrder,
    ),
    unique("workflow_stage_templates_template_department_unique").on(
      table.templateId,
      table.departmentId,
    ),
    index("workflow_stage_templates_department_idx").on(table.departmentId),
    index("workflow_stage_templates_rule_idx").on(table.ruleId),
    check(
      "workflow_stage_templates_step_order_positive",
      sql`${table.stepOrder} > 0`,
    ),
  ],
);

export const workflowApprovalTemplates = pgTable(
  "workflow_approval_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id").notNull(),
    positionId: uuid("position_id").notNull(),
    stepOrder: integer("step_order").notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
  },
  (table) => [
    foreignKey({
      name: "workflow_approval_templates_template_fk",
      columns: [table.templateId],
      foreignColumns: [workflowTemplates.id],
    })
      .onDelete("restrict")
      .onUpdate("no action"),
    foreignKey({
      name: "workflow_approval_templates_position_fk",
      columns: [table.positionId],
      foreignColumns: [authorityPositions.id],
    })
      .onDelete("restrict")
      .onUpdate("no action"),
    unique("workflow_approval_templates_template_order_unique").on(
      table.templateId,
      table.stepOrder,
    ),
    unique("workflow_approval_templates_template_position_unique").on(
      table.templateId,
      table.positionId,
    ),
    index("workflow_approval_templates_position_idx").on(table.positionId),
    check(
      "workflow_approval_templates_step_order_positive",
      sql`${table.stepOrder} > 0`,
    ),
  ],
);
