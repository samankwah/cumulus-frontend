import { NextResponse } from "next/server";

import { jsonError, withUser } from "@/lib/auth/api";
import { isContentKey } from "@/lib/content/documents";
import { listRevisions } from "@/lib/content/store";

export async function GET(_request: Request, { params }: { params: { key: string } }) {
  return withUser(async () => {
    if (!isContentKey(params.key)) return jsonError(404, "Unknown section");
    return NextResponse.json({ revisions: await listRevisions(params.key) });
  });
}
