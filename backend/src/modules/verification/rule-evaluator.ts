import { ruleOperatorEnum } from "../../db/schema/enums";

export type RuleOperator =
  (typeof ruleOperatorEnum.enumValues)[number];

export type MetricValue = number | string | boolean;

export type IncompleteReason =
  | "RULE_UNAVAILABLE"
  | "RULE_INVALID"
  | "METRIC_MISSING"
  | "METRIC_INVALID"
  | "TYPE_MISMATCH"
  | "UNSUPPORTED_COMPARISON";

export type RuleResult =
  | {
      outcome: "PASS" | "FAIL";
      checkedValue: MetricValue;
    }
  | {
      outcome: "INCOMPLETE";
      reason: IncompleteReason;
    };

function isRecord(value: unknown):
  value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isMetricValue(value: unknown):
  value is MetricValue {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return typeof value === "boolean";
}

function isOperator(value: unknown):
  value is RuleOperator {
  return ruleOperatorEnum.enumValues.some(
    (operator) => operator === value,
  );
}

function incomplete(
  reason: IncompleteReason,
): RuleResult {
  return { outcome: "INCOMPLETE", reason };
}

export function evaluateRule(
  rule: unknown,
  metrics: unknown,
): RuleResult {
  if (rule === null || rule === undefined) {
    return incomplete("RULE_UNAVAILABLE");
  }

  if (!isRecord(rule)
    || !hasOwn(rule, "metricKey")
    || !hasOwn(rule, "operator")
    || !hasOwn(rule, "expectedValue")) {
    return incomplete("RULE_INVALID");
  }

  const { metricKey, operator, expectedValue } = rule;

  if (typeof metricKey !== "string"
    || metricKey.trim().length === 0
    || !isOperator(operator)
    || !isMetricValue(expectedValue)) {
    return incomplete("RULE_INVALID");
  }

  if (!isRecord(metrics)
    || !hasOwn(metrics, metricKey)) {
    return incomplete("METRIC_MISSING");
  }

  const actual = metrics[metricKey];

  if (!isMetricValue(actual)) {
    return incomplete("METRIC_INVALID");
  }

  if (typeof actual !== typeof expectedValue) {
    return incomplete("TYPE_MISMATCH");
  }

  let passed: boolean;

  if (operator === "EQ") {
    passed = actual === expectedValue;
  } else if (operator === "NEQ") {
    passed = actual !== expectedValue;
  } else {
    if (typeof actual !== "number"
      || typeof expectedValue !== "number") {
      return incomplete("UNSUPPORTED_COMPARISON");
    }

    switch (operator) {
      case "GT":
        passed = actual > expectedValue;
        break;

      case "GTE":
        passed = actual >= expectedValue;
        break;

      case "LT":
        passed = actual < expectedValue;
        break;

      case "LTE":
        passed = actual <= expectedValue;
        break;

      default:
        return incomplete("RULE_INVALID");
    }
  }

  return {
    outcome: passed ? "PASS" : "FAIL",
    checkedValue: actual,
  };
}
