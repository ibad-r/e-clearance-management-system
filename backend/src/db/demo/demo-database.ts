
import { Pool, type PoolClient } from "pg";
import { SafeDiagnosticError } from "../../utils/safe-error";

export const DEMO_DATABASE_NAME = "e_clearance_demo";
export const DEMO_DATABASE_PORT = "55477";
export const DEMO_DATABASE_ROLE = "e_clearance_demo";

export function requireDemoEnvironment(): void {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.DEMO_DATABASE_CONFIRMATION !== DEMO_DATABASE_NAME
  ) {
    throw new SafeDiagnosticError(
      "Demo commands require NODE_ENV=development and explicit DEMO_DATABASE_CONFIRMATION=e_clearance_demo",
    );
  }
}

export function validateDemoDatabaseUrl(value: string | undefined): string {
  requireDemoEnvironment();

  if (!value || value !== value.trim()) {
    throw new SafeDiagnosticError("An explicit DEMO_DATABASE_URL is required");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new SafeDiagnosticError("DEMO_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== DEMO_DATABASE_PORT ||
    url.pathname !== `/${DEMO_DATABASE_NAME}` ||
    url.username !== DEMO_DATABASE_ROLE ||
    !url.password ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new SafeDiagnosticError(
      "Demo connection must explicitly target role/database e_clearance_demo at 127.0.0.1:55477 with a password and no query or fragment",
    );
  }

  return value;
}

export async function assertDemoDatabase(
  client: PoolClient,
): Promise<void> {
  requireDemoEnvironment();

  const result = await client.query<{
    database_name: string;
    database_role: string;
    server_version_num: string;
  }>(
    "SELECT current_database() AS database_name, current_user AS database_role, current_setting('server_version_num') AS server_version_num",
  );

  const row = result.rows[0];
  const version = Number(row?.server_version_num);

  if (
    result.rows.length !== 1 ||
    row?.database_name !== DEMO_DATABASE_NAME ||
    row.database_role !== DEMO_DATABASE_ROLE ||
    !Number.isInteger(version) ||
    version < 180000 ||
    version >= 190000
  ) {
    throw new SafeDiagnosticError("Demo PostgreSQL 18 database identity verification failed");
  }
}

export interface DemoConnection {
  client: PoolClient;
  close(): Promise<void>;
}

export async function connectDemoDatabase(
  value: string | undefined = process.env.DEMO_DATABASE_URL,
): Promise<DemoConnection> {
  // No dotenv, DATABASE_URL, TEST_DATABASE_URL, PGDATABASE or application-pool fallback.
  const connectionString = validateDemoDatabaseUrl(value);

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    options: "-c search_path=public",
  });

  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await assertDemoDatabase(client);
  } catch (cause) {
    client?.release();
    await pool.end().catch(() => undefined);

    throw new SafeDiagnosticError(
      "Could not verify the isolated local demo database",
      { cause },
    );
  }

  const verified = client;
  let closed = false;

  return {
    client: verified,

    async close() {
      if (!closed) {
        closed = true;
        verified.release();
        await pool.end();
      }
    },
  };
}
