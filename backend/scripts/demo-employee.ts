
import "dotenv/config";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";

import {
  connectTestDatabase,
  validateTestDatabaseUrl,
} from "../src/db/test-database";

const demoEmail = "fictional-case-demo@example.invalid";
const demoName = "Fictional Case Demo Employee";
const employeeNumber = "DEMO-CASE-001";
const designation = "Fictional Employee";
const department = "Fictional Test Department";

async function main() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_DEMO_CONFIRM !== "yes"
  ) {
    throw new Error("Local development confirmation required");
  }

  const action = process.argv[2];

  if (action !== "create" && action !== "cleanup") {
    throw new Error("Use create or cleanup");
  }

  const url = validateTestDatabaseUrl(
    process.env.TEST_DATABASE_URL
  );

  const target = new URL(url);

  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.port !== "55432" ||
    target.username !== "e_clearance_test" ||
    target.pathname !== "/e_clearance_test"
  ) {
    throw new Error("Only the isolated local test database is allowed");
  }

  const connection = await connectTestDatabase(url);
  const client = connection.client;

  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    if (action === "create") {
      const categoryCode = process.env.DEMO_CATEGORY_CODE;

      if (!categoryCode) {
        throw new Error(
          "An approved active test employee category is required"
        );
      }

      const category = await client.query<{ id: string }>(
        `SELECT id FROM public.employee_categories
         WHERE code = $1 AND is_active = true`,
        [categoryCode]
      );

      if (category.rows.length !== 1) {
        throw new Error("Active test employee category not found");
      }

      const password = process.env.DEMO_PASSWORD;

      if (!password || password.length < 12) {
        throw new Error(
          "A fictional demo password of 12+ characters is required"
        );
      }

      const existingUser = await client.query(
        "SELECT id FROM public.users WHERE email = $1",
        [demoEmail]
      );

      const existingEmployee = await client.query(
        `SELECT id FROM public.employees
         WHERE employee_number = $1`,
        [employeeNumber]
      );

      if (
        existingUser.rows.length > 0 ||
        existingEmployee.rows.length > 0
      ) {
        throw new Error("Fictional demo identity already exists");
      }

      const userId = randomUUID();
      const employeeId = randomUUID();

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      await client.query(
        `INSERT INTO public.users
         (id, email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, 'EMPLOYEE', true)`,
        [userId, demoEmail, passwordHash, demoName]
      );

      await client.query(
        `INSERT INTO public.employees
         (id, user_id, employee_number, category_id,
          full_name, designation, department_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          employeeId,
          userId,
          employeeNumber,
          category.rows[0].id,
          demoName,
          designation,
          department,
        ]
      );
    } else {
      const result = await client.query<{ id: string }>(
        `SELECT u.id
         FROM public.users u
         JOIN public.employees e ON e.user_id = u.id
         WHERE u.email = $1
           AND u.full_name = $2
           AND u.role = 'EMPLOYEE'
           AND e.employee_number = $3
           AND e.full_name = $2
           AND e.designation = $4
           AND e.department_name = $5
         FOR UPDATE OF u, e`,
        [
          demoEmail,
          demoName,
          employeeNumber,
          designation,
          department,
        ]
      );

      if (result.rows.length !== 1) {
        throw new Error(
          "Matching linked fictional demo account not found"
        );
      }

      const userId = result.rows[0].id;

      await client.query(
        `DELETE FROM public.employees
         WHERE user_id = $1 AND employee_number = $2`,
        [userId, employeeNumber]
      );

      await client.query(
        `DELETE FROM public.users
         WHERE id = $1 AND email = $2`,
        [userId, demoEmail]
      );
    }

    await client.query("COMMIT");
    transactionOpen = false;

    console.log(
      action === "create"
        ? "Linked fictional demo employee created"
        : "Linked fictional demo employee removed"
    );
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    "Demo operation failed:",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
