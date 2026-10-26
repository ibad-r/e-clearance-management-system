import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { employees } from "./identity";
import { clearanceDepartments } from "./workflow";

// Controlled FYP data only; this table has no university-system integration.
export const departmentDemoRecords = pgTable(
  "department_demo_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    departmentId: uuid("department_id").notNull(),
    values: jsonb("values")
      .$type<Record<string, number | boolean | string>>()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      // ORM-only hook: raw SQL updates must set updated_at explicitly.
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "department_demo_records_department_fk",
      columns: [table.departmentId],
      foreignColumns: [clearanceDepartments.id],
    })
      .onDelete("restrict")
      .onUpdate("no action"),
    unique("department_demo_records_employee_department_unique").on(
      table.employeeId,
      table.departmentId,
    ),
    index("department_demo_records_department_idx").on(table.departmentId),
    check(
      "department_demo_records_values_object",
      sql`jsonb_typeof(${table.values}) = 'object'`,
    ),
  ],
);
