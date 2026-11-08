import { connectDemoDatabase, DEMO_DATABASE_NAME, DEMO_DATABASE_PORT, DEMO_DATABASE_ROLE } from "./demo-database";
import { inspectDemoMigrations, migrateDemoDatabase } from "./demo-migrations";
import { seedDemoDatabase } from "./seed-demo";
import { verifyDemoDatabase } from "./verify-demo";
import { SafeDiagnosticError } from "../../utils/safe-error";

export async function runDemoCommand(command: string | undefined, flags: string[] = []): Promise<unknown> {
  if (!["inspect", "migrate", "seed", "verify"].includes(command ?? "")
    || flags.some((flag) => flag !== "--confirm-reviewed")
    || (command !== "migrate" && flags.length > 0)) {
    throw new SafeDiagnosticError("Use demo:inspect, demo:migrate -- --confirm-reviewed, demo:seed or demo:verify");
  }
  if (command === "migrate" && !flags.includes("--confirm-reviewed")) {
    throw new SafeDiagnosticError("Migration requires prior target inspection, SQL review and explicit --confirm-reviewed");
  }
  const connection = await connectDemoDatabase();
  try {
    if (command === "inspect") return {
      target: { host: "127.0.0.1", port: Number(DEMO_DATABASE_PORT), database: DEMO_DATABASE_NAME,
        role: DEMO_DATABASE_ROLE, postgresMajor: 18 },
      ...await inspectDemoMigrations(connection.client),
    };
    if (command === "migrate") return await migrateDemoDatabase(connection.client, true);
    if (command === "seed") return await seedDemoDatabase(connection.client);
    return await verifyDemoDatabase(connection.client);
  } finally {
    await connection.close();
  }
}
