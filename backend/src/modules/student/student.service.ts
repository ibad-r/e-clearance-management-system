import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema";
import { parseStudentIdentity } from "./student.auth";
import { StudentApiError } from "./student.errors";
import { departmentNames, initialApplicability, studentProgress, validateDeterminations } from "./student.policy";
import type { ApplicabilityResolver } from "./student.policy";
import { createStudentRequestSchema, studentRequestIdSchema } from "./student.schemas";
import { profileView } from "./student.views";
import type { StudentDepartment, StudentIdentity, StudentProfile, StudentRequest, StudentRequestSummary, StudentService } from "./student.types";

export type StudentDatabase = Pick<NodePgDatabase<typeof schema>, "select" | "insert" | "transaction">;
type Executor = Pick<StudentDatabase, "select" | "insert">;
type RequestRow = typeof schema.studentRequests.$inferSelect;
const { users, studentProfiles, studentRequests, studentRequestDepartments, studentDepartmentCodeEnum } = schema;
const readOnly = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

async function loadProfile(database: Executor, identity: StudentIdentity, lock = false): Promise<StudentProfile & { profileId: string }> {
  const userQuery = database.select({ id: users.id, role: users.role, isActive: users.isActive, fullName: users.fullName })
    .from(users).where(eq(users.id, identity.userId)).limit(1);
  const [user] = lock ? await userQuery.for("share") : await userQuery;
  if (!user || !user.isActive) throw new StudentApiError(401, "UNAUTHORIZED", "Authentication required");
  if (user.role !== "STUDENT") throw new StudentApiError(403, "FORBIDDEN", "Student access required");
  const profileQuery = database.select().from(studentProfiles).where(eq(studentProfiles.userId, identity.userId)).limit(1);
  const [profile] = lock ? await profileQuery.for("update") : await profileQuery;
  if (!profile) throw new StudentApiError(404, "STUDENT_PROFILE_NOT_FOUND", "Student profile not found");
  return { profileId: profile.id, sapId: profile.sapId, studentName: user.fullName,
    registrationNumber: profile.registrationNumber, fatherName: profile.fatherName, program: profile.program, semester: profile.semester };
}

function requestSummary(row: RequestRow): StudentRequestSummary {
  return { id: row.id, requestReference: row.requestReference, reason: row.reason, status: row.status,
    isActive: row.status === "IN_PROGRESS", submittedAt: row.submittedAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null };
}

async function departmentsFor(database: Executor, requestId: string): Promise<StudentDepartment[]> {
  const rows = await database.select().from(studentRequestDepartments).where(eq(studentRequestDepartments.requestId, requestId));
  if (rows.length !== 5 || new Set(rows.map((row) => row.departmentCode)).size !== 5) {
    throw new StudentApiError(503, "STUDENT_CONFIGURATION_INVALID", "Student clearance configuration needs administrator attention");
  }
  return studentDepartmentCodeEnum.enumValues.map((code) => {
    const row = rows.find((item) => item.departmentCode === code)!;
    return { departmentCode: code, displayName: departmentNames[code], applicability: row.applicability,
      status: row.status, remarks: null, updatedAt: row.updatedAt?.toISOString() ?? null };
  });
}

async function requestDetail(database: Executor, row: RequestRow): Promise<StudentRequest> {
  return { ...requestSummary(row), ...profileView(row), departments: await departmentsFor(database, row.id) };
}

function databaseFailure(error: unknown): { code?: unknown; constraint?: unknown } {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current) return { code: current.code, constraint: "constraint" in current ? current.constraint : undefined };
    current = "cause" in current ? current.cause : undefined;
  }
  return {};
}

