import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolCreated: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) {
      mocks.poolCreated(options);
    }
    connect = mocks.connect;
    end = mocks.end;
  },
}));

import { connectTestDatabase, validateTestDatabaseUrl } from "./test-database";

const safeUrl = "postgresql://fictional@localhost:5432/e_clearance_test";

beforeEach(() => {
  vi.resetAllMocks();
  // CI supplies a real test URL; unit cases must never inherit it implicitly.
  vi.stubEnv("TEST_DATABASE_URL", "");
  mocks.end.mockResolvedValue(undefined);
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockResolvedValue({
    rows: [{ database_name: "e_clearance_test", server_version_num: "180001" }],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("test database URL preflight", () => {
  it.each([
    undefined,
    "",
    "not a URL",
    "postgresql://localhost/e_clearance_dev",
    "postgresql://localhost/postgres",
    "postgresql://localhost/another_test_database",
    "postgresql://localhost",
    "postgresql://localhost/",
    "postgresql:///e_clearance_test",
    "postgresql://localhost/e_clearance_test/extra",
    "postgresql://localhost/e_clearance_test/",
    "postgresql://localhost/%65_clearance_test",
    "https://localhost/e_clearance_test",
    "postgresql://localhost/e_clearance_test?database=e_clearance_dev",
    "postgresql://localhost/e_clearance_test?dbname=postgres",
    "postgresql://localhost/e_clearance_test?host=other-host",
    "postgresql://localhost/e_clearance_test?options=-c%20search_path=other",
    "postgresql://localhost/e_clearance_test?sslmode=require",
    "postgresql://localhost/e_clearance_test#fragment",
    " postgresql://localhost/e_clearance_test",
  ])("rejects an unsafe or ambiguous target before creating a pool (%#)", async (url) => {
    await expect(connectTestDatabase(url)).rejects.toThrow();
    expect(mocks.poolCreated).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each([safeUrl, "postgres://localhost/e_clearance_test"])(
    "accepts an explicit supported test URL (%#)",
    (url) => {
      expect(validateTestDatabaseUrl(url)).toBe(url);
    },
  );

  it.each([undefined, ""])("never falls back to DATABASE_URL or PGDATABASE (%#)", async (value) => {
    vi.stubEnv("TEST_DATABASE_URL", value);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/e_clearance_dev");
    vi.stubEnv("PGDATABASE", "e_clearance_dev");
    await expect(connectTestDatabase()).rejects.toThrow("TEST_DATABASE_URL");
    expect(mocks.poolCreated).not.toHaveBeenCalled();
  });

  it("does not include malformed URL input in errors", () => {
    const sensitiveInput = "postgresql://fictional:do-not-print@[invalid/e_clearance_test";
    let thrown: unknown;
    try {
      validateTestDatabaseUrl(sensitiveInput);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).not.toContain("do-not-print");
    expect(String(thrown)).not.toContain(sensitiveInput);
  });
});

describe("connected database identity", () => {
  it("uses only the explicitly configured test URL", async () => {
    vi.stubEnv("TEST_DATABASE_URL", safeUrl);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/e_clearance_dev");
    const connection = await connectTestDatabase();
    expect(mocks.poolCreated).toHaveBeenCalledWith(expect.objectContaining({ connectionString: safeUrl }));
    await connection.close();
  });

  it.each([
    { rows: [] },
    { rows: [{ database_name: "e_clearance_dev", server_version_num: "180000" }] },
    { rows: [{ database_name: "postgres", server_version_num: "180000" }] },
    { rows: [{ database_name: "unexpected", server_version_num: "180000" }] },
    { rows: [{ database_name: "e_clearance_test", server_version_num: "170006" }] },
    { rows: [{ database_name: "e_clearance_test", server_version_num: "190000" }] },
    { rows: [{ database_name: "e_clearance_test", server_version_num: "invalid" }] },
  ])("rejects unexpected database/version results and releases resources (%#)", async (result) => {
    mocks.query.mockResolvedValue(result);
    await expect(connectTestDatabase(safeUrl)).rejects.toThrow("Could not verify");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[0]).toMatch(/^SELECT current_database\(\)/);
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("validates identity before returning a client and closes it once", async () => {
    const connection = await connectTestDatabase(safeUrl);
    expect(mocks.poolCreated).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: safeUrl,
      max: 1,
      options: "-c search_path=public",
    }));
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(connection.client.query).toBe(mocks.query);
    expect(mocks.release).not.toHaveBeenCalled();
    await connection.close();
    await connection.close();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("closes the pool on connection failure without exposing driver details", async () => {
    mocks.connect.mockRejectedValue(new Error("do-not-print connection details"));
    await expect(connectTestDatabase(safeUrl)).rejects.toThrow(
      "Could not verify the isolated PostgreSQL 18 test database.",
    );
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
