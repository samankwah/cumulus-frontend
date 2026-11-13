import { NextResponse } from "next/server";

import type { ChatErrorCode } from "../types";

export function chatError(code: ChatErrorCode, message: string, status: number, retryAfter?: number) {
  return NextResponse.json(
    { code, message, ...(retryAfter ? { retryAfter } : {}) },
    {
      status,
      headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) },
    },
  );
}

export const DISABLED_MESSAGE = "The assistant is switched off right now. Please try again later.";

/**
 * Browsers always send Origin on POST. Refusing other sites stops them using this page's quota;
 * requests with no Origin (curl, servers) still face the rate limit.
 */
export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return !host || new URL(origin).host !== host;
  } catch {
    return true;
  }
}
