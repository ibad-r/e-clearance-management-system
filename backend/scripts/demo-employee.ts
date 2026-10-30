
import "dotenv/config";
import argon2 from "argon2";
import { connectTestDatabase } from "../src/db/test-database";

const demoEmail = "fictional-demo@example.invalid";
const demoName = "Fictional Demo Employee";

async function main() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_DEMO_CONFIRM !== "yes"
  ) {
    throw new Error("Local development confirmation required");
  }

  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error("TEST_DATABASE_URL is required");
  }

  const parsed = new URL(url);

  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.port !== "55432"
  ) {
    throw new Error("Only the local test container is allowed");
  }

  const action = process.argv[2];

  if (action !== "create" && action !== "cleanup") {
    throw new Error("Use create or cleanup");
  }

  const connection = await connectTestDatabase(url);

  try {
    if (action === "create") {
      const password = process.env.DEMO_PASSWORD;

      if (!password || password.length < 12) {
        throw new Error(
          "A demo password of at least 12 characters is required"
        );
      }

      const existing = await connection.client.query(
        "SELECT id FROM public.users WHERE email = $1",
        [demoEmail]
      );

      if (existing.rows.length > 0) {
        throw new Error(
          "Fictional demo account already exists"
        );
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      await connection.client.query(
        `INSERT INTO public.users
         (email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, 'EMPLOYEE', true)`,
        [demoEmail, passwordHash, demoName]
      );

      console.log("Fictional demo account created");
      console.log("Email:", demoEmail);
    } else {
      const result = await connection.client.query(
        `DELETE FROM public.users
         WHERE email = $1
           AND full_name = $2
           AND role = 'EMPLOYEE'`,
        [demoEmail, demoName]
      );

      console.log(
        "Fictional demo accounts removed:",
        result.rowCount
      );
    }
  } finally {
    await connection.close();
  }
}

main().catch(() => {
  console.error(
    "Demo setup failed. Check the isolated test configuration."
  );
  process.exitCode = 1;
});
