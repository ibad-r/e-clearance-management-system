import { Router } from "express";
import type { ErrorRequestHandler, Request } from "express";
import { ZodError } from "zod";
import { parseStudentIdentity } from "./student.auth";
import { StudentApiError } from "./student.errors";
import { createStudentRequestSchema, studentEmptyQuerySchema, studentRequestIdSchema } from "./student.schemas";
import type { StudentService } from "./student.types";
import { dashboardView, profileView, requestView, summaryView } from "./student.views";

const studentErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof StudentApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } });
    return;
  }
  next(error);
};

// Production mounts shared requireAuth and requireRole before this router.
export function createStudentRouter(service: StudentService, getVerifiedIdentity: (req: Request) => unknown): Router {
  if (typeof getVerifiedIdentity !== "function") throw new TypeError("A verified identity resolver is required");
  const router = Router();
  const identityFor = (req: Request) => parseStudentIdentity(getVerifiedIdentity(req));
  router.get("/profile", async (req, res) => {
    const identity = identityFor(req);
    studentEmptyQuerySchema.parse(req.query);
    res.json({ data: profileView(await service.getProfile(identity)) });
  });
  router.get("/dashboard", async (req, res) => {
    const identity = identityFor(req);
    studentEmptyQuerySchema.parse(req.query);
    res.json({ data: dashboardView(await service.getDashboard(identity)) });
  });
  router.post("/requests", async (req, res) => {
    const identity = identityFor(req);
    studentEmptyQuerySchema.parse(req.query);
    const input = createStudentRequestSchema.parse(req.body);
    res.status(201).json({ data: requestView(await service.createRequest(identity, input)) });
  });
  router.get("/requests", async (req, res) => {
    const identity = identityFor(req);
    studentEmptyQuerySchema.parse(req.query);
    res.json({ data: (await service.listRequests(identity)).map(summaryView) });
  });
  router.get("/requests/:requestId", async (req, res) => {
    const identity = identityFor(req);
    studentEmptyQuerySchema.parse(req.query);
    const id = studentRequestIdSchema.parse(req.params.requestId);
    res.json({ data: requestView(await service.getRequest(identity, id)) });
  });
  router.use(studentErrorHandler);
  return router;
}
