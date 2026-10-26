import { randomUUID } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDatabase, testMigrationsFolder } from "./migrate-test-database";
import { connectTestDatabase } from "./test-database";

const tableNames = [
  "audit_logs", "authority_members", "authority_positions", "certificates",
  "clearance_departments", "clearance_issues", "clearance_requests", "clearance_rules",
  "department_demo_records", "employee_categories", "employees", "issue_resolutions",
  "notifications", "request_approvals", "request_stages", "users",
  "workflow_approval_templates", "workflow_stage_templates", "workflow_templates",
].sort();

const expectedEnums = {
  approval_status: ["WAITING", "PENDING", "APPROVED", "RETURNED", "SKIPPED"],
  clearance_request_status: [
    "PENDING_SUBMISSION", "IN_PROGRESS", "ACTION_REQUIRED", "AWAITING_APPROVAL",
    "RETURNED_FOR_CORRECTION", "COMPLETED", "CANCELLED",
  ],
  clearance_stage_status: ["LOCKED", "CHECKING", "CLEARED", "OUTSTANDING", "RECHECKING", "SKIPPED"],
  issue_status: ["OPEN", "RESOLVED"],
  rule_operator: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE"],
  user_role: ["EMPLOYEE", "HR_OFFICER", "APPROVER", "SYSTEM_ADMIN"],
};

type RequestStatus = (typeof expectedEnums.clearance_request_status)[number];
type Fixture = {
  categoryId: string;
  employeeId: string;
  employeeUserId: string;
  hrUserId: string;
  approverUserId: string;
  otherApproverUserId: string;
  templateId: string;
  departmentId: string;
  positionId: string;
  ruleId: string;
};

async function createFixture(client: PoolClient): Promise<Fixture> {
  const fixture: Fixture = {
    categoryId: randomUUID(), employeeId: randomUUID(), employeeUserId: randomUUID(),
    hrUserId: randomUUID(), approverUserId: randomUUID(), otherApproverUserId: randomUUID(),
    templateId: randomUUID(), departmentId: randomUUID(), positionId: randomUUID(), ruleId: randomUUID(),
  };

  for (const [id, role] of [
    [fixture.hrUserId, "HR_OFFICER"], [fixture.employeeUserId, "EMPLOYEE"],
    [fixture.approverUserId, "APPROVER"], [fixture.otherApproverUserId, "APPROVER"],
  ]) {
    await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'test-only-unusable-hash', 'Fictional Test User', $3)`,
      [id, `${randomUUID()}@example.invalid`, role],
    );
  }
  await client.query(
    "INSERT INTO employee_categories (id, code, name) VALUES ($1, $2, 'Fictional Category')",
    [fixture.categoryId, randomUUID()],
  );
  await client.query(
    `INSERT INTO employees
      (id, employee_number, user_id, category_id, full_name, designation, department_name)
     VALUES ($1, $2, $3, $4, 'Fictional Employee', 'Test Designation', 'Test Department')`,
    [fixture.employeeId, randomUUID(), fixture.employeeUserId, fixture.categoryId],
  );
  await client.query(
    "INSERT INTO clearance_departments (id, code, name) VALUES ($1, $2, 'Fictional Department')",
    [fixture.departmentId, randomUUID()],
  );
  await client.query(
    "INSERT INTO authority_positions (id, code, title) VALUES ($1, $2, 'Fictional Authority')",
    [fixture.positionId, randomUUID()],
  );
  await client.query(
    `INSERT INTO clearance_rules (id, code, metric_key, operator, expected_value, fail_message)
     VALUES ($1, $2, 'fictional_test_metric', 'EQ', '0'::jsonb, 'Fictional test issue')`,
    [fixture.ruleId, randomUUID()],
  );
  await client.query(
    `INSERT INTO workflow_templates (id, category_id, name, version, is_active)
     VALUES ($1, $2, 'Fictional Workflow', 1, true)`,
    [fixture.templateId, fixture.categoryId],
  );
  return fixture;
}

async function createCase(
  client: PoolClient,
  fixture: Fixture,
  status: RequestStatus = "PENDING_SUBMISSION",
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO clearance_requests
      (id, request_code, employee_id, template_id, initiated_by_id, status,
       reason_for_leaving, last_working_date, completed_at, cancelled_at,
       cancelled_by_id, cancellation_reason)
     VALUES ($1, $2, $3, $4, $5, $6::clearance_request_status, 'Fictional test reason', '2026-11-01',
       CASE WHEN $6 = 'COMPLETED' THEN now() END,
       CASE WHEN $6 = 'CANCELLED' THEN now() END,
       CASE WHEN $6 = 'CANCELLED' THEN $5::uuid END,
       CASE WHEN $6 = 'CANCELLED' THEN 'Fictional cancellation' END)`,
    [id, randomUUID(), fixture.employeeId, fixture.templateId, fixture.hrUserId, status],
  );
  return id;
}

