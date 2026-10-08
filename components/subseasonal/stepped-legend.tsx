"use client";

import { formatAmount } from "@/lib/subseasonal";
import type { SubseasonalLayer } from "@/lib/subseasonal";

function edgeLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function SteppedLegend({ layer }: { layer: SubseasonalLayer }) {
  const { legend, stats } = layer;
  const unit = legend.unit;
  return (
    <figure className="ss-legend" data-testid="subseasonal-legend" aria-label={`${layer.layer_label} legend in ${unit}`}>
      <div className="ss-legend-bar" role="list">
        {legend.bins.map((bin) => (
          <span
            key={bin.label}
            role="listitem"
            className="ss-legend-step"
            style={{ backgroundColor: bin.color }}
            title={`${bin.label} ${unit}`}
            aria-label={`${bin.label} ${unit}`}
          />
        ))}
      </div>
      <div className="ss-legend-axis" aria-hidden="true">
        {legend.bins.map((bin, position) => (
          <span key={bin.label} style={{ left: `${(position / legend.bins.length) * 100}%` }}>
            {position === 0 && bin.label.startsWith("<") ? "0" : edgeLabel(bin.min)}
          </span>
        ))}
        <span className="ss-legend-unit">{unit}</span>
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
