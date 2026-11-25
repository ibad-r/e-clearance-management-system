import { Router } from "express";
import type { Request } from "express";
import { employeeErrorHandler } from "../employee/employee.routes";
import type { HrService } from "./hr.service";
import { hrEmptyQuerySchema } from "./hr.schemas";

export function createHrRouter(service: HrService): Router {
  const router = Router();

  const identityFor = (req: Request) => req.auth
    ? { userId: req.auth.userId, role: req.auth.role }
    : undefined;

  router.get("/cases", async (req, res) => {
    const data = await service.listCases(
      identityFor(req),
      req.query,
    );

    res.json({ data });
  });

  router.get("/cases/:caseId", async (req, res) => {
    hrEmptyQuerySchema.parse(req.query);

    const data = await service.getCase(
      identityFor(req),
      req.params.caseId,
    );

    res.json({ data });
  });

  router.post("/cases/:caseId/confirm-departments", async (req, res) => {
    hrEmptyQuerySchema.parse(req.query);

    const data = await service.confirmDepartments(
      identityFor(req),
      req.params.caseId,
      req.body,
    );

    res.json({ data });
  });

  router.use(employeeErrorHandler);

  return router;
}
