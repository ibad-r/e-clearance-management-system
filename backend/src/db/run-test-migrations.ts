import { runTestMigrations } from "./migrate-test-database";

void runTestMigrations()
  .then(() => {
    console.log("Test database migrations completed successfully.");
  })
  .catch(() => {
    // Do not print raw database/driver errors, URLs or connection credentials.
    console.error("Test migration failed. Check the isolated database configuration and migration files.");
    process.exitCode = 1;
  });
