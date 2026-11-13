/**
 * The small, stable message format the chat panel speaks. The server turns Weather Skills'
 * internal message format (Open WebUI HTML-ish <details> blocks) into these parts, so the browser
 * never sees tool outputs, file-system paths of other chats, or the upstream key.
 */

/** One step the agent took: a skill run, a file check, or a stretch of thinking. */
export type ChatStep = {
  id: string;
  /** "note": the agent's own working commentary between skill runs. */
  kind: "tool" | "thinking" | "note";
  /** Friendly label, e.g. "Fetching IMERG rainfall around Tamale". */
  label: string;
  done: boolean;
  /** Seconds the step took, when finished. */
  seconds: number | null;
  /** Thinking text (trimmed); tools have none. */
  detail?: string;
  /** False when the skill reported a failure. */
  ok?: boolean;
};

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "steps"; steps: ChatStep[] }
  | { type: "image"; path: string; alt: string };

export type AssistantSnapshot = {
  /** Upstream assistant message id. */
  id: string;
  parts: ChatPart[];
  done: boolean;
  /** Short live status while nothing else is happening ("Waiting for model…"). */
  status: string | null;
  error: string | null;
};

export type ChatMessage =
  | { role: "user"; id: string; text: string }
  | ({ role: "assistant"; stopped?: boolean; elapsed?: number } & AssistantSnapshot);

/** Events on the chat stream (Server-Sent Events, one JSON object per `data:` line). */
export type ChatStreamEvent =
  /** First event of a new turn: the conversation token and the message ids. */
  | { type: "start"; token: string; userId: string; assistantId: string }
  | { type: "snapshot"; message: AssistantSnapshot }
  /** The proxy is about to hit its time budget; the browser should re-attach. */
  | { type: "detached" }
  /** Answered by Cumulus itself (a question outside Ghana): a finished reply, nothing upstream. */
  | { type: "local"; text: string }
  | { type: "error"; code: ChatErrorCode; message: string; retryAfter?: number };

export type ChatErrorCode =
  | "disabled"
  | "bad_request"
  | "rate_limited"
  | "busy"
  | "unavailable"
  | "expired"
  | "upstream";

/** Map / district context the panel sends with a question. Validated on the server. */
export type ChatContext = {
  areaName?: string;
  regionName?: string;
  level?: "district" | "region";
  latitude?: number;
  longitude?: number;
  runDate?: string;
  modelLabel?: string;
  layerLabel?: string;
};

export const CHAT_MAX_CHARS = 1000;
