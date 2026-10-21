"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { FieldIssuesContext, fieldId } from "@/components/admin/fields";
import { Icon } from "@/components/admin/icons";
import { Badge, Button, Drawer, Menu, PageHeader, RelativeTime, Skeleton, useConfirm, useToast, useUnsavedGuard } from "@/components/admin/ui";
import type { ContentData, ContentKey } from "@/lib/content/documents";
import type { Revision, StoredDocument } from "@/lib/content/store";

/* ------------------------------------------------------------------------------------------
 * The frame every content section is edited in:
 *   - page header with who saved last, History and (optionally) Preview
 *   - an error summary that links to each field the server flagged
 *   - a save bar that appears only with unsaved changes (Ctrl/Cmd+S saves)
 *   - a history drawer: each version, what it changed, and restore
 * The page supplies the form as `children(editor)`.
 * ------------------------------------------------------------------------------------------ */

type Issues = Record<string, string>;

export type EditorApi<T> = {
  draft: T;
  setDraft: (update: T | ((draft: T) => T)) => void;
  /** The built-in defaults, in the form's shape. */
  defaults: T;
  /** The last saved copy, in the form's shape. */
  saved: T;
  issues: Issues;
  /** The first issue at a path or anywhere under it. */
  issue: (path: string) => string | undefined;
};

async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  try {
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const body = (await response.json().catch(() => ({}))) as T;
    return { status: response.status, body };
  } catch {
    return { status: 0, body: { error: "No connection. Check your internet and try again." } as T };
  }
}

/** Paths whose values differ between two JSON values, e.g. ["2.label", "thresholds.heavyDayMm"]. */
export function changedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (a === b) return [];
  const bothObjects = a && b && typeof a === "object" && typeof b === "object";
  if (!bothObjects || Array.isArray(a) !== Array.isArray(b)) return [prefix || "(whole section)"];
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  return Array.from(keys).flatMap((key) =>
    changedPaths((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key),
  );
}

