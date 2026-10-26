import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { assertTestDatabase, connectTestDatabase } from "./test-database";

// Works from src/db and compiled dist/db; never accepts an arbitrary SQL directory.
export const testMigrationsFolder = resolve(__dirname, "../../drizzle");

export async function migrateTestDatabase(client: PoolClient): Promise<void> {
  // Drizzle creates its ledger before opening the DDL transaction: guard first.
  await assertTestDatabase(client);
  await migrate(drizzle({ client }), {
    migrationsFolder: testMigrationsFolder,
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations",
  });
}

export async function runTestMigrations(
  connectionString: string | undefined = process.env.TEST_DATABASE_URL,
): Promise<void> {
  const connection = await connectTestDatabase(connectionString);
  try {
    await migrateTestDatabase(connection.client);
  } finally {
    await connection.close();
  }
}
