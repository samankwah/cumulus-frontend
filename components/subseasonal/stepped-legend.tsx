"use client";

import { formatAmount, formatDay, leadDayDate } from "@/lib/subseasonal";
import type { SubseasonalLayer } from "@/lib/subseasonal";

function edgeLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Dark text on light bands, white on dark ones (WCAG relative luminance). */
function textColorOn(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return "var(--ink)";
  }
  const channel = (offset: number) => {
    const value = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.36 ? "#1e2a33" : "#ffffff";
}

/**
 * Day maps of an indicator flag each cell (a rain day, or inside a spell). The key names the class
 * with a swatch, and the caption reads the area mean as the share of Ghana that is flagged.
 */
function ClassLegend({ layer }: { layer: SubseasonalLayer }) {
  const { legend, stats } = layer;
  const share = stats.mean === null ? null : Math.round(stats.mean);
  return (
    <figure className="ss-legend ss-legend-classes" data-testid="subseasonal-legend" aria-label={`${layer.layer_label} legend`}>
      <ul className="ss-legend-class-list">
        {legend.bins.map((bin) => (
          <li key={bin.label}>
            <span className="ss-legend-swatch" style={{ backgroundColor: bin.color }} aria-hidden="true" />
            {bin.label}
            {share !== null ? <strong> across {share}% of Ghana</strong> : null}
          </li>
        ))}
      </ul>
      <figcaption className="ss-legend-caption">
        {legend.note ? <span className="ss-legend-note">{legend.note}</span> : <span />}
      </figcaption>
    </figure>
  );
}

/** Onset dates: one band per forecast week, each starting with its first date; grey for no onset. */
function OnsetLegend({ layer }: { layer: SubseasonalLayer }) {
  const { legend, stats } = layer;
  const earliest = stats.min !== null && stats.min !== undefined ? formatDay(leadDayDate(layer.start_date, stats.min), "weekday") : null;
  return (
    <figure className="ss-legend ss-legend-onset" data-testid="subseasonal-legend" aria-label={`${layer.layer_label} legend`}>
      <div className="ss-legend-bar" role="list">
        {legend.bins.map((bin, position) => (
          <span
            key={bin.label}
            role="listitem"
            className="ss-legend-step"
            style={{ backgroundColor: bin.color, color: textColorOn(bin.color) }}
            title={bin.label}
            aria-label={bin.label}
          >
            <span aria-hidden="true">{position === 0 ? "None" : bin.label.split("–")[0]}</span>
          </span>
        ))}
      </div>
      <figcaption className="ss-legend-caption">
        <span>
          {stats.share !== null && stats.share !== undefined ? (
            <>
              Onset across <strong>{Math.round(stats.share)}%</strong> of Ghana
            </>
          ) : (
            "Onset date"
          )}
          {earliest ? (
            <>
              {" "}
              · earliest <strong>{earliest}</strong>
            </>
          ) : null}
        </span>
        {legend.note ? <span className="ss-legend-note">{legend.note}</span> : null}
      </figcaption>
    </figure>
  );
}

/** Onset by day: started, then how soon elsewhere. The caption reads the shares for the shown day. */
function CountdownLegend({ layer }: { layer: SubseasonalLayer }) {
  const { legend, stats } = layer;
  const day = formatDay(layer.start_date, "weekday");
  return (
    <figure className="ss-legend ss-legend-onset" data-testid="subseasonal-legend" aria-label={`${layer.layer_label} legend`}>
      <div className="ss-legend-bar" role="list">
        {legend.bins.map((bin) => (
          <span
            key={bin.label}
            role="listitem"
            className="ss-legend-step"
            style={{ backgroundColor: bin.color, color: textColorOn(bin.color) }}
            title={bin.label}
            aria-label={bin.label}
          >
            <span aria-hidden="true">{bin.label.replace(" days", "").replace("Not in forecast", "None")}</span>
          </span>
        ))}
      </div>
      <figcaption className="ss-legend-caption">
        <span>
          Set in across <strong>{Math.round(stats.share ?? 0)}%</strong> of Ghana by {day}
          {stats.upcoming_share ? (
            <>
              {" "}
              · <strong>{Math.round(stats.upcoming_share)}%</strong> still to come
            </>
          ) : null}
        </span>
        <span className="ss-legend-note">Days until the rains set in</span>
      </figcaption>
    </figure>
  );
}

/** Windy-style scale: the unit and each band's lower edge are written inside the colour bar. */
export function SteppedLegend({ layer }: { layer: SubseasonalLayer }) {
  const { legend, stats } = layer;
  const unit = legend.unit;
  if (legend.categorical) {
    return <ClassLegend layer={layer} />;
  }
  if (unit === "date") {
    return <OnsetLegend layer={layer} />;
  }
  if (unit === "days_to_onset") {
    return <CountdownLegend layer={layer} />;
  }
  return (
    <figure className="ss-legend" data-testid="subseasonal-legend" aria-label={`${layer.layer_label} legend in ${unit}`}>
      <div className="ss-legend-bar" role="list">
        <span className="ss-legend-unit" aria-hidden="true">
          {unit}
        </span>
        {legend.bins.map((bin, position) => (
          <span
            key={bin.label}
            role="listitem"
            className="ss-legend-step"
            style={{ backgroundColor: bin.color, color: textColorOn(bin.color) }}
            title={`${bin.label} ${unit}`}
            aria-label={`${bin.label} ${unit}`}
          >
            <span aria-hidden="true">{position === 0 && bin.label.startsWith("<") ? "0" : edgeLabel(bin.min)}</span>
          </span>
        ))}
      </div>
      <figcaption className="ss-legend-caption">
        <span>
          Ghana mean <strong>{formatAmount(stats.mean, unit)}</strong>
          {stats.max !== null ? (
            <>
              {" "}
              · max <strong>{formatAmount(stats.max, unit)}</strong>
            </>
          ) : null}
        </span>
        {legend.note ? <span className="ss-legend-note">{legend.note}</span> : null}
      </figcaption>
    </figure>
  );
}
