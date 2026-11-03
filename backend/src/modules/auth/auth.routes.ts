
import { Router, type Response } from "express";

import { requireAuth } from "../../middleware/requireAuth";
import { validateBody } from "../../middleware/validateBody";

import { loginSchema, type LoginInput } from "./auth.schemas";
import { authenticateUser } from "./auth.service";
import { signAccessToken } from "./auth.tokens";

export const authRouter = Router();

function sendUnauthorized(
  res: Response,
  message: string
): void {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message,
    },
  });
}

// Employee login
authRouter.post(
  "/login",
  validateBody(loginSchema),
  async (req, res, next) => {
    try {
      const input = req.body as LoginInput;

      const user = await authenticateUser(input);

      if (!user) {
        sendUnauthorized(res, "Invalid credentials");
        return;
      }

      const accessToken = signAccessToken(
       user.id,
       user.role
);

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

// Protected authenticated user endpoint
authRouter.get("/me", requireAuth, (req, res) => {
  const user = req.auth?.user;

  if (!user) {
    sendUnauthorized(res, "Invalid or expired token");
    return;
  }

  res.status(200).json({ user });
});
