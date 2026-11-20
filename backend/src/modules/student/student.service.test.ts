import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createStudentService, type StudentDatabase } from "./student.service";

const identity = { userId: randomUUID(), role: "STUDENT" };
const input = { registrationNumber: "001", fatherName: "Fictional Parent", program: "Fictional Program", semester: "8", reason: "degree completed" as const };
function databaseDouble() {
  const transaction = vi.fn<StudentDatabase["transaction"]>();
  return { transaction, database: { transaction } as unknown as StudentDatabase };
}
describe("Student service trust boundaries and retries", () => {
  it("rejects identity spoofing and invalid fields before touching the database", async () => {
    const { transaction, database } = databaseDouble();
    await expect(createStudentService(database).createRequest(identity, { ...input, sapId: "spoofed" } as typeof input)).rejects.toMatchObject({ name: "ZodError" });
    await expect(createStudentService(database).createRequest({ ...identity, userId: "invalid" }, input)).rejects.toMatchObject({ status: 401 });
    expect(transaction).not.toHaveBeenCalled();
  });
  it("rejects other roles for all service methods", async () => {
    const { transaction, database } = databaseDouble();
    const service = createStudentService(database);
    const employee = { ...identity, role: "EMPLOYEE" };
    for (const promise of [service.getProfile(employee), service.getDashboard(employee), service.listRequests(employee), service.getRequest(employee, randomUUID()), service.createRequest(employee, input)]) {
      await expect(promise).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    }
    expect(transaction).not.toHaveBeenCalled();
  });
  it("maps the database active-request constraint to HTTP 409 without retrying", async () => {
    const { transaction, database } = databaseDouble();
    transaction.mockRejectedValue(new Error("driver wrapper", { cause: { code: "23505", constraint: "student_requests_one_active_profile_idx" } }));
    await expect(createStudentService(database).createRequest(identity, input)).rejects.toMatchObject({ status: 409, code: "ACTIVE_REQUEST_EXISTS" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("bounds reference collisions to three complete transaction attempts", async () => {
    const { transaction, database } = databaseDouble();
    transaction.mockRejectedValue(new Error("driver wrapper", { cause: { code: "23505", constraint: "student_requests_reference_unique" } }));
    await expect(createStudentService(database).createRequest(identity, input)).rejects.toMatchObject({ status: 503, code: "REQUEST_REFERENCE_UNAVAILABLE" });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it.each(["40001", "40P01"])("bounds transient PostgreSQL %s retries", async (code) => {
    const { transaction, database } = databaseDouble();
    transaction.mockRejectedValue(new Error("driver wrapper", { cause: { code } }));
    await expect(createStudentService(database).createRequest(identity, input)).rejects.toMatchObject({ status: 503, code: "REQUEST_CREATION_UNAVAILABLE" });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it("preserves unexpected errors for the safe HTTP error handler", async () => {
    const { transaction, database } = databaseDouble();
    const error = new Error("internal-only");
    transaction.mockRejectedValue(error);
    await expect(createStudentService(database).createRequest(identity, input)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
