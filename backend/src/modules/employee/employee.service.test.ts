import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createEmployeeCaseService, type EmployeeDatabase } from "./employee.service";
import type { VerifiedEmployeeIdentity } from "./employee.types";

const identity: VerifiedEmployeeIdentity = { userId: randomUUID(), role: "EMPLOYEE" };
const submission = { lastWorkingDate: "2026-11-05", reasonForLeaving: "Fictional service test" };

function databaseDouble() {
  const transaction = vi.fn<EmployeeDatabase["transaction"]>();
  const database = { transaction, select: vi.fn(), insert: vi.fn() } as unknown as EmployeeDatabase;
  return { database, transaction };
}

describe("employee submission boundaries and transaction retries", () => {
  it("rejects direct client identity fields before opening a transaction", async () => {
    const { database, transaction } = databaseDouble();
    const service = createEmployeeCaseService(database);
    const input = { ...submission, employeeId: randomUUID(), initiatedById: randomUUID() };
    await expect(service.createCase(identity, input)).rejects.toMatchObject({ name: "ZodError" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a malformed direct-service principal before opening a transaction", async () => {
    const { database, transaction } = databaseDouble();
    await expect(createEmployeeCaseService(database).createCase({ ...identity, userId: "invalid" }, submission))
      .rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a nonemployee principal before opening a transaction", async () => {
    const { database, transaction } = databaseDouble();
    await expect(createEmployeeCaseService(database).createCase({ ...identity, role: "HR_OFFICER" }, submission))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("maps a PostgreSQL active-case race wrapped by Drizzle to a controlled conflict", async () => {
    const { database, transaction } = databaseDouble();
    transaction.mockRejectedValue(new Error("Driver wrapper", {
      cause: { code: "23505", constraint: "clearance_requests_one_active_employee_idx" },
    }));
    await expect(createEmployeeCaseService(database).createCase(identity, submission))
      .rejects.toMatchObject({ status: 409, code: "ACTIVE_CASE_EXISTS" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("bounds unique request-code collision retries to three whole transactions", async () => {
    const { database, transaction } = databaseDouble();
    transaction.mockRejectedValue(new Error("Driver wrapper", {
      cause: { code: "23505", constraint: "clearance_requests_code_unique" },
    }));
    await expect(createEmployeeCaseService(database).createCase(identity, submission))
      .rejects.toMatchObject({ status: 409, code: "REQUEST_CODE_CONFLICT" });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("bounds serialization retries and returns a controlled retryable conflict", async () => {
    const { database, transaction } = databaseDouble();
    transaction.mockRejectedValue(new Error("Driver wrapper", { cause: { code: "40001" } }));
    await expect(createEmployeeCaseService(database).createCase(identity, submission))
      .rejects.toMatchObject({ status: 409, code: "CASE_CREATION_CONFLICT" });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("preserves unexpected transaction failure for the sanitizing HTTP boundary", async () => {
    const { database, transaction } = databaseDouble();
    const failure = new Error("Internal failure");
    transaction.mockRejectedValue(failure);
    await expect(createEmployeeCaseService(database).createCase(identity, submission)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
