
import { sql } from "drizzle-orm";
import { db, pool } from "./index";

async function main() {
  try {
    const result = await db.execute(sql`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        version() AS postgres_version
    `);

    console.log("Database connection successful");
    console.table(result.rows);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
