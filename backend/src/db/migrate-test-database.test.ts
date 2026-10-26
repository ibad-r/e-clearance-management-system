import { basename } from "node:path";
import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertDatabase: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  drizzle: vi.fn(),
  migrate: vi.fn(),
}));

vi.mock("./test-database", () => ({
  assertTestDatabase: mocks.assertDatabase,
  connectTestDatabase: mocks.connect,
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: mocks.drizzle }));
vi.mock("drizzle-orm/node-postgres/migrator", () => ({ migrate: mocks.migrate }));

import { migrateTestDatabase, runTestMigrations, testMigrationsFolder } from "./migrate-test-database";

// Database calls are mocked in this file; no socket or application pool is imported.
const client = {} as PoolClient;
const database = {};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertDatabase.mockResolvedValue(undefined);
  mocks.drizzle.mockReturnValue(database);
  mocks.migrate.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue({ client, close: mocks.close });
});

describe("guarded test migrator", () => {
  it("never invokes Drizzle when database verification fails", async () => {
    mocks.assertDatabase.mockRejectedValue(new Error("Unsafe target"));
    await expect(migrateTestDatabase(client)).rejects.toThrow("Unsafe target");
    expect(mocks.drizzle).not.toHaveBeenCalled();
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("verifies the same client before passing it to the installed migrator", async () => {
    await migrateTestDatabase(client);
    expect(mocks.assertDatabase).toHaveBeenCalledWith(client);
    expect(mocks.assertDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.drizzle.mock.invocationCallOrder[0]!,
    );
    expect(mocks.drizzle).toHaveBeenCalledWith({ client });
    expect(mocks.migrate).toHaveBeenCalledWith(database, {
      migrationsFolder: testMigrationsFolder,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });
    expect(basename(testMigrationsFolder)).toBe("drizzle");
  });

  it("closes the verified connection after success", async () => {
    await runTestMigrations("explicit-test-target");
    expect(mocks.connect).toHaveBeenCalledWith("explicit-test-target");
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("closes the connection after a migration failure", async () => {
    mocks.migrate.mockRejectedValue(new Error("Migration failed"));
    await expect(runTestMigrations("explicit-test-target")).rejects.toThrow("Migration failed");
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("does not migrate when the guarded connection cannot be opened", async () => {
    mocks.connect.mockRejectedValue(new Error("Connection rejected"));
    await expect(runTestMigrations("explicit-test-target")).rejects.toThrow("Connection rejected");
    expect(mocks.migrate).not.toHaveBeenCalled();
  });
});
