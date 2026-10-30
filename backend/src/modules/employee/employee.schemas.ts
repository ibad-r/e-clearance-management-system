import { z } from "zod";
import { clearanceRequestStatusEnum } from "../../db/schema/enums";

export const createCaseSchema = z.strictObject({
  // PostgreSQL date has no year zero; calendar/date-only validation stays in Zod.
  lastWorkingDate: z.iso.date().refine((value) => !value.startsWith("0000-"), {
    message: "Date must use a year from 0001 to 9999",
  }),
  reasonForLeaving: z.string().trim().min(3).max(500),
  employeeRemarks: z.string().trim().max(1000).nullable().optional(),
});

export type EmployeeCaseSubmission = z.infer<typeof createCaseSchema>;

export const caseIdSchema = z.uuid();

export const listCasesQuerySchema = z.strictObject({
  status: z.enum(clearanceRequestStatusEnum.enumValues).optional(),
});
