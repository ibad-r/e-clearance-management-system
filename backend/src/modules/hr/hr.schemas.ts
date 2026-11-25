import { z } from "zod";
import { clearanceRequestStatusEnum } from "../../db/schema";

export const hrIdentitySchema = z.strictObject({
  userId: z.uuid(),
  role: z.string(),
});

export const hrCaseIdSchema = z.uuid();

export const hrListSchema = z.strictObject({
  status: z.enum(clearanceRequestStatusEnum.enumValues).optional(),
});

export const hrEmptyQuerySchema = z.strictObject({});

export const confirmDepartmentsSchema = z.strictObject({
  departmentIds: z.array(
    z.uuid().transform((id) => id.toLowerCase()),
  ).min(1).max(14),
  expectedSelectionRevision: z.number().int().min(0).max(2147483647),
}).refine(
  (input) => new Set(input.departmentIds).size === input.departmentIds.length,
  { message: "Department IDs must be unique", path: ["departmentIds"] },
);

export type ConfirmDepartmentsInput =
  z.infer<typeof confirmDepartmentsSchema>;
