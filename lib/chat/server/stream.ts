import { parseAssistantContent } from "../parse-content";
import type { AssistantSnapshot, ChatStreamEvent } from "../types";
import type { ChatConfig } from "./config";
import type { ChatEvent, SocketSession } from "./socket";
import { getChat } from "./upstream";

/**
 * Server-Sent Events plumbing and the reply watcher shared by "ask" (POST /api/chat) and
 * "re-attach" (GET /api/chat/attach).
 */

const encoder = new TextEncoder();

export type Send = (event: ChatStreamEvent) => void;

/**
 * Wraps `run` in an SSE response. Sends a comment every 15 s so phones and proxies keep the
 * connection open through long, silent skill runs.
 */
export function sseResponse(run: (send: Send, signal: AbortSignal) => Promise<void>, requestSignal: AbortSignal): Response {
  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  requestSignal.addEventListener("abort", onRequestAbort);

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false;
        }
      };
      const send: Send = (event) => write(`data: ${JSON.stringify(event)}\n\n`);
      write(": open\n\n");
      heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
      run(send, abort.signal)
        .catch((error: unknown) => {
          console.error("[chat] stream failed", error);
          send({ type: "error", code: "upstream", message: "The assistant stopped unexpectedly. Please try again." });
        })
        .finally(() => {
          clearInterval(heartbeat);
          requestSignal.removeEventListener("abort", onRequestAbort);
          open = false;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
    },
    cancel() {
      clearInterval(heartbeat);
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

const STATUS_TEXT: Record<string, string> = {
  waiting_response: "Thinking…",
  preparing_tool_calls: "Choosing the next step…",
  weather_skills_runner: "Starting the weather skills…",
};

function statusText(data: Record<string, unknown>): string | null {
  if (data.hidden || data.done) return null;
  const action = typeof data.action === "string" ? data.action : "";
  if (STATUS_TEXT[action]) return STATUS_TEXT[action];
  const description = typeof data.description === "string" ? data.description : "";
  const cleaned = description.replace(/\s*\(\d+s\)\s*$/, "").trim();
  return cleaned ? cleaned.slice(0, 80) : null;
}

const GENERIC_ERROR = "The assistant couldn't finish this answer. Please try again in a moment.";

function upstreamErrorText(error: unknown): string | null {
  if (!error) return null;
  const raw =
    typeof error === "string"
      ? error
      : typeof error === "object" && error && "content" in error && typeof (error as { content: unknown }).content === "string"
        ? (error as { content: string }).content
        : "";
  console.error("[chat] reply error", raw.slice(0, 300));
  return GENERIC_ERROR;
}

export function snapshotFromStored(assistantId: string, content: string, done: boolean, error: unknown): AssistantSnapshot {
  return {
    id: assistantId,
    parts: parseAssistantContent(content ?? ""),
    done,
    status: null,
    error: upstreamErrorText(error),
  };
}

/**
 * Forwards one reply's progress until it is done, the time budget runs out (→ "detached", the
 * browser re-attaches) or the visitor goes away. The upstream task keeps running either way.
 */
export async function watchReply(options: {
  config: ChatConfig;
  session: SocketSession;
  chatId: string;
  assistantId: string;
  send: Send;
  signal: AbortSignal;
  deadline: number;
  initial?: AssistantSnapshot;
}): Promise<"done" | "detached" | "aborted"> {
  const { config, session, chatId, assistantId, send, signal, deadline } = options;
  let snapshot: AssistantSnapshot = options.initial ?? { id: assistantId, parts: [], done: false, status: "Thinking…", error: null };
  let lastSentJson = "";
  let lastEventAt = Date.now();
  let pending: ReturnType<typeof setTimeout> | null = null;

  const emit = (force = false) => {
    const json = JSON.stringify(snapshot);
    if (json === lastSentJson) return;
    if (!force && pending) return;
    const flush = () => {
      pending = null;
      const latest = JSON.stringify(snapshot);
      if (latest !== lastSentJson) {
        lastSentJson = latest;
        send({ type: "snapshot", message: snapshot });
      }
    };
    if (force) {
      if (pending) clearTimeout(pending);
      flush();
    } else {
      // At most ~5 updates a second: snapshots are whole messages, not deltas.
      pending = setTimeout(flush, 200);
    }
  };

  emit(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: "done" | "detached" | "aborted") => {
      if (settled) return;
      settled = true;
      if (pending) clearTimeout(pending);
      clearInterval(watchdog);
      clearTimeout(budget);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };

    const unsubscribe = session.onEvent((event: ChatEvent) => {
      if (event.chat_id !== chatId || event.message_id !== assistantId) return;
      const type = event.data?.type;
      const data = event.data?.data ?? {};
      lastEventAt = Date.now();
      if (type === "status") {
        const text = statusText(data);
        if (text !== snapshot.status) {
          snapshot = { ...snapshot, status: text };
          emit();
        }
        return;
      }
      if (type === "chat:completion" || type === "chat:message") {
        const content = typeof data.content === "string" ? data.content : null;
        const done = data.done === true;
        const error = upstreamErrorText(data.error);
        snapshot = {
          ...snapshot,
          parts: content !== null ? parseAssistantContent(content) : snapshot.parts,
          done: snapshot.done || done || Boolean(error),
          status: done ? null : snapshot.status,
          error: error ?? snapshot.error,
        };
        if (snapshot.done) {
          emit(true);
          finish("done");
        } else {
          emit();
        }
      }
    });

    // If the socket goes quiet, read the stored chat: the reply may have finished unseen.
    const watchdog = setInterval(async () => {
      if (settled || Date.now() - lastEventAt < 45_000) return;
      lastEventAt = Date.now();
      try {
        const chat = await getChat(config, chatId);
        const message = chat.chat.history.messages[assistantId];
        if (message?.done || message?.error) {
          snapshot = snapshotFromStored(assistantId, message.content, true, message.error);
          emit(true);
          finish("done");
        }
      } catch {
        /* keep waiting; the budget still ends the stream */
      }
    }, 15_000);

    const budget = setTimeout(
      () => {
        emit(true);
        send({ type: "detached" });
        finish("detached");
      },
      Math.max(5_000, deadline - Date.now()),
    );

    const onAbort = () => finish("aborted");
    signal.addEventListener("abort", onAbort);
  });
}