async function expectDatabaseError(
  client: PoolClient,
  operation: () => Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  // Expected PostgreSQL errors abort a transaction until rolled back to a savepoint.
  await client.query("SAVEPOINT expected_failure");
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_failure");
    await client.query("RELEASE SAVEPOINT expected_failure");
  }
  expect(failure).toMatchObject(constraint ? { code, constraint } : { code });
}

describe("Employee clearance initial migration", { concurrent: false }, () => {
  let connection: Awaited<ReturnType<typeof connectTestDatabase>> | undefined;

  function client(): PoolClient {
    if (!connection) throw new Error("The isolated test database connection was not established");
    return connection.client;
  }

  beforeAll(async () => {
    // CI/local setup must run db:migrate:test separately. Missing migrations must fail here.
    connection = await connectTestDatabase();
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("contains all 19 application tables with UUID primary keys and database defaults", async () => {
    const result = await client().query<{ name: string; type: string; default: string | null }>(`
      SELECT t.relname AS name, format_type(a.atttypid, a.atttypmod) AS type,
             pg_get_expr(d.adbin, d.adrelid) AS default
      FROM pg_class t
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_constraint p ON p.conrelid = t.oid AND p.contype = 'p'
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(p.conkey)
      LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND t.relkind = 'r'
      ORDER BY t.relname
    `);
    expect(result.rows.map((row) => row.name)).toEqual(tableNames);
    for (const row of result.rows) {
      expect(row.type).toBe("uuid");
      expect(row.default).toContain("gen_random_uuid()");
    }
  });

  it("contains the six exact employee-workflow enum value sets", async () => {
    const result = await client().query<{ name: string; values: string[] }>(`
      SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public'
      GROUP BY t.typname ORDER BY t.typname
    `);
    expect(Object.fromEntries(result.rows.map((row) => [row.name, row.values]))).toEqual(expectedEnums);
  });

  it("preserves the complete foreign-key graph with restrictive deletion", async () => {
    const expected = [
      ["employees", "user_id", "users"],
      ["employees", "category_id", "employee_categories"],
      ["authority_members", "user_id", "users"],
      ["authority_members", "position_id", "authority_positions"],
      ["workflow_templates", "category_id", "employee_categories"],
      ["workflow_stage_templates", "template_id", "workflow_templates"],
      ["workflow_stage_templates", "department_id", "clearance_departments"],
      ["workflow_stage_templates", "rule_id", "clearance_rules"],
      ["workflow_approval_templates", "template_id", "workflow_templates"],
      ["workflow_approval_templates", "position_id", "authority_positions"],
      ["department_demo_records", "employee_id", "employees"],
      ["department_demo_records", "department_id", "clearance_departments"],
      ["clearance_requests", "employee_id", "employees"],
      ["clearance_requests", "template_id", "workflow_templates"],
      ["clearance_requests", "initiated_by_id", "users"],
      ["clearance_requests", "cancelled_by_id", "users"],
      ["request_stages", "request_id", "clearance_requests"],
      ["request_stages", "department_id", "clearance_departments"],
      ["request_approvals", "request_id", "clearance_requests"],
      ["request_approvals", "position_id", "authority_positions"],
      ["request_approvals", "assigned_user_id", "users"],
      ["request_approvals", "decided_by_id", "users"],
      ["clearance_issues", "request_stage_id", "request_stages"],
      ["issue_resolutions", "issue_id", "clearance_issues"],
      ["issue_resolutions", "submitted_by_id", "users"],
      ["certificates", "request_id", "clearance_requests"],
      ["audit_logs", "actor_user_id", "users"],
      ["audit_logs", "request_id", "clearance_requests"],
      ["notifications", "user_id", "users"],
      ["notifications", "request_id", "clearance_requests"],
    ].map(([table, column, target]) => `${table}.${column}->${target}.id`).sort();
    const result = await client().query<{
      source: string; column: string; target: string; referenced: string;
      delete_action: string; update_action: string;
    }>(`
      SELECT source.relname AS source, local_column.attname AS column,
             target.relname AS target, referenced_column.attname AS referenced,
             c.confdeltype AS delete_action, c.confupdtype AS update_action
      FROM pg_constraint c
      JOIN pg_class source ON source.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = source.relnamespace
      JOIN pg_class target ON target.oid = c.confrelid
      CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS keys(local_number, referenced_number)
      JOIN pg_attribute local_column ON local_column.attrelid = source.oid
        AND local_column.attnum = keys.local_number
      JOIN pg_attribute referenced_column ON referenced_column.attrelid = target.oid
        AND referenced_column.attnum = keys.referenced_number
      WHERE c.contype = 'f' AND n.nspname = 'public'
    `);
    expect(result.rows.map((row) => `${row.source}.${row.column}->${row.target}.${row.referenced}`).sort())
      .toEqual(expected);
    for (const row of result.rows) {
      expect(row.delete_action).toBe("r");
      expect(row.update_action).toBe("a");
    }
  });

  it("contains the identity, ordering and certificate uniqueness constraints", async () => {
    const result = await client().query<{ name: string }>(`
      SELECT c.conname AS name FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'u' AND n.nspname = 'public'
    `);
    expect(result.rows.map((row) => row.name)).toEqual(expect.arrayContaining([
      "users_email_unique", "employees_employee_number_unique", "employees_user_id_unique",
      "employee_categories_code_unique", "authority_positions_code_unique", "clearance_departments_code_unique",
      "clearance_rules_code_unique", "authority_members_user_position_unique",
      "workflow_templates_category_version_unique", "workflow_stage_templates_template_order_unique",
      "workflow_stage_templates_template_department_unique", "workflow_approval_templates_template_order_unique",
      "workflow_approval_templates_template_position_unique", "department_demo_records_employee_department_unique",
      "clearance_requests_code_unique", "request_stages_request_order_unique",
      "request_stages_request_department_unique", "request_approvals_request_order_unique",
      "request_approvals_request_position_unique", "request_approvals_code_unique",
      "certificates_request_id_unique", "certificates_certificate_number_unique", "certificates_verification_token_unique",
    ]));

    const indexes = await client().query<{ name: string; unique: boolean; predicate: string; columns: string[] }>(`
      SELECT idx.relname AS name, i.indisunique AS unique,
             pg_get_expr(i.indpred, i.indrelid) AS predicate,
             ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS k(number, position)
               JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.number
               ORDER BY k.position) AS columns
      FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = idx.relnamespace
      WHERE n.nspname = 'public' AND idx.relname = ANY($1::text[])
    `, [["clearance_requests_one_active_employee_idx", "workflow_templates_one_active_per_category_unique"]]);
    expect(indexes.rows).toHaveLength(2);
    const byName = Object.fromEntries(indexes.rows.map((row) => [row.name, row]));
    expect(byName.clearance_requests_one_active_employee_idx).toMatchObject({ unique: true, columns: ["employee_id"] });
    expect(byName.clearance_requests_one_active_employee_idx?.predicate).toMatch(/status.*COMPLETED.*CANCELLED/);
    expect(byName.workflow_templates_one_active_per_category_unique).toMatchObject({ unique: true, columns: ["category_id"] });
    expect(byName.workflow_templates_one_active_per_category_unique?.predicate).toMatch(/is_active.*true/);
  });

  it("reruns the installed migrator twice without recreating objects or adding migration history", async () => {
    const expectedHistory = readMigrationFiles({ migrationsFolder: testMigrationsFolder })
      .map((migration) => ({ hash: migration.hash, created_at: String(migration.folderMillis) }))
      .sort((left, right) => Number(left.created_at) - Number(right.created_at));
    expect(expectedHistory.length).toBeGreaterThan(0);

    async function snapshot() {
      const objects = await client().query<{ kind: string; name: string; oid: string }>(`
        SELECT c.relkind::text AS kind, n.nspname || '.' || c.relname AS name, c.oid::text AS oid
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('public', 'drizzle')
        UNION ALL
        SELECT 'enum', n.nspname || '.' || t.typname, t.oid::text
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
        ORDER BY kind, name
      `);
      // Querying the existing journal first ensures this test cannot bootstrap a missing migration.
      const history = await client().query<{ hash: string; created_at: string }>(
        'SELECT hash, created_at::text FROM drizzle."__drizzle_migrations" ORDER BY created_at, id',
      );
      // The migrator skips recorded timestamps without validating their SQL hash.
      expect(history.rows).toEqual(expectedHistory);
      expect(objects.rows.filter((row) => row.kind === "r" && row.name.startsWith("public.")))
        .toHaveLength(tableNames.length);
      return { objects: objects.rows, history: history.rows };
    }

    // Drizzle owns its transaction; do not nest migration calls inside a fixture transaction.
    const before = await snapshot();
    await migrateTestDatabase(client());
    expect(await snapshot()).toEqual(before);
    await migrateTestDatabase(client());
    expect(await snapshot()).toEqual(before);
  });

  describe("database constraints with rollback-only fictional fixtures", { concurrent: false }, () => {
    let fixture: Fixture;
    let transactionStarted = false;

    beforeEach(async () => {
      await client().query("BEGIN");
      transactionStarted = true;
      fixture = await createFixture(client());
    });

    afterEach(async () => {
      if (transactionStarted) {
        await client().query("ROLLBACK");
        transactionStarted = false;
      }
    });

    it.each([
      "PENDING_SUBMISSION", "IN_PROGRESS", "ACTION_REQUIRED", "AWAITING_APPROVAL", "RETURNED_FOR_CORRECTION",
    ])("rejects a duplicate active case while the existing case is %s", async (status) => {
      await createCase(client(), fixture, status);
      await expectDatabaseError(client(), () => createCase(client(), fixture), "23505", "clearance_requests_one_active_employee_idx");
    });

    it.each(["COMPLETED", "CANCELLED"])("allows a fresh case after the previous case becomes %s", async (status) => {
      await createCase(client(), fixture, status);
      await expect(createCase(client(), fixture)).resolves.toEqual(expect.any(String));
      const result = await client().query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM clearance_requests WHERE employee_id = $1", [fixture.employeeId],
      );
      expect(result.rows[0]?.count).toBe(2);
    });

    it("rejects a second active workflow but permits multiple inactive versions", async () => {
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO workflow_templates (category_id, name, version, is_active) VALUES ($1, 'Test Version', 2, true)",
        [fixture.categoryId],
      ), "23505", "workflow_templates_one_active_per_category_unique");
      for (const version of [2, 3]) {
        await client().query(
          "INSERT INTO workflow_templates (category_id, name, version) VALUES ($1, 'Test Version', $2)",
          [fixture.categoryId, version],
        );
      }
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO workflow_templates (category_id, name, version) VALUES ($1, 'Duplicate Version', 2)",
        [fixture.categoryId],
      ), "23505", "workflow_templates_category_version_unique");
    });

    it("rejects orphaned employee, case, stage, issue, approval and certificate relationships", async () => {
      await expectDatabaseError(client(), () => client().query(
        "UPDATE employees SET category_id = $1 WHERE id = $2", [randomUUID(), fixture.employeeId],
      ), "23503");
      await expectDatabaseError(client(), () => createCase(client(), { ...fixture, employeeId: randomUUID() }), "23503");
      await expectDatabaseError(client(), () => createCase(client(), { ...fixture, templateId: randomUUID() }), "23503");
      const requestId = await createCase(client(), fixture);
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO request_stages (request_id, department_id, step_order, rule_snapshot) VALUES ($1, $2, 1, '{}'::jsonb)",
        [requestId, randomUUID()],
      ), "23503");
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO clearance_issues (request_stage_id, reason) VALUES ($1, 'Fictional issue')", [randomUUID()],
      ), "23503");
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO request_approvals (request_id, position_id, step_order) VALUES ($1, $2, 1)",
        [requestId, randomUUID()],
      ), "23503");
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO certificates (request_id, certificate_number, verification_token) VALUES ($1, $2, $3)",
        [randomUUID(), randomUUID(), randomUUID()],
      ), "23503");
    });

    it.each([0, -1])("rejects workflow version %i", async (version) => {
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO workflow_templates (category_id, name, version) VALUES ($1, 'Invalid Version', $2)",
        [fixture.categoryId, version],
      ), "23514", "workflow_templates_version_positive");
    });

    it("requires positive stage and approval order in templates and requests", async () => {
      const requestId = await createCase(client(), fixture);
      const checks: [string, unknown[], string][] = [
        ["INSERT INTO workflow_stage_templates (template_id, department_id, rule_id, step_order) VALUES ($1, $2, $3, 0)",
          [fixture.templateId, fixture.departmentId, fixture.ruleId], "workflow_stage_templates_step_order_positive"],
        ["INSERT INTO workflow_approval_templates (template_id, position_id, step_order) VALUES ($1, $2, 0)",
          [fixture.templateId, fixture.positionId], "workflow_approval_templates_step_order_positive"],
        ["INSERT INTO request_stages (request_id, department_id, step_order, rule_snapshot) VALUES ($1, $2, 0, '{}'::jsonb)",
          [requestId, fixture.departmentId], "request_stages_step_order_positive_check"],
        ["INSERT INTO request_approvals (request_id, position_id, step_order) VALUES ($1, $2, 0)",
          [requestId, fixture.positionId], "request_approvals_step_order_positive_check"],
      ];
      for (const [statement, values, constraint] of checks) {
        await expectDatabaseError(client(), () => client().query(statement, values), "23514", constraint);
      }
    });

    it("requires JSON objects for controlled data and frozen rule snapshots", async () => {
      const requestId = await createCase(client(), fixture);
      await expectDatabaseError(client(), () => client().query(
        `INSERT INTO department_demo_records (employee_id, department_id, "values") VALUES ($1, $2, '[]'::jsonb)`,
        [fixture.employeeId, fixture.departmentId],
      ), "23514", "department_demo_records_values_object");
      await expectDatabaseError(client(), () => client().query(
        "INSERT INTO request_stages (request_id, department_id, step_order, rule_snapshot) VALUES ($1, $2, 1, 'null'::jsonb)",
        [requestId, fixture.departmentId],
      ), "23514", "request_stages_rule_snapshot_object_check");
    });

    it("rejects cancellation and completion without their required evidence", async () => {
      const requestId = await createCase(client(), fixture);
      await expectDatabaseError(client(), () => client().query(
        "UPDATE clearance_requests SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1", [requestId],
      ), "23514", "clearance_requests_cancellation_consistency_check");
      await expectDatabaseError(client(), () => client().query(
        "UPDATE clearance_requests SET status = 'COMPLETED' WHERE id = $1", [requestId],
      ), "23514", "clearance_requests_completion_consistency_check");
    });

    it("requires assignment, matching human decision maker, decision time and return remarks", async () => {
      const requestId = await createCase(client(), fixture);
      await client().query(
        "INSERT INTO request_approvals (request_id, position_id, step_order) VALUES ($1, $2, 1)",
        [requestId, fixture.positionId],
      );
      const invalidUpdates: [string, unknown[], string][] = [
        ["status = 'PENDING'", [], "request_approvals_pending_assignment_check"],
        ["assigned_user_id = $2", [fixture.approverUserId], "request_approvals_assignment_consistency_check"],
        ["status = 'APPROVED', assigned_user_id = $2, assigned_at = now()", [fixture.approverUserId], "request_approvals_decision_consistency_check"],
        ["status = 'APPROVED', assigned_user_id = $2, assigned_at = now(), decided_by_id = $3, decided_at = now()",
          [fixture.approverUserId, fixture.otherApproverUserId], "request_approvals_decision_consistency_check"],
        ["status = 'APPROVED', assigned_user_id = $2, assigned_at = now(), decided_by_id = $2, decided_at = now() - interval '1 second'",
          [fixture.approverUserId], "request_approvals_decision_consistency_check"],
        ["status = 'RETURNED', assigned_user_id = $2, assigned_at = now(), decided_by_id = $2, decided_at = now()",
          [fixture.approverUserId], "request_approvals_return_remarks_check"],
        ["assigned_user_id = $2, assigned_at = now(), decided_by_id = $2, decided_at = now()",
          [fixture.approverUserId], "request_approvals_decision_consistency_check"],
      ];
      for (const [assignment, values, constraint] of invalidUpdates) {
        await expectDatabaseError(client(), () => client().query(
          `UPDATE request_approvals SET ${assignment} WHERE request_id = $1`, [requestId, ...values],
        ), "23514", constraint);
      }
    });

    it.each(["APPROVED", "RETURNED"])("persists a valid %s human decision", async (status) => {
      const requestId = await createCase(client(), fixture);
      const result = await client().query<{ status: string; decided_by_id: string }>(
        `INSERT INTO request_approvals
          (request_id, position_id, step_order, status, assigned_user_id, assigned_at, decided_by_id, decided_at, remarks)
         VALUES ($1, $2, 1, $3, $4, now(), $4, now(), 'Fictional decision remarks')
         RETURNING status, decided_by_id`,
        [requestId, fixture.positionId, status, fixture.approverUserId],
      );
      expect(result.rows).toEqual([{ status, decided_by_id: fixture.approverUserId }]);
    });

    it("enforces one certificate per request and unique certificate numbers and verification tokens", async () => {
      const firstRequestId = await createCase(client(), fixture, "COMPLETED");
      const secondRequestId = await createCase(client(), fixture, "COMPLETED");
      const number = randomUUID();
      const token = randomUUID();
      await client().query(
        "INSERT INTO certificates (request_id, certificate_number, verification_token) VALUES ($1, $2, $3)",
        [firstRequestId, number, token],
      );
      for (const [requestId, certificateNumber, verificationToken, constraint] of [
        [firstRequestId, randomUUID(), randomUUID(), "certificates_request_id_unique"],
        [secondRequestId, number, randomUUID(), "certificates_certificate_number_unique"],
        [secondRequestId, randomUUID(), token, "certificates_verification_token_unique"],
        [secondRequestId, randomUUID(), "too-short", "certificates_verification_token_length"],
      ]) {
        await expectDatabaseError(client(), () => client().query(
          "INSERT INTO certificates (request_id, certificate_number, verification_token) VALUES ($1, $2, $3)",
          [requestId, certificateNumber, verificationToken],
        ), constraint === "certificates_verification_token_length" ? "23514" : "23505", constraint);
      }
    });
  });
});
