import { describe, expect, it } from "vitest";
import { formatSafeError, SafeDiagnosticError } from "./safe-error";

describe("safe operational diagnostics", () => {
  it("retains the SQLSTATE through nested driver causes without logging secrets", () => {
    const secret = "do-not-log-credentials-or-tokens";
    const driver = Object.assign(new Error(secret), {
      code: "28P01", detail: secret, query: secret, parameters: [secret],
    });
    const error = new SafeDiagnosticError("Could not verify the isolated local demo database", {
      cause: new Error(secret, { cause: driver }),
    });
    expect(formatSafeError(error)).toContain("[28P01] PostgreSQL password authentication failed");
    expect(formatSafeError(error)).toContain("Could not verify");
    expect(formatSafeError(error)).not.toContain(secret);
  });

  it("reports application-authored guard failures and missing migration files", () => {
    expect(formatSafeError(new SafeDiagnosticError("An explicit DEMO_DATABASE_URL is required")))
      .toBe("An explicit DEMO_DATABASE_URL is required");
    expect(formatSafeError({ code: "ENOENT", path: "private-path", message: "private-message" }))
      .toBe("[ENOENT] A required local file was not found; check the migration folder and journal");
  });

  it("does not trust arbitrary messages, codes, or stacks", () => {
    expect(formatSafeError(Object.assign(new Error("secret"), { code: "secret" })))
      .toBe("Unexpected failure (no safe diagnostic available)");
  });

  it("handles aggregate network failures and cyclic causes", () => {
    const connection = { code: "ECONNREFUSED", cause: {} };
    connection.cause = connection;
    expect(formatSafeError(new AggregateError([connection], "private message")))
      .toBe("[ECONNREFUSED] Database connection refused; check the local service and port");
  });
});
