import { z } from "zod";
import { studentRequestReasonEnum } from "../../db/schema/student";

// Preserve stored academic values exactly; no inferred formats, ranges or program lists.
const profileField = z.string().refine((value) => value.trim().length > 0, "A nonblank value is required");
export const createStudentRequestSchema = z.strictObject({
  registrationNumber: profileField,
  fatherName: profileField,
  program: profileField,
  semester: profileField,
  reason: z.enum(studentRequestReasonEnum.enumValues),
});
export type StudentSubmission = z.infer<typeof createStudentRequestSchema>;
export const studentRequestIdSchema = z.uuid();
export const studentEmptyQuerySchema = z.strictObject({});
