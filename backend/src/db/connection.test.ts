
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDatabase, type TestDatabaseConnection } from "./test-database";

describe("PostgreSQL integration tests", () => {
  let connection: TestDatabaseConnection | undefined;

  beforeAll(async () => {
    connection = await connectTestDatabase();
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("connects to the test PostgreSQL database", async () => {
    if (!connection) {
      throw new Error("Guarded test database connection is unavailable");
    }
    const result = await connection.client.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    expect(result.rows).toHaveLength(1);

    const firstRow = result.rows[0];

    if (!firstRow) {
      throw new Error("PostgreSQL returned no rows");
    }

    expect(firstRow.database_name).toBe("e_clearance_test");
  });
});
