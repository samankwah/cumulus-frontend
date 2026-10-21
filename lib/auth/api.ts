import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth/users";
import type { AdminUser } from "@/lib/auth/users";
import { hasSessionSecret } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db/client";

/* Shared plumbing for the /api/admin route handlers. */

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Runs a handler for a signed-in user (an admin, if `adminOnly`), with consistent errors. */
export async function withUser(
  handler: (user: AdminUser) => Promise<Response>,
  { adminOnly = false }: { adminOnly?: boolean } = {},
): Promise<Response> {
  if (!hasDatabase() || !hasSessionSecret()) {
    return jsonError(503, "The admin database is not configured");
  }
  try {
    const user = await currentUser();
    if (!user) {
      return jsonError(401, "Please sign in");
    }
    if (adminOnly && user.role !== "admin") {
      return jsonError(403, "Only admins can do this");
    }
    return await handler(user);
  } catch (error) {
    console.error("[admin api]", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
