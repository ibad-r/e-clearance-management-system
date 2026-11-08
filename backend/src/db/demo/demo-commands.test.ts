import type { PoolClient } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), close: vi.fn(), inspect: vi.fn(), migrate: vi.fn(), seed: vi.fn(), verify: vi.fn() }));
vi.mock("./demo-database", () => ({ connectDemoDatabase: mocks.connect,
  DEMO_DATABASE_NAME: "e_clearance_demo", DEMO_DATABASE_PORT: "55477", DEMO_DATABASE_ROLE: "e_clearance_demo" }));
vi.mock("./demo-migrations", () => ({ inspectDemoMigrations: mocks.inspect, migrateDemoDatabase: mocks.migrate }));
vi.mock("./seed-demo", () => ({ seedDemoDatabase: mocks.seed }));
vi.mock("./verify-demo", () => ({ verifyDemoDatabase: mocks.verify }));
import { runDemoCommand } from "./demo-commands";

const client = {} as PoolClient;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ client, close: mocks.close });
  mocks.close.mockResolvedValue(undefined);
});

describe("explicit demo CLI commands", () => {
  it.each([undefined, "reset", "drop", "truncate", "unknown"])("rejects unsupported command before connecting (%#)", async (command) => {
    await expect(runDemoCommand(command)).rejects.toThrow("Use demo:inspect");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("requires migration review flag before opening a connection", async () => {
    await expect(runDemoCommand("migrate")).rejects.toThrow("--confirm-reviewed");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each(["inspect", "seed", "verify"])("runs %s on the same checked client and closes it", async (command) => {
    await runDemoCommand(command);
    expect(mocks[command as "inspect" | "seed" | "verify"]).toHaveBeenCalledWith(client);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("passes confirmed review only after explicit command approval", async () => {
    await runDemoCommand("migrate", ["--confirm-reviewed"]);
    expect(mocks.migrate).toHaveBeenCalledWith(client, true);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("reports the confirmed non-secret target during read-only inspection", async () => {
    mocks.inspect.mockResolvedValue({ state: "empty", migrationCount: 0, tableCount: 0, enumCount: 0 });
    await expect(runDemoCommand("inspect")).resolves.toMatchObject({ state: "empty",
      target: { host: "127.0.0.1", port: 55477, database: "e_clearance_demo", role: "e_clearance_demo", postgresMajor: 18 } });
  });
  it("closes the checked client after seed failure", async () => {
    mocks.seed.mockRejectedValue(new Error("Fixture conflict"));
    await expect(runDemoCommand("seed")).rejects.toThrow("Fixture conflict");
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
