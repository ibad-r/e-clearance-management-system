import { z } from "zod";
import {
  questionnaireAnswersSchema,
  questionnaireAnswerSchema,
  questionnaireKeys,
  type QuestionnaireAnswers,
} from "./employee.questionnaire";

const uuid = z.uuid().refine(
  (value) => value === value.toLowerCase(),
);

const policySchema = z.strictObject({
  categoryId: uuid,
  ruleVersion: z.string()
    .regex(/^[A-Za-z0-9._-]{1,100}$/),

  rules: z.array(z.strictObject({
    answerKey: questionnaireAnswersSchema.keyof(),
    answer: questionnaireAnswerSchema,

    departments: z.array(z.strictObject({
      departmentId: uuid,
      reason: z.string().trim().min(1).max(500),
    })).max(14),
  })).length(42),
});

export const recommendationPoliciesSchema =
  z.array(policySchema);

export type RecommendationResolver = (
  categoryId: string,
  answers: QuestionnaireAnswers,
) => {
  ruleVersion: string;
  departments: {
    departmentId: string;
    reason: string;
  }[];
} | undefined;

export function createRecommendationResolver(
  raw: unknown,
  catalog: ReadonlyMap<string, readonly string[]>,
): RecommendationResolver {
  const policies = recommendationPoliciesSchema.parse(raw);

  const byCategory = new Map(
    policies.map((policy) => [policy.categoryId, policy]),
  );

  if (byCategory.size !== policies.length) {
    throw new Error("Duplicate recommendation policy");
  }

  for (const policy of policies) {
    const keys = new Set(
      policy.rules.map((rule) =>
        `${rule.answerKey}:${rule.answer}`),
    );

    if (keys.size !== questionnaireKeys.length * 3) {
      throw new Error("Incomplete recommendation policy");
    }

    const allowed = catalog.get(policy.categoryId);

    if (!allowed?.length) {
      throw new Error("Recommendation catalog unavailable");
    }

    for (const rule of policy.rules) {
      if (rule.departments.some((item) =>
        !allowed.includes(item.departmentId),
      )) {
        throw new Error("Invalid recommendation mapping");
      }
    }
  }

  return (categoryId, answers) => {
    const policy = byCategory.get(categoryId);

    if (!policy) return undefined;

    const departments = new Map<string, Set<string>>();

    for (const rule of policy.rules) {
      if (answers[rule.answerKey] !== rule.answer) continue;

      for (const item of rule.departments) {
        const reasons = departments.get(item.departmentId)
          ?? new Set<string>();

        reasons.add(item.reason);

        departments.set(item.departmentId, reasons);
      }
    }

    return {
      ruleVersion: policy.ruleVersion,
      departments: Array.from(
        departments.entries(),
        ([departmentId, reasons]) => ({
          departmentId,
          reason: [...reasons].join("; "),
        }),
      ),
    };
  };
}
