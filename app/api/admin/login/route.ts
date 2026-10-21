import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson } from "@/lib/auth/api";
import { SESSION_COOKIE, hasSessionSecret, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { checkLogin } from "@/lib/auth/users";
import { hasDatabase } from "@/lib/db/client";

const body = z.object({ email: z.string().max(200), password: z.string().max(200) });

export async function POST(request: Request) {
  if (!hasDatabase() || !hasSessionSecret()) {
    return jsonError(503, "The admin database is not configured");
  }
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) {
    return jsonError(400, "Enter your email and password");
  }
  try {
    const result = await checkLogin(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      return result.reason === "locked"
        ? jsonError(429, `Too many failed attempts. Try again in ${result.minutes} minute${result.minutes === 1 ? "" : "s"}.`)
        : jsonError(401, "Wrong email or password");
    }
    const { user } = result;
    const response = NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
    response.cookies.set(SESSION_COOKIE, await signSession({ uid: user.id, role: user.role, sv: user.sessionVersion }), sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[admin login]", error);
    return jsonError(500, "Could not sign in. Please try again.");
  }
}
