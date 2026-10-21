import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { requireDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { UserRow } from "@/lib/db/schema";

/* ------------------------------------------------------------------------------------------
 * Admin users (server only): passwords, login with lock-out, and the signed-in user.
 * ------------------------------------------------------------------------------------------ */

export const MIN_PASSWORD_LENGTH = 10;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

export type AdminUser = Pick<UserRow, "id" | "email" | "name" | "role" | "active" | "sessionVersion"> & {
  createdAt: string;
  lastLoginAt: string | null;
};

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    sessionVersion: row.sessionVersion,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

export type LoginResult = { ok: true; user: AdminUser } | { ok: false; reason: "invalid" | "locked"; minutes?: number };

export async function checkLogin(email: string, password: string): Promise<LoginResult> {
  const db = requireDb();
  const [row] = await db.select().from(users).where(eq(users.email, normaliseEmail(email)));
  if (!row) {
    dummyHash ??= bcrypt.hash("not-a-real-password", 12);
    await bcrypt.compare(password, await dummyHash);
    return { ok: false, reason: "invalid" };
  }
  if (row.lockedUntil && row.lockedUntil > new Date()) {
    return { ok: false, reason: "locked", minutes: Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60_000) };
  }
  const matches = await bcrypt.compare(password, row.passwordHash);
  if (!matches || !row.active) {
    const failed = row.failedLogins + 1;
    await db
      .update(users)
      .set({
        failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : row.lockedUntil,
      })
      .where(eq(users.id, row.id));
    return failed >= MAX_FAILED_LOGINS ? { ok: false, reason: "locked", minutes: LOCK_MINUTES } : { ok: false, reason: "invalid" };
  }
  const [updated] = await db
    .update(users)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: sql`now()` })
    .where(eq(users.id, row.id))
    .returning();
  return { ok: true, user: toAdminUser(updated) };
}

/** The signed-in user, re-checked against the database; null if signed out, deactivated or signed out everywhere. */
export async function currentUser(): Promise<AdminUser | null> {
  const claims = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!claims) {
    return null;
  }
  const [row] = await requireDb().select().from(users).where(eq(users.id, claims.uid));
  if (!row || !row.active || row.sessionVersion !== claims.sv) {
    return null;
  }
  return toAdminUser(row);
}

export async function listUsers(): Promise<AdminUser[]> {
  const rows = await requireDb().select().from(users).orderBy(users.createdAt);
  return rows.map(toAdminUser);
}

export async function countUsers() {
  const [row] = await requireDb().select({ count: sql<number>`count(*)::int` }).from(users);
  return row?.count ?? 0;
}

export async function createUser(input: { email: string; name: string; password: string; role: "admin" | "editor" }) {
  const [row] = await requireDb()
    .insert(users)
    .values({
      email: normaliseEmail(input.email),
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
    })
    .onConflictDoNothing()
    .returning();
  return row ? toAdminUser(row) : null;
}

export async function updateUser(
  id: number,
  changes: { name?: string; role?: "admin" | "editor"; active?: boolean; password?: string },
) {
  const set: Omit<Partial<typeof users.$inferInsert>, "sessionVersion"> & { sessionVersion?: ReturnType<typeof sql> } = {};
  if (changes.name !== undefined) set.name = changes.name.trim();
  if (changes.role !== undefined) set.role = changes.role;
  if (changes.active !== undefined) set.active = changes.active;
  if (changes.password !== undefined) {
    set.passwordHash = await hashPassword(changes.password);
    set.failedLogins = 0;
    set.lockedUntil = null;
  }
  // A new password, a lost role or a deactivation signs the user out of every browser.
  if (changes.password !== undefined || changes.active === false || changes.role !== undefined) {
    set.sessionVersion = sql`${users.sessionVersion} + 1`;
  }
  const [row] = await requireDb().update(users).set(set).where(eq(users.id, id)).returning();
  return row ? toAdminUser(row) : null;
}

export async function deleteUser(id: number) {
  const [row] = await requireDb().delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return Boolean(row);
}

export async function countActiveAdmins() {
  const [row] = await requireDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.role} = 'admin' and ${users.active}`);
  return row?.count ?? 0;
}
