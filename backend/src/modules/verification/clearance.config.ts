import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  studentDepartmentCodeEnum,
  studentApplicabilityEnum,
  ruleOperatorEnum,
} from "../../db/schema";
import { initialApplicability, validateDeterminations } from "../student/student.policy";
import { visibleReasonsSchema } from "./verification.policy";
import {
  createStudentFixtureProvider,
} from "../student/student.verification";

const uuid = z.uuid().refine(
  (value) => value === value.toLowerCase(),
);

const version = z.string()
  .regex(/^[A-Za-z0-9._-]{1,100}$/);

const metric = z.union([
  z.number(),
  z.string().trim().min(1),
  z.boolean(),
]);

import {
  createRecommendationResolver,
  recommendationPoliciesSchema,
} from "../employee/employee.recommendation";

const configSchema = z.strictObject({
  recommendationPolicies: recommendationPoliciesSchema.default([]),
  questionnaireVersion: z.literal("v1").optional(),
  studentCompletionPolicy: z.literal("DEPARTMENTS_ONLY").optional(),
  employeeFinalPolicy: z.literal("DEPARTMENTS_ONLY").optional(),
  allowOutstandingRecheck: z.boolean().default(false),
  studentVisibleReasons: visibleReasonsSchema.default({}),
  employeeVisibleReasons: visibleReasonsSchema.default({}),
  studentApplicability: z.array(z.strictObject({
    sapId: z.string().min(1),
    determinations: z.array(z.strictObject({
      departmentCode: z.enum(studentDepartmentCodeEnum.enumValues),
      applicability: z.enum(studentApplicabilityEnum.enumValues),
      source: version,
    })).length(5),
  })).default([]),

  catalogVersion: version.optional(),

  allowIndependentVerification:
    z.boolean().default(false),

  hrScopes: z.record(
    uuid,
    z.array(uuid).min(1),
  ).default({}),

  departmentCatalog: z.record(
    uuid,
    z.array(uuid).min(1).max(14),
  ).default({}),

  studentFixtures: z.array(z.strictObject({
    profileId: uuid,
    departmentCode: z.enum(
      studentDepartmentCodeEnum.enumValues,
    ),
    evidence: z.strictObject({
      rule: z.strictObject({
        metricKey: z.string().min(1),
        operator: z.enum(ruleOperatorEnum.enumValues),
        expectedValue: metric,
      }),
      metrics: z.record(z.string(), metric),
      ruleVersion: version,
      datasetVersion: version,
      datasetUpdatedAt: z.iso.datetime({
        offset: true,
      }),
    }),
  })).default([]),
});

export function buildClearanceOptions(raw: unknown) {
  const config = configSchema.parse(raw);
  const applicability = new Map(config.studentApplicability.map((item) => [item.sapId, validateDeterminations(item.determinations)]));
  if (applicability.size !== config.studentApplicability.length) throw new Error("Duplicate Student applicability configuration");
  for (const ids of [...Object.values(config.hrScopes), ...Object.values(config.departmentCatalog)]) {
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate clearance mapping");
  }
  const fixtureKeys = config.studentFixtures.map((item) => `${item.profileId}:${item.departmentCode}`);
  if (new Set(fixtureKeys).size !== fixtureKeys.length) throw new Error("Duplicate Student fixture");

  const recommendationResolver = createRecommendationResolver(
    config.recommendationPolicies,
    new Map(Object.entries(config.departmentCatalog)),
  );

  return {
    employee: {
      ...(config.questionnaireVersion
        ? { questionnaireVersion: config.questionnaireVersion }
        : {}),
      ...(config.recommendationPolicies.length
        ? { recommendationResolver }
        : {}),
    },

    student: {
      resolveApplicability: (profile: Parameters<typeof initialApplicability>[0]) =>
        structuredClone(applicability.get(profile.sapId)) ?? initialApplicability(profile),
      allowAutomaticCompletion: config.studentCompletionPolicy === "DEPARTMENTS_ONLY",
      visibleReasons: config.studentVisibleReasons,
      allowOutstandingRecheck: config.allowOutstandingRecheck,
      evidenceProvider: createStudentFixtureProvider(
        config.studentFixtures,
      ),
    },

    hr: {
      finalPolicy: config.employeeFinalPolicy,
      visibleReasons: config.employeeVisibleReasons,
      allowOutstandingRecheck: config.allowOutstandingRecheck,
      categoryScopeByUser: new Map(
        Object.entries(config.hrScopes),
      ),

      catalogByCategory: new Map(
        Object.entries(config.departmentCatalog),
      ),

      ...(config.catalogVersion
        ? { catalogVersion: config.catalogVersion }
        : {}),

      allowIndependentVerification:
        config.allowIndependentVerification,
    },
  };
}

export function loadClearanceOptions(
  path = process.env.CLEARANCE_CONFIG_PATH,
) {
  if (!path) {
    return buildClearanceOptions({});
  }

  try {
    const raw: unknown = JSON.parse(
      readFileSync(path, "utf8"),
    );

    return buildClearanceOptions(raw);
  } catch {
    throw new Error(
      "Invalid server clearance configuration",
    );
  }
}

