import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { CONTENT_CACHE_TAG, FORECAST_CACHE_TAG } from "@/lib/content/get-content";

const ALLOWED_TAGS = [FORECAST_CACHE_TAG, CONTENT_CACHE_TAG];

function secretMatches(given: string | null) {
  const expected = process.env.REVALIDATE_SECRET ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the ingest workflow once a new run is live: drops the cached forecast so every
 * bulletin shows the new run on its next visit. Needs the X-Revalidate-Secret header.
 * Body (optional): {"tags": ["forecast"]}.
 */
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-revalidate-secret"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { tags?: unknown };
  const asked = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string") : [FORECAST_CACHE_TAG];
  const tags = asked.filter((tag) => ALLOWED_TAGS.includes(tag));
  if (!tags.length) {
    return NextResponse.json({ error: `Unknown tags; allowed: ${ALLOWED_TAGS.join(", ")}` }, { status: 400 });
  }
  tags.forEach((tag) => revalidateTag(tag));
  return NextResponse.json({ revalidated: tags, at: new Date().toISOString() });
}
