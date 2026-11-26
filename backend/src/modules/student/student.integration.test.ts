import { randomUUID } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { connectTestDatabase, validateTestDatabaseUrl, type TestDatabaseConnection } from "../../db/test-database";
import { signAccessToken } from "../auth/auth.tokens";
import { initialApplicability } from "./student.policy";
import { createStudentFixtureProvider, retryStudentVerification, type StudentEvidenceProvider } from "./student.verification";
import { createStudentService, type StudentDatabase } from "./student.service";

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const submission = { registrationNumber: "0001-FICTIONAL", fatherName: "Fictional Parent", program: "Fictional Program", semester: "08", reason: "degree completed" as const };
async function fixture(tx: StudentDatabase) {
  const identities = [0, 1, 2].map(() => ({ userId: randomUUID(), role: "STUDENT" }));
  const profileIds = [randomUUID(), randomUUID()];
  await tx.insert(schema.users).values(identities.map((identity, index) => ({
    id: identity.userId, email: randomUUID() + "@example.invalid", passwordHash: "fictional-unusable-hash", fullName: "Fictional Student " + index, role: "STUDENT" as const,
  })));
  await tx.insert(schema.studentProfiles).values(profileIds.map((id, index) => ({
    id, userId: identities[index]!.userId, sapId: "00-" + randomUUID(), registrationNumber: submission.registrationNumber,
    fatherName: submission.fatherName, program: submission.program, semester: submission.semester,
  })));
  return { identities, profileIds };
}
describe("Student PostgreSQL services", { concurrent: false }, () => {
  let connection: TestDatabaseConnection | undefined;
  let database: Database;
  beforeAll(async () => {
    connection = await connectTestDatabase();
    database = drizzle({ client: connection.client, schema });
    expect((await connection.client.query('SELECT count(*)::integer AS total FROM drizzle."__drizzle_migrations"')).rows[0].total).toBe(7);
  });
  afterAll(async () => { await connection?.close(); });
  async function withFixture(run: (tx: Transaction, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
    const rollback = new Error("rollback fictional Student fixtures");
    try {
      await database.transaction(async (tx) => {
        const f = await fixture(tx);
        await run(tx, f);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
  async function requestCount(tx: StudentDatabase, profileId: string) {
    return (await tx.select({ total: count() }).from(schema.studentRequests).where(eq(schema.studentRequests.studentProfileId, profileId)))[0]!.total;
  }
  it("completes only configured fully resolved results and preserves completion history", async () => {
    await withFixture(async (tx, f) => {
      const provider: StudentEvidenceProvider = () => ({ rule: { metricKey: "fictional_ready", operator: "EQ", expectedValue: true },
        metrics: { fictional_ready: true }, ruleVersion: "fictional-v1", datasetVersion: "fictional-v1", datasetUpdatedAt: "2026-11-25T00:00:00Z" });
      const service = createStudentService(tx, { evidenceProvider: provider, allowAutomaticCompletion: true,
        resolveApplicability: () => schema.studentDepartmentCodeEnum.enumValues.map((departmentCode) => ({ departmentCode,
          applicability: departmentCode === "LABORATORY" ? "NOT_REQUIRED" : "REQUIRED", source: "fictional-approved-test-v1" })) });
      const result = await service.createRequest(f.identities[0]!, submission);
      expect(result.status).toBe("COMPLETED"); expect(result.isActive).toBe(false);
      expect(Date.parse(result.closedAt!)).toBeGreaterThanOrEqual(Date.parse(result.submittedAt));
      const dashboard = await service.getDashboard(f.identities[0]!);
      expect(dashboard.activeRequest).toBeNull(); expect(dashboard.departments).toEqual([]);
      expect(dashboard.history.closedRequestCount).toBe(1);
      expect(dashboard.history.latestClosedRequest?.id).toBe(result.id);
      expect(await service.getRequest(f.identities[0]!, result.id)).toEqual(result);
      const terminal = await retryStudentVerification(tx, result.id, () => { throw new Error("Terminal request must not evaluate"); });
      expect(terminal.status).toBe("COMPLETED");
      const audit = await tx.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, result.id));
      expect(audit).toHaveLength(1); expect(audit[0]!.action).toBe("STUDENT_REQUEST_STATUS_CHANGED");
      expect((await service.createRequest(f.identities[0]!, submission)).status).toBe("COMPLETED");
      const requiredLab = await createStudentService(tx, { evidenceProvider: provider, allowAutomaticCompletion: true,
        resolveApplicability: () => schema.studentDepartmentCodeEnum.enumValues.map((departmentCode) => ({ departmentCode,
          applicability: "REQUIRED", source: "fictional-required-lab-test-v1" })) }).createRequest(f.identities[1]!, submission);
      expect(requiredLab.departments.every((row) => row.status === "CLEARED")).toBe(true);
      expect(requiredLab.departments[3]!.status).toBe("CLEARED"); expect(requiredLab.status).toBe("COMPLETED");
    });
  });
  it("retains immutable attempts, retries changed incomplete evidence, and gates obligation rechecks", async () => {
    await withFixture(async (tx, f) => {
      let metric: unknown = undefined;
      let version = 1;
      const provider: StudentEvidenceProvider = () => ({ rule: { metricKey: "fictional_ready", operator: "EQ", expectedValue: true },
        metrics: metric === undefined ? {} : { fictional_ready: metric }, ruleVersion: "fictional-v1",
        datasetVersion: "fictional-v" + version, datasetUpdatedAt: "2026-11-25T00:00:00Z" });
      const service = createStudentService(tx, { evidenceProvider: provider,
        visibleReasons: { "fictional-v1": { failed: "Fictional approved obligation.", incomplete: "Fictional evidence is unavailable." } } });
      const result = await service.createRequest(f.identities[0]!, submission);
      const savedRows = () => tx.select().from(schema.studentRequestDepartments).where(eq(schema.studentRequestDepartments.requestId, result.id));
      const first = (await savedRows()).find((row) => row.departmentCode === "LIBRARY")!.verificationSnapshot!;
      await retryStudentVerification(tx, result.id, provider);
      expect((await savedRows()).find((row) => row.departmentCode === "LIBRARY")!.verificationSnapshot).toEqual(first);
      metric = false; version++;
      await retryStudentVerification(tx, result.id, provider);
      expect((await service.getRequest(f.identities[0]!, result.id)).departments[0]!.status).toBe("ACTION_REQUIRED");
      const second = (await savedRows()).find((row) => row.departmentCode === "LIBRARY")!.verificationSnapshot!;
      expect(second.attempts).toEqual([...(first.attempts as unknown[]), expect.objectContaining({ outcome: "FAIL", attempt: 2 })]);
      metric = true; version++;
      await retryStudentVerification(tx, result.id, provider);
      expect((await savedRows()).find((row) => row.departmentCode === "LIBRARY")!.status).toBe("ACTION_REQUIRED");
      await retryStudentVerification(tx, result.id, provider, { mode: "RECHECK_OUTSTANDING", allowOutstandingRecheck: true });
      const third = (await savedRows()).find((row) => row.departmentCode === "LIBRARY")!;
      expect(third.status).toBe("CLEARED");
      expect((third.verificationSnapshot!.attempts as unknown[])).toHaveLength(3);
      expect(third.studentVisibleRemarks).toBeNull();
      expect((await service.getRequest(f.identities[0]!, result.id)).departments[3]!.applicability).toBe("UNDETERMINED");
    });
  });
  it("rolls back Student results and parent when the verification audit insert fails", async () => {
    await withFixture(async (tx, f) => {
      const failure = new Error("Fictional Student audit failure");
      const wrap = (transaction: Transaction): Transaction => new Proxy(transaction, { get(target, key) {
        if (key === "transaction") return (run: (nested: Transaction) => Promise<unknown>) => target.transaction((nested) => run(wrap(nested)));
        if (key === "insert") return (table: unknown) => { if (table === schema.auditLogs) throw failure; return target.insert(table as typeof schema.studentRequests); };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
      await expect(createStudentService(wrap(tx)).createRequest(f.identities[0]!, submission)).rejects.toBe(failure);
      expect(await requestCount(tx, f.profileIds[0]!)).toBe(0);
    });
  });
  it("bounds incomplete Student verification attempts even when evidence keeps changing", async () => {
    await withFixture(async (tx, f) => {
      let version = 1;
      const provider: StudentEvidenceProvider = () => ({ rule: { metricKey: "fictional_missing", operator: "EQ", expectedValue: true },
        metrics: {}, ruleVersion: "fictional-v1", datasetVersion: "fictional-v" + version, datasetUpdatedAt: "2026-11-25T00:00:00Z" });
      const result = await createStudentService(tx, { evidenceProvider: provider }).createRequest(f.identities[0]!, submission);
      for (version = 2; version < 6; version++) await retryStudentVerification(tx, result.id, provider);
      const rows = await tx.select().from(schema.studentRequestDepartments).where(eq(schema.studentRequestDepartments.requestId, result.id));
      for (const row of rows.filter((row) => row.applicability === "REQUIRED")) {
        expect(row.status).toBe("PENDING"); expect(row.verificationSnapshot!.attempts).toHaveLength(3);
      }
    });
  });
  it.each(["2026", "not-a-date", ""])("never clears positive metrics with malformed provenance timestamp %j", async (datasetUpdatedAt) => {
    await withFixture(async (tx, f) => {
      const provider: StudentEvidenceProvider = () => ({ rule: { metricKey: "fictional_ready", operator: "EQ", expectedValue: true },
        metrics: { fictional_ready: true }, ruleVersion: "fictional-v1", datasetVersion: "fictional-v1", datasetUpdatedAt });
      const result = await createStudentService(tx, { evidenceProvider: provider }).createRequest(f.identities[0]!, submission);
      expect(result.status).toBe("IN_PROGRESS");
      expect(result.departments.every((row) => row.status === "PENDING")).toBe(true);
      const [row] = await tx.select().from(schema.studentRequestDepartments).where(and(eq(schema.studentRequestDepartments.requestId, result.id), eq(schema.studentRequestDepartments.departmentCode, "LIBRARY")));
      expect(row!.verificationSnapshot).toMatchObject({ outcome: "INCOMPLETE", reason: "PROVENANCE_MISSING", datasetUpdatedAt: null });
    });
  });
  it("loads the academic profile from verified users and handles a missing profile", async () => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx);
      const profile = await service.getProfile(f.identities[0]!);
      expect(profile).toMatchObject({ studentName: "Fictional Student 0", semester: "08", registrationNumber: "0001-FICTIONAL" });
      expect(profile.sapId.startsWith("00-")).toBe(true);
      expect(Object.keys(profile).sort()).toEqual(["sapId", "studentName", "registrationNumber", "fatherName", "program", "semester"].sort());
      await expect(service.getProfile(f.identities[2]!)).rejects.toMatchObject({ status: 404, code: "STUDENT_PROFILE_NOT_FOUND" });
    });
  });
  it("creates a request and exactly five honest independent department rows", async () => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx);
      const item = await service.createRequest(f.identities[0]!, submission);
      expect(item).toMatchObject({ status: "IN_PROGRESS", isActive: true, closedAt: null, studentName: "Fictional Student 0" });
      expect(item.requestReference).toMatch(/^SC-[A-F0-9]{32}$/);
      expect(item.departments).toHaveLength(5);
      expect(item.departments.every((d) =>
        d.status === "PENDING" && d.remarks === null,
      )).toBe(true);

      expect(item.departments.filter((d) =>
        d.applicability === "REQUIRED",
      ).every((d) => d.updatedAt !== null)).toBe(true);

      expect(item.departments.find((d) =>
        d.departmentCode === "LABORATORY",
      )?.updatedAt).toBeNull();
      expect(item.departments.find((d) => d.departmentCode === "LABORATORY")!.applicability).toBe("UNDETERMINED");
      expect(await service.getRequest(f.identities[0]!, item.id)).toEqual(item);
      expect(await requestCount(tx, f.profileIds[0]!)).toBe(1);
      expect((await tx.select().from(schema.studentRequestDepartments).where(eq(schema.studentRequestDepartments.requestId, item.id))).every((row) => row.applicabilitySource.length > 0)).toBe(true);
    });
  });
  it("persists automatic clearance results and safe incomplete outcomes", async () => {
    await withFixture(async (tx, f) => {
      const evidence = (value: number) => ({
        rule: {
          metricKey: "fictionalMetric",
          operator: "EQ",
          expectedValue: 0,
        },
        metrics: { fictionalMetric: value },
        ruleVersion: "fictional-rule-v1",
        datasetVersion: "fictional-data-v1",
        datasetUpdatedAt: new Date().toISOString(),
      });

      const provider = createStudentFixtureProvider([
        {
          profileId: f.profileIds[0]!,
          departmentCode: "LIBRARY",
          evidence: evidence(0),
        },
        {
          profileId: f.profileIds[0]!,
          departmentCode: "FEE_DUES",
          evidence: evidence(2),
        },
      ]);

      let calls = 0;

      const service = createStudentService(tx, {
        evidenceProvider: (profileId, departmentCode) => {
          calls++;
          return provider(profileId, departmentCode);
        },
      });

      const item = await service.createRequest(
        f.identities[0]!,
        submission,
      );

      expect(item.departments).toHaveLength(5);
      expect(item.status).toBe("IN_PROGRESS");

      expect(Object.fromEntries(
        item.departments.map((d) => [
          d.departmentCode,
          d.status,
        ]),
      )).toEqual({
        LIBRARY: "CLEARED",
        FEE_DUES: "ACTION_REQUIRED",
        STUDENT_SERVICE: "PENDING",
        LABORATORY: "PENDING",
        COORDINATION_OFFICE: "PENDING",
      });

      expect(item.departments.find((d) =>
        d.departmentCode === "LABORATORY",
      )?.applicability).toBe("UNDETERMINED");

      const dashboard = await service.getDashboard(
        f.identities[0]!,
      );

      expect(dashboard.progress).toEqual({
        requiredCount: 4,
        clearedRequiredCount: 1,
        actionRequiredCount: 1,
        notRequiredCount: 0,
        undeterminedCount: 1,
      });

      expect(dashboard.departments).toEqual(item.departments);

      expect(await service.getRequest(
        f.identities[0]!,
        item.id,
      )).toEqual(item);

      // GET operations must never invoke verification.
      expect(calls).toBe(4);

      const departments = await tx.select()
        .from(schema.studentRequestDepartments)
        .where(eq(
          schema.studentRequestDepartments.requestId,
          item.id,
        ));

      const audits = await tx.select()
        .from(schema.auditLogs)
        .where(inArray(
          schema.auditLogs.entityId,
          departments.map((d) => d.id),
        ));

      expect(audits).toHaveLength(4);

      expect(audits.every((a) =>
        a.requestId === null
        && a.actorUserId === null
        && a.action === "STUDENT_DEPARTMENT_VERIFIED",
      )).toBe(true);

      expect(item.departments.every((d) =>
        d.remarks === null,
      )).toBe(true);
    });
  });

  it("rolls back Student submission when verification fails", async () => {
    await withFixture(async (tx, f) => {
      const failure = new Error("Fictional provider failure");
      let calls = 0;

      const service = createStudentService(tx, {
        evidenceProvider: () => {
          calls++;
          if (calls === 2) throw failure;
          return undefined;
        },
      });

      await expect(service.createRequest(
        f.identities[0]!,
        submission,
      )).rejects.toBe(failure);

      expect(await requestCount(
        tx,
        f.profileIds[0]!,
      )).toBe(0);
    });
  });

  it("rejects profile edits and client identity without persisting requests", async () => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx);
      for (const field of ["registrationNumber", "fatherName", "program", "semester"]) {
        await expect(service.createRequest(f.identities[0]!, { ...submission, [field]: "changed" })).rejects.toMatchObject({ status: 422, code: "PROFILE_MISMATCH" });
      }
      await expect(service.createRequest(f.identities[0]!, { ...submission, sapId: "spoofed" } as typeof submission)).rejects.toMatchObject({ name: "ZodError" });
      expect(await requestCount(tx, f.profileIds[0]!)).toBe(0);
    });
  });
  it("isolates profile, detail, list and dashboard history by owner", async () => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx);
      const first = await service.createRequest(f.identities[0]!, submission);
      const second = await service.createRequest(f.identities[1]!, submission);
      await tx.update(schema.studentRequests).set({ status: "CANCELLED", closedAt: new Date(), updatedAt: new Date() }).where(eq(schema.studentRequests.id, second.id));
      for (const id of [second.id, randomUUID()]) {
        await expect(service.getRequest(f.identities[0]!, id)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND", message: "Student request not found" });
      }
      expect((await service.listRequests(f.identities[0]!)).map((item) => item.id)).toEqual([first.id]);
      expect((await service.getDashboard(f.identities[0]!)).history).toEqual({ closedRequestCount: 0, latestClosedRequest: null });
      expect((await service.getProfile(f.identities[0]!)).studentName).toBe("Fictional Student 0");
      expect((await service.getProfile(f.identities[1]!)).studentName).toBe("Fictional Student 1");
    });
  });
  it.each(["COMPLETED", "CANCELLED"] as const)("retains %s history and releases the active slot", async (status) => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx);
      const first = await service.createRequest(f.identities[0]!, submission);
      await expect(service.createRequest(f.identities[0]!, submission)).rejects.toMatchObject({ status: 409, code: "ACTIVE_REQUEST_EXISTS" });
      await tx.update(schema.studentRequests).set({ status, closedAt: new Date(), updatedAt: new Date() }).where(eq(schema.studentRequests.id, first.id));
      const empty = await service.getDashboard(f.identities[0]!);
      expect(empty).toMatchObject({ activeRequest: null, departments: [], progress: null, history: { closedRequestCount: 1, latestClosedRequest: { id: first.id, status, isActive: false } } });
      const second = await service.createRequest(f.identities[0]!, { ...submission, reason: "discontinuing studies" });
      expect((await service.listRequests(f.identities[0]!)).map((item) => item.id)).toEqual([second.id, first.id]);
      expect((await service.getRequest(f.identities[0]!, first.id)).status).toBe(status);
    });
  });
  it("returns correct dashboard states and independent recorded progress", async () => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx);
      expect(await service.getDashboard(f.identities[0]!)).toMatchObject({ activeRequest: null, progress: null, departments: [], history: { closedRequestCount: 0, latestClosedRequest: null } });
      const item = await service.createRequest(f.identities[0]!, submission);
      await tx.update(schema.studentRequestDepartments).set({ status: "CLEARED", updatedAt: new Date(), remarks: "Private staff note" })
        .where(and(eq(schema.studentRequestDepartments.requestId, item.id), eq(schema.studentRequestDepartments.departmentCode, "COORDINATION_OFFICE")));
      await tx.update(schema.studentRequestDepartments).set({ status: "ACTION_REQUIRED", updatedAt: new Date() })
        .where(and(eq(schema.studentRequestDepartments.requestId, item.id), eq(schema.studentRequestDepartments.departmentCode, "LIBRARY")));
      const dashboard = await service.getDashboard(f.identities[0]!);
      expect(dashboard.progress).toEqual({ requiredCount: 4, clearedRequiredCount: 1, actionRequiredCount: 1, notRequiredCount: 0, undeterminedCount: 1 });
      expect(dashboard.activeRequest?.status).toBe("IN_PROGRESS");
      expect(dashboard.departments).toEqual((await service.getRequest(f.identities[0]!, item.id)).departments);
      expect(dashboard.departments.every((d) => d.remarks === null)).toBe(true);
    });
  });
  it.each(["REQUIRED", "NOT_REQUIRED"] as const)("uses an explicit configured Laboratory determination of %s", async (applicability) => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx, { resolveApplicability: async (profile) => (await initialApplicability(profile)).map((d) =>
        d.departmentCode === "LABORATORY" ? { ...d, applicability, source: "fictional-configured-lab" } : d) });
      const item = await service.createRequest(f.identities[0]!, submission);
      expect(item.departments.find((d) => d.departmentCode === "LABORATORY")).toMatchObject({ applicability, status: applicability === "REQUIRED" ? "PENDING" : "NOT_REQUIRED" });
    });
  });
  it("fails incomplete configuration without committing a parent or child row", async () => {
    await withFixture(async (tx, f) => {
      await expect(createStudentService(tx, { resolveApplicability: () => [] }).createRequest(f.identities[0]!, submission))
        .rejects.toMatchObject({ status: 503, code: "STUDENT_CONFIGURATION_INVALID" });
      expect(await requestCount(tx, f.profileIds[0]!)).toBe(0);
    });
  });
  it("rolls back a persisted parent when department insertion fails", async () => {
    await withFixture(async (tx, f) => {
      const failure = new Error("fictional child-write failure");
      const failing = new Proxy(tx, {
        get(target, property) {
          if (property === "transaction") return (run: (db: StudentDatabase) => Promise<unknown>) => target.transaction(async (nested) =>
            run(new Proxy(nested, {
              get(inner, key) {
                if (key === "insert") return (table: unknown) => {
                  if (table === schema.studentRequestDepartments) throw failure;
                  return inner.insert(table as typeof schema.studentRequests);
                };
                const value = Reflect.get(inner, key);
                return typeof value === "function" ? value.bind(inner) : value;
              },
            })));
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      await expect(createStudentService(failing).createRequest(f.identities[0]!, submission)).rejects.toBe(failure);
      expect(await requestCount(tx, f.profileIds[0]!)).toBe(0);
    });
  });
  it("retries a reference collision, retaining exactly one parent and five children", async () => {
    await withFixture(async (tx, f) => {
      const first = await createStudentService(tx).createRequest(f.identities[1]!, submission);
      let calls = 0;
      const reference = "FICTIONAL-" + randomUUID();
      const item = await createStudentService(tx, { generateReference: () => ++calls === 1 ? first.requestReference : reference })
        .createRequest(f.identities[0]!, submission);
      expect(calls).toBe(2);
      expect(item.requestReference).toBe(reference);
      expect(await requestCount(tx, f.profileIds[0]!)).toBe(1);
      expect(item.departments).toHaveLength(5);
      await tx.update(schema.studentRequests).set({ status: "CANCELLED", closedAt: new Date() }).where(eq(schema.studentRequests.id, item.id));
      await expect(createStudentService(tx, { generateReference: () => reference }).createRequest(f.identities[0]!, submission))
        .rejects.toMatchObject({ status: 503, code: "REQUEST_REFERENCE_UNAVAILABLE" });
      expect(await requestCount(tx, f.profileIds[0]!)).toBe(1);
    });
  });
  it("preserves submitted identity after current user and profile changes", async () => {
    await withFixture(async (tx, f) => {
      const service = createStudentService(tx);
      const item = await service.createRequest(f.identities[0]!, submission);
      await tx.update(schema.users).set({ fullName: "Changed Fictional Name" }).where(eq(schema.users.id, f.identities[0]!.userId));
      await tx.update(schema.studentProfiles).set({ program: "Changed Fictional Program" }).where(eq(schema.studentProfiles.id, f.profileIds[0]!));
      expect((await service.getProfile(f.identities[0]!)).studentName).toBe("Changed Fictional Name");
      expect(await service.getRequest(f.identities[0]!, item.id)).toEqual(item);
    });
  });
  it("rechecks database user activity and role", async () => {
    await withFixture(async (tx, f) => {
      await tx.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, f.identities[0]!.userId));
      await expect(createStudentService(tx).getProfile(f.identities[0]!)).rejects.toMatchObject({ status: 401 });
      await tx.update(schema.users).set({ isActive: true, role: "EMPLOYEE" }).where(eq(schema.users.id, f.identities[0]!.userId));
      await expect(createStudentService(tx).getProfile(f.identities[0]!)).rejects.toMatchObject({ status: 403 });
    });
  });
  it("enforces Student uniqueness, department consistency and closure constraints in PostgreSQL", async () => {
    await withFixture(async (tx, f) => {
      const [profile] = await tx.select().from(schema.studentProfiles).where(eq(schema.studentProfiles.id, f.profileIds[0]!));
      await expect(tx.transaction(async (nested) => { await nested.insert(schema.studentProfiles).values({ ...profile!, id: randomUUID() }); })).rejects.toMatchObject({ cause: { code: "23505" } });
      const item = await createStudentService(tx).createRequest(f.identities[0]!, submission);
      const [row] = await tx.select().from(schema.studentRequests).where(eq(schema.studentRequests.id, item.id));
      await expect(tx.transaction(async (nested) => { await nested.insert(schema.studentRequests).values({ ...row!, id: randomUUID(), requestReference: randomUUID() }); }))
        .rejects.toMatchObject({ cause: { code: "23505", constraint: "student_requests_one_active_profile_idx" } });
      await expect(tx.transaction(async (nested) => { await nested.update(schema.studentRequests).set({ status: "COMPLETED" }).where(eq(schema.studentRequests.id, item.id)); }))
        .rejects.toMatchObject({ cause: { code: "23514", constraint: "student_requests_closure_check" } });
      await expect(tx.transaction(async (nested) => { await nested.update(schema.studentRequestDepartments).set({ status: "CLEARED" })
        .where(and(eq(schema.studentRequestDepartments.requestId, item.id), eq(schema.studentRequestDepartments.departmentCode, "LABORATORY"))); }))
        .rejects.toMatchObject({ cause: { code: "23514", constraint: "student_request_departments_state_check" } });
    });
  });
  it("permits only one successful real concurrent submission on independent connections", async () => {
    const first = await connectTestDatabase();
    const second = await connectTestDatabase();
    const db1 = drizzle({ client: first.client, schema });
    const db2 = drizzle({ client: second.client, schema });
    let f: Awaited<ReturnType<typeof fixture>> | undefined;
    try {
      f = await db1.transaction((tx) => fixture(tx));
      const results = await Promise.allSettled([
        createStudentService(db1).createRequest(f.identities[0]!, submission),
        createStudentService(db2).createRequest(f.identities[0]!, submission),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected && rejected.status === "rejected" ? rejected.reason : null).toMatchObject({ status: 409, code: "ACTIVE_REQUEST_EXISTS" });
      expect(await requestCount(db1, f.profileIds[0]!)).toBe(1);
      const children = await db1.select({ total: count() }).from(schema.studentRequestDepartments).innerJoin(schema.studentRequests, eq(schema.studentRequestDepartments.requestId, schema.studentRequests.id))
        .where(eq(schema.studentRequests.studentProfileId, f.profileIds[0]!));
      expect(children[0]!.total).toBe(5);
    } finally {
      try {
        if (f) {
          const ids = (await db1.select({ id: schema.studentRequests.id }).from(schema.studentRequests).where(inArray(schema.studentRequests.studentProfileId, f.profileIds))).map((row) => row.id);
          if (ids.length) {
          const departmentRows = await db1.select()
            .from(schema.studentRequestDepartments)
            .where(inArray(schema.studentRequestDepartments.requestId, ids));

          if (departmentRows.length) {
            await db1.delete(schema.auditLogs).where(and(
              eq(schema.auditLogs.action, "STUDENT_DEPARTMENT_VERIFIED"),
              inArray(schema.auditLogs.entityId, departmentRows.map((row) => row.id)),
            ));
          }

          await db1.delete(schema.studentRequestDepartments)
            .where(inArray(schema.studentRequestDepartments.requestId, ids));
        }
          await db1.delete(schema.studentRequests).where(inArray(schema.studentRequests.studentProfileId, f.profileIds));
          await db1.delete(schema.studentProfiles).where(inArray(schema.studentProfiles.id, f.profileIds));
          await db1.delete(schema.users).where(inArray(schema.users.id, f.identities.map((identity) => identity.userId)));
        }
      } finally { await first.close(); await second.close(); }
    }
  }, 30000);
});

