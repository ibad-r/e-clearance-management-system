import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildClearanceOptions,
} from "./clearance.config";

describe("Server clearance configuration", () => {
  it("fails closed with empty configuration", () => {
    const options = buildClearanceOptions({});

    expect(options.employee).toEqual({});
    expect(options.hr.categoryScopeByUser.size).toBe(0);
    expect(options.hr.catalogByCategory.size).toBe(0);
    expect(options.hr.allowIndependentVerification)
      .toBe(false);

    expect(options.student.evidenceProvider(
      randomUUID(), "LIBRARY",
    )).toBeUndefined();
  });

  it("accepts explicit fictional HR scope and catalog", () => {
    const userId = randomUUID();
    const categoryId = randomUUID();
    const departmentId = randomUUID();

    const options = buildClearanceOptions({
      questionnaireVersion: "v1",
      catalogVersion: "fictional-v1",
      allowIndependentVerification: true,
      hrScopes: {
        [userId]: [categoryId],
      },
      departmentCatalog: {
        [categoryId]: [departmentId],
      },
    });

    expect(options.hr.categoryScopeByUser.get(userId))
      .toEqual([categoryId]);

    expect(options.hr.catalogByCategory.get(categoryId))
      .toEqual([departmentId]);

    expect(options.employee)
      .toEqual({ questionnaireVersion: "v1" });
  });

  it("rejects invalid HR scope", () => {
    expect(() => buildClearanceOptions({
      hrScopes: { invalid: ["invalid"] },
    })).toThrow();
  });

  it("rejects unknown questionnaire versions", () => {
    expect(() => buildClearanceOptions({
      questionnaireVersion: "unknown",
    })).toThrow();
  });

  it("rejects unexpected configuration fields", () => {
    expect(() => buildClearanceOptions({
      allowAllHrUsers: true,
    })).toThrow();
  });

  it("returns evidence only for the matching student", () => {
    const profileId = randomUUID();

    const options = buildClearanceOptions({
      studentFixtures: [{
        profileId,
        departmentCode: "LIBRARY",
        evidence: {
          rule: {
            metricKey: "fictional",
            operator: "EQ",
            expectedValue: 0,
          },
          metrics: { fictional: 0 },
          ruleVersion: "test-v1",
          datasetVersion: "test-v1",
          datasetUpdatedAt: "2026-11-25T00:00:00Z",
        },
      }],
    });

    expect(options.student.evidenceProvider(
      profileId, "LIBRARY",
    )).toBeDefined();

    expect(options.student.evidenceProvider(
      randomUUID(), "LIBRARY",
    )).toBeUndefined();

    expect(options.student.evidenceProvider(
      profileId, "LABORATORY",
    )).toBeUndefined();
  });
});
