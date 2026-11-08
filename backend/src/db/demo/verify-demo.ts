import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import * as schema from "../schema";
import { demoData } from "./demo-data";
import { assertDemoDatabase } from "./demo-database";
import { assertDemoMigrations } from "./demo-migrations";
import { SafeDiagnosticError } from "../../utils/safe-error";

type DemoReader = Pick<NodePgDatabase<typeof schema>, "select">;

export interface DemoVerificationSummary {
  dataset: typeof demoData.dataset;
  categoryCount: number;
  employeeCount: number;
  departmentCount: number;
  ruleCount: number;
  workflowTemplateCount: number;
  stageMappingCount: number;
  authorityPositionCount: number;
  approvalMappingCount: number;
  departmentRecordCount: number;
  linkedEmployeeCount: number;
  unlinkedEmployeeCount: number;
  authenticationIntegration: "requires-authentication-owner-handoff";
}

function assertOwnedRows(
  name: string,
  actual: readonly { id: string }[],
  expected: readonly { readonly id: string }[],
  mutableFields: readonly string[] = [],
): void {
  if (actual.length !== expected.length) {
    throw new SafeDiagnosticError(`Demo dataset verification failed for ${name}: owned rows are missing or unexpected`);
  }
  for (const expectedRow of expected) {
    const row = actual.find((candidate) => candidate.id === expectedRow.id);
    if (!row || Object.entries(expectedRow).some(([key, value]) =>
      !mutableFields.includes(key)
      && JSON.stringify((row as Record<string, unknown>)[key]) !== JSON.stringify(value))) {
      // Never log conflicting row contents or authentication data.
      throw new SafeDiagnosticError(`Demo dataset verification failed for ${name}: an owned row conflicts with the reviewed fixture`);
    }
  }
}

// Shared with seed so conflicts roll back in the seed's own transaction.
// Only immutable fixture fields are compared; no changes are made.
export async function verifyDemoRows(database: DemoReader): Promise<DemoVerificationSummary> {
  const categories = await database.select().from(schema.employeeCategories)
    .where(eq(schema.employeeCategories.id, demoData.category.id));
  assertOwnedRows("employee_categories", categories, [demoData.category]);
  const departments = await database.select().from(schema.clearanceDepartments)
    .where(inArray(schema.clearanceDepartments.id, demoData.departments.map((row) => row.id)));
  assertOwnedRows("clearance_departments", departments, demoData.departments);
  const rules = await database.select().from(schema.clearanceRules)
    .where(inArray(schema.clearanceRules.id, demoData.rules.map((row) => row.id)));
  assertOwnedRows("clearance_rules", rules, demoData.rules);
  const templates = await database.select().from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.id, demoData.template.id));
  assertOwnedRows("workflow_templates", templates, [demoData.template]);
  const stages = await database.select().from(schema.workflowStageTemplates)
    .where(eq(schema.workflowStageTemplates.templateId, demoData.template.id));
  assertOwnedRows("workflow_stage_templates", stages, demoData.stageMappings);
  const positions = await database.select().from(schema.authorityPositions)
    .where(inArray(schema.authorityPositions.id, demoData.authorityPositions.map((row) => row.id)));
  assertOwnedRows("authority_positions", positions, demoData.authorityPositions);
  const approvals = await database.select().from(schema.workflowApprovalTemplates)
    .where(eq(schema.workflowApprovalTemplates.templateId, demoData.template.id));
  assertOwnedRows("workflow_approval_templates", approvals, demoData.approvalMappings);
  const employees = await database.select().from(schema.employees)
    .where(inArray(schema.employees.id, demoData.employees.map((row) => row.id)));
  // Linking an account later is an authentication-owner operation, not a seed reset.
  assertOwnedRows("employees", employees, demoData.employees, ["userId"]);
  const records = await database.select().from(schema.departmentDemoRecords)
    .where(inArray(schema.departmentDemoRecords.employeeId, demoData.employees.map((row) => row.id)));
  // Preserve authorized corrections to controlled data across seed reruns.
  assertOwnedRows("department_demo_records", records, demoData.departmentRecords, ["values"]);

  const linkedEmployeeCount = employees.filter((employee) => employee.userId !== null).length;
  return {
    dataset: demoData.dataset,
    categoryCount: categories.length,
    employeeCount: employees.length,
    departmentCount: departments.length,
    ruleCount: rules.length,
    workflowTemplateCount: templates.length,
    stageMappingCount: stages.length,
    authorityPositionCount: positions.length,
    approvalMappingCount: approvals.length,
    departmentRecordCount: records.length,
    linkedEmployeeCount,
    unlinkedEmployeeCount: employees.length - linkedEmployeeCount,
    authenticationIntegration: "requires-authentication-owner-handoff",
  };
}

export async function verifyDemoDatabase(client: PoolClient): Promise<DemoVerificationSummary> {
  await assertDemoDatabase(client);
  await assertDemoMigrations(client);
  return drizzle({ client, schema }).transaction(
    (transaction) => verifyDemoRows(transaction),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
