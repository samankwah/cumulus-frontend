import { unstable_cache } from "next/cache";

import { buildSiteContent } from "@/lib/content/documents";
import { DEFAULT_SITE_CONTENT } from "@/lib/content/site-content";
import type { SiteContent } from "@/lib/content/site-content";
import { getDb } from "@/lib/db/client";
import { contentDocuments } from "@/lib/db/schema";

/** Admin saves revalidate this tag, so the public site picks up an edit within seconds. */
export const CONTENT_CACHE_TAG = "content";
/** Forecast data fetched on the server (the bulletin); a new run or official model revalidates it. */
export const FORECAST_CACHE_TAG = "forecast";

/** Past this the site stops waiting for the database and shows the built-in content. */
const DATABASE_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)),
  ]);
}

const loadStoredDocuments = unstable_cache(
  async () => {
    const db = getDb();
    if (!db) return {};
    const rows = await withTimeout(db.select({ key: contentDocuments.key, data: contentDocuments.data }).from(contentDocuments), DATABASE_TIMEOUT_MS);
    return Object.fromEntries(rows.map((row) => [row.key, row.data]));
  },
  ["site-content-documents"],
  { tags: [CONTENT_CACHE_TAG], revalidate: 300 },
);

/**
 * The content the public site shows: the edited sections from the database over the built-in
 * defaults. Never throws: without a database, or if it is down or slow, the defaults are used.
 */
export async function getSiteContent(): Promise<SiteContent> {
  if (!getDb()) {
    return DEFAULT_SITE_CONTENT;
  }
  try {
    return buildSiteContent(await loadStoredDocuments());
  } catch (error) {
    console.warn("[content] Could not load content from the database; using the defaults.", error);
    return DEFAULT_SITE_CONTENT;
  }
}
