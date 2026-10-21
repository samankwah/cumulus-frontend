import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson, withUser } from "@/lib/auth/api";
import { defaultDocument, isContentKey } from "@/lib/content/documents";
import { CONTENT_CACHE_TAG } from "@/lib/content/get-content";
import { getDocument, saveDocument } from "@/lib/content/store";

type Params = { params: { key: string } };

export async function GET(_request: Request, { params }: Params) {
  return withUser(async () => {
    if (!isContentKey(params.key)) return jsonError(404, "Unknown section");
    const document = await getDocument(params.key);
    return NextResponse.json({ document, defaults: defaultDocument(params.key) });
  });
}

const body = z.object({
  /** The section's new content, or null to go back to the built-in defaults. */
  data: z.unknown(),
  /** The version the editor started from. */
  version: z.number().int().min(0),
});

export async function PUT(request: Request, { params }: Params) {
  return withUser(async (user) => {
    if (!isContentKey(params.key)) return jsonError(404, "Unknown section");
    const parsed = body.safeParse(await readJson(request));
    if (!parsed.success) return jsonError(400, "Malformed request");
    const result = await saveDocument(params.key, parsed.data.data ?? null, parsed.data.version, user.name);
    if (!result.ok) {
      return result.reason === "conflict"
        ? jsonError(409, "Someone else saved this section while you were editing. Reload to see their changes.", {
            document: result.document,
          })
        : jsonError(422, "Some fields need fixing", { issues: result.issues });
    }
    revalidateTag(CONTENT_CACHE_TAG);
    return NextResponse.json({ document: result.document });
  });
}
