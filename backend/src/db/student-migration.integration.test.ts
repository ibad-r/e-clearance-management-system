import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDatabase, type TestDatabaseConnection } from "./test-database";
import { testMigrationsFolder } from "./migrate-test-database";

const migrations = readMigrationFiles({ migrationsFolder: testMigrationsFolder });
const snapshot = (number: string) => JSON.parse(readFileSync(resolve(testMigrationsFolder, "meta/" + number + "_snapshot.json"), "utf8"));
describe("Student migration scope and upgrade preservation", { concurrent: false }, () => {
  let connection: TestDatabaseConnection | undefined;
  beforeAll(async () => { connection = await connectTestDatabase(); });
  afterAll(async () => { await connection?.close(); });
  it("extends the exact shared-role snapshot without modifying existing tables or enums", () => {
    expect(migrations.length).toBeGreaterThanOrEqual(3);
    const previous = snapshot("0001");
    const current = snapshot("0002");
    expect(current.prevId).toBe(previous.id);
    for (const [name, table] of Object.entries(previous.tables)) expect(current.tables[name]).toEqual(table);
    for (const [name, values] of Object.entries(previous.enums)) expect(current.enums[name]).toEqual(values);
    expect(Object.keys(current.tables).filter((name) => !(name in previous.tables)).sort()).toEqual(["public.student_profiles", "public.student_request_departments", "public.student_requests"]);
    expect(Object.keys(current.enums).filter((name) => !(name in previous.enums))).toHaveLength(5);
    const sql = migrations[2]!.sql.join("\n");
    expect(sql).not.toMatch(/DROP |TRUNCATE |DELETE FROM|ALTER TYPE/i);
    for (const statement of migrations[2]!.sql) {
      if (statement.trim().startsWith("ALTER TABLE")) expect(statement).toMatch(/ALTER TABLE "student_/);
    }
  });
  it.each([0, 1])("upgrades from migration %s while preserving all Employee definitions and fictional data", async (base) => {
    if (!connection) throw new Error("Isolated test connection is unavailable");
    const client = connection.client;
    const namespace = "student_upgrade_" + randomUUID().replaceAll("-", "");
    const originalTables = Object.keys(snapshot("0000").tables).map((name) => name.replace("public.", ""));
    await client.query("BEGIN");
    try {
      await client.query('CREATE SCHEMA "' + namespace + '"');
      await client.query('SET LOCAL search_path = "' + namespace + '"');
      async function apply(number: number) {
        for (const statement of migrations[number]!.sql) {
          await client.query(statement.replaceAll('"public".', '"' + namespace + '".'));
        }
      }
      await apply(0);
      if (base === 1) await apply(1);
      const userId = randomUUID(), categoryId = randomUUID(), employeeId = randomUUID(), templateId = randomUUID();
      await client.query("INSERT INTO users (id,email,password_hash,full_name,role) VALUES ($1,$2,'fictional-unusable-hash','Fictional Employee','EMPLOYEE')", [userId, randomUUID() + "@example.invalid"]);
      await client.query("INSERT INTO employee_categories (id,code,name) VALUES ($1,$2,'Fictional Category')", [categoryId, randomUUID()]);
      await client.query("INSERT INTO employees (id,user_id,employee_number,category_id,full_name,designation,department_name) VALUES ($1,$2,$3,$4,'Fictional Employee','Fictional Teacher','Fictional Department')", [employeeId, userId, randomUUID(), categoryId]);
      await client.query("INSERT INTO workflow_templates (id,category_id,name,version) VALUES ($1,$2,'Fictional Workflow',1)", [templateId, categoryId]);
      await client.query("INSERT INTO clearance_requests (request_code,employee_id,template_id,initiated_by_id,status,reason_for_leaving,last_working_date) VALUES ($1,$2,$3,$4,'IN_PROGRESS','Fictional reason','2026-11-13')", [randomUUID(), employeeId, templateId, userId]);
      async function employeeSnapshot() {
        const columns = await client.query(`SELECT t.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull,
          pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
          JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
          LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
          WHERE n.nspname=$1 AND t.relname=ANY($2::text[]) ORDER BY t.relname,a.attnum`, [namespace, originalTables]);
        const constraints = await client.query(`SELECT t.relname,c.conname,pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
          WHERE n.nspname=$1 AND t.relname=ANY($2::text[]) ORDER BY t.relname,c.conname`, [namespace, originalTables]);
        const indexes = await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=ANY($2::text[]) ORDER BY indexname", [namespace, originalTables]);
        const data: Record<string, unknown> = {};
        for (const table of originalTables) data[table] = (await client.query('SELECT * FROM "' + namespace + '"."' + table + '" ORDER BY id')).rows;
        return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, data };
      }
      const before = await employeeSnapshot();
      if (base === 0) await apply(1);
      await apply(2);
      expect(await employeeSnapshot()).toEqual(before);
      const tables = await client.query("SELECT count(*)::integer AS total FROM pg_tables WHERE schemaname=$1", [namespace]);
      expect(tables.rows[0].total).toBe(22);
      const roles = await client.query(`SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
        FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname=$1 AND t.typname='user_role'`, [namespace]);
      expect(roles.rows[0].values).toEqual(["EMPLOYEE", "HR_OFFICER", "APPROVER", "SYSTEM_ADMIN", "STUDENT"]);
    } finally { await client.query("ROLLBACK"); }
  }, 30000);
});
