
import "dotenv/config";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { Client } from "pg";

const demoEmail = "fictional-case-demo@example.invalid";
const demoName = "Fictional Case Demo Employee";
const employeeNumber = "DEMO-CASE-001";
const designation = "Fictional Employee";
const department = "Fictional Test Department";

function getDemoDatabaseUrl(): string {
  const value = process.env.DEMO_DATABASE_URL;

  if (!value || value !== value.trim()) {
    throw new Error("DEMO_DATABASE_URL is required");
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid DEMO_DATABASE_URL");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "55432" ||
    url.pathname !== "/e_clearance_demo" ||
    !url.username ||
    !url.password ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "Only the local e_clearance_demo database on port 55432 is allowed"
    );
  }

  return value;
}

async function main(): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_DEMO_CONFIRM !== "yes"
  ) {
    throw new Error("Local demo confirmation required");
  }

  const action = process.argv[2];

  if (action !== "create" && action !== "cleanup") {
    throw new Error("Use create or cleanup");
  }

  const connectionString = getDemoDatabaseUrl();

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  let connected = false;
  let transactionOpen = false;

  try {
    await client.connect();
    connected = true;

    // Verify the actual connected database before any writes.
    const identity = await client.query<{ name: string }>(
      "SELECT current_database() AS name"
    );

    if (
      identity.rows.length !== 1 ||
      identity.rows[0]?.name !== "e_clearance_demo"
    ) {
      throw new Error("Demo database identity verification failed");
    }

    await client.query("BEGIN");
    transactionOpen = true;

    if (action === "create") {
      const categoryCode = process.env.DEMO_CATEGORY_CODE;
      const password = process.env.DEMO_PASSWORD;

      if (!categoryCode) {
        throw new Error("DEMO_CATEGORY_CODE is required");
      }

      if (!password || password.length < 12) {
        throw new Error(
          "DEMO_PASSWORD must contain at least 12 characters"
        );
      }

      const category = await client.query<{ id: string }>(
        `SELECT id
         FROM public.employee_categories
         WHERE code = $1 AND is_active = true`,
        [categoryCode]
      );

      if (category.rows.length !== 1) {
        throw new Error(
          "Approved active demo employee category not found"
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
      // Only clean up the matching fictional demo identity.
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
        throw new Error("Matching fictional demo account not found");
      }

      const userId = result.rows[0].id;

      const employeeDeletion = await client.query(
        `DELETE FROM public.employees
         WHERE user_id = $1 AND employee_number = $2`,
        [userId, employeeNumber]
      );

      if (employeeDeletion.rowCount !== 1) {
        throw new Error("Demo employee cleanup was not completed");
      }

      const userDeletion = await client.query(
        `DELETE FROM public.users
         WHERE id = $1 AND email = $2`,
        [userId, demoEmail]
      );

      if (userDeletion.rowCount !== 1) {
        throw new Error("Demo user cleanup was not completed");
      }
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
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
    }

    throw error;
  } finally {
    if (connected) {
      await client.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    "Demo operation failed:",
    error instanceof Error ? error.message : "Unknown error"
  );

  process.exitCode = 1;
});
