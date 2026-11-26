import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  questionnaireAnswersSchema,
  questionnaireKeys,
} from "./employee.questionnaire";
import {
  createRecommendationResolver,
} from "./employee.recommendation";

const categoryId = randomUUID();
const departmentId = randomUUID();

const catalog = new Map([
  [categoryId, [departmentId]],
]);

const answers = questionnaireAnswersSchema.parse(
  Object.fromEntries(
    questionnaireKeys.map((key) => [key, "NOT_SURE"]),
  ),
);

function policy() {
  return {
    categoryId,
    ruleVersion: "fictional-test-v1",
    rules: questionnaireKeys.flatMap((answerKey) =>
      ["YES", "NO", "NOT_SURE"].map((answer) => ({
        answerKey,
        answer,
        departments:
          answerKey === "financeDepartment"
          && answer === "NOT_SURE"
            ? [{
              departmentId,
              reason: "Fictional test recommendation",
            }]
            : [],
      })),
    ),
  };
}

describe("Employee department recommendations", () => {
  it("returns unavailable without configured policy", () => {
    const resolve = createRecommendationResolver([], catalog);

    expect(resolve(categoryId, answers)).toBeUndefined();
  });

  it("applies explicitly configured fictional rules", () => {
    const resolve = createRecommendationResolver(
      [policy()], catalog,
    );

    expect(resolve(categoryId, answers)).toEqual({
      ruleVersion: "fictional-test-v1",
      departments: [{
        departmentId,
        reason: "Fictional test recommendation",
      }],
    });
  });

  it("does not invent recommendations for other answers", () => {
    const resolve = createRecommendationResolver(
      [policy()], catalog,
    );

    expect(resolve(categoryId, {
      ...answers,
      financeDepartment: "NO",
    })?.departments).toEqual([]);
  });

  it("rejects incomplete policies", () => {
    const invalid = policy();
    invalid.rules.pop();

    expect(() => createRecommendationResolver(
      [invalid], catalog,
    )).toThrow();
  });

  it("rejects duplicate policies", () => {
    expect(() => createRecommendationResolver(
      [policy(), policy()], catalog,
    )).toThrow();
  });

  it("rejects departments outside the configured catalog", () => {
    expect(() => createRecommendationResolver(
      [policy()],
      new Map([[categoryId, [randomUUID()]]]),
    )).toThrow();
  });

  it("keeps recommendations scoped to the category", () => {
    const resolve = createRecommendationResolver(
      [policy()], catalog,
    );

    expect(resolve(randomUUID(), answers)).toBeUndefined();
  });
});
