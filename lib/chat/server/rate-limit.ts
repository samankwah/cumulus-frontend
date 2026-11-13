/**
 * Fair use for a public assistant that runs on one shared Weather Skills account.
 *
 * Counts live in the function instance's memory. Vercel's Fluid compute keeps instances warm and
 * reuses them across requests, so this catches the common case (one person or bot hammering the
 * button) without another service. It is not a global guarantee: under heavy traffic several
 * instances each keep their own counts. Swap `store` for Upstash/Neon if that ever matters.
 */

type Window = { hits: number[] };

const store = new Map<string, Window>();
let running = 0;

export const LIMITS = {
  /** Questions per visitor in a short burst. */
  burst: { max: 6, windowMs: 10 * 60 * 1000 },
  /** Questions per visitor per day. */
  daily: { max: 40, windowMs: 24 * 60 * 60 * 1000 },
  /** Replies being worked on at once, across all visitors on this instance. */
  concurrent: Number(process.env.CHAT_MAX_CONCURRENT ?? 6),
};

function prune(window: Window, now: number) {
  const oldest = now - LIMITS.daily.windowMs;
  while (window.hits.length && window.hits[0] < oldest) window.hits.shift();
}

export type LimitResult = { ok: true } | { ok: false; reason: "rate_limited" | "busy"; retryAfter: number };

/** Checks and, when allowed, records one question for `key`. */
export function takeQuestion(key: string, now = Date.now()): LimitResult {
  if (running >= LIMITS.concurrent) {
    return { ok: false, reason: "busy", retryAfter: 30 };
  }
  const window = store.get(key) ?? { hits: [] };
  prune(window, now);
  const inBurst = window.hits.filter((t) => t > now - LIMITS.burst.windowMs);
  if (inBurst.length >= LIMITS.burst.max) {
    const retryAfter = Math.ceil((inBurst[0] + LIMITS.burst.windowMs - now) / 1000);
    return { ok: false, reason: "rate_limited", retryAfter: Math.max(1, retryAfter) };
  }
  if (window.hits.length >= LIMITS.daily.max) {
    const retryAfter = Math.ceil((window.hits[0] + LIMITS.daily.windowMs - now) / 1000);
    return { ok: false, reason: "rate_limited", retryAfter: Math.max(1, retryAfter) };
  }
  window.hits.push(now);
  store.set(key, window);
  if (store.size > 5000) {
    // Drop the stalest visitors so memory stays bounded.
    const keys = [...store.keys()].slice(0, 1000);
    for (const k of keys) store.delete(k);
  }
  return { ok: true };
}

/** Marks a reply as running; call the returned function exactly once when it ends. */
export function beginRun(): () => void {
  running += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      running = Math.max(0, running - 1);
    }
  };
}

/** The visitor key: first forwarded address (Vercel sets it) plus the conversation, if any. */
export function visitorKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "local";
}

export function __resetLimitsForTests() {
  store.clear();
  running = 0;
}
