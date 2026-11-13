"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { ASK_EVENT, type AskEventDetail } from "@/lib/chat/open-ask";
import type { ChatContext } from "@/lib/chat/types";
import { useWeatherChat } from "@/lib/chat/use-weather-chat";

import { AssistantMark } from "./icons";

// The panel (markdown renderer and all) loads on first open, so the map's first load is unchanged.
const AskPanel = dynamic(() => import("./ask-panel"), {
  ssr: false,
  loading: () => (
    <section className="ask-panel is-loading" aria-label="Weather Skill" aria-busy="true">
      <span className="ask-spinner" aria-hidden="true" />
    </section>
  ),
});

const SHEET_QUERY = "(max-width: 860px)";

function useIsSheet() {
  const [isSheet, setIsSheet] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(SHEET_QUERY);
    const update = () => setIsSheet(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isSheet;
}

type LauncherAnchor = { left: number; right: number; bottom: number };

/** Width reserved for the launcher when checking whether the dock covers the corner. */
const LAUNCHER_ROOM = 190;

/**
 * Where the launcher sits: the bottom-left corner on desktop. Where the timeline dock reaches into
 * that corner (laptops, tablets, phones), it sits just above the dock. On phones it takes the
 * right-hand side, over the sea, so it doesn't hide the coast (CSS picks the side).
 * The dock loads late and changes size, so this follows it. Null falls back to the CSS corner.
 */
function useLauncherAnchor(enabled: boolean) {
  const [anchor, setAnchor] = useState<LauncherAnchor | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stage = document.querySelector<HTMLElement>(".atlas-stage");
        const dock = stage?.querySelector<HTMLElement>(".floating-legend");
        let next: LauncherAnchor | null = null;
        if (stage && dock) {
          const style = getComputedStyle(dock);
          const box = dock.getBoundingClientRect();
          const stageBox = stage.getBoundingClientRect();
          const visible = box.height > 0 && style.visibility !== "hidden" && style.opacity !== "0";
          if (visible && box.left - stageBox.left < LAUNCHER_ROOM) {
            next = {
              left: Math.max(12, Math.round(box.left - stageBox.left)),
              right: Math.max(10, Math.round(stageBox.right - box.right)),
              bottom: Math.max(0, Math.round(stageBox.bottom - box.top + 10)),
            };
          }
        }
        setAnchor((current) =>
          current?.left === next?.left && current?.right === next?.right && current?.bottom === next?.bottom
            ? current
            : next,
        );
      });
    };
    measure();
    const resize = new ResizeObserver(measure);
    const stage = document.querySelector<HTMLElement>(".atlas-stage");
    if (stage) resize.observe(stage);
    const observed = new Set<Element>();
    // The dock mounts after the forecast loads and can be swapped by the view; a cheap check
    // keeps the observer attached, and transitions re-measure when they finish.
    const watchDock = () => {
      const dock = document.querySelector(".atlas-stage .floating-legend");
      if (dock && !observed.has(dock)) {
        observed.add(dock);
        resize.observe(dock);
      }
      measure();
    };
    const timer = window.setInterval(watchDock, 1000);
    window.addEventListener("resize", measure);
    document.addEventListener("transitionend", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      resize.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("transitionend", measure, true);
    };
  }, [enabled]);
  return anchor;
}

/**
 * The "Ask" launcher and panel. The conversation lives here (not in the panel), so closing the
 * panel never interrupts an answer that is still being worked on.
 */
export function AskAssistant({
  open,
  onOpenChange,
  context,
  contextLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: ChatContext | null;
  contextLabel: string | null;
}) {
  const chat = useWeatherChat();
  const isSheet = useIsSheet();
  const [expanded, setExpanded] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Focus returns to the launcher when the panel closes.
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  // Other parts of the page (the district drawer) open the assistant with a ready question.
  useEffect(() => {
    const onAsk = (event: Event) => {
      const detail = (event as CustomEvent<AskEventDetail>).detail;
      onOpenChange(true);
      if (detail?.prefill) setPrefill({ text: detail.prefill, nonce: Date.now() });
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [onOpenChange]);

  // Ctrl/⌘ + K toggles the assistant on desktop.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, open]);

  // Phones: the sheet's backdrop and page behind are inert while it is open.
  useEffect(() => {
    if (!open || !isSheet) return;
    const stage = document.querySelector<HTMLElement>(".atlas-stage .map-frame");
    stage?.setAttribute("inert", "");
    return () => stage?.removeAttribute("inert");
  }, [open, isSheet]);

  // Phones: keep the composer above the on-screen keyboard. The visual viewport shrinks when the
  // keyboard opens; the sheet's bottom follows it (iOS doesn't resize the layout for the keyboard).
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !isSheet || !viewport) return;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setKeyboardInset(inset > 60 ? inset : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setKeyboardInset(0);
    };
  }, [open, isSheet]);

  // Drag the sheet down by its handle or header to close it, like the district sheet.
  const onSheetDragStart = useCallback(
    (event: React.PointerEvent) => {
      if ((event.target as HTMLElement).closest("button, a, textarea, input")) return;
      const startY = event.clientY;
      const startedAt = performance.now();
      let offset = 0;
      const move = (moveEvent: PointerEvent) => {
        offset = Math.max(0, moveEvent.clientY - startY);
        setSheetOffset(offset);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        const velocity = offset / Math.max(1, performance.now() - startedAt);
        setSheetOffset(0);
        if (offset > 140 || (offset > 40 && velocity > 0.6)) close();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [close],
  );

  const working = chat.phase === "working";
  const anchor = useLauncherAnchor(!open);

  return (
    <>
      {!open ? (
        <button
          ref={launcherRef}
          type="button"
          className={`ask-launcher${working ? " is-working" : ""}`}
          onClick={() => onOpenChange(true)}
          aria-haspopup="dialog"
          aria-label={working ? "Weather Skill (still answering)" : "Weather Skill"}
          title="Ask about rainfall (Ctrl+K)"
          data-testid="ask-launcher"
          style={
            anchor
              ? ({
                  "--ask-launcher-left": `${anchor.left}px`,
                  "--ask-launcher-right": `${anchor.right}px`,
                  "--ask-launcher-bottom": `${anchor.bottom}px`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <AssistantMark size={18} />
          <span>Weather Skill</span>
          {working ? <span className="ask-launcher-pulse" aria-hidden="true" /> : null}
        </button>
      ) : null}
      {open && isSheet ? <div className="ask-backdrop" onClick={close} aria-hidden="true" /> : null}
      {open ? (
        <AskPanel
          chat={chat}
          context={context}
          contextLabel={contextLabel}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((value) => !value)}
          onClose={close}
          prefill={prefill}
          isSheet={isSheet}
          sheetOffset={sheetOffset}
          keyboardInset={keyboardInset}
          onSheetDragStart={onSheetDragStart}
        />
      ) : null}
    </>
  );
}
