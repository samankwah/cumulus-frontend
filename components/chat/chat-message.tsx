"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { foldForDisplay, partsToPlainText } from "@/lib/chat/parse-content";
import type { ChatMessage, ChatPart, ChatStep } from "@/lib/chat/types";

import { CheckIcon, ChevronIcon, CloseIcon, CopyIcon, DownloadIcon, RetryIcon, WarningIcon } from "./icons";
import Markdown, { artifactUrl } from "./markdown";

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest}s` : `${m} min`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="ask-row ask-row-user">
      <h3 className="ask-sr">You said</h3>
      <div className="ask-bubble">{text}</div>
    </div>
  );
}

function Spinner() {
  return <span className="ask-spinner" aria-hidden="true" />;
}

function StepIcon({ step }: { step: ChatStep }) {
  if (step.kind === "note") return <span className="ask-step-icon ask-step-dot" aria-hidden="true" />;
  if (!step.done) return <Spinner />;
  if (step.ok === false) {
    return (
      <span className="ask-step-icon ask-step-warn">
        <WarningIcon size={12} />
      </span>
    );
  }
  return (
    <span className="ask-step-icon">
      <CheckIcon size={12} />
    </span>
  );
}

/**
 * The agent's work as one quiet line: while running, the current step with a spinner; when done,
 * a summary ("Worked through 9 steps"). Expands to the full list for anyone curious.
 */
function StepsBlock({ steps, live }: { steps: ChatStep[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const tools = steps.filter((step) => step.kind === "tool");
  const current = [...steps].reverse().find((step) => !step.done) ?? (live ? steps[steps.length - 1] : null);
  const total = steps.reduce((sum, step) => sum + (step.seconds ?? 0), 0);
  const summary = live && current
    ? current.label
    : tools.length
      ? `Worked through ${tools.length} step${tools.length === 1 ? "" : "s"}`
      : "Thought it through";

  return (
    <div className={`ask-steps${live ? " is-live" : ""}${open ? " is-open" : ""}`}>
      <button type="button" className="ask-steps-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {live ? <Spinner /> : <span className="ask-steps-dot" aria-hidden="true" />}
        <span className="ask-steps-label">{summary}</span>
        {!live && total >= 1 ? <span className="ask-steps-time">{formatDuration(total)}</span> : null}
        <ChevronIcon size={14} className="ask-steps-chevron" />
      </button>
      {open ? (
        <ol className="ask-step-list">
          {steps.map((step) => (
            <li key={step.id} className={`ask-step ask-step-${step.kind}`}>
              <StepIcon step={step} />
              <div className="ask-step-body">
                <span className="ask-step-label">{step.label}</span>
                {step.kind !== "tool" && step.detail ? <p className="ask-step-detail">{step.detail}</p> : null}
              </div>
              {step.done && step.seconds ? <span className="ask-step-time">{formatDuration(step.seconds)}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** The agent can show a chart a moment before the file is written: wait and try again. */
const CHART_RETRY_SECONDS = [2, 4, 8, 15];

function ChartImage({ src: baseSrc, alt, filename }: { src: string; alt: string; filename: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const src = attempt ? `${baseSrc}&r=${attempt}` : baseSrc;
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!zoomed) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setZoomed(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      openerRef.current?.focus();
    };
  }, [zoomed]);

  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  const onError = () => {
    const wait = CHART_RETRY_SECONDS[attempt];
    if (wait === undefined) {
      setState("error");
      return;
    }
    retryTimer.current = window.setTimeout(() => setAttempt((value) => value + 1), wait * 1000);
  };

  if (state === "error") {
    return (
      <div className="ask-chart ask-chart-error" role="note">
        <WarningIcon size={16} />
        <span>The chart couldn&apos;t be loaded.</span>
        <button
          type="button"
          className="ask-chart-retry"
          onClick={() => {
            setState("loading");
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <figure className={`ask-chart${state === "ready" ? " is-ready" : ""}`}>
      <button ref={openerRef} type="button" className="ask-chart-open" onClick={() => setZoomed(true)} aria-label={`Enlarge: ${alt}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" onLoad={() => setState("ready")} onError={onError} />
      </button>
      <figcaption>
        <span>{filename}</span>
        <a href={src} download={filename} className="ask-icon-btn" aria-label="Download chart" title="Download">
          <DownloadIcon size={15} />
        </a>
      </figcaption>
      {zoomed ? (
        <div className="ask-lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setZoomed(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} />
          <div className="ask-lightbox-bar" onClick={(event) => event.stopPropagation()}>
            <a href={src} download={filename} className="ask-lightbox-btn">
              <DownloadIcon size={16} /> Download
            </a>
            <button ref={closeRef} type="button" className="ask-lightbox-btn" onClick={() => setZoomed(false)}>
              <CloseIcon size={16} /> Close
            </button>
          </div>
        </div>
      ) : null}
    </figure>
  );
}

