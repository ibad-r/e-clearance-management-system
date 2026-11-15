import { z } from "zod";
import { StudentApiError } from "./student.errors";
import type { StudentIdentity } from "./student.types";

const identitySchema = z.strictObject({ userId: z.uuid(), role: z.string() });
export function parseStudentIdentity(value: unknown): StudentIdentity {
  const result = identitySchema.safeParse(value);
  if (!result.success) throw new StudentApiError(401, "UNAUTHORIZED", "Authentication required");
  if (result.data.role !== "STUDENT") throw new StudentApiError(403, "FORBIDDEN", "Student access required");
  return result.data;
}
