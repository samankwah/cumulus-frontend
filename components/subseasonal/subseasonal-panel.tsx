"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { aggregationLabel, availableLayers, formatInitTime, formatIssueDate, LAYER_FALLBACK_LABELS, LAYER_SHORT_LABELS } from "@/lib/subseasonal";
import type { SubseasonalAreaLevel, SubseasonalLayerKey } from "@/lib/subseasonal";
import type { SubseasonalState } from "@/hooks/use-subseasonal";
import { ForecastTimeline } from "@/components/subseasonal/forecast-timeline";
import { SteppedLegend } from "@/components/subseasonal/stepped-legend";

function layerHint(state: SubseasonalState, layer: SubseasonalLayerKey) {
  const thresholds = state.run?.thresholds;
  if (!thresholds) {
    return "";
  }
  switch (layer) {
    case "rainfall":
      return "Amount, mm";
    case "rainy_days":
      return `Days ≥${thresholds.wet_day_mm} mm`;
    case "dry_spell_days":
      return `≥${thresholds.dry_spell_min_days} dry days`;
    case "wet_spell_days":
      return `≥${thresholds.wet_spell_min_days} wet days`;
    case "onset":
      return "Start of rains";
  }
}

/** Onset in plain words for farmers; the drawer gives the exact rule. */
const ONSET_SUMMARY = "When the rains have truly started and it is safe to plant.";

/** Small stroke glyphs for the layer cards, drawn in each layer's colour. */
const LAYER_ICONS: Record<SubseasonalLayerKey, ReactNode> = {
  onset: (
    <>
      <path d="M10 17v-6" />
      <path d="M10 11c0-3.2-2.2-5-5.5-5 0 3.3 2.2 5 5.5 5Z" />
      <path d="M10 13c0-3 2-4.7 5.5-4.7 0 3-2 4.7-5.5 4.7Z" />
    </>
  ),
  rainfall: <path d="M10 2.8s-5 5.6-5 9.3a5 5 0 0 0 10 0c0-3.7-5-9.3-5-9.3Z" />,
  wet_spell_days: (
    <>
      <path d="M6 12.5a3.6 3.6 0 0 1-.4-7.2 4.6 4.6 0 0 1 8.8 1.2 3 3 0 0 1-.4 6H6Z" />
      <path d="M7 15.5 6.2 17.5M10.5 15.5l-.8 2M14 15.5l-.8 2" />
    </>
  ),
  dry_spell_days: (
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
    </>
  ),
  rainy_days: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
      <path d="M3 8.5h14M7 2.8v3M13 2.8v3" />
      <path d="M10 10.6s-1.7 1.9-1.7 3.1a1.7 1.7 0 0 0 3.4 0c0-1.2-1.7-3.1-1.7-3.1Z" />
    </>
  ),
};

export function RunBadge({ state }: { state: SubseasonalState }) {
  const run = state.run;
  if (!run) {
    return state.isRunsLoading ? <span className="control-skeleton ss-run-skeleton" aria-hidden="true" /> : null;
  }
  return (
    <div className="ss-run" data-testid="subseasonal-run">
      <span className="ss-run-model">{run.model_label}</span>
      <IssueDatePicker state={state} />
      {state.activeRunId && run.run_id !== state.activeRunId ? (
        // An earlier issue chosen on purpose: say so rather than warn that it is old.
        <span className="ss-run-earlier" data-testid="subseasonal-earlier" title="A newer run is available in the Issued menu.">
          Earlier issue
        </span>
      ) : run.is_stale ? (
        <span className="ss-run-stale" data-testid="subseasonal-stale" title="A newer run has not been published yet.">
          {run.age_days} days old
        </span>
      ) : null}
    </div>
  );
}

/**
 * Forecast issue date (the model run's start). A pill in the run badge; with more than one run kept
 * it is also the picker, a native select laid over the pill so it works with touch and keyboard.
 */
