import type { Request, Response } from "express";
import { z } from "zod";
import { userRoleEnum } from "../../db/schema/enums";
import { EmployeeApiError } from "./employee.errors";
import type { VerifiedEmployeeIdentity } from "./employee.types";

/**
 * Server-only integration seam for a future credential-verification middleware.
 * The resolver must read its already-verified identity and return { userId, role }.
 * It must not construct an identity from request headers, body fields or decoded,
 * unverified tokens. The production app must not mount these routes until that
 * verifier and this explicit mapping are available.
 */
export type VerifiedIdentityResolver = (req: Request, res: Response) => unknown;

const principalSchema = z.strictObject({
  userId: z.uuid(),
  role: z.enum(userRoleEnum.enumValues),
});

export function parsePrincipal(value: unknown): VerifiedEmployeeIdentity {
  const result = principalSchema.safeParse(value);
  if (!result.success) {
    throw new EmployeeApiError(401, "UNAUTHENTICATED", "Authentication required");
  }
  if (result.data.role !== "EMPLOYEE") {
    throw new EmployeeApiError(403, "FORBIDDEN", "Employee access required");
  }
  return result.data;
}