describe("Mounted Student API with real JWT and PostgreSQL", { concurrent: false }, () => {
  let connection: TestDatabaseConnection | undefined;
  let database: Database;
  let f: Awaited<ReturnType<typeof fixture>>;
  let app: typeof import("../../app")["app"];
  let appLoaded = false;
  const employeeId = randomUUID();
  const previousDatabase = process.env.DATABASE_URL;
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.DATABASE_URL = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    process.env.JWT_SECRET = randomUUID() + randomUUID();
    connection = await connectTestDatabase();
    database = drizzle({ client: connection.client, schema });
    f = await database.transaction((tx) => fixture(tx));
    await database.insert(schema.users).values({ id: employeeId, email: randomUUID() + "@example.invalid", passwordHash: "fictional-unusable-hash", fullName: "Fictional Employee", role: "EMPLOYEE" });
    app = (await import("../../app.js")).app;
    appLoaded = true;
  });
  afterAll(async () => {
    try {
      if (connection && f) {
        const ids = (await database.select({ id: schema.studentRequests.id }).from(schema.studentRequests).where(inArray(schema.studentRequests.studentProfileId, f.profileIds))).map((row) => row.id);
        if (ids.length) {
          const departmentRows = await database.select()
            .from(schema.studentRequestDepartments)
            .where(inArray(schema.studentRequestDepartments.requestId, ids));

          if (departmentRows.length) {
            await database.delete(schema.auditLogs).where(and(
              eq(schema.auditLogs.action, "STUDENT_DEPARTMENT_VERIFIED"),
              inArray(schema.auditLogs.entityId, departmentRows.map((row) => row.id)),
            ));
          }

          await database.delete(schema.studentRequestDepartments)
            .where(inArray(schema.studentRequestDepartments.requestId, ids));
        }
        await database.delete(schema.studentRequests).where(inArray(schema.studentRequests.studentProfileId, f.profileIds));
        await database.delete(schema.studentProfiles).where(inArray(schema.studentProfiles.id, f.profileIds));
        await database.delete(schema.users).where(inArray(schema.users.id, [...f.identities.map((identity) => identity.userId), employeeId]));
      }
    } finally {
      await connection?.close();
      if (appLoaded) await (await import("../../db/index.js")).pool.end();
      if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
      if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    }
  });
  it("protects every mounted Student operation from missing, invalid and Employee JWTs", async () => {
    const employeeToken = signAccessToken(employeeId, "EMPLOYEE");
    for (const path of ["/profile", "/dashboard", "/requests", "/requests/" + randomUUID()]) {
      for (const token of [undefined, "invalid", employeeToken]) {
        const call = request(app).get("/api/v1/student" + path);
        if (token) call.set("Authorization", "Bearer " + token);
        expect((await call).status).toBe(token === employeeToken ? 403 : 401);
      }
    }
    expect((await request(app).post("/api/v1/student/requests").send(submission)).status).toBe(401);
    expect((await request(app).post("/api/v1/student/requests").set("Authorization", "Bearer " + employeeToken).send(submission)).status).toBe(403);
  });
  it("uses verified ownership for all five endpoints and rejects impersonation", async () => {
    const token = signAccessToken(f.identities[0]!.userId, "STUDENT");
    const otherToken = signAccessToken(f.identities[1]!.userId, "STUDENT");
    const missingToken = signAccessToken(f.identities[2]!.userId, "STUDENT");
    const auth = "Bearer " + token;
    expect((await request(app).get("/api/v1/student/profile").set("Authorization", auth)).body.data.studentName).toBe("Fictional Student 0");
    expect((await request(app).get("/api/v1/student/profile").set("Authorization", "Bearer " + missingToken)).status).toBe(404);
    const created = await request(app).post("/api/v1/student/requests").set("Authorization", auth).send(submission);
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await request(app).get("/api/v1/student/requests/" + id).set("Authorization", auth)).body.data).toEqual(created.body.data);
    expect((await request(app).get("/api/v1/student/requests").set("Authorization", auth)).body.data[0].id).toBe(id);
    expect((await request(app).get("/api/v1/student/dashboard").set("Authorization", auth)).body.data.activeRequest.id).toBe(id);
    const foreign = await request(app).get("/api/v1/student/requests/" + id).set("Authorization", "Bearer " + otherToken).set("x-user-id", f.identities[0]!.userId);
    const missing = await request(app).get("/api/v1/student/requests/" + randomUUID()).set("Authorization", "Bearer " + otherToken);
    expect(foreign.status).toBe(404); expect(foreign.body).toEqual(missing.body);
    expect((await request(app).get("/api/v1/student/requests").set("Authorization", "Bearer " + otherToken)).body.data).toEqual([]);
    expect((await request(app).post("/api/v1/student/requests").set("Authorization", auth).send({ ...submission, userId: f.identities[1]!.userId })).status).toBe(422);
    expect((await request(app).post("/api/v1/student/requests").set("Authorization", auth).send(submission)).status).toBe(409);
    expect((await request(app).get("/api/v1/employee/profile").set("Authorization", auth)).status).toBe(403);
  });
});
