import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDatabase, type TestDatabaseConnection } from "./test-database";
import { testMigrationsFolder } from "./migrate-test-database";
import { questionnaireKeys } from "../modules/employee/employee.questionnaire";

describe("Complete clearance migration fresh install and prefix upgrades", { concurrent: false }, () => {
  let connection: TestDatabaseConnection;
  beforeAll(async () => { connection = await connectTestDatabase(); });
  afterAll(async () => { await connection?.close(); });

  it("preserves the complete journal and snapshot ancestry", async () => {
    const journal = JSON.parse(await readFile(join(testMigrationsFolder, "meta/_journal.json"), "utf8"));
    expect(journal.entries).toHaveLength(7);
    let previousId = "00000000-0000-0000-0000-000000000000";
    for (const entry of journal.entries) {
      const snapshot = JSON.parse(await readFile(join(testMigrationsFolder, "meta", String(entry.idx).padStart(4, "0") + "_snapshot.json"), "utf8"));
      expect(snapshot.prevId).toBe(previousId);
      previousId = snapshot.id;
    }
  });

  it.each([0, 1, 2, 3, 4, 5, 6])("installs from prefix length %s without replacing legacy data and safely reruns", async (prefix) => {
    const client = connection.client;
    const namespace = "clearance_upgrade_" + randomUUID().replaceAll("-", "");
    const directory = await mkdtemp(join(tmpdir(), "issue26-migrations-"));
    const journal = JSON.parse(await readFile(join(testMigrationsFolder, "meta/_journal.json"), "utf8"));
    await mkdir(join(directory, "meta"));
    await client.query(`CREATE SCHEMA "${namespace}"`);
    try {
      await client.query(`SET search_path = "${namespace}"`);
      for (const entry of journal.entries) {
        const source = await readFile(join(testMigrationsFolder, entry.tag + ".sql"), "utf8");
        await writeFile(join(directory, entry.tag + ".sql"), source.replaceAll('"public".', `"${namespace}".`));
      }
      const run = async (length: number) => {
        await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, length) }));
        await migrate(drizzle({ client }), { migrationsFolder: directory, migrationsSchema: namespace, migrationsTable: "__upgrade_migrations" });
      };
      const userId = randomUUID(), categoryId = randomUUID(), employeeId = randomUUID(), templateId = randomUUID(), requestId = randomUUID();
      if (prefix > 0) {
        await run(prefix);
        await client.query("INSERT INTO users (id,email,password_hash,full_name,role) VALUES ($1,$2,'fictional-unusable','Fictional Employee','EMPLOYEE')", [userId, randomUUID() + "@example.invalid"]);
        await client.query("INSERT INTO employee_categories (id,code,name) VALUES ($1,$2,'Fictional Category')", [categoryId, randomUUID()]);
        await client.query("INSERT INTO employees (id,user_id,employee_number,category_id,full_name,designation,department_name) VALUES ($1,$2,$3,$4,'Fictional Employee','Fictional Teacher','Fictional Department')", [employeeId, userId, randomUUID(), categoryId]);
        await client.query("INSERT INTO workflow_templates (id,category_id,name,version) VALUES ($1,$2,'Fictional Workflow',1)", [templateId, categoryId]);
        await client.query("INSERT INTO clearance_requests (id,request_code,employee_id,template_id,initiated_by_id,status,reason_for_leaving,last_working_date) VALUES ($1,$2,$3,$4,$5,'IN_PROGRESS','Fictional legacy reason','2026-11-25')", [requestId, randomUUID(), employeeId, templateId, userId]);
      }
      const before = prefix > 0 ? (await client.query("SELECT * FROM clearance_requests WHERE id=$1", [requestId])).rows[0] : null;
      const tableOid = prefix > 0 ? (await client.query("SELECT 'clearance_requests'::regclass::oid AS oid")).rows[0].oid : null;
      await run(7);
      if (before) {
        const after = (await client.query("SELECT * FROM clearance_requests WHERE id=$1", [requestId])).rows[0];
        expect(after).toMatchObject(before);
        expect(after.questionnaire_snapshot).toBeNull();
        expect(after.hr_verified_at).toBeNull();
        expect(after.selection_revision).toBe(0);
        expect((await client.query("SELECT 'clearance_requests'::regclass::oid AS oid")).rows[0].oid).toBe(tableOid);
      }
      const installed = readMigrationFiles({ migrationsFolder: directory });
      const ledger = async () => (await client.query(`SELECT hash, created_at::text FROM "${namespace}".__upgrade_migrations ORDER BY created_at`)).rows;
      expect(await ledger()).toEqual(installed.map((item) => ({ hash: item.hash, created_at: String(item.folderMillis) })));
      const originalLedger = await ledger();
      await run(7); await run(7);
      expect(await ledger()).toEqual(originalLedger);
      expect((await client.query("SELECT count(*)::int AS total FROM pg_tables WHERE schemaname=$1", [namespace])).rows[0].total).toBe(23);
      const answers = JSON.stringify({ version: "v1", answers: Object.fromEntries(questionnaireKeys.map((key) => [key, "NOT_SURE"])) });
      // Consumes the added enum after the migrator's commit, even on a fresh install.
      if (prefix === 0) {
        await client.query("INSERT INTO users (id,email,password_hash,full_name,role) VALUES ($1,$2,'fictional-unusable','Fictional Employee','EMPLOYEE')", [userId, randomUUID() + "@example.invalid"]);
        await client.query("INSERT INTO employee_categories (id,code,name) VALUES ($1,$2,'Fictional Category')", [categoryId, randomUUID()]);
        await client.query("INSERT INTO employees (id,user_id,employee_number,category_id,full_name,designation,department_name) VALUES ($1,$2,$3,$4,'Fictional Employee','Fictional Teacher','Fictional Department')", [employeeId, userId, randomUUID(), categoryId]);
      } else {
        await client.query("UPDATE clearance_requests SET status='COMPLETED', completed_at=now() WHERE id=$1", [requestId]);
      }
      const pending = randomUUID();
      await client.query("INSERT INTO clearance_requests (id,request_code,employee_id,initiated_by_id,status,reason_for_leaving,last_working_date,submitted_at,questionnaire_snapshot,department_recommendation_snapshot) VALUES ($1,$2,$3,$4,'PENDING_HR_VERIFICATION','Fictional pending reason','2026-11-25',now(),$5::jsonb,'{}')", [pending, randomUUID(), employeeId, userId, answers]);
      await expect(client.query("UPDATE clearance_requests SET questionnaire_snapshot='{}' WHERE id=$1", [pending])).rejects.toMatchObject({ code: "23514", constraint: "clearance_requests_questionnaire_shape_check" });
      expect((await client.query("SELECT template_id,hr_verified_at,selection_revision FROM clearance_requests WHERE id=$1", [pending])).rows[0]).toEqual({ template_id: null, hr_verified_at: null, selection_revision: 0 });
    } finally {
      await client.query("SET search_path = public");
      // Only the unique schema created by this test is removed; never public/ledger.
      await client.query(`DROP SCHEMA "${namespace}" CASCADE`);
      if (resolve(directory).startsWith(resolve(tmpdir(), "issue26-migrations-"))) await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