export interface StudentServiceOptions {
  generateReference?: () => string;
  resolveApplicability?: ApplicabilityResolver;
}
export function createStudentService(database: StudentDatabase, options: StudentServiceOptions = {}): StudentService {
  const generateReference = options.generateReference ?? (() => `SC-${randomUUID().replaceAll("-", "").toUpperCase()}`);
  const resolveApplicability = options.resolveApplicability ?? initialApplicability;
  return {
    async getProfile(identity) {
      const principal = parseStudentIdentity(identity);
      return database.transaction(async (tx) => profileView(await loadProfile(tx, principal)), readOnly);
    },
    async createRequest(identity, submission) {
      const principal = parseStudentIdentity(identity);
      const input = createStudentRequestSchema.parse(submission);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await database.transaction(async (tx) => {
            const profile = await loadProfile(tx, principal, true);
            const [existing] = await tx.select({ id: studentRequests.id }).from(studentRequests)
              .where(and(eq(studentRequests.studentProfileId, profile.profileId), eq(studentRequests.status, "IN_PROGRESS"))).limit(1);
            if (existing) throw new StudentApiError(409, "ACTIVE_REQUEST_EXISTS", "An active clearance request already exists");
            if (input.registrationNumber !== profile.registrationNumber || input.fatherName !== profile.fatherName
              || input.program !== profile.program || input.semester !== profile.semester) {
              throw new StudentApiError(422, "PROFILE_MISMATCH", "Submitted details must match the Student profile");
            }
            const determinations = validateDeterminations(await resolveApplicability(Object.freeze(profileView(profile))));
            const reference = generateReference();
            if (typeof reference !== "string" || reference.trim().length === 0) throw new Error("Reference generator failed");
            const now = new Date();
            const [created] = await tx.insert(studentRequests).values({ ...profileView(profile),
              studentProfileId: profile.profileId, requestReference: reference, reason: input.reason, status: "IN_PROGRESS",
              submittedAt: now, createdAt: now, updatedAt: now }).returning();
            if (!created) throw new Error("Student request insert returned no row");
            await tx.insert(studentRequestDepartments).values(determinations.map((item) => ({
              requestId: created.id, departmentCode: item.departmentCode, applicability: item.applicability,
              applicabilitySource: item.source, status: item.applicability === "NOT_REQUIRED" ? "NOT_REQUIRED" as const : "PENDING" as const,
              createdAt: now,
            })));
            return requestDetail(tx, created);
          });
        } catch (error) {
          const failure = databaseFailure(error);
          if (failure.code === "23505" && failure.constraint === "student_requests_one_active_profile_idx") {
            throw new StudentApiError(409, "ACTIVE_REQUEST_EXISTS", "An active clearance request already exists");
          }
          if (failure.code === "23505" && failure.constraint === "student_requests_reference_unique") {
            if (attempt < 2) continue;
            throw new StudentApiError(503, "REQUEST_REFERENCE_UNAVAILABLE", "Could not allocate a request reference; retry later");
          }
          if (failure.code === "40001" || failure.code === "40P01") {
            if (attempt < 2) continue;
            throw new StudentApiError(503, "REQUEST_CREATION_UNAVAILABLE", "Could not create the request; retry later");
          }
          throw error;
        }
      }
      throw new Error("Student request retries exhausted");
    },
    async listRequests(identity) {
      const principal = parseStudentIdentity(identity);
      return database.transaction(async (tx) => {
        const profile = await loadProfile(tx, principal);
        const rows = await tx.select().from(studentRequests).where(eq(studentRequests.studentProfileId, profile.profileId))
          .orderBy(desc(studentRequests.submittedAt), desc(studentRequests.id));
        return rows.map(requestSummary);
      }, readOnly);
    },
    async getRequest(identity, requestId) {
      const principal = parseStudentIdentity(identity);
      const id = studentRequestIdSchema.parse(requestId);
      return database.transaction(async (tx) => {
        const profile = await loadProfile(tx, principal);
        const [row] = await tx.select().from(studentRequests)
          .where(and(eq(studentRequests.id, id), eq(studentRequests.studentProfileId, profile.profileId))).limit(1);
        if (!row) throw new StudentApiError(404, "NOT_FOUND", "Student request not found");
        return requestDetail(tx, row);
      }, readOnly);
    },
    async getDashboard(identity) {
      const principal = parseStudentIdentity(identity);
      return database.transaction(async (tx) => {
        const profile = await loadProfile(tx, principal);
        const owned = eq(studentRequests.studentProfileId, profile.profileId);
        const [active] = await tx.select().from(studentRequests)
          .where(and(owned, eq(studentRequests.status, "IN_PROGRESS"))).limit(1);
        const [latest] = await tx.select().from(studentRequests)
          .where(and(owned, ne(studentRequests.status, "IN_PROGRESS")))
          .orderBy(desc(studentRequests.closedAt), desc(studentRequests.submittedAt), desc(studentRequests.id)).limit(1);
        const [history] = await tx.select({ total: count() }).from(studentRequests)
          .where(and(owned, ne(studentRequests.status, "IN_PROGRESS")));
        const departments = active ? await departmentsFor(tx, active.id) : [];
        return { profile: profileView(profile), activeRequest: active ? requestSummary(active) : null, departments,
          progress: active ? studentProgress(departments) : null,
          history: { closedRequestCount: history?.total ?? 0, latestClosedRequest: latest ? requestSummary(latest) : null } };
      }, readOnly);
    },
  };
}
