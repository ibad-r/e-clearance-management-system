
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "./requireAuth";
import { requireRole } from "./requireRole";

type UserRole = AuthContext["role"];

describe("Role-based authorization middleware", () => {
  function checkEmployeeAccess(
    role?: UserRole,
    bodyRole?: string
  ) {
    const user = role
      ? {
          id: "00000000-0000-4000-8000-000000000001",
          email: "fictional@example.invalid",
          fullName: "Fictional Test User",
          role,
        }
      : undefined;

    const req = {
      body: { role: bodyRole },
      auth: user
        ? {
            userId: user.id,
            role: user.role,
            user,
          }
        : undefined,
    } as Request;

    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const next = vi.fn();

    const res = {
      status,
      json,
    } as unknown as Response;

    const middleware = requireRole("EMPLOYEE");

    middleware(req, res, next);

    return { status, json, next };
  }

  it("rejects requests without authentication", () => {
    const result = checkEmployeeAccess();

    expect(result.status).toHaveBeenCalledWith(401);
    expect(result.json).toHaveBeenCalledWith({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
    expect(result.next).not.toHaveBeenCalled();
  });

  it("allows EMPLOYEE users", () => {
    const result = checkEmployeeAccess("EMPLOYEE");

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it.each([
    "HR_OFFICER",
    "APPROVER",
    "SYSTEM_ADMIN",
  ] as const)(
    "denies %s access to Employee-only resources",
    (role) => {
      const result = checkEmployeeAccess(role);

      expect(result.status).toHaveBeenCalledWith(403);
      expect(result.json).toHaveBeenCalledWith({
        error: {
          code: "FORBIDDEN",
          message: "Insufficient permissions",
        },
      });
      expect(result.next).not.toHaveBeenCalled();
    }
  );

  it("does not trust a role supplied in the request body", () => {
    const result = checkEmployeeAccess(
      "SYSTEM_ADMIN",
      "EMPLOYEE"
    );

    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });

  it("allows one of multiple permitted roles", () => {
    const role: UserRole = "HR_OFFICER";

    const user = {
      id: "00000000-0000-4000-8000-000000000002",
      email: "fictional-hr@example.invalid",
      fullName: "Fictional HR User",
      role,
    };

    const req = {
      auth: {
        userId: user.id,
        role: user.role,
        user,
      },
    } as Request;

    const res = {
      status: vi.fn(),
      json: vi.fn(),
    } as unknown as Response;

    const next = vi.fn();

    requireRole("EMPLOYEE", "HR_OFFICER")(
      req,
      res,
      next
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects an empty list of allowed roles", () => {
    expect(() => requireRole()).toThrow(
      "At least one role is required"
    );
  });
});
