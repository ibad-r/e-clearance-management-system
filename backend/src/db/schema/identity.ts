import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";

// Shared authentication contract: hash format/validation belong to the auth feature.
// Never serialize full user rows into API responses or audit details.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique("users_email_unique"),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Drizzle updates this on ORM writes; raw SQL writers must set updated_at.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const employeeCategories = pgTable("employee_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique("employee_categories_code_unique"),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeNumber: text("employee_number")
      .notNull()
      .unique("employees_employee_number_unique"),
    userId: uuid("user_id")
      .unique("employees_user_id_unique")
      .references(() => users.id, { onDelete: "restrict", onUpdate: "no action" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => employeeCategories.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    fullName: text("full_name").notNull(),
    designation: text("designation").notNull(),
    facultyCode: text("faculty_code").default("FC").notNull(),
    departmentName: text("department_name").notNull(),
    joiningDate: date("joining_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // ORM-only update hook; direct SQL must set updated_at explicitly.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("employees_faculty_category_idx").on(table.facultyCode, table.categoryId),
    index("employees_category_id_idx").on(table.categoryId),
  ],
);