/** "about.contactEmail" → "About › Contact email". */
export function humanizePath(path: string) {
  return path
    .split(".")
    .map((part) =>
      /^\d+$/.test(part)
        ? `#${Number(part) + 1}`
        : part
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/_/g, " ")
            .replace(/^./, (c) => c.toUpperCase())
            .replace(/ (\w)/g, (m) => m.toLowerCase()),
    )
    .join(" › ");
}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function DocumentEditor<K extends ContentKey, T = ContentData<K>>({
  sectionKey,
  title,
  description,
  noun = title,
  fromStored = (data) => data as unknown as T,
  toStored = (draft) => draft as unknown as ContentData<K>,
  describeChange = humanizePath,
  preview,
  children,
}: {
  sectionKey: K;
  title: string;
  description?: ReactNode;
  /** For messages: "Thresholds saved". */
  noun?: string;
  fromStored?: (data: ContentData<K>, defaults: ContentData<K>) => T;
  toStored?: (draft: T, defaults: ContentData<K>) => ContentData<K>;
  /** Names a changed path for the history ("crops.2.label" → "Rice › Name"). */
  describeChange?: (path: string, data: ContentData<K>) => string;
  /** A live preview of the draft, opened from the header. */
  preview?: (draft: T) => ReactNode;
  children: (editor: EditorApi<T>) => ReactNode;
}) {
  const [document, setDocument] = useState<StoredDocument | null>(null);
  const [defaultsStored, setDefaultsStored] = useState<ContentData<K> | null>(null);
  const [draft, setDraftState] = useState<T | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [issues, setIssues] = useState<Issues>({});
  const [problem, setProblem] = useState<{ text: string; conflict?: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const guard = useUnsavedGuard();
  const convert = useRef(fromStored);
  convert.current = fromStored;

  const adopt = useCallback((doc: StoredDocument, defaults: ContentData<K>) => {
    const next = convert.current((doc.data ?? defaults) as ContentData<K>, defaults);
    setDocument(doc);
    setDefaultsStored(defaults);
    setDraftState(next);
    setSavedJson(JSON.stringify(next));
    setIssues({});
    setProblem(null);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    const { status, body } = await api<{ document: StoredDocument; defaults: ContentData<K>; error?: string }>(`/api/admin/content/${sectionKey}`);
    if (status !== 200) {
      setLoadError(body.error ?? "This section could not be loaded.");
      return;
    }
    adopt(body.document, body.defaults);
  }, [adopt, sectionKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = draft !== null && JSON.stringify(draft) !== savedJson;

  useEffect(() => {
    guard.setDirty(sectionKey, dirty);
    return () => guard.setDirty(sectionKey, false);
  }, [dirty, guard, sectionKey]);

  const showIssues = (list: { path: string; message: string }[]) => {
    setIssues(Object.fromEntries(list.map((item) => [item.path, item.message])));
    window.requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const save = useCallback(
    async (data: ContentData<K> | null, done: string) => {
      if (!document || !defaultsStored) return false;
      setBusy(true);
      const { status, body } = await api<{ document?: StoredDocument; error?: string; issues?: { path: string; message: string }[] }>(
        `/api/admin/content/${sectionKey}`,
        { method: "PUT", body: JSON.stringify({ data, version: document.version }) },
      );
      setBusy(false);
      if (status === 200 && body.document) {
        adopt(body.document, defaultsStored);
        setHistoryKey((key) => key + 1);
        toast(done);
        return true;
      }
      if (status === 422 && body.issues) {
        setProblem({ text: "There is a problem" });
        showIssues(body.issues);
      } else {
        setIssues({});
        setProblem({ text: body.error ?? "Could not save. Please try again.", conflict: status === 409 });
        window.requestAnimationFrame(() => summaryRef.current?.focus());
      }
      return false;
    },
    [adopt, defaultsStored, document, sectionKey, toast],
  );

  const saveDraft = useCallback(() => {
    if (draft === null || !defaultsStored || !dirty || busy) return;
    void save(toStored(draft, defaultsStored), `${noun} saved`);
  }, [busy, defaultsStored, dirty, draft, noun, save, toStored]);

  // Ctrl+S / Cmd+S saves, as in a desktop editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveDraft]);

  const editor = useMemo<EditorApi<T> | null>(() => {
    if (draft === null || defaultsStored === null) return null;
    return {
      draft,
      setDraft: (update) => setDraftState((current) => (typeof update === "function" ? (update as (d: T) => T)(current as T) : update)),
      defaults: convert.current(defaultsStored, defaultsStored),
      saved: JSON.parse(savedJson) as T,
      issues,
      issue: (path) => issues[path] ?? Object.entries(issues).find(([key]) => key.startsWith(`${path}.`))?.[1],
    };
  }, [draft, defaultsStored, issues, savedJson]);

  if (loadError) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <div className="adm-banner tone-danger" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <strong>{loadError}</strong>
            <div className="adm-banner-actions">
              <Button size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!editor || !document || !defaultsStored) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <Skeleton rows={4} />
      </>
    );
  }

  const usingDefaults = document.data === null;
  const issueList = Object.entries(issues);
  const shortcut = isMac() ? "⌘S" : "Ctrl+S";

  return (
    <FieldIssuesContext.Provider value={issues}>
      <PageHeader
        title={title}
        description={description}
        status={
          usingDefaults ? (
            <Badge>Built-in default content</Badge>
          ) : (
            <span className="adm-saved-by">
              <Badge tone="accent" dot>
                Customised
              </Badge>
              <span>
                Last saved by {document.updatedBy}
                {document.updatedAt ? (
                  <>
                    {" · "}
                    <RelativeTime iso={document.updatedAt} />
                  </>
                ) : null}
              </span>
            </span>
          )
        }
        actions={
          <>
            {preview ? (
              <Button icon="eye" onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
            ) : null}
            <Button icon="history" onClick={() => setHistoryOpen(true)}>
              History
            </Button>
            <Menu
              items={[
                {
                  label: "Reset section to defaults",
                  icon: "undo",
                  tone: "danger",
                  disabled: usingDefaults,
                  onSelect: async () => {
                    const ok = await confirm({
                      title: `Reset ${title.toLowerCase()} to defaults?`,
                      description: (
                        <>
                          Everything in this section goes back to the built-in content. Your current version stays in <strong>History</strong>, so
                          you can restore it.
                        </>
                      ),
                      confirmLabel: "Reset to defaults",
                      tone: "danger",
                    });
                    if (ok) await save(null, `${noun} reset to defaults`);
                  },
                },
              ]}
            />
          </>
        }
      />

      {problem ? (
        <div className="adm-banner tone-danger" role="alert" tabIndex={-1} ref={summaryRef}>
          <Icon name="alert" size={18} />
          <div>
            <strong>{problem.text}</strong>
            {issueList.length ? (
              <ul className="adm-error-list">
                {issueList.slice(0, 8).map(([path, message]) => (
                  <li key={path}>
                    <a
                      href={`#${fieldId(path)}`}
                      onClick={(event) => {
                        event.preventDefault();
                        const target = window.document.getElementById(fieldId(path));
                        target?.scrollIntoView({ block: "center", behavior: "smooth" });
                        target?.focus({ preventScroll: true });
                      }}
                    >
                      {path ? `${describeChange(path, (toStored(draft as T, defaultsStored) ?? defaultsStored) as ContentData<K>)}: ` : ""}
                      {message}
                    </a>
                  </li>
                ))}
                {issueList.length > 8 ? <li>and {issueList.length - 8} more</li> : null}
              </ul>
            ) : null}
            {problem.conflict ? (
              <div className="adm-banner-actions">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (
                      !dirty ||
                      (await confirm({
                        title: "Load the latest version?",
                        description: "Your unsaved changes here will be lost. You may want to copy anything you need first.",
                        confirmLabel: "Load latest version",
                        tone: "danger",
                      }))
                    ) {
                      await load();
                    }
                  }}
                >
                  Load the latest version
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="adm-form">{children(editor)}</div>

      <div className={`adm-savebar${dirty ? " show" : ""}`} aria-hidden={!dirty} role="region" aria-label="Unsaved changes">
        <span className="adm-savebar-text">
          <Icon name="alert" size={16} />
          Unsaved changes
        </span>
        <Button
          variant="ghost"
          disabled={!dirty || busy}
          tabIndex={dirty ? 0 : -1}
          onClick={async () => {
            if (
              await confirm({
                title: "Discard changes?",
                description: "Everything you changed since the last save is undone.",
                confirmLabel: "Discard changes",
                tone: "danger",
              })
            ) {
              setDraftState(JSON.parse(savedJson) as T);
              setIssues({});
              setProblem(null);
            }
          }}
        >
          Discard
        </Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={!dirty}
          tabIndex={dirty ? 0 : -1}
          onClick={saveDraft}
          title={`Save (${shortcut})`}
          data-testid="admin-save"
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sectionKey={sectionKey}
        title={title}
        refreshKey={historyKey}
        currentVersion={document.version}
        currentData={(document.data ?? defaultsStored) as ContentData<K>}
        defaults={defaultsStored}
        describeChange={describeChange}
        onRestored={async (version) => {
          await load();
          setHistoryKey((key) => key + 1);
          toast(`Version ${version} restored`);
        }}
        dirty={dirty}
      />

      {preview ? (
        <Drawer open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview" subtitle="With your unsaved changes" width={520}>
          {previewOpen ? preview(editor.draft) : null}
        </Drawer>
      ) : null}
    </FieldIssuesContext.Provider>
  );
}

function summarise(paths: string[], describe: (path: string) => string) {
  const named = Array.from(new Set(paths.map(describe)));
  if (!named.length) return "No changes";
  return named.length <= 3 ? named.join(", ") : `${named.slice(0, 3).join(", ")} and ${named.length - 3} more`;
}

function HistoryDrawer<K extends ContentKey>({
  open,
  onClose,
  sectionKey,
  title,
  refreshKey,
  currentVersion,
  currentData,
  defaults,
  describeChange,
  onRestored,
  dirty,
}: {
  open: boolean;
  onClose: () => void;
  sectionKey: K;
  title: string;
  refreshKey: number;
  currentVersion: number;
  currentData: ContentData<K>;
  defaults: ContentData<K>;
  describeChange: (path: string, data: ContentData<K>) => string;
  onRestored: (version: number) => Promise<void>;
  dirty: boolean;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (!open) return;
    setRevisions(null);
    void api<{ revisions?: Revision[]; error?: string }>(`/api/admin/content/${sectionKey}/revisions`).then(({ body }) => {
      if (body.revisions) setRevisions(body.revisions);
      else setError(body.error ?? "Could not load the history");
    });
  }, [open, refreshKey, sectionKey]);

  const restore = async (revision: Revision) => {
    const target = (revision.data ?? defaults) as ContentData<K>;
    const differences = changedPaths(currentData, target);
    const ok = await confirm({
      title: `Restore version ${revision.version}?`,
      description: (
        <>
          <p style={{ margin: 0 }}>
            {differences.length
              ? `Changes: ${summarise(differences, (path) => describeChange(path, target))}.`
              : "It is the same as the current version."}
          </p>
          <p style={{ margin: "8px 0 0" }}>
            It is saved as a new version, so this can be undone from History.
            {dirty ? " Your unsaved changes on this page will be lost." : ""}
          </p>
        </>
      ),
      confirmLabel: "Restore version",
      tone: dirty ? "danger" : "primary",
    });
    if (!ok) return;
    setRestoring(revision.id);
    const { status, body } = await api<{ error?: string }>(`/api/admin/content/${sectionKey}/restore`, {
      method: "POST",
      body: JSON.stringify({ revisionId: revision.id }),
    });
    setRestoring(null);
    if (status === 200) {
      await onRestored(revision.version);
    } else {
      setError(body.error ?? "Could not restore that version");
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="History" subtitle={`Every saved version of ${title.toLowerCase()}, newest first`}>
      {error ? (
        <div className="adm-banner tone-danger" role="alert">
          <Icon name="alert" size={18} />
          <strong>{error}</strong>
        </div>
      ) : null}
      {!revisions ? (
        <div aria-busy="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="adm-skel" style={{ height: 58, marginBottom: 10 }} />
          ))}
        </div>
      ) : revisions.length === 0 ? (
        <p className="adm-muted">Nothing saved yet. The built-in default content is in use.</p>
      ) : (
        <ol className="adm-timeline">
          {revisions.map((revision, index) => {
            const previous = revisions[index + 1];
            const data = (revision.data ?? defaults) as ContentData<K>;
            const before = (previous ? (previous.data ?? defaults) : defaults) as ContentData<K>;
            const changes = revision.data === null ? null : changedPaths(before, data);
            const current = revision.version === currentVersion;
            return (
              <li key={revision.id} className={current ? "current" : undefined}>
                <span className="adm-timeline-dot" aria-hidden="true" />
                <div className="adm-timeline-body">
                  <div className="adm-timeline-top">
                    <strong>Version {revision.version}</strong>
                    {current ? <Badge tone="accent">Current</Badge> : null}
                    {revision.data === null ? <Badge>Defaults</Badge> : null}
                  </div>
                  <div className="adm-muted adm-small">
                    {revision.updatedBy} · <RelativeTime iso={revision.createdAt} />
                  </div>
                  <div className="adm-small adm-timeline-changes">
                    {changes === null
                      ? "Reset to the built-in defaults"
                      : changes.length
                        ? `Changed ${summarise(changes, (path) => describeChange(path, data))}`
                        : previous
                          ? "No changes"
                          : "First save"}
                  </div>
                </div>
                {!current ? (
                  <Button size="sm" loading={restoring === revision.id} onClick={() => void restore(revision)}>
                    Restore
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
}
