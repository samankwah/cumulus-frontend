/**
 * Creates an admin account (or resets its password), for the first sign-in or when every admin
 * has lost access. Prints a one-time password to change after signing in.
 *
 *   npm run admin:create -- --email someone@meteo.gov.gh --name "Their Name"
 *   npm run admin:create -- --email someone@meteo.gov.gh --name "Their Name" --role editor
 *
 * Reads DATABASE_URL from the environment or .env.local.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

import { users } from "../lib/db/schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: DATABASE_URL must come from the environment.
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "admin" },
  },
});

async function main() {
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role === "editor" ? "editor" : "admin";
  if (!email || !email.includes("@") || !name) {
    console.error('Usage: npm run admin:create -- --email you@example.org --name "Your Name" [--role editor]');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to .env.local first.");
    process.exit(1);
  }
  const db = drizzle(neon(process.env.DATABASE_URL));
  // Easy to read out and type: no 0/O or 1/l.
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const password = Array.from(randomBytes(16), (byte) => alphabet[byte % alphabet.length]).join("");
  const passwordHash = await bcrypt.hash(password, 12);

  await db
    .insert(users)
    .values({ email, name, role, passwordHash })
    .onConflictDoUpdate({
      target: users.email,
      set: { name, role, passwordHash, active: true, failedLogins: 0, lockedUntil: null, sessionVersion: sql`${users.sessionVersion} + 1` },
    });

  console.log(`\n${role === "admin" ? "Admin" : "Editor"} account ready for ${email}.`);
  console.log(`One-time password: ${password}`);
  console.log("Sign in at /admin/login and change it under Account.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
