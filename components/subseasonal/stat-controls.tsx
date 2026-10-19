"use client";

import { RAIN_STAT_LABELS, RAIN_STATS } from "@/lib/subseasonal";
import type { RainStat, SubseasonalAggregation } from "@/lib/subseasonal";
import type { SubseasonalState } from "@/hooks/use-subseasonal";

const PERIOD_WORDS: Record<SubseasonalAggregation, string> = { daily: "in a day", weekly: "in a week", total: "in total" };

/** One plain sentence on what the chosen statistic means, so the switch explains itself. */
export function statExplanation(stat: RainStat, members: number, threshold: number | null, aggregation: SubseasonalAggregation) {
  if (stat === "median") {
    return `The middle of the ${members} members. It can understate scattered heavy rain.`;
  }
  if (stat === "chance") {
    return `Share of the ${members} members with at least ${threshold ?? 0} mm ${PERIOD_WORDS[aggregation]}.`;
  }
  return `The average of the ${members} members.`;
}

/**
 * The ensemble rainfall switch (Mean / Median / Chance, and the amount for Chance), shared by the
 * side panel, the drawer and the phone options so the choice reads and behaves the same everywhere.
 * Renders nothing unless the layer and run offer a choice.
 */
export function StatControls({ state, variant }: { state: SubseasonalState; variant: "panel" | "compact" }) {
  if (!state.stat) {
    return null;
  }
  const members = state.run?.members ?? 1;
  const note = statExplanation(state.stat, members, state.threshold, state.aggregation);
  const idPrefix = variant === "panel" ? "ss" : "ss-c";

  if (variant === "compact") {
    return (
      <div className="ss-stat-compact" data-testid="ss-stat-compact">
        <div className="ss-stat-compact-row">
          <div className="ss-mini-segmented" role="radiogroup" aria-label="Ensemble statistic">
            {RAIN_STATS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={state.stat === item}
                data-testid={`${idPrefix}-stat-${item}`}
                onClick={() => state.setStat(item)}
              >
                {RAIN_STAT_LABELS[item]}
              </button>
            ))}
          </div>
          {state.stat === "chance" ? (
            <div className="ss-mini-segmented ss-stat-amounts" role="radiogroup" aria-label="Rainfall amount">
              {state.chanceThresholds.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  role="radio"
                  aria-checked={state.threshold === amount}
                  data-testid={`${idPrefix}-thr-${amount}`}
                  onClick={() => state.setThreshold(amount)}
                >
                  ≥{amount}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="ss-stat-note">{note}</p>
      </div>
    );
  }

  return (
    <div className="control-group ss-stat-group">
      <div className="control-field">
        <span className="control-label">Show</span>
        <div className="segmented ss-segmented-triple" role="tablist" aria-label="Ensemble statistic">
          {RAIN_STATS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={state.stat === item}
              className={state.stat === item ? "active" : ""}
              data-testid={`${idPrefix}-stat-${item}`}
              onClick={() => state.setStat(item)}
            >
              {RAIN_STAT_LABELS[item]}
            </button>
          ))}
        </div>
      </div>
      {state.stat === "chance" ? (
        <div className="control-field">
          <span className="control-label">At least</span>
          <div className="segmented ss-segmented-triple" role="tablist" aria-label="Rainfall amount">
            {state.chanceThresholds.map((amount) => (
              <button
                key={amount}
                type="button"
                role="tab"
                aria-selected={state.threshold === amount}
                className={state.threshold === amount ? "active" : ""}
                data-testid={`${idPrefix}-thr-${amount}`}
                onClick={() => state.setThreshold(amount)}
              >
                {amount} mm
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="ss-stat-note" data-testid="ss-stat-note">
        {note}
      </p>
    </div>
  );
}

/**
 * With a single-run model on the rainfall layer, point to an ensemble model that has data: the
 * probability views exist, they just need members.
 */
export function EnsembleHint({ state }: { state: SubseasonalState }) {
  const run = state.run;
  if (!run || (run.members ?? 1) > 1 || state.layer !== "rainfall") {
    return null;
  }
  const ensemble = state.models.find((item) => item.available && (item.members ?? 1) > 1 && item.id !== state.model);
  if (!ensemble) {
    return null;
  }
  return (
    <p className="ss-ensemble-hint" data-testid="ss-ensemble-hint">
      Mean, median and chance views need an ensemble.{" "}
      <button type="button" className="ss-link-button" onClick={() => state.selectModel(ensemble.id)}>
        Switch to {ensemble.label} ({ensemble.members} members)
      </button>
    </p>
  );
}
