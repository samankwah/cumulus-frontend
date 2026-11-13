"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AssistantSnapshot, ChatContext, ChatErrorCode, ChatMessage, ChatStreamEvent } from "./types";

/**
 * Conversation state for the "Ask" panel: sends questions to /api/chat, follows the streamed
 * snapshots, re-attaches when a long skill run outlives one request, and keeps the conversation
 * for the browser tab (sessionStorage) so closing the panel or reloading loses nothing.
 */

export type ChatPhase = "idle" | "working" | "error";

export type ChatNotice = {
  code: ChatErrorCode | "network";
  message: string;
  /** Epoch ms when asking is allowed again (rate limits). */
  retryAt?: number;
};

type Stored = { v: 1; token: string | null; messages: ChatMessage[] };

const STORAGE_KEY = "cumulus-chat";
const MAX_REATTACH = 6;

function load(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return parsed?.v === 1 && Array.isArray(parsed.messages) ? parsed : null;
  } catch {
    return null;
  }
}

function save(value: Stored | null) {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode or full: the chat still works for this page view */
  }
}

/** Reads an SSE response body, calling `onEvent` for each `data:` JSON line. */
async function readEvents(response: Response, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          try {
            onEvent(JSON.parse(data) as ChatStreamEvent);
          } catch {
            /* ignore a malformed frame */
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function errorFromResponse(response: Response): Promise<ChatNotice> {
  let body: { code?: ChatErrorCode; message?: string; retryAfter?: number } = {};
  try {
    body = await response.json();
  } catch {
    /* not JSON */
  }
  const retryAfter = Number(response.headers.get("Retry-After") ?? body.retryAfter ?? 0);
  return {
    code: body.code ?? "unavailable",
    message: body.message ?? "Couldn't reach the assistant. Please try again in a moment.",
    ...(retryAfter > 0 ? { retryAt: Date.now() + retryAfter * 1000 } : {}),
  };
}

export function useWeatherChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const tokenRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  tokenRef.current = token;
  messagesRef.current = messages;

  // Persist after every change once the stored conversation has been read.
  useEffect(() => {
    if (!restored) return;
    save(messages.length || token ? { v: 1, token, messages } : null);
  }, [messages, token, restored]);

  const applySnapshot = useCallback((snapshot: AssistantSnapshot) => {
    setMessages((current) => {
      const index = current.findIndex((message) => message.role === "assistant" && message.id === snapshot.id);
      if (index === -1) return current;
      const previous = current[index] as Extract<ChatMessage, { role: "assistant" }>;
      // A re-attach can start from an older stored state: never move backwards.
      const parts = snapshot.parts.length || snapshot.done ? snapshot.parts : previous.parts;
      const next = [...current];
      next[index] = { ...previous, ...snapshot, parts, stopped: previous.stopped };
      return next;
    });
  }, []);

  const finish = useCallback((elapsedFrom: number | null, assistantId: string | null) => {
    if (assistantId && elapsedFrom) {
      const elapsed = Math.round((Date.now() - elapsedFrom) / 1000);
      setMessages((current) =>
        current.map((message) =>
          message.role === "assistant" && message.id === assistantId && message.elapsed === undefined ? { ...message, elapsed } : message,
        ),
      );
    }
    setPhase("idle");
    setStartedAt(null);
    abortRef.current = null;
  }, []);

  /** Follows a reply already started upstream, re-attaching through time budgets and drops. */
  const follow = useCallback(
    async (assistantId: string, firstResponse: Response | null, since: number) => {
      const controller = abortRef.current ?? new AbortController();
      abortRef.current = controller;
      let attempts = 0;
      let response = firstResponse;
      for (;;) {
        const result: { outcome: "done" | "detached" | "error" | "dropped" } = { outcome: "dropped" };
        try {
          if (!response) {
            const currentToken = tokenRef.current;
            if (!currentToken) return;
            response = await fetch(
              `/api/chat/attach?token=${encodeURIComponent(currentToken)}&message=${encodeURIComponent(assistantId)}`,
              { signal: controller.signal, cache: "no-store" },
            );
            if (!response.ok) {
              setNotice(await errorFromResponse(response));
              setPhase("error");
              return;
            }
          }
          await readEvents(
            response,
            (event) => {
              if (event.type === "snapshot") {
                applySnapshot(event.message);
                if (event.message.done) result.outcome = "done";
              } else if (event.type === "detached") {
                result.outcome = "detached";
              } else if (event.type === "error") {
                result.outcome = "error";
                setNotice({ code: event.code, message: event.message });
                if (event.code === "expired") {
                  // The conversation is gone upstream: close this reply and start fresh next time.
                  setMessages((current) =>
                    current.map((message) =>
                      message.role === "assistant" && message.id === assistantId
                        ? { ...message, done: true, status: null, error: event.message }
                        : message,
                    ),
                  );
                  setToken(null);
                  tokenRef.current = null;
                }
              }
            },
            controller.signal,
          );
        } catch {
          if (controller.signal.aborted) return;
        }
        if (controller.signal.aborted) return;
        if (result.outcome === "done") {
          finish(since, assistantId);
          return;
        }
        if (result.outcome === "error") {
          setPhase("error");
          setStartedAt(null);
          abortRef.current = null;
          return;
        }
        attempts += result.outcome === "dropped" ? 1 : 0;
        if (attempts > MAX_REATTACH) {
          setNotice({ code: "network", message: "The connection dropped. The answer may still be on its way." });
          setPhase("error");
          setStartedAt(null);
          abortRef.current = null;
          return;
        }
        response = null;
        if (result.outcome === "dropped") await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 1000 * 2 ** attempts)));
      }
    },
    [applySnapshot, finish],
  );

  // Restore the tab's conversation; resume a reply that was still being worked on.
  useEffect(() => {
    const stored = load();
    if (stored) {
      setToken(stored.token);
      tokenRef.current = stored.token;
      setMessages(stored.messages);
      const last = stored.messages[stored.messages.length - 1];
      if (last?.role === "assistant" && !last.done && stored.token) {
        setPhase("working");
        setStartedAt(Date.now());
        void follow(last.id, null, Date.now());
      }
    }
    setRestored(true);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(
    async (text: string, context?: ChatContext) => {
      const question = text.trim();
      if (!question || abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const pendingUserId = `local-${Date.now()}`;
      const since = Date.now();
      setNotice(null);
      setPhase("working");
      setStartedAt(since);
      setMessages((current) => [...current, { role: "user", id: pendingUserId, text: question }]);

      let response: Response;
      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenRef.current, message: question, context }),
          signal: controller.signal,
          cache: "no-store",
        });
      } catch {
        abortRef.current = null;
        if (controller.signal.aborted) return;
        setMessages((current) => current.filter((message) => message.id !== pendingUserId));
        setNotice({ code: "network", message: "You seem to be offline. Check your connection and try again." });
        setPhase("error");
        setStartedAt(null);
        return { restore: question };
      }

      if (!response.ok) {
        abortRef.current = null;
        const failure = await errorFromResponse(response);
        setMessages((current) => current.filter((message) => message.id !== pendingUserId));
        if (failure.code === "expired") {
          setToken(null);
          tokenRef.current = null;
        }
        setNotice(failure);
        setPhase("error");
        setStartedAt(null);
        return { restore: question };
      }

      // The first event names the conversation and the reply; the rest are followed by `follow`.
      let assistantId: string | null = null;
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      let failed: ChatNotice | null = null;
      let localReply: string | null = null;
      while (!assistantId && !failed && localReply === null) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1 && !assistantId && !failed && localReply === null) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (line) {
            try {
              const event = JSON.parse(line.slice(5).trimStart()) as ChatStreamEvent;
              if (event.type === "start") {
                assistantId = event.assistantId;
                setToken(event.token);
                tokenRef.current = event.token;
                const startEvent = event;
                setMessages((current) => [
                  ...current.map((message) =>
                    message.id === pendingUserId ? { ...message, id: startEvent.userId } : message,
                  ),
                  { role: "assistant", id: startEvent.assistantId, parts: [], done: false, status: "Thinking…", error: null },
                ]);
              } else if (event.type === "local") {
                localReply = event.text;
              } else if (event.type === "error") {
                failed = { code: event.code, message: event.message };
              }
            } catch {
              /* ignore */
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }

      // Answered on the spot (a question about somewhere outside Ghana): the conversation and its
      // token carry on unchanged.
      if (localReply !== null) {
        const text = localReply;
        void reader.cancel().catch(() => undefined);
        abortRef.current = null;
        setMessages((current) => [
          ...current,
          { role: "assistant", id: `local-reply-${Date.now()}`, parts: [{ type: "text", text }], done: true, status: null, error: null },
        ]);
        setPhase("idle");
        setStartedAt(null);
        return;
      }

      if (!assistantId) {
        reader.releaseLock();
        abortRef.current = null;
        setMessages((current) => current.filter((message) => message.id !== pendingUserId));
        if (failed?.code === "expired") {
          setToken(null);
          tokenRef.current = null;
        }
        setNotice(failed ?? { code: "unavailable", message: "Couldn't reach the assistant. Please try again in a moment." });
        setPhase("error");
        setStartedAt(null);
        return { restore: question };
      }

      // Hand the rest of this stream (plus anything still buffered) to the follower.
      const rest = new ReadableStream<Uint8Array>({
        start(streamController) {
          if (buffer) streamController.enqueue(new TextEncoder().encode(buffer));
        },
        async pull(streamController) {
          const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
          if (done || !value) streamController.close();
          else streamController.enqueue(value);
        },
        cancel() {
          void reader.cancel();
        },
      });
      await follow(assistantId, new Response(rest), since);
      return undefined;
    },
    [follow],
  );

  /** Stops the current reply here and upstream, keeping what was already written. */
  const stop = useCallback(async () => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    const since = startedAt;
    setMessages((current) => {
      const last = current[current.length - 1];
      if (last?.role !== "assistant" || last.done) return current;
      return [
        ...current.slice(0, -1),
        { ...last, done: true, stopped: true, status: null, elapsed: since ? Math.round((Date.now() - since) / 1000) : undefined },
      ];
    });
    setPhase("idle");
    setStartedAt(null);
    const currentToken = tokenRef.current;
    if (currentToken) {
      await fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: currentToken }),
      }).catch(() => undefined);
    }
  }, [startedAt]);

  /** Re-attaches to an answer after a dropped connection. */
  const resume = useCallback(() => {
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last?.role !== "assistant" || last.done || abortRef.current) return;
    setNotice(null);
    setPhase("working");
    setStartedAt(Date.now());
    void follow(last.id, null, Date.now());
  }, [follow]);

  const reset = useCallback(() => {
    if (abortRef.current) void stop();
    setMessages([]);
    setToken(null);
    tokenRef.current = null;
    setNotice(null);
    setPhase("idle");
    setStartedAt(null);
  }, [stop]);

  const dismissNotice = useCallback(() => {
    setNotice(null);
    setPhase((current) => (current === "error" ? "idle" : current));
  }, []);

  const canResume =
    phase === "error" &&
    (() => {
      const last = messages[messages.length - 1];
      return last?.role === "assistant" && !last.done;
    })();

  return { messages, token, phase, notice, startedAt, restored, send, stop, reset, resume, canResume, dismissNotice };
}
