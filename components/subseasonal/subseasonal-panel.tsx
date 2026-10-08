"use client";

import { useState } from "react";

import { AGGREGATION_LABELS, formatInitTime, LAYER_FALLBACK_LABELS, LAYER_SHORT_LABELS } from "@/lib/subseasonal";
import type { SubseasonalAggregation, SubseasonalAreaLevel, SubseasonalLayerKey } from "@/lib/subseasonal";
import type { SubseasonalState } from "@/hooks/use-subseasonal";
import { ForecastTimeline } from "@/components/subseasonal/forecast-timeline";
import { SteppedLegend } from "@/components/subseasonal/stepped-legend";

const LAYER_ORDER: SubseasonalLayerKey[] = ["rainfall", "rainy_days", "dry_spell_days", "wet_spell_days"];
const AGGREGATIONS: SubseasonalAggregation[] = ["daily", "weekly", "total"];

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
      return `Runs ≥${thresholds.dry_spell_min_days} dry days`;
    case "wet_spell_days":
      return `Runs ≥${thresholds.wet_spell_min_days} wet days`;
  }
}

export function RunBadge({ state }: { state: SubseasonalState }) {
  const run = state.run;
  if (!run) {
    return state.isRunsLoading ? <span className="control-skeleton ss-run-skeleton" aria-hidden="true" /> : null;
  }
  return (
    <div className="ss-run" data-testid="subseasonal-run">
      <span className="ss-run-model">{run.model_label}</span>
      <span className="ss-run-init">Init {formatInitTime(run.init_time)}</span>
      {run.is_stale ? (
        <span className="ss-run-stale" data-testid="subseasonal-stale" title="A newer run has not been published yet.">
          {run.age_days} days old
        </span>
      ) : null}
    </div>
  );
}

export function SubseasonalPanel({ state }: { state: SubseasonalState }) {
  const run = state.run;
  const activeDescription = run?.layers.find((item) => item.layer === state.layer)?.description;

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
      <div className="control-group">
        <div className="control-field">
          <span className="control-label" id="ss-layer-label">
            Layer
          </span>
          <div className="ss-layer-grid" role="radiogroup" aria-labelledby="ss-layer-label">
            {LAYER_ORDER.map((layer) => {
              const selected = state.layer === layer;
              return (
                <button
                  key={layer}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`ss-layer-option${selected ? " active" : ""}`}
                  data-testid={`ss-layer-${layer}`}
                  disabled={!run}
                  onClick={() => state.setLayer(layer)}
                >
                  <strong>{run?.layers.find((item) => item.layer === layer)?.label ?? LAYER_FALLBACK_LABELS[layer]}</strong>
                  <small>{layerHint(state, layer)}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {state.layer === "rainfall" ? (
        <div className="control-group">
          <div className="control-field">
            <span className="control-label">Period</span>
            <div className="segmented ss-segmented-triple" role="tablist" aria-label="Rainfall period">
              {AGGREGATIONS.map((aggregation) => (
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
                  {aggregation === "total" && run ? `${run.lead_days}-day` : AGGREGATION_LABELS[aggregation]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeDescription ? <p className="control-inline-note ss-layer-description">{activeDescription}</p> : null}
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
  const run = state.run;
  const description = run?.layers.find((item) => item.layer === state.layer)?.description;
  return (
    <div className="ss-mobile-controls">
      <div className="ss-mobile-bar">
        <div className="ss-chips" role="radiogroup" aria-label="Map layer">
          {LAYER_ORDER.map((layer) => (
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
          {state.layer === "rainfall" ? (
            <div className="ss-option-row">
              <span className="ss-option-label">Period</span>
              <div className="ss-mini-segmented" role="radiogroup" aria-label="Rainfall period">
                {AGGREGATIONS.map((aggregation) => (
                  <button
                    key={aggregation}
                    type="button"
                    role="radio"
                    aria-checked={state.aggregation === aggregation}
                    data-testid={`ss-magg-${aggregation}`}
                    disabled={!run}
                    onClick={() => state.setAggregation(aggregation)}
                  >
                    {aggregation === "total" && run ? `${run.lead_days}-day` : AGGREGATION_LABELS[aggregation]}
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
export function SubseasonalTopBar({ state, onSeasonal }: { state: SubseasonalState; onSeasonal: () => void }) {
  const run = state.run;
  return (
    <header className="ss-topbar" data-testid="ss-topbar">
      <div className="ss-mini-segmented ss-topbar-outlook" role="radiogroup" aria-label="Forecast outlook">
        <button type="button" role="radio" aria-checked="true">
          46 days
        </button>
        <button type="button" role="radio" aria-checked="false" data-testid="ss-topbar-seasonal" onClick={onSeasonal}>
          Seasonal
        </button>
      </div>
      {run ? (
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
