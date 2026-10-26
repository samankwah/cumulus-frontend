import { NextResponse } from "next/server";

import { getSiteContent } from "@/lib/content/get-content";

// Read from the database on each request (cached by getSiteContent), never frozen at build time.
export const dynamic = "force-dynamic";

/** The admin's forecast choices, read by the backend's partner API (subseasonal.official_model_url). */
export async function GET() {
  const { forecast } = await getSiteContent();
  return NextResponse.json(
    { officialModel: forecast.officialModel || null },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
