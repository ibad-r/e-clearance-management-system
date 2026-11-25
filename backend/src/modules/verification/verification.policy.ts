import { createHash } from "node:crypto";
import { z } from "zod";
import { ruleOperatorEnum, studentDepartmentCodeEnum } from "../../db/schema";

// Technical response limit; wording and permission to publish remain configured.
export const visibleTextSchema = z.string().trim().min(1).max(500)
  .refine((value) => !/[<>]/u.test(value) && [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }));
export const visibleReasonsSchema = z.record(z.string(), z.strictObject({
  failed: visibleTextSchema.optional(),
  incomplete: visibleTextSchema.optional(),
}));
export type VisibleReasons = z.infer<typeof visibleReasonsSchema>;
export function visibleText(value: unknown): string | null {
  const parsed = visibleTextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export const pinnedRuleSchema = z.object({
  metricKey: z.string().min(1),
  operator: z.enum(ruleOperatorEnum.enumValues),
  expectedValue: z.union([z.number(), z.string().min(1), z.boolean()]),
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export function evidenceFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export const MAX_VERIFICATION_ATTEMPTS = 3;
export type VerificationMode = "INITIAL" | "RETRY_INCOMPLETE" | "RECHECK_OUTSTANDING";
export function previousAttempts(snapshot: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!snapshot) return [];
  if (snapshot.attempts !== undefined) return z.array(z.record(z.string(), z.unknown())).max(MAX_VERIFICATION_ATTEMPTS).parse(snapshot.attempts);
  // Preserve the committed implementation's earlier single attempt on upgrade.
  return snapshot.source === "AUTOMATED_VERIFICATION" ? [snapshot] : [];
}

export function studentCanComplete(rows: { departmentCode: string; applicability: string; status: string }[]) {
  return rows.length === 5 && new Set(rows.map((row) => row.departmentCode)).size === 5
    && studentDepartmentCodeEnum.enumValues.every((code) => rows.some((row) => row.departmentCode === code))
    && rows.every((row) => row.applicability === "REQUIRED" ? row.status === "CLEARED"
      : row.applicability === "NOT_REQUIRED" && row.status === "NOT_REQUIRED");
}
export function employeeAggregate(rows: { status: string }[], finalPolicy?: "DEPARTMENTS_ONLY") {
  if (rows.some((row) => row.status === "OUTSTANDING")) return "ACTION_REQUIRED" as const;
  if (finalPolicy === "DEPARTMENTS_ONLY" && rows.length > 0
    && rows.every((row) => row.status === "CLEARED")) return "COMPLETED" as const;
  return "IN_PROGRESS" as const;
}
