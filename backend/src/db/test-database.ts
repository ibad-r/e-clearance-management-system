import { Pool, type PoolClient } from "pg";

export const TEST_DATABASE_NAME = "e_clearance_test";

// Intentionally independent of db/index.ts, dotenv, and DATABASE_URL.
export function validateTestDatabaseUrl(value: string | undefined): string {
  if (!value || value !== value.trim()) {
    throw new Error("An explicit TEST_DATABASE_URL is required.");
  }

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    // URL parsing errors can contain credentials; never propagate their input.
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !target.hostname ||
    target.pathname !== `/${TEST_DATABASE_NAME}` ||
    target.search !== "" ||
    target.hash !== ""
  ) {
    throw new Error(
      "TEST_DATABASE_URL must explicitly target e_clearance_test with a hostname and no query parameters or fragment.",
    );
  }

  return value;
}

// Use this same client for all subsequent migrations and fixture writes.
export async function assertTestDatabase(client: PoolClient): Promise<void> {
  const result = await client.query<{
    database_name: string;
    server_version_num: string;
  }>(
    "SELECT current_database() AS database_name, current_setting('server_version_num') AS server_version_num",
  );
  const identity = result.rows[0];

  if (result.rows.length !== 1 || identity?.database_name !== TEST_DATABASE_NAME) {
    throw new Error("Test database identity verification failed.");
  }

  const version = Number(identity.server_version_num);
  if (!Number.isInteger(version) || version < 180000 || version >= 190000) {
    throw new Error("PostgreSQL 18 is required for migration verification.");
  }
}

export interface TestDatabaseConnection {
  client: PoolClient;
  close(): Promise<void>;
}

export async function connectTestDatabase(
  value: string | undefined = process.env.TEST_DATABASE_URL,
): Promise<TestDatabaseConnection> {
  // Complete URL preflight before even constructing a connection pool.
  const connectionString = validateTestDatabaseUrl(value);
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    // Override PGOPTIONS: generated SQL creates its objects in public.
    options: "-c search_path=public",
  });

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await assertTestDatabase(client);
  } catch {
    client?.release();
    await pool.end();
    throw new Error("Could not verify the isolated PostgreSQL 18 test database.");
  }

  const verifiedClient = client;
  let closed = false;
  return {
    client: verifiedClient,
    async close() {
      if (!closed) {
        closed = true;
        verifiedClient.release();
        await pool.end();
      }
    },
  };
}
