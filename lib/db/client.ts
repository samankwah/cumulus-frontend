import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/lib/db/schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

/** Whether an admin database is configured. Without one the site runs on the built-in content. */
export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

/** The Neon database over HTTP (no connection pool to manage on serverless), or null if not configured. */
export function getDb(): Database | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }
  cached ??= drizzle(neon(url), { schema });
  return cached;
}

export function requireDb(): Database {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is not set");
  }
  return db;
}
