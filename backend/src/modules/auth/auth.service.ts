
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema";
import type { LoginInput } from "./auth.schemas";

export type PublicUser = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "fullName" | "role"
>;


async function getDatabase() {
  const { db } = await import("../../db/index.js");
  return db;
}


export async function authenticateEmployee(
  input: LoginInput
): Promise<PublicUser | null> {
  const db = await getDatabase();

  const results = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);

  const user = results[0];

 
  if (!user || !user.isActive) {
    return null;
  }

 
  const passwordValid = await argon2.verify(
    user.passwordHash,
    input.password
  );

  if (!passwordValid) {
    return null;
  }

 
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}


export async function findActiveUserById(
  userId: string
): Promise<PublicUser | null> {
  if (!z.uuid().safeParse(userId).success) {
    return null;
  }

  const db = await getDatabase();

  const results = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = results[0];

  if (!user || !user.isActive) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}
