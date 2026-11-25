import { z } from "zod";

export const questionnaireAnswerSchema = z.enum([
  "YES", "NO", "NOT_SURE",
]);

const answer = questionnaireAnswerSchema;

export const questionnaireAnswersSchema = z.strictObject({
  hdsDepartment: answer,
  financeDepartment: answer,
  feesAndDuesDepartment: answer,
  computerServicesDepartment: answer,
  operationsDepartment: answer,
  cmsRepresentative: answer,
  oric: answer,
  storeSection: answer,
  wardenHostel: answer,
  labInchargeOffice: answer,
  informationServicesDepartment: answer,
  wardInchargeNursingDivision: answer,
  pharmacy: answer,
  headOfDepartment: answer,
});

export const questionnaireKeys =
  Object.keys(questionnaireAnswersSchema.shape);

export const questionnaireSnapshotSchema = z.strictObject({
  version: z.literal("v1"),
  answers: questionnaireAnswersSchema,
});

export type QuestionnaireAnswers =
  z.infer<typeof questionnaireAnswersSchema>;

export const recommendationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("UNAVAILABLE"),
    ruleVersion: z.null(),
    departments: z.tuple([]),
  }),
  z.strictObject({
    status: z.literal("AVAILABLE"),
    ruleVersion: z.string().min(1),
    departments: z.array(z.strictObject({
      departmentId: z.uuid(),
      departmentCode: z.string().min(1),
      departmentName: z.string().min(1),
      reason: z.string().min(1),
    })),
  }),
]);

export type DepartmentRecommendation =
  z.infer<typeof recommendationSchema>;

export function unavailableRecommendation():
  DepartmentRecommendation {
  return {
    status: "UNAVAILABLE",
    ruleVersion: null,
    departments: [],
  };
}