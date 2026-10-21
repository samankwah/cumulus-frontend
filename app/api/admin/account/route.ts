import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson, withUser } from "@/lib/auth/api";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { MIN_PASSWORD_LENGTH, updateUser } from "@/lib/auth/users";
import { requireDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const body = z.object({
  currentPassword: z.string().max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `The new password needs at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
});

/** Changes the signed-in user's own password; other browsers are signed out, this one stays in. */
export async function POST(request: Request) {
  return withUser(async (me) => {
    const parsed = body.safeParse(await readJson(request));
    if (!parsed.success) return jsonError(422, parsed.error.issues[0]?.message ?? "Check the form");
    const [row] = await requireDb().select({ hash: users.passwordHash }).from(users).where(eq(users.id, me.id));
    if (!row || !(await bcrypt.compare(parsed.data.currentPassword, row.hash))) {
      return jsonError(401, "Your current password is wrong");
    }
    const user = await updateUser(me.id, { password: parsed.data.newPassword });
    if (!user) return jsonError(404, "Unknown user");
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await signSession({ uid: user.id, role: user.role, sv: user.sessionVersion }), sessionCookieOptions());
    return response;
  });
}
