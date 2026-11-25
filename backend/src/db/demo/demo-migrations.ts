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
// Exact reviewed chain. The initial Employee and shared-role SQL are unchanged.
// Hashes here normalize checkout line endings; ledger hashes use actual file bytes.
const reviewed = [
  { tag: "0000_employee_clearance", when: 1793031755049, hash: "4813e3c8f6d4365ff4a7404e6a90ef0176dcb8b730aa5f6f9971c960005eff52" },
  { tag: "0001_student_role", when: 1794215907667, hash: "859e063b4fa3074afcd0802540af357eef9c08b97cb23020d537e38e9f4865ca" },
  { tag: "0002_student_clearance", when: 1794752314869, hash: "cf5aac591460aa5579aaa07055908939e6827090f7fe89d18dac77a4d35ae966" },
  { tag: "0003_employee_pending_hr", when: 1795604572978, hash: "f8c26c7bd4f6de9dca72cb4f34008d71346fab828b5653429b55765776a07bbc" },
  { tag: "0004_student_verification_provenance", when: 1795613066133, hash: "35992727676fda4adb04ea250c3c623f0e4d6df1f569a9fc14c13e1749f334a7" },
  { tag: "0005_verification_attempts_and_safe_reasons", when: 1795614200357, hash: "917bb201b1bacd179f5f7713acb24035039dca60036448365e2103951b11366b" },
  { tag: "0006_questionnaire_shape_and_legacy_cancellation", when: 1795614325469, hash: "b2b7ef20d28d315bfa5099737e187b4538ec17bc7ce4543ecfe7b79b6f464edd" },
] as const;

export function reviewedDemoMigrations() {
  const journal = JSON.parse(readFileSync(resolve(demoMigrationsFolder, "meta/_journal.json"), "utf8")) as {
    dialect?: string; entries?: { idx: number; tag: string; when: number }[];
  };
  const files = readdirSync(demoMigrationsFolder).filter((file) => file.endsWith(".sql")).sort();
  if (journal.dialect !== "postgresql" || journal.entries?.length !== reviewed.length
    || files.length !== reviewed.length || reviewed.some((item, index) => {
      const entry = journal.entries?.[index];
      const source = readFileSync(resolve(demoMigrationsFolder, item.tag + ".sql"), "utf8").replace(/\r\n/g, "\n");
      return entry?.idx !== index || entry.tag !== item.tag || entry.when !== item.when
        || files[index] !== item.tag + ".sql" || createHash("sha256").update(source).digest("hex") !== item.hash;
    })) {
    throw new SafeDiagnosticError("Demo migration files differ from the reviewed migration chain; review before proceeding");
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

const employeeTables = [
  "users", "employees", "employee_categories", "authority_members", "authority_positions",
  "clearance_departments", "clearance_rules", "workflow_approval_templates", "workflow_stage_templates",
  "workflow_templates", "department_demo_records", "clearance_requests", "request_approvals",
  "request_stages", "clearance_issues", "issue_resolutions", "certificates", "audit_logs", "notifications",
].map((name) => "public." + name);
const studentTables = ["student_profiles", "student_requests", "student_request_departments"].map((name) => "public." + name);
const employeeEnums = ["approval_status", "clearance_request_status", "clearance_stage_status", "issue_status", "rule_operator", "user_role"].map((name) => "public." + name);
const studentEnums = ["student_applicability", "student_department_code", "student_department_status", "student_request_reason", "student_request_status"].map((name) => "public." + name);

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
  const tableCount = objects.rows.filter((row) => row.kind === "relation" && [...employeeTables, ...studentTables].includes(row.name)).length;
  const enumCount = objects.rows.filter((row) => row.kind === "enum").length;
  if (objects.rows.length === 0) return { state: "empty", migrationCount: 0, tableCount: 0, enumCount: 0 };
  const blocked = (migrationCount: number): DemoMigrationInspection => ({
    state: "blocked", migrationCount, tableCount, enumCount,
    reason: "Existing or partially migrated objects or migration ledger need manual review; nothing will be reset or adopted",
  });
  if (!objects.rows.some((row) => row.kind === "relation" && row.name === "drizzle.__drizzle_migrations")) return blocked(0);
  const ledger = await client.query<{ hash: string; created_at: string }>(
    'SELECT hash, created_at::text FROM drizzle."__drizzle_migrations" ORDER BY created_at, id',
  );
  const count = ledger.rows.length;
  if (count < 1 || count > expected.length || ledger.rows.some((row, index) =>
    row.hash !== expected[index]?.hash || row.created_at !== String(expected[index]?.folderMillis))) return blocked(count);
  const tables = count >= 3 ? [...employeeTables, ...studentTables] : employeeTables;
  const enums = count >= 3 ? [...employeeEnums, ...studentEnums] : employeeEnums;
  const allowedRelations = [...tables, "drizzle.__drizzle_migrations", "drizzle.__drizzle_migrations_id_seq"];
  if (tableCount !== tables.length || enumCount !== enums.length || objects.rows.some((row) =>
    row.kind === "relation" ? !allowedRelations.includes(row.name) : row.kind === "enum" ? !enums.includes(row.name) : true)) return blocked(count);
  return { state: "ready", migrationCount: count, tableCount, enumCount,
    ...(count < expected.length ? { reason: "Reviewed upgrade available; run demo:migrate with --confirm-reviewed before seeding" } : {}) };
}

export async function assertDemoMigrations(client: PoolClient): Promise<void> {
  const inspection = await inspectDemoMigrations(client);
  if (inspection.state !== "ready" || inspection.migrationCount !== reviewed.length) {
    throw new SafeDiagnosticError("Demo schema is not the verified reviewed migration chain; inspect and review it before seeding");
  }
}

export async function migrateDemoDatabase(client: PoolClient, confirmedReviewed: boolean): Promise<DemoMigrationInspection> {
  if (!confirmedReviewed) throw new SafeDiagnosticError("Review the SQL and inspect the target, then pass --confirm-reviewed explicitly");
  await assertDemoDatabase(client);
  await client.query("SELECT pg_advisory_lock(110011, 20261102)");
  try {
    const before = await inspectDemoMigrations(client);
    if (before.state === "blocked") throw new SafeDiagnosticError("Refusing to migrate an existing or partially migrated demo database; manual review required");
    if (before.state === "empty" || before.migrationCount < reviewed.length) {
      // Only an empty database or an exact verified prefix may be upgraded.
      await migrate(drizzle({ client }), { migrationsFolder: demoMigrationsFolder,
        migrationsSchema: "drizzle", migrationsTable: "__drizzle_migrations" });
    }
    await assertDemoMigrations(client);
    return await inspectDemoMigrations(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(110011, 20261102)");
  }
}
