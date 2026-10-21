import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env files; pick up DATABASE_URL from .env.local when it is there.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: DATABASE_URL must come from the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
