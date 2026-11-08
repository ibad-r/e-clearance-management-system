import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../schema";
import { demoData } from "./demo-data";

const mocks = vi.hoisted(() => ({
  assertDatabase: vi.fn(),
  assertMigrations: vi.fn(),
  drizzle: vi.fn(),
}));

vi.mock("./demo-database", () => ({ assertDemoDatabase: mocks.assertDatabase }));
vi.mock("./demo-migrations", () => ({ assertDemoMigrations: mocks.assertMigrations }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocks.drizzle }));

import { seedDemoDatabase } from "./seed-demo";
import { verifyDemoRows } from "./verify-demo";

type Row = { id: string } & Record<string, unknown>;
const client = {} as PoolClient;

function copies(rows: readonly { readonly id: string }[]): Row[] {
  return structuredClone(rows) as Row[];
}

function reviewedRows(): Map<unknown, Row[]> {
  return new Map<unknown, Row[]>([
    [schema.employeeCategories, copies([demoData.category])],
    [schema.clearanceDepartments, copies(demoData.departments)],
    [schema.clearanceRules, copies(demoData.rules)],
    [schema.workflowTemplates, copies([demoData.template])],
    [schema.workflowStageTemplates, copies(demoData.stageMappings)],
    [schema.authorityPositions, copies(demoData.authorityPositions)],
    [schema.workflowApprovalTemplates, copies(demoData.approvalMappings)],
    [schema.employees, copies(demoData.employees)],
    [schema.departmentDemoRecords, copies(demoData.departmentRecords)],
    [schema.clearanceRequests, []],
  ]);
}

function reader(rows: Map<unknown, Row[]>, events: string[] = []) {
  const select = vi.fn(() => ({
    from(table: unknown) {
      if (table === schema.clearanceRequests) events.push("check-template-use");
      const result = Promise.resolve(rows.get(table) ?? []);
      const query = {
        where: vi.fn(() => query),
        limit: vi.fn(() => query),
        for: vi.fn((mode: string) => {
          if (table === schema.workflowTemplates) events.push(`lock-template:${mode}`);
          return query;
        }),
        then: result.then.bind(result),
      };
      return query;
    },
  }));
  return { select };
}

function seedHarness(rows = reviewedRows()) {
  const events: string[] = [];
  const insert = vi.fn((table: unknown) => ({
    table,
    values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })),
  }));
  const transaction = {
    ...reader(rows, events),
    execute: vi.fn().mockResolvedValue(undefined),
    insert,
  };
  const runTransaction = vi.fn(async (run: (tx: typeof transaction) => Promise<unknown>) => {
    events.push("begin");
    try {
      const result = await run(transaction);
      events.push("commit");
      return result;
    } catch (error) {
      events.push("rollback");
      throw error;
    }
  });
  mocks.drizzle.mockReturnValue({ transaction: runTransaction });
  return { rows, events, transaction, runTransaction, insert };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertDatabase.mockResolvedValue(undefined);
  mocks.assertMigrations.mockResolvedValue(undefined);
});

describe("read-only fictional demo verification", () => {
  it("reports configuration counts without declaring authentication ready", async () => {
    const database = reader(reviewedRows()) as unknown as Parameters<typeof verifyDemoRows>[0];
    await expect(verifyDemoRows(database)).resolves.toMatchObject({
      categoryCount: 1,
      employeeCount: 2,
      departmentCount: 2,
      ruleCount: 2,
      stageMappingCount: 2,
      approvalMappingCount: 1,
      departmentRecordCount: 4,
      linkedEmployeeCount: 0,
      unlinkedEmployeeCount: 2,
      authenticationIntegration: "requires-authentication-owner-handoff",
    });
  });

  it("preserves account links and authorized controlled-data corrections", async () => {
    const rows = reviewedRows();
    const employee = rows.get(schema.employees)?.[0];
    const record = rows.get(schema.departmentDemoRecords)?.[0];
    if (!employee || !record) throw new Error("Fictional test data missing");
    employee.userId = randomUUID();
    record.values = { demo_library_items_outstanding: 7 };
    const before = structuredClone([...rows.values()]);
    const database = reader(rows) as unknown as Parameters<typeof verifyDemoRows>[0];
    await expect(verifyDemoRows(database)).resolves.toMatchObject({ linkedEmployeeCount: 1, unlinkedEmployeeCount: 1 });
    expect([...rows.values()]).toEqual(before);
  });

  it("rejects missing stage mappings without writing or repairing them", async () => {
    const rows = reviewedRows();
    rows.set(schema.workflowStageTemplates, []);
    const database = reader(rows) as unknown as Parameters<typeof verifyDemoRows>[0];
    await expect(verifyDemoRows(database)).rejects.toThrow("workflow_stage_templates");
    expect(rows.get(schema.workflowStageTemplates)).toEqual([]);
  });

  it("rejects immutable conflicts without exposing their contents", async () => {
    const rows = reviewedRows();
    const rule = rows.get(schema.clearanceRules)?.[0];
    if (!rule) throw new Error("Fictional rule missing");
    rule.expectedValue = "PRIVATE_CONFLICT_CONTENT";
    const database = reader(rows) as unknown as Parameters<typeof verifyDemoRows>[0];
    let failure: unknown;
    try { await verifyDemoRows(database); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("clearance_rules");
    expect(String(failure)).not.toContain("PRIVATE_CONFLICT_CONTENT");
  });
});

describe("guarded insert-only demo seed orchestration", () => {
  it.each(["target", "migration"])("does not open a transaction when %s verification fails", async (guard) => {
    const harness = seedHarness();
    const verifier = guard === "target" ? mocks.assertDatabase : mocks.assertMigrations;
    verifier.mockRejectedValue(new Error("Verification rejected"));
    await expect(seedDemoDatabase(client)).rejects.toThrow("Verification rejected");
    expect(harness.runTransaction).not.toHaveBeenCalled();
    expect(harness.insert).not.toHaveBeenCalled();
  });

  it("locks the existing template before checking use and never inserts credentials", async () => {
    const harness = seedHarness();
    await expect(seedDemoDatabase(client)).resolves.toMatchObject({ employeeCount: 2 });
    expect(harness.events.indexOf("lock-template:update")).toBeLessThan(harness.events.indexOf("check-template-use"));
    expect(harness.insert.mock.calls.some((call) => call[0] === schema.users)).toBe(false);
    expect(harness.events.at(-1)).toBe("commit");
  });

  it("exits the seed transaction with failure when immutable configuration conflicts", async () => {
    const rows = reviewedRows();
    const department = rows.get(schema.clearanceDepartments)?.[0];
    if (!department) throw new Error("Fictional department missing");
    department.isActive = false;
    const harness = seedHarness(rows);
    await expect(seedDemoDatabase(client)).rejects.toThrow("clearance_departments");
    expect(harness.events.at(-1)).toBe("rollback");
    expect(harness.events).not.toContain("commit");
  });

  it("only verifies a used workflow and refuses to repair missing mappings", async () => {
    const rows = reviewedRows();
    rows.set(schema.clearanceRequests, [{ id: randomUUID() }]);
    rows.set(schema.workflowStageTemplates, []);
    const harness = seedHarness(rows);
    await expect(seedDemoDatabase(client)).rejects.toThrow("workflow_stage_templates");
    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.events.at(-1)).toBe("rollback");
  });
});
