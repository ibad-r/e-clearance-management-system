import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertDatabase: vi.fn(), drizzle: vi.fn(), migrate: vi.fn() }));
vi.mock("./demo-database", () => ({ assertDemoDatabase: mocks.assertDatabase }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocks.drizzle }));
vi.mock("drizzle-orm/node-postgres/migrator", () => ({ migrate: mocks.migrate }));
import { assertDemoMigrations, demoMigrationsFolder, inspectDemoMigrations, migrateDemoDatabase, reviewedDemoMigrations } from "./demo-migrations";

type ObjectRow = { kind: string; name: string };
const snapshot = JSON.parse(readFileSync(resolve(demoMigrationsFolder, "meta/0000_snapshot.json"), "utf8")) as {
  tables: Record<string, unknown>; enums: Record<string, unknown>;
};
const migratedObjects: ObjectRow[] = [
  ...Object.keys(snapshot.tables).map((name) => ({ kind: "relation", name })),
  ...Object.keys(snapshot.enums).map((name) => ({ kind: "enum", name })),
  { kind: "relation", name: "drizzle.__drizzle_migrations" },
  { kind: "relation", name: "drizzle.__drizzle_migrations_id_seq" },
];
const migrations = reviewedDemoMigrations();
const ledger = migrations.map((entry) => ({ hash: entry.hash, created_at: String(entry.folderMillis) }));

function clientDouble(initialObjects: ObjectRow[] = [], history = ledger) {
  let objects = initialObjects;
  const query = vi.fn(async (statement: string) => ({
    rows: statement.includes("FROM pg_class") ? objects : statement.includes("SELECT hash") ? history : [],
  }));
  const client = { query } as unknown as PoolClient;
  return { client, query, migrateCatalog: () => { objects = migratedObjects; } };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertDatabase.mockResolvedValue(undefined);
  mocks.drizzle.mockReturnValue({});
  mocks.migrate.mockResolvedValue(undefined);
});

describe("reviewed demo migration procedure without database access", () => {
  it("reads the actual existing SQL/journal with no new migration history", () => {
    expect(migrations).toHaveLength(1);
    expect(migrations[0]?.folderMillis).toBe(1793031755049);
    expect(migrations[0]?.sql.join("\n")).toContain('CREATE TABLE "employees"');
  });

  it("requires explicit review confirmation before any client access", async () => {
    const { client, query } = clientDouble();
    await expect(migrateDemoDatabase(client, false)).rejects.toThrow("--confirm-reviewed");
    expect(mocks.assertDatabase).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("rejects failed target verification before catalog reads or migrator writes", async () => {
    const { client, query } = clientDouble();
    mocks.assertDatabase.mockRejectedValue(new Error("Wrong target"));
    await expect(migrateDemoDatabase(client, true)).rejects.toThrow("Wrong target");
    expect(query).not.toHaveBeenCalled();
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it.each([
    { objects: [{ kind: "relation", name: "public.existing_table" }] },
    { objects: [{ kind: "relation", name: "drizzle.__drizzle_migrations" }] },
    { objects: [...migratedObjects, { kind: "routine", name: "public.unexpected_function" }] },
    { objects: [...migratedObjects, { kind: "trigger", name: "public.unexpected_trigger" }] },
  ])("refuses existing, partial or unexpected objects without resets (%#)", async ({ objects }) => {
    const { client } = clientDouble(objects);
    expect((await inspectDemoMigrations(client)).state).toBe("blocked");
    await expect(migrateDemoDatabase(client, true)).rejects.toThrow("manual review");
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("rejects a mismatched ledger before seed or migration", async () => {
    const { client } = clientDouble(migratedObjects, [{ hash: "wrong", created_at: ledger[0]!.created_at }]);
    await expect(assertDemoMigrations(client)).rejects.toThrow("verified reviewed migration");
    await expect(migrateDemoDatabase(client, true)).rejects.toThrow("manual review");
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("applies the installed migrator only to the verified empty target", async () => {
    const { client, query, migrateCatalog } = clientDouble();
    mocks.migrate.mockImplementation(async () => migrateCatalog());
    expect((await migrateDemoDatabase(client, true)).state).toBe("ready");
    expect(mocks.assertDatabase.mock.invocationCallOrder[0]).toBeLessThan(mocks.drizzle.mock.invocationCallOrder[0]!);
    expect(mocks.drizzle).toHaveBeenCalledWith({ client });
    expect(mocks.migrate).toHaveBeenCalledExactlyOnceWith({}, expect.objectContaining({ migrationsFolder: demoMigrationsFolder }));
    expect(query.mock.calls.at(-1)?.[0]).toContain("pg_advisory_unlock");
  });

  it("leaves an already migrated target unchanged on rerun", async () => {
    const { client } = clientDouble(migratedObjects);
    expect((await migrateDemoDatabase(client, true)).state).toBe("ready");
    expect((await migrateDemoDatabase(client, true)).state).toBe("ready");
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("releases the advisory lock on a migration failure", async () => {
    const { client, query } = clientDouble();
    mocks.migrate.mockRejectedValue(new Error("Migration failure"));
    await expect(migrateDemoDatabase(client, true)).rejects.toThrow("Migration failure");
    expect(query.mock.calls.at(-1)?.[0]).toContain("pg_advisory_unlock");
  });
});
