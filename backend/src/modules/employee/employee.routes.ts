import { Router } from "express";
import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";
import { parsePrincipal } from "./employee.auth";
import type { VerifiedIdentityResolver } from "./employee.auth";
import { EmployeeApiError } from "./employee.errors";
import { caseIdSchema, createCaseSchema, listCasesQuerySchema } from "./employee.schemas";
import type { EmployeeCase, EmployeeCaseService, EmployeeProfile } from "./employee.types";

function profileResponse(profile: EmployeeProfile): EmployeeProfile {
  return {
    id: profile.id,
    employeeNumber: profile.employeeNumber,
    fullName: profile.fullName,
    designation: profile.designation,
    facultyCode: profile.facultyCode,
    departmentName: profile.departmentName,
    joiningDate: profile.joiningDate,
    categoryId: profile.categoryId,
    category: { id: profile.category.id, code: profile.category.code, name: profile.category.name },
  };
}

function caseResponse(item: EmployeeCase): EmployeeCase {
  return {
    id: item.id,
    requestCode: item.requestCode,
    employeeId: item.employeeId,
    status: item.status,
    reasonForLeaving: item.reasonForLeaving,
    lastWorkingDate: item.lastWorkingDate,
    employeeRemarks: item.employeeRemarks,
    initiatedAt: item.initiatedAt,
    submittedAt: item.submittedAt,
    completedAt: item.completedAt,
    cancelledAt: item.cancelledAt,
    stages: item.stages.map((stage) => ({
      id: stage.id,
      departmentId: stage.departmentId,
      departmentCode: stage.departmentCode,
      departmentName: stage.departmentName,
      stepOrder: stage.stepOrder,
      isRequired: stage.isRequired,
      status: stage.status,
      outstandingNote: stage.outstandingNote,
      startedAt: stage.startedAt,
      lastCheckedAt: stage.lastCheckedAt,
      clearedAt: stage.clearedAt,
    })),
    approvals: item.approvals.map((approval) => ({
      id: approval.id,
      positionId: approval.positionId,
      positionTitle: approval.positionTitle,
      stepOrder: approval.stepOrder,
      isRequired: approval.isRequired,
      status: approval.status,
    })),
    issues: item.issues.map((issue) => ({
      id: issue.id,
      requestStageId: issue.requestStageId,
      status: issue.status,
      reason: issue.reason,
      openedAt: issue.openedAt,
      resolvedAt: issue.resolvedAt,
    })),
    certificateId: item.certificateId,
    progress: {
      totalStages: item.progress.totalStages,
      clearedStages: item.progress.clearedStages,
      outstandingStages: item.progress.outstandingStages,
      skippedStages: item.progress.skippedStages,
    },
  };
}

const employeeErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof EmployeeApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } });
    return;
  }
  res.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
  });
};

/**
 * Unmounted integration factory. A future app integration must first mount a real
 * credential verifier, then explicitly map its trusted principal with this resolver.
 */
export function createEmployeeRouter(
  service: EmployeeCaseService,
  getVerifiedIdentity: VerifiedIdentityResolver,
): Router {
  if (typeof getVerifiedIdentity !== "function") {
    throw new TypeError("An explicit verified identity resolver is required");
  }
  const router = Router();
  const identityFor = (req: Request, res: Response) => parsePrincipal(getVerifiedIdentity(req, res));

  router.get("/profile", async (req, res) => {
    const identity = identityFor(req, res);
    const profile = await service.getProfile(identity);
    res.json({ data: profileResponse(profile) });
  });

  router.post("/cases", async (req, res) => {
    const identity = identityFor(req, res);
    const input = createCaseSchema.parse(req.body);
    const item = await service.createCase(identity, input);
    res.status(201).json({ data: caseResponse(item) });
  });

  router.get("/cases", async (req, res) => {
    const identity = identityFor(req, res);
    const filter = listCasesQuerySchema.parse(req.query);
    const items = await service.listCases(identity, filter);
    res.json({ data: items.map(caseResponse) });
  });

  router.get("/cases/:caseId", async (req, res) => {
    const identity = identityFor(req, res);
    const caseId = caseIdSchema.parse(req.params.caseId);
    const item = await service.getCase(identity, caseId);
    res.json({ data: caseResponse(item) });
  });

  router.use(employeeErrorHandler);
  return router;
}
