import { describe, expect, it } from "vitest";
import { evaluateRule } from "./rule-evaluator";

describe("Typed clearance rule evaluator", () => {
  it.each([
    ["EQ", 0, 0, "PASS"],
    ["EQ", 2, 0, "FAIL"],
    ["NEQ", 2, 0, "PASS"],
    ["NEQ", 0, 0, "FAIL"],
    ["GT", 5, 4, "PASS"],
    ["GT", 4, 4, "FAIL"],
    ["GTE", 4, 4, "PASS"],
    ["GTE", 3, 4, "FAIL"],
    ["LT", 2, 3, "PASS"],
    ["LT", 3, 3, "FAIL"],
    ["LTE", 3, 3, "PASS"],
    ["LTE", 4, 3, "FAIL"],
  ])("evaluates %s: %s versus %s", (
    operator, actual, expectedValue, outcome,
  ) => {
    expect(evaluateRule(
      { metricKey: "metric", operator, expectedValue },
      { metric: actual },
    )).toEqual({ outcome, checkedValue: actual });
  });

  it("supports exact boolean equality", () => {
    expect(evaluateRule(
      { metricKey: "returned", operator: "EQ", expectedValue: true },
      { returned: true },
    ).outcome).toBe("PASS");
  });

  it("supports exact string equality", () => {
    expect(evaluateRule(
      { metricKey: "state", operator: "EQ", expectedValue: "DONE" },
      { state: "DONE" },
    ).outcome).toBe("PASS");
  });

  it("does not coerce numeric strings", () => {
    expect(evaluateRule(
      { metricKey: "metric", operator: "EQ", expectedValue: 0 },
      { metric: "0" },
    )).toEqual({
      outcome: "INCOMPLETE",
      reason: "TYPE_MISMATCH",
    });
  });

  it("does not pass incompatible NEQ inputs", () => {
    expect(evaluateRule(
      { metricKey: "metric", operator: "NEQ", expectedValue: 0 },
      { metric: "0" },
    ).outcome).toBe("INCOMPLETE");
  });

  it.each([undefined, null])(
    "does not clear when rule is unavailable",
    (rule) => {
      expect(evaluateRule(rule, { metric: 0 }))
        .toEqual({
          outcome: "INCOMPLETE",
          reason: "RULE_UNAVAILABLE",
        });
    },
  );

  it.each([undefined, null, {}, []])(
    "does not clear missing evidence",
    (metrics) => {
      expect(evaluateRule(
        { metricKey: "metric", operator: "EQ", expectedValue: 0 },
        metrics,
      ).outcome).toBe("INCOMPLETE");
    },
  );

  it.each([null, undefined, {}, [], NaN, Infinity, ""])(
    "rejects malformed metric values",
    (metric) => {
      expect(evaluateRule(
        { metricKey: "metric", operator: "EQ", expectedValue: 0 },
        { metric },
      ).outcome).toBe("INCOMPLETE");
    },
  );

  it("rejects unsupported operators", () => {
    expect(evaluateRule(
      { metricKey: "metric", operator: "UNKNOWN", expectedValue: 0 },
      { metric: 0 },
    ).outcome).toBe("INCOMPLETE");
  });

  it("rejects malformed rule expectations", () => {
    expect(evaluateRule(
      { metricKey: "metric", operator: "EQ", expectedValue: null },
      { metric: 0 },
    ).outcome).toBe("INCOMPLETE");
  });

  it("rejects ordered string comparisons", () => {
    expect(evaluateRule(
      { metricKey: "metric", operator: "GT", expectedValue: "A" },
      { metric: "B" },
    ).outcome).toBe("INCOMPLETE");
  });

  it("rejects inherited metric properties", () => {
    expect(evaluateRule(
      { metricKey: "metric", operator: "EQ", expectedValue: 0 },
      Object.create({ metric: 0 }),
    ).outcome).toBe("INCOMPLETE");
  });
});
