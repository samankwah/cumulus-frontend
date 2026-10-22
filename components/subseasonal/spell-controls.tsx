"use client";

import { useEffect, useRef, useState } from "react";

import { SPELL_STATS } from "@/lib/subseasonal";
import type { SpellKind, SpellStat } from "@/lib/subseasonal";
import type { SubseasonalState } from "@/hooks/use-subseasonal";

const SPELL_STAT_LABELS: Record<SpellStat, string> = { chance: "Chance", days: "Days" };
/** Dragging the slider asks for maps only once it rests this long. */
const COMMIT_DELAY_MS = 250;

/**
 * The spell length a farmer cares about ("at least N days in a row"), for the Dry and Wet spell
 * layers, and for a week or the whole run whether to show the chance of such a spell or the days
 * inside one. Shared by the side panel, the drawer and the phone options. The slider answers at
 * once on screen and asks for new maps once it rests. Renders nothing for other layers.
 */
export function SpellControls({ state, variant }: { state: SubseasonalState; variant: "panel" | "compact" }) {
  const kind = state.spellKind;
  const committed = kind ? state.spellDays[kind] : 0;
  const [draft, setDraft] = useState(committed);
  const timer = useRef<number | null>(null);
  useEffect(() => setDraft(committed), [committed, kind]);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  if (!kind || !state.run) {
    return null;
  }
  const [low, high] = state.spellRange[kind];
  const official = state.spellDefaults[kind];
  const idPrefix = variant === "panel" ? "ss" : "ss-c";

  const commit = (value: number, now = false) => {
    const next = Math.min(Math.max(Math.round(value), low), high);
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (now) {
      state.setSpellDays(kind, next);
    } else {
      timer.current = window.setTimeout(() => state.setSpellDays(kind, next), COMMIT_DELAY_MS);
    }
  };
  const ticks = Array.from({ length: high - low + 1 }, (_, position) => low + position);
  const at = (value: number) => `${((value - low) / Math.max(high - low, 1)) * 100}%`;

  const slider = (
    <div className={`ss-length-slider tone-${kind}`} data-testid={`${idPrefix}-spell-length`}>
      <button
        type="button"
        className="ss-length-step"
        aria-label="Shorter spell"
        disabled={draft <= low}
        onClick={() => commit(draft - 1, true)}
        data-testid={`${idPrefix}-spell-shorter`}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M5 10h10" />
        </svg>
      </button>
      <div className="ss-length-track">
        <div className="ss-length-ticks" aria-hidden="true">
          {ticks.map((value) => (
            <span
              key={value}
              className={`${value === official ? "official" : ""}${value <= draft ? " on" : ""}`}
              style={{ left: at(value) }}
              title={value === official ? `GMet standard: ${official} days` : undefined}
            />
          ))}
        </div>
        <input
          type="range"
          min={low}
          max={high}
          step={1}
          value={draft}
          aria-label={`${kind === "dry" ? "Dry" : "Wet"} spell length, days in a row`}
          aria-valuetext={`At least ${draft} days`}
          data-testid={`${idPrefix}-spell-slider`}
          style={{ ["--fill" as string]: at(draft) }}
          onChange={(event) => commit(Number(event.target.value))}
          onPointerUp={(event) => commit(Number((event.target as HTMLInputElement).value), true)}
          onKeyUp={(event) => commit(Number((event.target as HTMLInputElement).value), true)}
        />
      </div>
      <button
        type="button"
        className="ss-length-step"
        aria-label="Longer spell"
        disabled={draft >= high}
        onClick={() => commit(draft + 1, true)}
        data-testid={`${idPrefix}-spell-longer`}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M5 10h10M10 5v10" />
        </svg>
      </button>
      <output className="ss-length-value" data-testid={`${idPrefix}-spell-value`} aria-live="polite">
        <strong>{draft}+</strong>
        <small>days</small>
      </output>
    </div>
  );

  const statToggle =
    state.aggregation === "daily" ? null : (
      <div
        className={variant === "panel" ? "segmented ss-segmented-double" : "ss-mini-segmented"}
        role={variant === "panel" ? "tablist" : "radiogroup"}
        aria-label="Show for the period"
      >
        {SPELL_STATS.map((item) => {
          const selected = state.spellStat === item;
          return (
            <button
              key={item}
              type="button"
              role={variant === "panel" ? "tab" : "radio"}
              aria-selected={variant === "panel" ? selected : undefined}
              aria-checked={variant === "panel" ? undefined : selected}
              className={variant === "panel" && selected ? "active" : ""}
              data-testid={`${idPrefix}-spell-stat-${item}`}
              onClick={() => state.setSpellStat(item)}
            >
              {SPELL_STAT_LABELS[item]}
            </button>
          );
        })}
      </div>
    );

  if (variant === "compact") {
    return (
      <div className="ss-stat-compact ss-spell-compact" data-testid="ss-spell-compact">
        <div className="ss-stat-compact-row">
          {slider}
          {statToggle}
        </div>
      </div>
    );
  }
  return (
    <div className="control-group ss-stat-group ss-spell-group">
      <div className="control-field ss-spell-field">
        <span className="control-label">Spell</span>
        {slider}
      </div>
      {statToggle ? (
        <div className="control-field">
          <span className="control-label">Show</span>
          {statToggle}
        </div>
      ) : null}
    </div>
  );
}
