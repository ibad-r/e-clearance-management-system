import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  studentDepartmentCodeEnum,
  ruleOperatorEnum,
} from "../../db/schema";
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
      evidenceProvider: createStudentFixtureProvider(
        config.studentFixtures,
      ),
    },

    hr: {
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

