
import type { RequestHandler } from "express";
import type { PublicUser } from "../modules/auth/auth.service";

type UserRole = PublicUser["role"];

export function requireRole(
  ...allowedRoles: UserRole[]
): RequestHandler {
  if (allowedRoles.length === 0) {
    throw new Error("At least one role is required");
  }

  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Insufficient permissions",
        },
      });
      return;
    }

    next();
  };
}
