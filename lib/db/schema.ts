import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------------------------------
 * Admin database (Neon Postgres). Content is stored as one JSON document per section (see
 * lib/content/documents.ts); every save also lands in content_revisions so any earlier version
 * can be restored. A document whose data is null means "use the built-in defaults".
 * ------------------------------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** "admin" manages users and content; "editor" manages content only. */
  role: text("role").$type<"admin" | "editor">().notNull().default("editor"),
  active: boolean("active").notNull().default(true),
  /** Bumped on password change or deactivation, which signs the user out everywhere. */
  sessionVersion: integer("session_version").notNull().default(1),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const contentDocuments = pgTable("content_documents", {
  key: text("key").primaryKey(),
  data: jsonb("data"),
  version: integer("version").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    data: jsonb("data"),
    version: integer("version").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("content_revisions_key_version").on(table.key, table.version)],
);

export type UserRow = typeof users.$inferSelect;
