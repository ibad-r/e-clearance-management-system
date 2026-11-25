import { describe, expect, it } from "vitest";
import {
  questionnaireAnswersSchema,
  questionnaireKeys,
  questionnaireSnapshotSchema,
  unavailableRecommendation,
} from "./employee.questionnaire";

const answers = Object.fromEntries(
  questionnaireKeys.map((key) => [key, "NOT_SURE"]),
);

describe("Employee questionnaire contract", () => {
  it("defines exactly fourteen answer keys", () => {
    expect(questionnaireKeys).toHaveLength(14);
    expect(new Set(questionnaireKeys).size).toBe(14);
  });

  it.each(["YES", "NO", "NOT_SURE"])(
    "accepts the supported answer %s",
    (value) => {
      expect(questionnaireAnswersSchema.safeParse({
        ...answers,
        financeDepartment: value,
      }).success).toBe(true);
    },
  );

  it("rejects an incomplete questionnaire", () => {
    expect(questionnaireAnswersSchema.safeParse({
      financeDepartment: "YES",
    }).success).toBe(false);
  });

  it("rejects invalid answer values", () => {
    expect(questionnaireAnswersSchema.safeParse({
      ...answers,
      financeDepartment: "MAYBE",
    }).success).toBe(false);
  });

  it("rejects client decision fields", () => {
    expect(questionnaireAnswersSchema.safeParse({
      ...answers,
      cleared: true,
    }).success).toBe(false);
  });

  it("preserves a versioned questionnaire snapshot", () => {
    expect(questionnaireSnapshotSchema.parse({
      version: "v1",
      answers,
    })).toEqual({ version: "v1", answers });
  });

  it("keeps unavailable recommendations separate", () => {
    expect(unavailableRecommendation()).toEqual({
      status: "UNAVAILABLE",
      ruleVersion: null,
      departments: [],
    });
  });
});