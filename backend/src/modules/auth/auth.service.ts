
import argon2 from "argon2";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { studentProfiles, users } from "../../db/schema";
import type { LoginInput } from "./auth.schemas";

export type PublicUser = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "fullName" | "role"
>;


async function getDatabase() {
  const { db } = await import("../../db/index.js");
  return db;
}


export async function authenticateUser(
  input: LoginInput
): Promise<PublicUser | null> {
  const db = await getDatabase();

  const emailMatch = "email" in input ? eq(users.email, input.email.toLowerCase()) : undefined;
  const sapMatch = (sapId: string) => and(eq(users.role, "STUDENT"), eq(studentProfiles.sapId, sapId));
  // SAP is opaque: an email-shaped SAP may overlap the email namespace.
  // A shared identifier must resolve to exactly one account, never a guessed precedence.
  const lookup = "identifier" in input
    ? or(eq(users.email, input.identifier.toLowerCase()), sapMatch(input.identifier))
    : "sapId" in input ? sapMatch(input.sapId) : emailMatch;

  const results = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      studentProfileId: studentProfiles.id,
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(lookup)
    .limit(2);

  const user = results[0];

 
  if (results.length !== 1 || !user || !user.isActive
    || (user.role === "STUDENT" && !user.studentProfileId)) {
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
