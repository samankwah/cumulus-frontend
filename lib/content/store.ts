import { and, desc, eq, sql } from "drizzle-orm";

import { CONTENT_KEYS, validateDocument } from "@/lib/content/documents";
import type { ContentKey } from "@/lib/content/documents";
import { requireDb } from "@/lib/db/client";
import { contentDocuments, contentRevisions } from "@/lib/db/schema";

/* ------------------------------------------------------------------------------------------
 * Reading and saving content documents (server only). Every save writes a revision, so earlier
 * versions can be restored; a save must name the version it was edited from, so two editors
 * working at once cannot silently overwrite each other.
 * ------------------------------------------------------------------------------------------ */

export type StoredDocument = {
  key: ContentKey;
  /** null: the section uses the built-in defaults. */
  data: unknown;
  /** 0 when the section has never been saved. */
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type SaveResult =
  | { ok: true; document: StoredDocument }
  | { ok: false; reason: "conflict"; document: StoredDocument }
  | { ok: false; reason: "invalid"; issues: { path: string; message: string }[] };

function toStored(key: ContentKey, row: typeof contentDocuments.$inferSelect | undefined): StoredDocument {
  return row
    ? { key, data: row.data, version: row.version, updatedBy: row.updatedBy, updatedAt: row.updatedAt.toISOString() }
    : { key, data: null, version: 0, updatedBy: null, updatedAt: null };
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const rows = await requireDb().select().from(contentDocuments);
  return CONTENT_KEYS.map((key) => toStored(key, rows.find((row) => row.key === key)));
}

export async function getDocument(key: ContentKey): Promise<StoredDocument> {
  const [row] = await requireDb().select().from(contentDocuments).where(eq(contentDocuments.key, key));
  return toStored(key, row);
}

/**
 * Saves a section (data null resets it to the defaults). `expectedVersion` is the version the
 * editor started from; if someone saved in between, nothing is written and the newer copy is returned.
 */
export async function saveDocument(key: ContentKey, data: unknown, expectedVersion: number, editor: string): Promise<SaveResult> {
  let value: unknown = null;
  if (data !== null) {
    const parsed = validateDocument(key, data);
    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      };
    }
    value = parsed.data;
  }
  const db = requireDb();
  const next = expectedVersion + 1;
  const write =
    expectedVersion === 0
      ? db
          .insert(contentDocuments)
          .values({ key, data: value, version: next, updatedBy: editor })
          .onConflictDoNothing()
          .returning()
      : db
          .update(contentDocuments)
          .set({ data: value, version: next, updatedBy: editor, updatedAt: sql`now()` })
          .where(and(eq(contentDocuments.key, key), eq(contentDocuments.version, expectedVersion)))
          .returning();
  // The revision copies the row just written, so it only appears if the write went through.
  const revision = db.execute(
    sql`insert into ${contentRevisions} (key, data, version, updated_by)
        select key, data, version, updated_by from ${contentDocuments}
        where key = ${key} and version = ${next} and updated_by = ${editor}
        and not exists (select 1 from ${contentRevisions} where key = ${key} and version = ${next})`,
  );
  const [written] = await db.batch([write, revision]);
  const row = written[0];
  if (!row) {
    return { ok: false, reason: "conflict", document: await getDocument(key) };
  }
  return { ok: true, document: toStored(key, row) };
}

export type Revision = { id: number; version: number; updatedBy: string; createdAt: string; data: unknown };

export async function listRevisions(key: ContentKey, limit = 30): Promise<Revision[]> {
  const rows = await requireDb()
    .select({
      id: contentRevisions.id,
      version: contentRevisions.version,
      updatedBy: contentRevisions.updatedBy,
      createdAt: contentRevisions.createdAt,
      data: contentRevisions.data,
    })
    .from(contentRevisions)
    .where(eq(contentRevisions.key, key))
    .orderBy(desc(contentRevisions.version))
    .limit(limit);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getRevision(key: ContentKey, id: number) {
  const [row] = await requireDb()
    .select()
    .from(contentRevisions)
    .where(and(eq(contentRevisions.key, key), eq(contentRevisions.id, id)));
  return row ?? null;
}

export type Activity = { key: ContentKey; version: number; updatedBy: string; createdAt: string; isDefault: boolean };

/** The latest saves across all sections, for the overview page. */
export async function recentActivity(limit = 8): Promise<Activity[]> {
  const rows = await requireDb()
    .select({
      key: contentRevisions.key,
      version: contentRevisions.version,
      updatedBy: contentRevisions.updatedBy,
      createdAt: contentRevisions.createdAt,
      isDefault: sql<boolean>`${contentRevisions.data} is null`,
    })
    .from(contentRevisions)
    .orderBy(desc(contentRevisions.createdAt))
    .limit(limit);
  return rows
    .filter((row): row is typeof row & { key: ContentKey } => CONTENT_KEYS.includes(row.key as ContentKey))
    .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** Restores an earlier revision by saving its content as a new version (so the restore can itself be undone). */
export async function restoreRevision(key: ContentKey, id: number, editor: string): Promise<SaveResult | null> {
  const revision = await getRevision(key, id);
  if (!revision) {
    return null;
  }
  const current = await getDocument(key);
  return saveDocument(key, revision.data, current.version, editor);
}
