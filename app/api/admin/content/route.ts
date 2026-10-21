import { NextResponse } from "next/server";

import { withUser } from "@/lib/auth/api";
import { buildSiteContent } from "@/lib/content/documents";
import { listDocuments } from "@/lib/content/store";

// Per-user data: never pre-rendered at build time.
export const dynamic = "force-dynamic";

/** All sections as the public site currently uses them, for the admin previews. */
export async function GET() {
  return withUser(async () => {
    const documents = await listDocuments();
    return NextResponse.json({ content: buildSiteContent(Object.fromEntries(documents.map((doc) => [doc.key, doc.data]))) });
  });
}
