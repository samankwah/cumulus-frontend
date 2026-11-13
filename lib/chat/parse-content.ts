import type { ChatPart, ChatStep } from "./types";

/**
 * Weather Skills (an Open WebUI fork) stores an assistant reply as markdown with
 * `<details type="reasoning|tool_calls" …>` blocks between the prose. Tool arguments and results
 * are HTML-escaped JSON in attributes. This turns that into ordered parts for the chat panel:
 * prose, grouped steps, and images the agent chose to show (its `display_image` tool).
 */

const DETAILS_OPEN = /<details\b([^>]*)>/g;

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " " };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/** Tool arguments arrive as an escaped JSON string that itself holds JSON. */
export function parseJsonAttribute(raw: string | undefined): unknown {
  if (!raw) return null;
  let value: unknown = decodeEntities(raw);
  for (let i = 0; i < 2 && typeof value === "string"; i += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

const TOOL_LABELS: Record<string, string> = {
  list_available_tools: "Checking available skills",
  list_artifacts: "Checking files",
  display_image: "Preparing the chart",
  resolve_region: "Finding the area",
  resolve_time: "Working out the dates",
  plot: "Drawing the chart",
};

function humanizeToolName(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const words = name.replace(/[_-]+/g, " ").replace(/\bfetch\b/i, "data").trim();
  return words ? `Running ${words}` : "Running a skill";
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 140) : null;
}

/** The thinking body is a quoted block after a <summary>; keep it short and plain. */
function thinkingText(body: string): string {
  return body
    .replace(/<summary>[\s\S]*?<\/summary>/i, "")
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim()
    .slice(0, 1600);
}

function toolOk(result: unknown): boolean | undefined {
  if (result && typeof result === "object" && !Array.isArray(result) && "ok" in result) {
    return (result as { ok?: unknown }).ok !== false;
  }
  return undefined;
}

/** Only plain relative workspace paths, the same rule the Weather Skills app applies. */
export function safeArtifactPath(raw: string | null | undefined): string | null {
  let path = (raw ?? "").trim();
  if (!path || path.startsWith("#") || path.startsWith("/") || path.startsWith("\\") || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return null;
  }
  path = path.split("#")[0].split("?")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/^\.\//, "").replace(/\\/g, "/");
  if (!path || path === "." || path.length > 300 || path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    return null;
  }
  return path;
}

type Block = { attrs: Record<string, string>; body: string; closed: boolean };

/** Splits content into prose strings and <details> blocks; an unclosed last block is "in progress". */
function tokenize(content: string): Array<string | Block> {
  const out: Array<string | Block> = [];
  let cursor = 0;
  DETAILS_OPEN.lastIndex = 0;
  for (;;) {
    DETAILS_OPEN.lastIndex = cursor;
    const open = DETAILS_OPEN.exec(content);
    if (!open) break;
    if (open.index > cursor) out.push(content.slice(cursor, open.index));
    const bodyStart = open.index + open[0].length;
    const close = content.indexOf("</details>", bodyStart);
    if (close === -1) {
      out.push({ attrs: parseAttributes(open[1]), body: content.slice(bodyStart), closed: false });
      cursor = content.length;
      break;
    }
    out.push({ attrs: parseAttributes(open[1]), body: content.slice(bodyStart, close), closed: true });
    cursor = close + "</details>".length;
  }
  if (cursor < content.length) out.push(content.slice(cursor));
  return out;
}

export function parseAssistantContent(content: string): ChatPart[] {
  const parts: ChatPart[] = [];
  let steps: ChatStep[] = [];
  let images: Array<{ path: string; alt: string }> = [];
  const seenImages = new Set<string>();

  const flush = () => {
    if (steps.length) parts.push({ type: "steps", steps });
    for (const image of images) parts.push({ type: "image", ...image });
    steps = [];
    images = [];
  };

  for (const token of tokenize(content)) {
    if (typeof token === "string") {
      // Unfinished tags at the very end of a streaming snapshot are dropped until complete.
      const text = token.replace(/<details\b[^>]*$/, "").replace(/\n{3,}/g, "\n\n").trim();
      if (!text) continue;
      flush();
      const last = parts[parts.length - 1];
      if (last?.type === "text") last.text = `${last.text}\n\n${text}`;
      else parts.push({ type: "text", text });
      continue;
    }

    const { attrs, body, closed } = token;
    const done = closed && attrs.done !== "false";
    const seconds = attrs.duration !== undefined && Number.isFinite(Number(attrs.duration)) ? Number(attrs.duration) : null;
    const id = attrs.id || `step-${parts.length}-${steps.length}`;

    if (attrs.type === "reasoning") {
      steps.push({ id, kind: "thinking", label: done ? "Reasoning" : "Thinking", done, seconds, detail: thinkingText(body) });
      continue;
    }

    if (attrs.type === "tool_calls") {
      const name = attrs.name ?? "";
      const args = parseJsonAttribute(attrs.arguments);
      const argObject = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
      if (name === "display_image") {
        const path = safeArtifactPath(typeof argObject.path === "string" ? argObject.path : null);
        if (path && done && !seenImages.has(path)) {
          seenImages.add(path);
          images.push({ path, alt: cleanLabel(argObject.caption) ?? cleanLabel(argObject.title) ?? "Chart from Weather Skills" });
        }
        continue;
      }
      const label = cleanLabel(argObject.display) ?? cleanLabel(argObject.activity) ?? humanizeToolName(name);
      steps.push({ id, kind: "tool", label, done, seconds, ok: done ? toolOk(parseJsonAttribute(attrs.result)) : undefined });
      continue;
    }

    // Other block types (code runs, citations) still count as work done.
    steps.push({ id, kind: "tool", label: cleanLabel(attrs.name) ?? "Working", done, seconds });
  }
  flush();
  return parts;
}

/**
 * What a visitor should see: one activity block with every step (and the agent's working notes
 * between steps), then the charts, then the answer. Text written before the last batch of steps is
 * working commentary ("Next: sample it at Tamale…"), so it moves into the activity list, unless it
 * is the only text there is.
 */
export function foldForDisplay(parts: ChatPart[], done: boolean): ChatPart[] {
  const lastSteps = parts.map((part) => part.type).lastIndexOf("steps");
  if (lastSteps === -1) return parts;
  const hasAnswerAfter = parts.slice(lastSteps + 1).some((part) => part.type === "text");
  // While still working, everything before the latest steps is commentary.
  const lastTextBefore = hasAnswerAfter || !done ? -1 : parts.map((part) => part.type).lastIndexOf("text");

  const steps: ChatStep[] = [];
  const images: ChatPart[] = [];
  const answer: ChatPart[] = [];
  parts.forEach((part, index) => {
    if (part.type === "steps") {
      steps.push(...part.steps);
    } else if (part.type === "image") {
      images.push(part);
    } else if (index > lastSteps || index === lastTextBefore) {
      answer.push(part);
    } else {
      const text = part.text.replace(/\s+/g, " ").trim();
      steps.push({ id: `note-${index}`, kind: "note", label: text.slice(0, 160), detail: text.length > 160 ? text.slice(0, 1600) : undefined, done: true, seconds: null });
    }
  });
  return [{ type: "steps", steps }, ...images, ...answer];
}

/** Plain text of a reply (for copy-to-clipboard). */
export function partsToPlainText(parts: ChatPart[]): string {
  return parts
    .filter((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}
