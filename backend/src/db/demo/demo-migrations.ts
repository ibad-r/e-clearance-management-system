import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { assertDemoDatabase } from "./demo-database";
import { SafeDiagnosticError } from "../../utils/safe-error";

export const demoMigrationsFolder = resolve(__dirname, "../../../drizzle");
const reviewedTag = "0000_employee_clearance";
const reviewedTimestamp = 1793031755049;
// The existing reviewed migration, normalized only for checkout line endings.
const reviewedSqlHash = "4813e3c8f6d4365ff4a7404e6a90ef0176dcb8b730aa5f6f9971c960005eff52";

export function reviewedDemoMigrations() {
  const journal = JSON.parse(readFileSync(resolve(demoMigrationsFolder, "meta/_journal.json"), "utf8")) as {
    dialect?: string; entries?: { idx: number; tag: string; when: number }[];
  };
  const entry = journal.entries?.[0];
  const sqlFiles = readdirSync(demoMigrationsFolder).filter((file) => file.endsWith(".sql"));
  const source = readFileSync(resolve(demoMigrationsFolder, `${reviewedTag}.sql`), "utf8").replace(/\r\n/g, "\n");
  if (journal.dialect !== "postgresql" || journal.entries?.length !== 1
    || entry?.idx !== 0 || entry.tag !== reviewedTag || entry.when !== reviewedTimestamp
    || sqlFiles.length !== 1 || sqlFiles[0] !== `${reviewedTag}.sql`
    || createHash("sha256").update(source).digest("hex") !== reviewedSqlHash) {
    throw new SafeDiagnosticError("Demo migration files differ from the reviewed initial migration; review before proceeding");
  }
  return readMigrationFiles({ migrationsFolder: demoMigrationsFolder });
}

interface CatalogObject { kind: string; name: string }
export interface DemoMigrationInspection {
  state: "empty" | "ready" | "blocked";
  migrationCount: number;
  tableCount: number;
  enumCount: number;
  reason?: string;
}

const expectedTables = [
  "users", "employees", "employee_categories", "authority_members", "authority_positions",
  "clearance_departments", "clearance_rules", "workflow_approval_templates", "workflow_stage_templates",
  "workflow_templates", "department_demo_records", "clearance_requests", "request_approvals",
  "request_stages", "clearance_issues", "issue_resolutions", "certificates", "audit_logs", "notifications",
].map((name) => `public.${name}`);
const expectedEnums = ["approval_status", "clearance_request_status", "clearance_stage_status", "issue_status", "rule_operator", "user_role"]
  .map((name) => `public.${name}`);

export async function inspectDemoMigrations(client: PoolClient): Promise<DemoMigrationInspection> {
  await assertDemoDatabase(client);
  const expected = reviewedDemoMigrations();
  const objects = await client.query<CatalogObject>(`
    SELECT 'relation' AS kind, n.nspname || '.' || c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    UNION ALL
    SELECT 'enum', n.nspname || '.' || t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND t.typtype IN ('e', 'd')
    UNION ALL
    SELECT 'routine', n.nspname || '.' || p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    UNION ALL
    SELECT 'trigger', n.nspname || '.' || t.tgname
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
  `);
  const tableCount = objects.rows.filter((row) => expectedTables.includes(row.name)).length;
  const enumCount = objects.rows.filter((row) => row.kind === "enum").length;
  if (objects.rows.length === 0) return { state: "empty", migrationCount: 0, tableCount: 0, enumCount: 0 };
  const allowedRelations = [...expectedTables, "drizzle.__drizzle_migrations", "drizzle.__drizzle_migrations_id_seq"];
  if (objects.rows.some((row) => row.kind === "relation" ? !allowedRelations.includes(row.name)
    : row.kind === "enum" ? !expectedEnums.includes(row.name) : true)
    || tableCount !== 19 || enumCount !== 6
    || !objects.rows.some((row) => row.name === "drizzle.__drizzle_migrations")) {
    return { state: "blocked", migrationCount: 0, tableCount, enumCount,
      reason: "Existing or partially migrated objects need manual review; nothing will be reset or adopted" };
  }
  const ledger = await client.query<{ hash: string; created_at: string }>(
    'SELECT hash, created_at::text FROM drizzle."__drizzle_migrations" ORDER BY created_at, id',
  );
  const matches = ledger.rows.length === expected.length && expected.every((migration, index) =>
    ledger.rows[index]?.hash === migration.hash
    && ledger.rows[index]?.created_at === String(migration.folderMillis));
  return {
    state: matches ? "ready" : "blocked", migrationCount: ledger.rows.length, tableCount, enumCount,
    ...(matches ? {} : { reason: "Migration ledger does not match the reviewed SQL files" }),
  };
}

export async function assertDemoMigrations(client: PoolClient): Promise<void> {
  const inspection = await inspectDemoMigrations(client);
  if (inspection.state !== "ready") {
    throw new SafeDiagnosticError("Demo schema is not the verified reviewed migration; inspect and review it before seeding");
  }
}

export async function migrateDemoDatabase(client: PoolClient, confirmedReviewed: boolean): Promise<DemoMigrationInspection> {
  if (!confirmedReviewed) throw new SafeDiagnosticError("Review the SQL and inspect the target, then pass --confirm-reviewed explicitly");
  await assertDemoDatabase(client);
  await client.query("SELECT pg_advisory_lock(110011, 20261102)");
  try {
    const before = await inspectDemoMigrations(client);
    if (before.state === "blocked") throw new SafeDiagnosticError("Refusing to migrate an existing or partially migrated demo database; manual review required");
    if (before.state === "empty") {
      // The same verified connection is used; Drizzle's ledger writes happen only here.
      await migrate(drizzle({ client }), { migrationsFolder: demoMigrationsFolder,
        migrationsSchema: "drizzle", migrationsTable: "__drizzle_migrations" });
    }
    await assertDemoMigrations(client);
    return await inspectDemoMigrations(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(110011, 20261102)");
  }
}
