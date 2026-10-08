"use client";

import { formatAmount } from "@/lib/subseasonal";
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
        <span className="ss-legend-credit" title="Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors">
          Basemap © Esri
        </span>
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
        {/* Esri's terms require a visible basemap credit; the map's own badge is hidden in this view. */}
        <span className="ss-legend-credit" title="Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors">
          Basemap © Esri
        </span>
      </figcaption>
    </figure>
  );
}
