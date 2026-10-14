
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "./index";

describe("PostgreSQL integration tests", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("connects to the test PostgreSQL database", async () => {
    const result = await db.execute(
      sql`SELECT current_database() AS database_name`
    );

    expect(result.rows).toHaveLength(1);

    const firstRow = result.rows[0];

    if (!firstRow) {
      throw new Error("PostgreSQL returned no rows");
    }

    expect(firstRow.database_name).toBe("e_clearance_test");
  });
});
