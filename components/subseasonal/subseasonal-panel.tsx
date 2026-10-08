"use client";

import { AGGREGATION_LABELS, formatInitTime, LAYER_FALLBACK_LABELS } from "@/lib/subseasonal";
import type { SubseasonalAggregation, SubseasonalLayerKey } from "@/lib/subseasonal";
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

export function SubseasonalDock({ state }: { state: SubseasonalState }) {
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
