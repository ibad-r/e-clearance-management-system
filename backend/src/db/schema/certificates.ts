import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clearanceRequests } from "./requests";

export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .unique("certificates_request_id_unique")
      .references(() => clearanceRequests.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    certificateNumber: text("certificate_number")
      .notNull()
      .unique("certificates_certificate_number_unique"),
    // The issuing service must generate an unguessable token; length alone is not entropy.
    verificationToken: text("verification_token")
      .notNull()
      .unique("certificates_verification_token_unique"),
    pdfStorageKey: text("pdf_storage_key"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "certificates_number_nonempty",
      sql`length(btrim(${table.certificateNumber})) > 0`,
    ),
    check(
      "certificates_verification_token_length",
      sql`length(${table.verificationToken}) >= 24`,
    ),
    check(
      "certificates_revocation_time_valid",
      sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.issuedAt}`,
    ),
  ],
);
