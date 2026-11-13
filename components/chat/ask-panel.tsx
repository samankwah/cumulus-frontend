"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ChatContext } from "@/lib/chat/types";
import { CHAT_MAX_CHARS } from "@/lib/chat/types";
import type { useWeatherChat } from "@/lib/chat/use-weather-chat";

import { AssistantReply, formatDuration, UserBubble } from "./chat-message";
import {
  ArrowDownIcon,
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  NewChatIcon,
  PinIcon,
  SendIcon,
  StopIcon,
  WarningIcon,
} from "./icons";

type Chat = ReturnType<typeof useWeatherChat>;

export type AskPanelProps = {
  chat: Chat;
  /** What the map is showing; sent with questions unless the visitor removes the chip. */
  context: ChatContext | null;
  contextLabel: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  /** Text to put in the box when the panel opens (from "Ask about this district"). */
  prefill: { text: string; nonce: number } | null;
  isSheet: boolean;
  sheetOffset: number;
  /** Phones: height of the on-screen keyboard over the page, in px. */
  keyboardInset: number;
  onSheetDragStart: (event: React.PointerEvent) => void;
};

function suggestionsFor(area: string | null): string[] {
  if (area) {
    return [
      `How much rain has fallen in ${area} in the last 2 weeks?`,
      `Is ${area} wetter or drier than normal this month?`,
      `Plot the rainfall outlook for ${area} for the next 2 weeks`,
      `Will the next 2 weeks suit planting maize in ${area}?`,
    ];
  }
  return [
    "How much rain fell across Ghana in the last 7 days?",
    "Which parts of Ghana are drier than normal this month?",
    "Map the rainfall forecast for Ghana for the next week",
    "What does the ECMWF outlook say for northern Ghana?",
  ];
}

const isCoarsePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export default function AskPanel({
  chat,
  context,
  contextLabel,
  expanded,
  onToggleExpanded,
  onClose,
  prefill,
  isSheet,
  sheetOffset,
  keyboardInset,
  onSheetDragStart,
}: AskPanelProps) {
  const { messages, phase, notice, startedAt, send, stop, reset, resume, canResume, dismissNotice } = chat;
  const [draft, setDraft] = useState("");
  const [useContext, setUseContext] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const working = phase === "working";

  // A new place on the map brings the chip back.
  useEffect(() => setUseContext(true), [contextLabel]);

  useEffect(() => {
    if (!prefill) return;
    setDraft(prefill.text);
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }, [prefill]);

  // Desktop: focus the box on open. Phones: wait for a tap, so the keyboard doesn't cover the sheet.
  useEffect(() => {
    if (!isCoarsePointer()) inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Grow the box with its text, up to ~6 lines.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
  }, [draft]);

  // Stick to the newest message unless the visitor scrolled up to read.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 72);
  }, []);
  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);
  // After a question is sent it moves to the top of the view and the answer grows beneath it (as in
  // ChatGPT and Claude), so a long answer is read from its start. A spacer lets the question reach
  // the top while the answer is still short; it shrinks away as the answer grows.
  const [pinCount, setPinCount] = useState(0);
  const [spacer, setSpacer] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const measureSpacer = useCallback(() => {
    const el = scrollRef.current;
    const log = logRef.current;
    if (!el || !log || pinCount === 0) return;
    const rows = log.querySelectorAll<HTMLElement>(".ask-row-user");
    const last = rows[rows.length - 1];
    if (!last) return;
    const below = log.offsetTop + log.offsetHeight - last.offsetTop;
    setSpacer(Math.max(0, el.clientHeight - below - 36));
  }, [pinCount]);

  useLayoutEffect(() => {
    if (pinCount === 0) return;
    measureSpacer();
    const el = scrollRef.current;
    const rows = logRef.current?.querySelectorAll<HTMLElement>(".ask-row-user");
    const last = rows?.[rows.length - 1];
    if (el && last) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.requestAnimationFrame(() => el.scrollTo({ top: Math.max(0, last.offsetTop - 16), behavior: reduce ? "auto" : "smooth" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinCount]);

  useEffect(() => {
    const log = logRef.current;
    if (!log || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureSpacer());
    observer.observe(log);
    return () => observer.disconnect();
  }, [measureSpacer, messages.length]);

  // Reopening the panel (or restoring after a reload) shows the latest messages.
  useEffect(() => {
    if (messages.length) scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen readers hear the start and end of an answer, not every streamed word.
  const lastAssistantDone = (() => {
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? last.done : null;
  })();
  useEffect(() => {
    if (working) setAnnouncement("Working on your answer…");
    else if (lastAssistantDone) setAnnouncement("Answer ready.");
  }, [working, lastAssistantDone]);
  useEffect(() => {
    if (notice) setAnnouncement(notice.message);
  }, [notice]);

  // Countdown for a rate limit.
  useEffect(() => {
    if (!notice?.retryAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [notice?.retryAt]);
  const waitSeconds = notice?.retryAt ? Math.max(0, Math.ceil((notice.retryAt - now) / 1000)) : 0;
  const blocked = waitSeconds > 0;

  const area = context?.areaName ?? null;
  const suggestions = useMemo(() => suggestionsFor(area), [area]);

  const submit = async (text: string) => {
    const question = text.trim();
    if (!question || working || blocked) return;
    setDraft("");
    setPinCount((count) => count + 1);
    const result = await send(question, useContext && context ? context : undefined);
    if (result?.restore) setDraft((current) => current || result.restore);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !isCoarsePointer()) {
      event.preventDefault();
      void submit(draft);
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    if (working) void stop();
    else onClose();
  };

  const lastUserText = [...messages].reverse().find((message) => message.role === "user");
  const retry = lastUserText?.role === "user" ? () => void submit(lastUserText.text) : undefined;
  const remaining = CHAT_MAX_CHARS - draft.length;
  const empty = messages.length === 0;

  return (
    <section
      className={`ask-panel${expanded ? " is-expanded" : ""}${isSheet ? " is-sheet" : ""}`}
      role={isSheet ? "dialog" : "complementary"}
      aria-modal={isSheet ? true : undefined}
      aria-label="Weather Skill"
      onKeyDown={onPanelKeyDown}
      style={
        isSheet
          ? ({ "--ask-drag": `${sheetOffset}px`, "--ask-keyboard": `${keyboardInset}px` } as React.CSSProperties)
          : undefined
      }
      data-testid="ask-panel"
    >
      {isSheet ? (
        <div className="ask-grabber" onPointerDown={onSheetDragStart} aria-hidden="true">
          <span />
        </div>
      ) : null}
      <header className="ask-header" onPointerDown={isSheet ? onSheetDragStart : undefined}>
        <h2 className="ask-title">Weather Skill</h2>
        <div className="ask-header-actions">
          {!empty ? (
            <button type="button" className="ask-icon-btn" onClick={reset} aria-label="New conversation" title="New conversation">
              <NewChatIcon size={17} />
            </button>
          ) : null}
          {!isSheet ? (
            <button
              type="button"
              className="ask-icon-btn"
              onClick={onToggleExpanded}
              aria-label={expanded ? "Make panel narrower" : "Make panel wider"}
              title={expanded ? "Narrower" : "Wider"}
            >
              {expanded ? <CollapseIcon size={16} /> : <ExpandIcon size={16} />}
            </button>
          ) : null}
          <button type="button" className="ask-icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <CloseIcon size={18} />
          </button>
        </div>
      </header>

      <div className="ask-scroll" ref={scrollRef} onScroll={onScroll}>
        {empty ? (
          <div className="ask-empty">
            <h3>{area ? `What would you like to know about ${area}?` : "Ask about rain anywhere in Ghana"}</h3>
            <ul className="ask-suggestions" aria-label="Suggested questions">
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button type="button" onClick={() => void submit(suggestion)} disabled={blocked}>
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="ask-log" ref={logRef} role="log" aria-live="off" aria-label="Conversation">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <UserBubble key={message.id} text={message.text} />
              ) : (
                <AssistantReply
                  key={message.id}
                  message={message}
                  token={chat.token}
                  isLast={index === messages.length - 1}
                  startedAt={index === messages.length - 1 ? startedAt : null}
                  onRetry={!working ? retry : undefined}
                />
              ),
            )}
          </div>
        )}

        {notice ? (
          <div className={`ask-notice ask-notice-${notice.code}`} role="alert">
            <WarningIcon size={16} />
            <div>
              <p>
                {notice.message}
                {blocked ? ` You can ask again in ${formatDuration(waitSeconds)}.` : ""}
              </p>
              <div className="ask-notice-actions">
                {canResume ? (
                  <button type="button" onClick={resume}>
                    Reconnect
                  </button>
                ) : null}
                {notice.code === "expired" ? (
                  <button type="button" onClick={reset}>
                    Start a new conversation
                  </button>
                ) : null}
                <button type="button" className="is-quiet" onClick={dismissNotice}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {!empty && spacer > 0 ? <div className="ask-spacer" style={{ height: spacer }} aria-hidden="true" /> : null}
      </div>

      {!atBottom && !empty ? (
        <button type="button" className="ask-jump" onClick={() => { setAtBottom(true); scrollToBottom(true); }} aria-label="Scroll to latest">
          <ArrowDownIcon size={16} />
        </button>
      ) : null}

      <footer className="ask-footer">
        {context && contextLabel && useContext ? (
          <div className="ask-context">
            <span className="ask-chip" title="Your questions include what the map is showing">
              <PinIcon size={13} />
              <span>{contextLabel}</span>
              <button type="button" onClick={() => setUseContext(false)} aria-label={`Don't include ${contextLabel}`}>
                <CloseIcon size={12} />
              </button>
            </span>
          </div>
        ) : null}
        <form
          className={`ask-composer${working ? " is-working" : ""}`}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <label htmlFor="ask-input" className="ask-sr">
            Your question
          </label>
          <textarea
            id="ask-input"
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={CHAT_MAX_CHARS}
            placeholder={working ? "Working on it…" : area ? `Ask about ${area}…` : "Ask about rainfall in Ghana…"}
            enterKeyHint="send"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={blocked}
          />
          {working ? (
            <button type="button" className="ask-send is-stop" onClick={() => void stop()} aria-label="Stop answering" title="Stop (Esc)">
              <StopIcon size={13} />
            </button>
          ) : (
            <button type="submit" className="ask-send" disabled={!draft.trim() || blocked} aria-label="Send question" title="Send">
              <SendIcon size={18} />
            </button>
          )}
        </form>
        <p className="ask-disclaimer">
          {remaining <= 200 ? <span className={remaining <= 0 ? "is-over" : ""}>{remaining} characters left · </span> : null}
          AI answers can be wrong. Check official{" "}
          <a href="https://www.meteo.gov.gh" target="_blank" rel="noopener noreferrer">
            GMet
          </a>{" "}
          forecasts. Powered by{" "}
          <a href="https://weather-skills.org" target="_blank" rel="noopener noreferrer">
            Weather Skills
          </a>
          .
        </p>
      </footer>

      <div className="ask-sr" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </section>
  );
}
