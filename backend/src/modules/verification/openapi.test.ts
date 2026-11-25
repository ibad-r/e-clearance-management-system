import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { questionnaireKeys } from "../employee/employee.questionnaire";
import { clearanceRequestStatusEnum } from "../../db/schema";

const path = resolve(__dirname, "../../../../docs/references/openapi_employee_v1.yaml");
const contract = parse(readFileSync(path, "utf8"));
describe("Canonical OpenAPI delivered clearance contract", () => {
  it("validates as OpenAPI with all local references resolved", async () => {
    await expect(SwaggerParser.validate(path, { resolve: { external: false } })).resolves.toHaveProperty("openapi", "3.0.3");
  });
  it("marks exactly the fourteen mounted Auth, Student, Employee and HR operations implemented", () => {
    const live = Object.entries(contract.paths).flatMap(([route, item]) => Object.entries(item as Record<string, { [key: string]: unknown }>).filter(([, operation]) => operation["x-implementation-status"] === "implemented").map(([method]) => method.toUpperCase() + " " + route));
    expect(live).toHaveLength(14);
    const extended = ["POST /student/requests", "GET /student/dashboard", "GET /student/requests/{requestId}", "POST /employee/cases", "GET /employee/cases", "GET /employee/cases/{caseId}"];
    const hr = ["GET /hr/cases", "GET /hr/cases/{caseId}", "POST /hr/cases/{caseId}/confirm-departments"];
    for (const operation of [...extended, ...hr]) expect(live).toContain(operation);
    for (const operation of hr) {
      const [method, route] = operation.split(" ");
      expect(contract.paths[route!][method!.toLowerCase()]["x-required-roles"]).toEqual(["HR_OFFICER"]);
    }
    for (const [route, item] of Object.entries(contract.paths)) if (route.startsWith("/student/")) expect(item).not.toHaveProperty("patch");
  });
  it("matches the runtime questionnaire and status enums and immutable nullable fields", () => {
    expect(contract.components.schemas.QuestionnaireAnswers.required.sort()).toEqual([...questionnaireKeys].sort());
    expect(contract.components.schemas.EmployeeRequestStatus.enum).toEqual(clearanceRequestStatusEnum.enumValues);
    for (const name of ["questionnaireVersion", "questionnaireAnswers", "departmentRecommendation", "hrSelection", "confirmedDepartmentIds"]) {
      expect(contract.components.schemas.CaseDetail.required).toContain(name);
    }
    expect(contract.components.schemas.CaseDetail.properties.hrSelection.properties).not.toHaveProperty("hrVerifiedById");
    expect(contract.components.schemas.HrEmployeeCase.properties.hrSelection.properties).toHaveProperty("hrVerifiedById");
    expect(contract.components.schemas.ConfirmDepartmentsRequest.properties.departmentIds).toMatchObject({ minItems: 1, maxItems: 14, uniqueItems: true });
  });
});
