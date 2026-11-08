import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import * as schema from "../schema";
import { demoData } from "./demo-data";
import { assertDemoDatabase } from "./demo-database";
import { assertDemoMigrations } from "./demo-migrations";
import { verifyDemoRows, type DemoVerificationSummary } from "./verify-demo";

/**
 * Development-only, insert-missing seed. It never creates credentials or clears
 * state: conflicts with owned immutable fields reject and roll back every insert.
 */
export async function seedDemoDatabase(client: PoolClient): Promise<DemoVerificationSummary> {
  await assertDemoDatabase(client);
  await assertDemoMigrations(client);
  return drizzle({ client, schema }).transaction(async (transaction) => {
    // Concurrent runs of this dataset serialize without a persistent helper table.
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(110011, 20261102)`);
    // Employee submission holds FOR SHARE on this row while creating snapshots.
    // Waiting here before checking use prevents repairing mappings underneath it.
    await transaction.select({ id: schema.workflowTemplates.id }).from(schema.workflowTemplates)
      .where(eq(schema.workflowTemplates.id, demoData.template.id)).for("update");
    const [usedTemplate] = await transaction.select({ id: schema.clearanceRequests.id })
      .from(schema.clearanceRequests).where(eq(schema.clearanceRequests.templateId, demoData.template.id)).limit(1);
    if (usedTemplate) {
      // A used workflow and its mappings are immutable. Never repair missing
      // mappings or change configuration beneath existing clearance snapshots.
      return verifyDemoRows(transaction);
    }
    await transaction.insert(schema.employeeCategories).values(demoData.category).onConflictDoNothing();
    await transaction.insert(schema.clearanceDepartments).values([...demoData.departments]).onConflictDoNothing();
    await transaction.insert(schema.clearanceRules).values([...demoData.rules]).onConflictDoNothing();
    await transaction.insert(schema.authorityPositions).values([...demoData.authorityPositions]).onConflictDoNothing();
    await transaction.insert(schema.workflowTemplates).values(demoData.template).onConflictDoNothing();
    await transaction.insert(schema.workflowStageTemplates).values([...demoData.stageMappings]).onConflictDoNothing();
    await transaction.insert(schema.workflowApprovalTemplates).values([...demoData.approvalMappings]).onConflictDoNothing();
    // No users/password writes: these employees remain unlinked until provisioned
    // with the authentication owner's real hashing and account-creation flow.
    await transaction.insert(schema.employees).values([...demoData.employees]).onConflictDoNothing();
    await transaction.insert(schema.departmentDemoRecords).values([...demoData.departmentRecords]).onConflictDoNothing();
    return verifyDemoRows(transaction);
  });
}
