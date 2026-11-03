
import type { RequestHandler, Response } from "express";
import {
  findActiveUserById,
  type PublicUser,
} from "../modules/auth/auth.service";
import { verifyAccessToken } from "../modules/auth/auth.tokens";

export interface AuthContext {
  userId: string;
  role: PublicUser["role"];
  user: PublicUser;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

function unauthorized(res: Response): void {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or expired token",
    },
  });
}

export const requireAuth: RequestHandler = async (
  req,
  res,
  next
) => {
  const authorization = req.get("authorization");

  const token = authorization?.match(
    /^Bearer ([^\s]+)$/i
  )?.[1];

  if (!token) {
    unauthorized(res);
    return;
  }

  let userId: string;

  try {
    userId = verifyAccessToken(token);
  } catch {
    unauthorized(res);
    return;
  }

  try {
    const user = await findActiveUserById(userId);

    if (!user) {
      unauthorized(res);
      return;
    }

    req.auth = {
      userId: user.id,
      role: user.role,
      user,
    };

    next();
  } catch (error) {
    next(error);
  }
};
