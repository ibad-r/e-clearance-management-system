
import jwt from "jsonwebtoken";

const JWT_ISSUER = "e-clearance-backend";
const JWT_AUDIENCE = "e-clearance-api";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "JWT_SECRET must contain at least 32 bytes"
    );
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

export function signAccessToken(userId: string): string {
  return jwt.sign({}, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: getTokenLifetime(),
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: userId,
  });
}

export function verifyAccessToken(token: string): string {
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

  return payload.sub;
}
