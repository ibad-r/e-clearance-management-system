
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { db } from "./db";
import { errorHandler } from "./middleware/errorHandler";
import { requireAuth } from "./middleware/requireAuth";
import { requireRole } from "./middleware/requireRole";
import { authRouter } from "./modules/auth/auth.routes";
import { createEmployeeCaseService } from "./modules/employee/employee.service";
import { createEmployeeRouter } from "./modules/employee/employee.routes";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "e-clearance-backend",
  });
});

app.use("/api/v1/auth", authRouter);

const employeeService = createEmployeeCaseService(db);

app.use(
  "/api/v1/employee",
  requireAuth,
  requireRole("EMPLOYEE"),
  createEmployeeRouter(employeeService, (req) => {
    if (!req.auth) return undefined;

    return {
      userId: req.auth.userId,
      role: req.auth.role,
    };
  }),
);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});

app.use(errorHandler);
