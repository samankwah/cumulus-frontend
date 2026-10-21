import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Guards the admin pages and API: a valid session cookie is required everywhere except the login
 * page and login call. Changes (POST/PUT/PATCH/DELETE) must also come from this site's own pages.
 * The API routes re-check the user in the database; this only keeps signed-out visitors out early.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/admin");
  const isPublic = pathname === "/admin/login" || pathname === "/api/admin/login";
  if (isApi && request.method !== "GET" && request.method !== "HEAD") {
    // Compare with the host the browser asked for (behind Vercel's proxy, the forwarded one).
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const origin = request.headers.get("origin");
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
    }
  }
  if (isPublic) {
    return NextResponse.next();
  }
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    return NextResponse.next();
  }
  if (isApi) {
    return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  }
  const login = new URL("/admin/login", request.url);
  if (pathname !== "/admin") {
    login.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
