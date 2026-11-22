import { z } from "zod";

const password = z.string().min(1, "Password is required");
const opaqueIdentifier = z.string().trim().min(1, "An identifier is required");

// Strict alternatives prevent multiple identifiers and preserve existing email clients.
export const loginSchema = z.union([
  z.strictObject({ email: z.email("Invalid email address"), password }),
  z.strictObject({ sapId: opaqueIdentifier, password }),
  z.strictObject({ identifier: opaqueIdentifier, password }),
]);

export type LoginInput = z.infer<typeof loginSchema>;
