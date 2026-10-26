import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { clearanceRequests } from "./requests";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "no action",
      }),
    requestId: uuid("request_id").references(() => clearanceRequests.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("notifications_user_read_idx").on(table.userId, table.readAt),
    index("notifications_request_idx").on(table.requestId),
  ],
);

// Future services must append curated audit details in the same transaction as the action.
// Never copy whole user records or request bodies: passwords, hashes and auth tokens
// must not enter audit details. Append-only behavior is a service/DB-permission concern.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    requestId: uuid("request_id").references(() => clearanceRequests.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_request_created_idx").on(table.requestId, table.createdAt),
    index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_logs_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
  ],
);
