import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson, withUser } from "@/lib/auth/api";
import { isContentKey } from "@/lib/content/documents";
import { CONTENT_CACHE_TAG } from "@/lib/content/get-content";
import { restoreRevision } from "@/lib/content/store";

const body = z.object({ revisionId: z.number().int().positive() });

export async function POST(request: Request, { params }: { params: { key: string } }) {
  return withUser(async (user) => {
    if (!isContentKey(params.key)) return jsonError(404, "Unknown section");
    const parsed = body.safeParse(await readJson(request));
    if (!parsed.success) return jsonError(400, "Malformed request");
    const result = await restoreRevision(params.key, parsed.data.revisionId, user.name);
    if (!result) return jsonError(404, "That version no longer exists");
    if (!result.ok) {
      // A stored revision that no longer validates (the rules got stricter since): say so plainly.
      return result.reason === "invalid"
        ? jsonError(422, "That version can no longer be used. Some of its values are outside today's allowed ranges.", {
            issues: result.issues,
          })
        : jsonError(409, "Someone else saved this section just now. Try again.");
    }
    revalidateTag(CONTENT_CACHE_TAG);
    return NextResponse.json({ document: result.document });
  });
}
