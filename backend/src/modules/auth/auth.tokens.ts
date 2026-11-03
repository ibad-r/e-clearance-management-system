
import jwt from "jsonwebtoken";
import { userRoleEnum } from "../../db/schema/enums";
import type { PublicUser } from "./auth.service";

type UserRole = PublicUser["role"];

export interface VerifiedAccessToken {
  userId: string;
  role: UserRole;
}

const JWT_ISSUER = "e-clearance-backend";
const JWT_AUDIENCE = "e-clearance-api";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes");
  }

  return secret;
}

function getTokenLifetime(): number {
  const seconds = Number(
    process.env.JWT_ACCESS_TTL_SECONDS ?? "900"
  );

  if (
    !Number.isInteger(seconds) ||
    seconds < 60 ||
    seconds > 3600
  ) {
    throw new Error("Invalid JWT access token lifetime");
  }

  return seconds;
}

export function signAccessToken(
  userId: string,
  role: UserRole
): string {
  return jwt.sign({ role }, getJwtSecret(), {
    algorithm: "HS256",
    subject: userId,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: getTokenLifetime(),
  });
}

export function verifyAccessToken(
  token: string
): VerifiedAccessToken {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !payload.sub
  ) {
    throw new Error("Invalid access token");
  }

  const allowedRoles: readonly string[] =
    userRoleEnum.enumValues;

  if (
    typeof payload.role !== "string" ||
    !allowedRoles.includes(payload.role)
  ) {
    throw new Error("Invalid access token role");
  }

  return {
    userId: payload.sub,
    role: payload.role as UserRole,
  };
}
