import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { issueStatusEnum } from "./enums";
import { users } from "./identity";
import { requestStages } from "./requests";

export const clearanceIssues = pgTable(
  "clearance_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestStageId: uuid("request_stage_id")
      .notNull()
      .references(() => requestStages.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    status: issueStatusEnum("status").default("OPEN").notNull(),
    reason: text("reason").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("clearance_issues_stage_status_idx").on(table.requestStageId, table.status),
    check("clearance_issues_reason_nonempty", sql`length(btrim(${table.reason})) > 0`),
    check(
      "clearance_issues_resolution_consistent",
      sql`(${table.status} = 'OPEN' AND ${table.resolvedAt} IS NULL)
        OR (${table.status} = 'RESOLVED' AND ${table.resolvedAt} IS NOT NULL)`,
    ),
    check(
      "clearance_issues_resolution_time_valid",
      sql`${table.resolvedAt} IS NULL OR ${table.resolvedAt} >= ${table.openedAt}`,
    ),
  ],
);

// An employee explanation is evidence only; a later authorized recheck resolves the issue.
export const issueResolutions = pgTable(
  "issue_resolutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => clearanceIssues.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    submittedById: uuid("submitted_by_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    explanation: text("explanation").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("issue_resolutions_issue_submitted_idx").on(table.issueId, table.submittedAt),
    index("issue_resolutions_submitted_by_idx").on(table.submittedById),
    check(
      "issue_resolutions_explanation_nonempty",
      sql`length(btrim(${table.explanation})) > 0`,
    ),
  ],
);
