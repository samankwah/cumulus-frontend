"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  aggregationLabel,
  availableLayers,
  formatInitTime,
  formatIssueDate,
  LAYER_FALLBACK_LABELS,
  LAYER_SHORT_LABELS,
  modelGrid,
  resolutionText,
} from "@/lib/subseasonal";
import type { ModelAxisOption, SubseasonalAreaLevel, SubseasonalLayerKey } from "@/lib/subseasonal";
import type { SubseasonalState } from "@/hooks/use-subseasonal";
import { ForecastTimeline } from "@/components/subseasonal/forecast-timeline";
import { PillMenu } from "@/components/subseasonal/pill-menu";
import { SpellControls } from "@/components/subseasonal/spell-controls";
import { StatControls } from "@/components/subseasonal/stat-controls";
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
      return `≥${state.spellDays.dry} dry days`;
    case "wet_spell_days":
      return `≥${state.spellDays.wet} wet days`;
    case "extreme_rain":
      return `≥${thresholds.extreme_rain_mm ?? 50} mm a day`;
    case "onset":
      return "Start of rains";
  }
}

/** Each layer in plain words for farmers; the cards' hints and the drawer give the exact rules. */
const LAYER_SUMMARIES: Record<SubseasonalLayerKey, string> = {
  onset: "When the rains have truly started and it is safe to plant.",
  rainfall: "How much rain is expected.",
  wet_spell_days: "Days in long stretches of steady rain.",
  dry_spell_days: "Days in long stretches with little or no rain.",
  rainy_days: "How many days will have rain.",
  extreme_rain: "Chance of a very wet day that could bring flooding.",
};

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
  extreme_rain: (
    <>
      <path d="M6 11.5a3.6 3.6 0 0 1-.4-7.2 4.6 4.6 0 0 1 8.8 1.2 3 3 0 0 1-.4 6" />
      <path d="M10.8 9.5 8.6 13.4h3l-2 4" />
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
      {/* With the models described as source x downscaler, the panel's Model row carries the choice. */}
      {modelGrid(state.models, state.model) ? null : <ModelPicker state={state} />}
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
 * The forecast model (IFS-UNet, IFS-Diffusion, Aurora...). A pill in the run badge; when more than
 * one model is configured it opens a menu, with models that have no runs yet listed but disabled.
 */
export function ModelPicker({
  state,
  testId = "ss-model",
  align = "start",
}: {
  state: SubseasonalState;
  testId?: string;
  /** Phones: the pill sits at the right edge, so the menu opens leftwards. */
  align?: "start" | "end";
}) {
  const { run, models } = state;
  if (!run) {
    return null;
  }
  const pill = (
    <>
      {run.model_label}
      {(run.members ?? 1) > 1 ? <small className="ss-run-members">×{run.members}</small> : null}
      {run.synthetic ? (
        <small className="ss-run-demo" data-testid="ss-demo-badge" title="Synthetic demo data, not a real forecast">
          Demo
        </small>
      ) : null}
    </>
  );
  if (models.length < 2) {
    return (
      <span className="ss-run-model" title={run.source_label} data-testid={testId}>
        {pill}
      </span>
    );
  }
  return (
    <PillMenu
      className="ss-run-model choosable"
      label="Forecast model"
      testId={testId}
      align={align}
      value={state.model ?? ""}
      onChange={state.selectModel}
      trigger={pill}
      options={models.map((item) => ({
        value: item.id,
        label: item.label,
        detail: !item.available ? "Data coming soon" : (item.members ?? 1) > 1 ? `Ensemble of ${item.members}` : "Single run",
        badge: item.available && item.synthetic ? "Demo" : undefined,
        disabled: !item.available,
      }))}
    />
  );
}

/** One line under each forecast model in the menu: what it is, in plain words. */
const FAMILY_NOTES: Record<string, string> = {
  aurora_imerg: "Microsoft Aurora · rain calibrated to satellite",
  aurora_era5: "Microsoft Aurora · rain calibrated to ERA5",
  ifs: "ECMWF extended-range forecast",
};

/** Short names for the field itself, where the full "Aurora · IMERG head" would not fit. */
const FAMILY_SHORT: Record<string, string> = {
  aurora_imerg: "Aurora-IMERG",
  aurora_era5: "Aurora-ERA5",
  ifs: "ECMWF IFS",
};

function downscalingNote(option: ModelAxisOption) {
  if (option.key === "bilinear") return "Interpolated only, no machine learning";
  if ((option.members ?? 1) > 1) return `Ensemble of ${option.members} · gives chances`;
  return "Machine-learnt detail · single run";
}

/**
 * The model, as the modelling team describes it: a forecast model (the S2S source, e.g. Aurora with
 * its IMERG-calibrated rain) and how it is downscaled to 0.1° (UNet, diffusion ensemble or plain
 * bilinear interpolation). Two labelled menus; combinations without a run are listed but disabled.
 * Renders nothing when the backend does not describe its models that way.
 */
export function ModelChoice({
  state,
  layout = "panel",
}: {
  state: SubseasonalState;
  /** "panel": a Model row in the desktop panel; "rows": two option rows in the phone card. */
  layout?: "panel" | "rows";
}) {
  const grid = modelGrid(state.models, state.model);
  if (!grid || !state.run) {
    return null;
  }
  const family = grid.families.find((item) => item.key === grid.family);
  const method = grid.downscalers.find((item) => item.key === grid.downscaling);
  const members = state.run.members ?? 1;
  const choose = (modelId: string) => {
    const next = state.models.find((item) => item.id === modelId);
    if (next) state.selectModel(next.id);
  };
  const familyMenu = (
    <PillMenu
      className="ss-model-field"
      label="Forecast model"
      testId={layout === "panel" ? "ss-family" : "ss-mfamily"}
      align="start"
      value={grid.family}
      onChange={(key) => {
        const option = grid.families.find((item) => item.key === key);
        if (option?.modelId) choose(option.modelId);
      }}
      trigger={
        <span className="ss-model-field-body">
          {layout === "panel" ? <small>Forecast model</small> : null}
          <strong>{FAMILY_SHORT[grid.family] ?? family?.label ?? state.run.model_label}</strong>
        </span>
      }
      options={grid.families.map((item) => ({
        value: item.key,
        label: item.label,
        detail: item.available ? (FAMILY_NOTES[item.key] ?? undefined) : "No run yet",
        badge: item.synthetic ? "Demo" : undefined,
        disabled: !item.available,
      }))}
    />
  );
  const methodMenu = (
    <PillMenu
      className="ss-model-field"
      label="Downscaling"
      testId={layout === "panel" ? "ss-downscaling" : "ss-mdownscaling"}
      align="end"
      value={grid.downscaling}
      onChange={(key) => {
        const option = grid.downscalers.find((item) => item.key === key);
        if (option?.modelId) choose(option.modelId);
      }}
      trigger={
        <span className="ss-model-field-body">
          {layout === "panel" ? <small>Downscaling</small> : null}
          <strong>
            {method?.label ?? grid.downscaling}
            {members > 1 ? <em className="ss-model-members">×{members}</em> : null}
            {state.run.synthetic ? (
              <em className="ss-run-demo" data-testid="ss-demo-badge" title="Synthetic demo data, not a real forecast">
                Demo
              </em>
            ) : null}
          </strong>
        </span>
      }
      options={grid.downscalers.map((item) => ({
        value: item.key,
        label: item.label,
        detail: item.available ? downscalingNote(item) : `No ${family?.label ?? "such"} run yet`,
        badge: item.synthetic ? "Demo" : undefined,
        disabled: !item.available,
      }))}
    />
  );
  if (layout === "rows") {
    return (
      <>
        <div className="ss-option-row">
          <span className="ss-option-label">Model</span>
          <div className="ss-model-inline">{familyMenu}</div>
        </div>
        <div className="ss-option-row">
          <span className="ss-option-label">Downscale</span>
          <div className="ss-model-inline">{methodMenu}</div>
        </div>
      </>
    );
  }
  return (
    <div className="control-group ss-model-group">
      <div className="control-field">
        <span className="control-label">Model</span>
        <div className="ss-model-fields" data-testid="ss-model-choice">
          {familyMenu}
          {methodMenu}
        </div>
      </div>
    </div>
  );
}

/**
 * Forecast issue date (the model run's start). A pill in the run badge; with more than one run kept
 * it opens a menu of the kept runs, newest first.
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
  const label = formatInitTime(run.init_time).split(" ").slice(0, 3).join(" ");
  const text = bare ? label : `Issued ${label}`;
  if (runs.length < 2) {
    return (
      <span className="ss-run-issue" title={`Model run started ${formatInitTime(run.init_time)}`} data-testid={testId}>
        {text}
      </span>
    );
  }
  return (
    <PillMenu
      className="ss-run-issue choosable"
      label="Forecast issue date"
      testId={testId}
      align={bare ? "end" : "start"}
      value={run.run_id}
      onChange={state.selectRun}
      trigger={text}
      options={runs.map((item) => ({
        value: item.run_id,
        label: formatIssueDate(item.init_time),
        detail: item.run_id === state.activeRunId ? "Latest" : `${item.age_days} days old`,
      }))}
    />
  );
}

export function SubseasonalPanel({ state }: { state: SubseasonalState }) {
  const run = state.run;
  const activeDescription = LAYER_SUMMARIES[state.layer];

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
      <ModelChoice state={state} />
      <div className="control-group ss-layer-group">
        <div className="control-field">
          <span className="control-label" id="ss-layer-label">
            Layer
          </span>
          <div className={`ss-layer-grid count-${availableLayers(run).length}`} role="radiogroup" aria-labelledby="ss-layer-label">
            {availableLayers(run).map((layer, position, all) => {
              const selected = state.layer === layer;
              // Narrow cards use the short names: the bottom three of the uneven 2 + 3 grid, or all of 3 + 3.
              const narrow = all.length === 6 || (all.length === 5 && position >= 2);
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

      <StatControls state={state} variant="panel" />
      <SpellControls state={state} variant="panel" />
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
  const description = LAYER_SUMMARIES[state.layer];
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
          {modelGrid(state.models, state.model) ? (
            <ModelChoice state={state} layout="rows" />
          ) : state.models.length > 1 ? (
            <div className="ss-option-row">
              <span className="ss-option-label">Model</span>
              <div className="ss-run ss-run-inline">
                <ModelPicker state={state} testId="ss-mmodel" align="end" />
              </div>
            </div>
          ) : null}
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
          {state.stat ? (
            <div className="ss-option-row ss-option-row-stack">
              <span className="ss-option-label">Show</span>
              <StatControls state={state} variant="compact" />
            </div>
          ) : null}
          {state.spellKind ? (
            <div className="ss-option-row ss-option-row-stack">
              <span className="ss-option-label">Spell length</span>
              <SpellControls state={state} variant="compact" />
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
          values={layer.timeline}
          unit={layer.timeline_unit}
        />
      ) : null}
      {layer.observed ? (
        // An elapsed day that has been observed: the map shows what fell, not the forecast.
        <p className="ss-dock-stat observed" data-testid="ss-dock-observed">
          <span className="ss-observed-chip">Observed</span>
          {run.observed_source ?? "Satellite rainfall"}
          {run.observed_synthetic ? <em className="ss-run-demo">Demo</em> : null}
        </p>
      ) : layer.statistic === "median" || layer.statistic === "mean" || (layer.statistic === "probability" && layer.layer === "rainfall") ? (
        <p className="ss-dock-stat" data-testid="ss-dock-stat">
          {layer.statistic === "median"
            ? `Ensemble median of ${layer.members} members`
            : layer.statistic === "mean"
              ? `Ensemble mean of ${layer.members} members`
              : `Chance of ${layer.threshold_mm ?? ""} mm or more · share of ${layer.members} members`}
        </p>
      ) : null}
      <SteppedLegend layer={layer} />
      <p className="ss-dock-resolution" data-testid="ss-dock-resolution">
        {resolutionText(run, Boolean(layer.observed))}
      </p>
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
