
import { Router } from "express";
import { validateBody } from "../../middleware/validateBody";
import { loginSchema, type LoginInput } from "./auth.schemas";
import {
  authenticateEmployee,
  findActiveUserById,
} from "./auth.service";
import {
  signAccessToken,
  verifyAccessToken,
} from "./auth.tokens";

export const authRouter = Router();

function sendUnauthorized(
  res: import("express").Response,
  message: string
) {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message,
    },
  });
}

// POST /api/v1/auth/login
authRouter.post(
  "/login",
  validateBody(loginSchema),
  async (req, res, next) => {
    try {
      const input = req.body as LoginInput;

      const user = await authenticateEmployee(input);

      if (!user) {
        sendUnauthorized(res, "Invalid credentials");
        return;
      }

      const accessToken = signAccessToken(user.id);

      res.status(200).json({
        accessToken,
        tokenType: "Bearer",
        expiresIn: Number(
          process.env.JWT_ACCESS_TTL_SECONDS ?? "900"
        ),
        user,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/auth/me
authRouter.get("/me", async (req, res, next) => {
  const authorization = req.header("authorization");

  const token = authorization?.match(
    /^Bearer ([^\s]+)$/i
  )?.[1];

  if (!token) {
    sendUnauthorized(res, "Invalid or expired token");
    return;
  }

  let userId: string;

  try {
    userId = verifyAccessToken(token);
  } catch {
    sendUnauthorized(res, "Invalid or expired token");
    return;
  }

  try {
    const user = await findActiveUserById(userId);

    if (!user) {
      sendUnauthorized(res, "Invalid or expired token");
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});
