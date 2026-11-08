import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pool: vi.fn(), connect: vi.fn(), query: vi.fn(), release: vi.fn(), end: vi.fn() }));
vi.mock("pg", () => ({ Pool: class {
  constructor(options: unknown) { mocks.pool(options); }
  connect = mocks.connect;
  end = mocks.end;
} }));
import { connectDemoDatabase, validateDemoDatabaseUrl } from "./demo-database";
import { formatSafeError } from "../../utils/safe-error";

// Mock-only fixture, not an account or a usable demonstration credential.
const url = "postgresql://e_clearance_demo:mock-only@127.0.0.1:55477/e_clearance_demo";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DEMO_DATABASE_CONFIRMATION", "e_clearance_demo");
  vi.stubEnv("DEMO_DATABASE_URL", "");
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.end.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ rows: [{ database_name: "e_clearance_demo", database_role: "e_clearance_demo", server_version_num: "180001" }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("isolated demo target guards", () => {
  it.each([
    undefined, "", "invalid", url.replace("e_clearance_demo", "postgres"),
    url.replace("/e_clearance_demo", "/e_clearance_dev"),
    url.replace("/e_clearance_demo", "/e_clearance_test"),
    url.replace("/e_clearance_demo", "/postgres"), url.replace("/e_clearance_demo", "/"),
    url.replace("127.0.0.1", "database.example.invalid"), url.replace("127.0.0.1", "localhost"),
    url.replace("55477", "5432"), url.replace(":55477", ""),
    url.replace("mock-only", ""), url.replace("postgresql:", "https:"),
    `${url}?database=e_clearance_dev`, `${url}?host=other`, `${url}#fragment`,
    `${url}/extra`, url.replace("/e_clearance_demo", "/%65_clearance_demo"), ` ${url}`,
  ])("rejects unsafe/ambiguous targets before pool construction (%#)", async (value) => {
    await expect(connectDemoDatabase(value)).rejects.toThrow();
    expect(mocks.pool).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each(["production", "test", ""])("rejects environment %s before connecting", async (value) => {
    vi.stubEnv("NODE_ENV", value);
    await expect(connectDemoDatabase(url)).rejects.toThrow("NODE_ENV=development");
    expect(mocks.pool).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation and has no application/test URL fallback", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/e_clearance_dev");
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://localhost/e_clearance_test");
    vi.stubEnv("PGDATABASE", "e_clearance_dev");
    await expect(connectDemoDatabase()).rejects.toThrow("DEMO_DATABASE_URL");
    vi.stubEnv("DEMO_DATABASE_CONFIRMATION", "");
    await expect(connectDemoDatabase(url)).rejects.toThrow("DEMO_DATABASE_CONFIRMATION");
    expect(mocks.pool).not.toHaveBeenCalled();
  });

  it("accepts only the explicit reviewed loopback target", () => {
    expect(validateDemoDatabaseUrl(url)).toBe(url);
  });

  it.each([
    { database_name: "e_clearance_dev", database_role: "e_clearance_demo", server_version_num: "180000" },
    { database_name: "e_clearance_demo", database_role: "postgres", server_version_num: "180000" },
    { database_name: "e_clearance_demo", database_role: "e_clearance_demo", server_version_num: "170000" },
    { database_name: "e_clearance_demo", database_role: "e_clearance_demo", server_version_num: "190000" },
    { database_name: "e_clearance_demo", database_role: "e_clearance_demo", server_version_num: "invalid" },
  ])("checks actual identity/version before exposing a writable client (%#)", async (row) => {
    mocks.query.mockResolvedValue({ rows: [row] });
    await expect(connectDemoDatabase(url)).rejects.toThrow("Could not verify");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[0]).toMatch(/^SELECT current_database\(\)/);
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("returns the checked client, fixes search_path and closes once", async () => {
    const connection = await connectDemoDatabase(url);
    expect(connection.client.query).toBe(mocks.query);
    expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ max: 1, options: "-c search_path=public" }));
    await connection.close();
    await connection.close();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("does not expose raw driver errors or malformed connection input", async () => {
    mocks.connect.mockRejectedValue(new Error("private-driver-information"));
    await expect(connectDemoDatabase(url)).rejects.toThrow("Could not verify the isolated local demo database");
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(() => validateDemoDatabaseUrl("postgresql://private:do-not-print@[invalid/"))
      .toThrow("DEMO_DATABASE_URL must be a valid PostgreSQL URL");
  });

  it("preserves an authentication failure for safe CLI diagnostics even if cleanup fails", async () => {
    const cause = Object.assign(new Error("private-driver-information"), { code: "28P01" });
    mocks.connect.mockRejectedValue(cause);
    mocks.end.mockRejectedValue(new Error("cleanup failure"));
    const error = await connectDemoDatabase(url).catch((failure: unknown) => failure);
    expect(error).toHaveProperty("cause", cause);
    expect(formatSafeError(error)).toContain("[28P01]");
    expect(formatSafeError(error)).not.toContain("private-driver-information");
  });
});