function renderPart(part: ChatPart, index: number, token: string | null, live: boolean) {
  if (part.type === "text") return <Markdown key={`t${index}`} text={part.text} token={token} />;
  if (part.type === "steps") return <StepsBlock key={`s${index}`} steps={part.steps} live={live} />;
  const src = artifactUrl(token, part.path);
  if (!src) return null;
  return <ChartImage key={`i${index}`} src={src} alt={part.alt} filename={part.path.split("/").pop() ?? part.path} />;
}

export function AssistantReply({
  message,
  token,
  isLast,
  startedAt,
  onRetry,
}: {
  message: Extract<ChatMessage, { role: "assistant" }>;
  token: string | null;
  isLast: boolean;
  startedAt: number | null;
  onRetry?: () => void;
}) {
  const working = !message.done;
  const now = useNow(working);
  const [copied, setCopied] = useState(false);
  const parts = useMemo(() => foldForDisplay(message.parts, message.done), [message.parts, message.done]);
  const lastPart = parts[parts.length - 1];
  const liveSteps = working && lastPart?.type === "steps";
  const elapsed = working && startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(partsToPlainText(parts));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const hasText = parts.some((part) => part.type === "text");

  return (
    <div className="ask-row ask-row-assistant" aria-busy={working}>
      <h3 className="ask-sr">Assistant said</h3>
      {parts.map((part, index) => renderPart(part, index, token, liveSteps && index === parts.length - 1))}

      {working && !liveSteps ? (
        <div className="ask-working">
          <Spinner />
          <span>{message.status ?? (message.parts.length ? "Still working…" : "Thinking…")}</span>
          {elapsed !== null && elapsed >= 3 ? <span className="ask-working-time">{formatDuration(elapsed)}</span> : null}
        </div>
      ) : null}
      {working && liveSteps && elapsed !== null && elapsed >= 3 ? (
        <p className="ask-working-note">
          {formatDuration(elapsed)}
          {elapsed > 45 ? " · charts and data downloads can take a few minutes" : ""}
        </p>
      ) : null}

      {message.error ? (
        <div className="ask-inline-error" role="note">
          <WarningIcon size={15} />
          <span>{message.error}</span>
        </div>
      ) : null}

      {message.done ? (
        <div className="ask-actions">
          {message.stopped ? <span className="ask-tag">Stopped</span> : null}
          {hasText ? (
            <button type="button" className="ask-icon-btn" onClick={copy} aria-label={copied ? "Copied" : "Copy answer"} title={copied ? "Copied" : "Copy"}>
              {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
            </button>
          ) : null}
          {isLast && onRetry ? (
            <button type="button" className="ask-icon-btn" onClick={onRetry} aria-label="Ask again" title="Ask again">
              <RetryIcon size={15} />
            </button>
          ) : null}
          {message.elapsed ? <span className="ask-meta">{formatDuration(message.elapsed)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
