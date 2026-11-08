import { connectDemoDatabase } from "./demo-database";
import { assertDemoMigrations } from "./demo-migrations";
import { formatSafeError } from "../../utils/safe-error";

async function start(): Promise<void> {
  const connectionString = process.env.DEMO_DATABASE_URL;
  const connection = await connectDemoDatabase(connectionString);
  try {
    await assertDemoMigrations(connection.client);
  } finally {
    await connection.close();
  }
  // Set the verified target before app/db imports. dotenv does not override it.
  process.env.DATABASE_URL = connectionString;
  await import("../../server.js");
}

void start().catch((error: unknown) => {
  console.error(`Demo API startup failed: ${formatSafeError(error)}`);
  process.exitCode = 1;
});
