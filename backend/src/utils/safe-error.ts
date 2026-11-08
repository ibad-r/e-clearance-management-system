// Only use for application-authored diagnostics that contain no input or secrets.
export class SafeDiagnosticError extends Error {}

const diagnostics: Record<string, string> = {
  "28P01": "PostgreSQL password authentication failed; supply the working database role password",
  "28000": "PostgreSQL rejected authorization; check the role and server authentication configuration",
  "3D000": "The requested PostgreSQL database does not exist",
  "42P01": "A required database relation does not exist; inspect the target and migration history",
  "42501": "The database role lacks permission for this operation",
  "23505": "A unique constraint conflicts with an existing record",
  "23503": "A foreign key constraint prevents this operation",
  "23514": "A database check constraint rejected this operation",
  ECONNREFUSED: "Database connection refused; check the local service and port",
  ETIMEDOUT: "Database connection timed out",
  ENOTFOUND: "Database hostname could not be resolved",
  ENOENT: "A required local file was not found; check the migration folder and journal",
  EACCES: "Access to a required local resource was denied",
};

/** Never serialize raw driver messages, SQL, parameters, detail, or stacks. */
export function formatSafeError(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<object>();
  function visit(value: unknown): void {
    if (!value || typeof value !== "object" || seen.has(value) || seen.size >= 8) return;
    seen.add(value);
    if (value instanceof SafeDiagnosticError) messages.push(value.message);
    if ("code" in value && typeof value.code === "string") {
      const description = Object.hasOwn(diagnostics, value.code) ? diagnostics[value.code] : undefined;
      if (description) messages.push(`[${value.code}] ${description}`);
    }
    if ("cause" in value) visit(value.cause);
    if (value instanceof AggregateError) value.errors.forEach(visit);
  }
  visit(error);
  return [...new Set(messages)].join(": ") || "Unexpected failure (no safe diagnostic available)";
}