export function IssueDatePicker({
  state,
  testId = "ss-issue-date",
  bare = false,
}: {
  state: SubseasonalState;
  testId?: string;
  /** Under an "Issued" label already: show the date alone. */
  bare?: boolean;
}) {
  const { run, runs } = state;
  if (!run) {
    return null;
  }
  const choosable = runs.length > 1;
  const label = formatInitTime(run.init_time).split(" ").slice(0, 3).join(" ");
  return (
    <span
      className={`ss-run-issue${choosable ? " choosable" : ""}`}
      title={`Model run started ${formatInitTime(run.init_time)}${choosable ? ". Choose another issue date." : ""}`}
      data-testid={choosable ? undefined : testId}
    >
      {bare ? label : `Issued ${label}`}
      {choosable ? (
        <>
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="m6 8 4 4 4-4" />
          </svg>
          <select
            value={run.run_id}
            data-testid={testId}
            aria-label="Forecast issue date"
            onChange={(event) => state.selectRun(event.target.value)}
          >
            {runs.map((item) => (
              <option key={item.run_id} value={item.run_id}>
                {formatIssueDate(item.init_time)}
                {item.run_id === state.activeRunId ? " · latest" : ""}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </span>
  );
}

export function SubseasonalPanel({ state }: { state: SubseasonalState }) {
  const run = state.run;
  // Onset's own rule is long (the drawer explains it), so the panel gives a short plain version.
  const activeDescription =
    state.layer === "onset" ? ONSET_SUMMARY : run?.layers.find((item) => item.layer === state.layer)?.description;

  if (state.runsError) {
    return (
      <div className="control-group">
        <section className="control-status-panel control-status-panel-warning" data-testid="subseasonal-error" aria-live="polite">
          <span className="control-status-kicker">46-day forecast unavailable</span>
          <p>{state.runsError}</p>
          <div className="control-status-actions">
            <button type="button" className="ghost-button" onClick={state.retryRuns} disabled={state.isRunsLoading}>
              {state.isRunsLoading ? "Retrying..." : "Retry"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <div className="control-group ss-layer-group">
        <div className="control-field">
          <span className="control-label" id="ss-layer-label">
            Layer
          </span>
          <div className={`ss-layer-grid count-${availableLayers(run).length}`} role="radiogroup" aria-labelledby="ss-layer-label">
            {availableLayers(run).map((layer, position, all) => {
              const selected = state.layer === layer;
              // The three narrower cards of the uneven grid use the short names.
              const narrow = all.length === 5 && position >= 2;
              return (
                <button
                  key={layer}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`ss-layer-option ss-layer-${layer}${selected ? " active" : ""}`}
                  data-testid={`ss-layer-${layer}`}
                  disabled={!run}
                  onClick={() => state.setLayer(layer)}
                >
                  <svg className="ss-layer-icon" viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                    {LAYER_ICONS[layer]}
                  </svg>
                  <strong>{narrow ? LAYER_SHORT_LABELS[layer] : (run?.layers.find((item) => item.layer === layer)?.label ?? LAYER_FALLBACK_LABELS[layer])}</strong>
                  <small>{layerHint(state, layer)}</small>
                </button>
              );
            })}
          </div>
          {activeDescription ? (
            <p className="ss-layer-description">
              <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                <circle cx="10" cy="10" r="7.5" />
                <path d="M10 9v4.5M10 6.4v.1" />
              </svg>
              <span>{activeDescription}</span>
            </p>
          ) : null}
        </div>
      </div>

      {state.aggregations.length > 1 ? (
        <div className="control-group">
          <div className="control-field">
            <span className="control-label">Period</span>
            <div
              className="segmented ss-segmented-triple"
              style={{ gridTemplateColumns: `repeat(${state.aggregations.length}, minmax(0, 1fr))` }}
              role="tablist"
              aria-label="Forecast period"
            >
              {state.aggregations.map((aggregation) => (
                <button
                  key={aggregation}
                  type="button"
                  role="tab"
                  aria-selected={state.aggregation === aggregation}
                  className={state.aggregation === aggregation ? "active" : ""}
                  data-testid={`ss-agg-${aggregation}`}
                  disabled={!run}
                  onClick={() => state.setAggregation(aggregation)}
                >
                  {aggregationLabel(state.layer, aggregation, run?.lead_days ?? null)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type Geography = { mode: SubseasonalAreaLevel; setMode: (mode: SubseasonalAreaLevel) => void };

/**
 * Phones only (hidden by CSS above 860px): the controls the side panel holds on desktop, folded into
 * the bottom card. Layers are one tap away as chips; period and areas sit behind the options button.
 */
function MobileControls({ state, geography }: { state: SubseasonalState; geography: Geography }) {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (row && chip) {
      // Scroll the row only; scrollIntoView would also move the page.
      row.scrollLeft = Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2);
    }
  }, [state.layer, state.run]);
  const run = state.run;
  const description = state.layer === "onset" ? ONSET_SUMMARY : run?.layers.find((item) => item.layer === state.layer)?.description;
  return (
    <div className="ss-mobile-controls">
      <div className="ss-mobile-bar">
        <div className="ss-chips" role="radiogroup" aria-label="Map layer" ref={chipsRef}>
          {availableLayers(run).map((layer) => (
            <button
              key={layer}
              type="button"
              role="radio"
              aria-checked={state.layer === layer}
              className={`ss-chip ss-chip-${layer}`}
              data-testid={`ss-mlayer-${layer}`}
              disabled={!run}
              onClick={(event) => {
                state.setLayer(layer);
                // Keep the chosen chip fully visible when the row is scrolled.
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
              }}
            >
              <svg className="ss-chip-icon" viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                {LAYER_ICONS[layer]}
              </svg>
              {LAYER_SHORT_LABELS[layer]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ss-options-button"
          aria-expanded={isOptionsOpen}
          aria-controls="ss-mobile-options"
          aria-label={isOptionsOpen ? "Hide map options" : "Show map options"}
          data-testid="ss-mobile-options"
          onClick={() => setIsOptionsOpen((open) => !open)}
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
            <circle cx="13" cy="6" r="2" />
            <circle cx="7" cy="14" r="2" />
          </svg>
        </button>
      </div>
      {isOptionsOpen ? (
        <div className="ss-mobile-options" id="ss-mobile-options">
          <div className="ss-option-row">
            <span className="ss-option-label">Issued</span>
            <div className="ss-run ss-run-inline">
              <IssueDatePicker state={state} testId="ss-missue-date" bare />
            </div>
          </div>
          {state.aggregations.length > 1 ? (
            <div className="ss-option-row">
              <span className="ss-option-label">Period</span>
              <div className="ss-mini-segmented" role="radiogroup" aria-label="Forecast period">
                {state.aggregations.map((aggregation) => (
                  <button
                    key={aggregation}
                    type="button"
                    role="radio"
                    aria-checked={state.aggregation === aggregation}
                    data-testid={`ss-magg-${aggregation}`}
                    disabled={!run}
                    onClick={() => state.setAggregation(aggregation)}
                  >
                    {aggregationLabel(state.layer, aggregation, run?.lead_days ?? null)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="ss-option-row">
            <span className="ss-option-label">Areas</span>
            <div className="ss-mini-segmented" role="radiogroup" aria-label="Map areas">
              {(["region", "district"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={geography.mode === mode}
                  data-testid={`ss-mgeo-${mode}`}
                  onClick={() => geography.setMode(mode)}
                >
                  {mode === "region" ? "Regions" : "Districts"}
                </button>
              ))}
            </div>
          </div>
          {description ? <p className="ss-option-note">{description}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Phones only: what the desktop panel header carries, the outlook switch and how fresh the run is. */
export function SubseasonalTopBar({ state, onSeasonal }: { state: SubseasonalState; onSeasonal?: () => void }) {
  const run = state.run;
  return (
    <header className="ss-topbar" data-testid="ss-topbar">
      {onSeasonal ? (
        <div className="ss-mini-segmented ss-topbar-outlook" role="radiogroup" aria-label="Forecast outlook">
          <button type="button" role="radio" aria-checked="true">
            46 days
          </button>
          <button type="button" role="radio" aria-checked="false" data-testid="ss-topbar-seasonal" onClick={onSeasonal}>
            Seasonal
          </button>
        </div>
      ) : (
        <span className="ss-topbar-title">46-Day Forecast</span>
      )}
      {run && state.activeRunId && run.run_id !== state.activeRunId ? (
        <span className="ss-topbar-run" data-testid="ss-topbar-run" title={`${run.model_label} run initialised ${formatInitTime(run.init_time)}`}>
          <span className="ss-topbar-model">Issued </span>
          {formatInitTime(run.init_time).split(" ").slice(0, 2).join(" ")}
        </span>
      ) : run ? (
        <span
          className={run.is_stale ? "ss-topbar-run stale" : "ss-topbar-run"}
          data-testid="ss-topbar-run"
          title={`${run.model_label} run initialised ${formatInitTime(run.init_time)}`}
        >
          <span className="ss-topbar-model">{run.model_label} · </span>
          {run.is_stale ? `${run.age_days} days old` : formatInitTime(run.init_time)}
        </span>
      ) : null}
    </header>
  );
}

export function SubseasonalDock({ state, geography }: { state: SubseasonalState; geography: Geography }) {
  return (
    <>
      {state.runsError ? null : <MobileControls state={state} geography={geography} />}
      <DockBody state={state} />
    </>
  );
}

function DockBody({ state }: { state: SubseasonalState }) {
  const run = state.run;
  const layer = state.layerMeta;
  const isCurrentLayer =
    layer && run && layer.run_id === run.run_id && layer.layer === state.layer && layer.aggregation === state.aggregation;

  if (state.runsError) {
    return (
      <div className="continuous-legend-empty" data-testid="legend-empty">
        The 46-day forecast could not be loaded.
      </div>
    );
  }
  if (!run || !layer || !isCurrentLayer) {
    return (
      <div className="legend-skeleton" data-testid="legend-skeleton" aria-hidden="true">
        <span className="control-skeleton legend-skeleton-bar" />
        <span className="control-skeleton legend-skeleton-line" />
      </div>
    );
  }

  return (
    <div className="ss-dock">
      {state.hasTimeline ? null : (
        // Without a timeline the period is not shown elsewhere, so title the dock.
        <div className="ss-dock-title">
          <span className="section-kicker">{layer.layer_label}</span>
          <strong data-testid="subseasonal-layer-title">{layer.title.split(" · ").slice(1).join(" · ") || layer.title}</strong>
        </div>
      )}
      {state.hasTimeline ? (
        <ForecastTimeline
          run={run}
          aggregation={state.aggregation}
          index={state.index}
          onIndexChange={state.setIndex}
          isPlaying={state.isPlaying}
          onTogglePlaying={state.togglePlaying}
          isBusy={layer.index !== state.index}
        />
      ) : null}
      <SteppedLegend layer={layer} />
      {state.layerError ? (
        <p className="control-inline-note" role="status">
          {state.layerError}{" "}
          <button type="button" className="ss-link-button" onClick={state.retryLayer}>
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
