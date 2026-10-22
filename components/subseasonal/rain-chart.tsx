"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { formatAmount, formatDay, formatRange, observedDayCount, pastDayCount, todayIso, weeklyWettestDay, weekUnits } from "@/lib/subseasonal";
import type { SpellKind, SubseasonalOnset, SubseasonalSeries, SubseasonalSpread } from "@/lib/subseasonal";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round tick step for a 0-based axis with at most five intervals. */
function axisFor(value: number) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((candidate) => value / candidate <= 5) ?? 500;
  const max = Math.max(step, Math.ceil(value / step) * step);
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, index) => index * step) };
}

type Scale = {
  /** Left edge of slot `unit` (0-based; fractions allowed). */
  x: (unit: number) => number;
  /** The y-axis top value; marks above it are clipped to the plot. */
  max: number;
  y: (value: number) => number;
  slot: number;
  top: number;
  baseline: number;
  plotWidth: number;
  plotHeight: number;
  /** Fill for a hatched area (days with no answer yet), unique to this chart. */
  hatch: string;
};

/** An x-axis tick; the short label is used when ticks are packed too tightly for the full one. */
type XTick = { at: number; label: string; sub?: string; shortLabel?: string };

/** Day/month, e.g. "25/9": the compact date for crowded axes on phones. */
function numericDay(iso: string) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}

/** Below this spacing (px) between ticks the full "25 Sep" labels collide. */
const TIGHT_TICKS = 50;

// The top margin holds the "Elapsed" and "Today" labels on their own line, clear of the bar values.
const PAD = { top: 38, right: 10, left: 52 };
const MARKER_LINE = PAD.top - 22;

/**
 * The shared frame of every 46-day chart, drawn to one standard (WMO style): a zero-based y-axis
 * with ticks, gridlines and unit, axis lines, an x-axis with ticks and title, and the days already
 * gone shaded up to a dashed "Today" line: "Observed" where observations have replaced the forecast,
 * "Elapsed" where they have not arrived yet. Charts draw their marks inside it.
 */
function ChartFrame({
  units,
  maxValue,
  pastUnits,
  observedUnits = 0,
  xTicks,
  xLabel,
  xLabelTight,
  yLabel = "Rainfall (mm)",
  yTicks,
  height,
  children,
  onMouseLeave,
  ariaLabel,
}: {
  /** Number of equal slots across the x-axis: days or weeks. */
  units: number;
  maxValue: number;
  /** Slots already in the past (fractions allowed); 0 for none. */
  pastUnits: number;
  /** Of those, the leading slots holding observed rain instead of forecast. */
  observedUnits?: number;
  xTicks: XTick[];
  xLabel: string;
  /** The x-axis title when ticks are crowded and their second line (dates) is dropped. */
  xLabelTight?: string;
  yLabel?: string;
  /** Fixed y ticks from 0 (e.g. 0–7 days); otherwise rounded from `maxValue`. */
  yTicks?: number[];
  height: number;
  children: (scale: Scale) => ReactNode;
  onMouseLeave?: () => void;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const hatchId = `ss-hatch-${useId().replace(/:/g, "")}`;
  const { max, ticks } = yTicks?.length ? { max: yTicks[yTicks.length - 1], ticks: yTicks } : axisFor(maxValue);
  // Narrow charts (phones) give the y-axis less room so the bars get more.
  const left = width < 420 ? 42 : PAD.left;
  const right = width < 420 ? 6 : PAD.right;
  const plotWidth = Math.max(0, width - left - right);
  // Crowded ticks (phones): short labels, no second line, and single-line ticks thinned to every other.
  const tight = xTicks.length > 0 && plotWidth / xTicks.length < TIGHT_TICKS;
  const hasSub = xTicks.some((tick) => tick.sub) && !tight;
  const bottom = hasSub ? 52 : 40;
  const plotHeight = height - PAD.top - bottom;
  const slot = units ? plotWidth / units : 0;
  const baseline = PAD.top + plotHeight;
  const scale: Scale = {
    max,
    x: (unit) => left + unit * slot,
    y: (value) => baseline - (Math.min(Math.max(value, 0), max) / max) * plotHeight,
    slot,
    top: PAD.top,
    baseline,
    plotWidth,
    plotHeight,
    hatch: `url(#${hatchId})`,
  };
  const pastX = pastUnits > 0 ? scale.x(Math.min(pastUnits, units)) : null;
  const hasToday = pastX !== null && pastUnits < units;
  const observedX = observedUnits > 0 ? scale.x(Math.min(observedUnits, pastUnits || observedUnits, units)) : null;
  // Room for a band's label left of the "Today" label, or none when the band is too narrow.
  const labelRoom = (bandWidth: number, words: number) => bandWidth > (hasToday ? 44 + words : words);

  return (
    <div ref={ref} className="ss-frame">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={onMouseLeave}>
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="ss-hatch-ground" width="6" height="6" />
              <line className="ss-hatch-line" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          {observedX !== null ? (
            <g className="ss-frame-observed" aria-hidden="true">
              <rect x={left} y={PAD.top} width={observedX - left} height={plotHeight} />
              {labelRoom(observedX - left, 62) ? (
                <text className="ss-frame-observed-label" x={left + 4} y={MARKER_LINE}>
                  Observed
                </text>
              ) : null}
            </g>
          ) : null}
          {pastX !== null && (observedX === null || pastX > observedX + 0.5) ? (
            <g className={`ss-frame-past${observedX !== null ? " awaiting" : ""}`} aria-hidden="true">
              {/* Elapsed days still awaiting observations are hatched: forecast, but no longer ahead. */}
              <rect
                x={observedX ?? left}
                y={PAD.top}
                width={pastX - (observedX ?? left)}
                height={plotHeight}
                style={observedX !== null ? { fill: scale.hatch } : undefined}
              />
              {observedX === null && labelRoom(pastX - left, 56) ? (
                <text className="ss-frame-past-label" x={left + 4} y={MARKER_LINE}>
                  Elapsed
                </text>
              ) : null}
            </g>
          ) : null}
          {ticks.map((tick) => (
            <g key={tick}>
              {tick > 0 ? <line className="ss-frame-grid" x1={left} x2={left + plotWidth} y1={scale.y(tick)} y2={scale.y(tick)} /> : null}
              <line className="ss-frame-axis" x1={left - 5} x2={left} y1={scale.y(tick)} y2={scale.y(tick)} />
              <text className="ss-frame-tick" x={left - 8} y={scale.y(tick) + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {children(scale)}
          {/* axis lines over the marks */}
          <line className="ss-frame-axis" x1={left} x2={left} y1={PAD.top} y2={baseline} />
          <line className="ss-frame-axis" x1={left} x2={left + plotWidth} y1={baseline} y2={baseline} />
          {xTicks.map((tick, index) => {
            const at = scale.x(tick.at);
            const showLabel = !tight || tick.sub !== undefined || index % 2 === 0;
            return (
              <g key={`${tick.at}-${tick.label}`}>
                <line className="ss-frame-axis" x1={at} x2={at} y1={baseline} y2={baseline + 5} />
                {showLabel ? (
                  <text className={`ss-frame-tick${tick.sub ? " strong" : ""}`} x={at} y={baseline + 18} textAnchor="middle">
                    {tight ? (tick.shortLabel ?? tick.label) : tick.label}
                  </text>
                ) : null}
                {hasSub && tick.sub ? (
                  <text className="ss-frame-tick" x={at} y={baseline + 32} textAnchor="middle">
                    {tick.sub}
                  </text>
                ) : null}
              </g>
            );
          })}
          <text className="ss-frame-label" transform={`translate(14 ${PAD.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">
            {yLabel}
          </text>
          <text className="ss-frame-label" x={left + plotWidth / 2} y={height - 4} textAnchor="middle">
            {tight && xLabelTight ? xLabelTight : xLabel}
          </text>
          {hasToday ? (
            <g aria-hidden="true">
              <line className="ss-frame-today" x1={pastX} x2={pastX} y1={MARKER_LINE + 4} y2={baseline} />
              <text className="ss-frame-today-label" x={pastX} y={MARKER_LINE} textAnchor="middle">
                Today
              </text>
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}

/** Legend keys shared by the charts; each is a swatch class plus its words. */
function ChartLegend({ items }: { items: { key: string; label: string }[] }) {
  return (
    <div className="ss-frame-legend" aria-hidden="true">
      {items.map((item) => (
        <span key={item.key} className={`key ${item.key}`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * One ensemble box-and-whisker, ECMWF meteogram style: a thin whisker from the lowest to the highest
 * member, a box over the middle half (25th-75th percentile) and a tick at the median.
 */
function SpreadBox({
  spread,
  centre,
  width,
  y,
  axisMax,
  className = "",
}: {
  spread: SubseasonalSpread;
  centre: number;
  width: number;
  y: (value: number) => number;
  /** Top of the y-axis: a wettest member above it is labelled, since extremes must stay visible. */
  axisMax?: number;
  className?: string;
}) {
  const low = spread.p25 ?? spread.p50 ?? 0;
  const high = spread.p75 ?? spread.p50 ?? 0;
  const outerLow = spread.p10 ?? low;
  const outerHigh = spread.p90 ?? high;
  const top = y(high);
  const outerTop = y(outerHigh);
  const clipped = axisMax !== undefined && (spread.max ?? 0) > axisMax;
  return (
    <g className={`ss-spread ${className}`}>
      <line className="ss-spread-whisker" x1={centre} x2={centre} y1={y(spread.min ?? low)} y2={y(spread.max ?? high)} />
      {/* ECMWF meteogram layout: a narrow 10-90% box behind the wide 25-75% box. */}
      <rect className="ss-spread-outer" x={centre - width / 4} y={outerTop} width={width / 2} height={Math.max(1, y(outerLow) - outerTop)} />
      <rect className="ss-spread-box" x={centre - width / 2} y={top} width={width} height={Math.max(1, y(low) - top)} />
      {spread.p50 !== null && spread.p50 !== undefined ? (
        <line className="ss-spread-median" x1={centre - width / 2} x2={centre + width / 2} y1={y(spread.p50)} y2={y(spread.p50)} />
      ) : null}
      {clipped ? (
        <text className="ss-spread-clipped" x={centre} y={y(axisMax) - 3} textAnchor="middle">
          {Math.round(spread.max ?? 0)}
        </text>
      ) : null}
    </g>
  );
}

/** Colour ramps for chance bars, matching the map legends (edges in %). */
const CHANCE_RAMPS: Record<string, { edges: number[]; colors: string[] }> = {
  // Rain days: the map's rainy-day ramp; rain amounts: its rain-chance ramp.
  rainy: { edges: [10, 20, 40, 60, 80], colors: ["#cfeefa", "#9bd9f2", "#5cbbe6", "#2f96d4", "#2a6fc0"] },
  rain: { edges: [10, 20, 40, 60, 80], colors: ["#cfeefa", "#9bd9f2", "#5cbbe6", "#2f96d4", "#3e4ca8"] },
  dry: { edges: [10, 20, 40, 60, 80], colors: ["#fbe7a6", "#f8cf6a", "#f0a945", "#de7d2c", "#c0531f"] },
  wet: { edges: [10, 20, 40, 60, 80], colors: ["#d4f0e3", "#a3dfc8", "#6cc7ac", "#3aa894", "#1f8580"] },
  extreme: { edges: [5, 10, 20, 40, 60], colors: ["#fde68a", "#fbbf24", "#f97316", "#dc2626", "#7e22ce"] },
};

/** The map's colour for a chance, so a bar and the map agree; pale grey below the lowest class. */
function chanceFill(value: number, tone: string) {
  const ramp = CHANCE_RAMPS[tone];
  if (!ramp) {
    return undefined;
  }
  let color = "#dbe3eb";
  ramp.edges.forEach((edge, position) => {
    if (value >= edge) {
      color = ramp.colors[position];
    }
  });
  return color;
}

/** "Median 3.2 mm · middle half 1–5 mm · range 0.4–18 mm": the spread in words for readouts and tooltips. */
function spreadText(spread: SubseasonalSpread | null | undefined, unit: "mm" | "days" = "mm") {
  if (!spread) {
    return "";
  }
  const amount = (value: number | null | undefined) => (unit === "days" ? `${dayCount(value)} days` : formatAmount(value, "mm"));
  const bare = (value: number | null | undefined) => (unit === "days" ? dayCount(value) : short(value));
  return `Median ${amount(spread.p50)} · middle half ${bare(spread.p25)}–${amount(spread.p75)} · range ${bare(spread.min)}–${amount(spread.max)}`;
}

/** A number without its unit, for ranges that name the unit once. */
function short(value: number | null | undefined) {
  return formatAmount(value, "mm").replace(/ mm$/, "");
}

/** A day count from a spread (members' average can be fractional): "4", "4.3". */
function dayCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "–";
  }
  return String(Math.round(value * 10) / 10);
}

/** Top of a spread chart's axis: the 90th percentile with headroom, so one wild member doesn't flatten the rest. */
function spreadAxisMax(spreads: (SubseasonalSpread | null | undefined)[], floor: number) {
  const values = spreads.map((spread) => Math.max(spread?.p90 ?? 0, spread?.p75 ?? 0, spread?.mean ?? 0));
  return Math.max(floor, ...values) * 1.25;
}

function periodTitle(series: SubseasonalSeries) {
  const first = series.days[0];
  const last = series.days[series.days.length - 1];
  return first && last ? `${formatRange(first.date, last.date)} ${last.date.slice(0, 4)}` : "";
}

/**
 * Daily rainfall bars on the standard frame, with dry/wet spell bands (or the onset burst). The
 * current timeline day is highlighted; clicking a bar seeks the map to that day.
 */
export function RainChart({
  series,
  currentDay,
  onSelectDay,
  onset,
  bands = "both",
  extremeMm,
  lineLabel,
  centre = "mean",
  title: titleOverride,
}: {
  /** The chart's title; by default it names what the chart shows. */
  title?: string;
  series: SubseasonalSeries;
  currentDay: number | null;
  onSelectDay: (day: number) => void;
  /** Marks the onset burst and replaces the spell bands (onset layer). */
  onset?: SubseasonalOnset | null;
  /** Which spell bands to shade: a spell layer shows its own kind only. */
  bands?: "both" | "none" | SpellKind;
  /** Draws the extreme-rain threshold as a second line (Extreme rain layer). */
  extremeMm?: number;
  /** Legend words for that line (default: the extreme threshold). */
  lineLabel?: string;
  /** Ensemble runs: the line through the boxes follows the members' mean or their median. */
  centre?: "mean" | "median";
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const days = series.days;
  // Ensemble runs: a box-and-whisker per day and a line through the members' mean.
  const ensemble = days.some((day) => day.spread);
  const centreOf = (day: SubseasonalSeries["days"][number]) => (centre === "median" ? (day.spread?.p50 ?? null) : day.value);
  const pastDays = pastDayCount(series, todayIso());
  // Elapsed days with observed rain: one certain amount each, drawn as a bar rather than a spread.
  const observedDays = observedDayCount(series);
  const threshold = series.thresholds.wet_day_mm;
  const focus = days[(hoverDay ?? currentDay ?? 0) - 1] ?? null;
  const spells =
    onset !== undefined || bands === "none" ? [] : series.spells.filter((spell) => bands === "both" || spell.kind === bands);
  const title =
    titleOverride ??
    (onset !== undefined
      ? "Daily rain and onset (mm)"
      : bands === "dry"
        ? "Daily rain and dry spells (mm)"
        : bands === "wet"
          ? "Daily rain and wet spells (mm)"
          : "Daily rain (mm)");
  const observedPeak = Math.max(0, ...days.slice(0, observedDays).map((day) => day.value ?? 0));
  const maxValue = ensemble
    ? Math.max(
        spreadAxisMax(days.slice(observedDays).map((day) => day.spread), Math.max(threshold * 2, extremeMm ? extremeMm * 1.1 : 0)),
        observedPeak * 1.1,
      )
    : Math.max(threshold * 2, extremeMm ? extremeMm * 1.1 : 0, ...days.map((day) => day.value ?? 0));
  const focusObserved = Boolean(focus?.observed);

  return (
    <figure className="ss-chart" data-testid="subseasonal-chart">
      <figcaption className="ss-frame-title">
        <strong>{title}</strong>
        <span className="ss-frame-period">{periodTitle(series)}</span>
      </figcaption>
      <div className="ss-chart-readout" aria-live="polite">
        {focus ? (
          <>
            <strong>{formatAmount(ensemble && !focusObserved ? centreOf(focus) : focus.value, "mm")}</strong>
            <span>
              {formatDay(focus.date, "weekday")}
              {focusObserved ? " · observed" : ensemble ? ` · ${centre}` : ""}
              {focus.spell ? ` · ${focus.spell} spell` : ""}
            </span>
            {focusObserved ? (
              focus.forecast_value !== null && focus.forecast_value !== undefined ? (
                <span className="ss-chart-spread-text">
                  Forecast{ensemble ? " mean" : ""} was {formatAmount(focus.forecast_value, "mm")}
                </span>
              ) : null
            ) : focus.spread ? (
              <span className="ss-chart-spread-text">{spreadText(focus.spread)}</span>
            ) : null}
          </>
        ) : null}
      </div>
      <ChartFrame
        units={days.length}
        maxValue={maxValue}
        pastUnits={pastDays}
        observedUnits={observedDays}
        xTicks={series.weeks.map((week) => ({
          at: week.start_day - 1,
          label: formatDay(week.start_date, "compact"),
          shortLabel: numericDay(week.start_date),
        }))}
        xLabel="Date"
        height={244}
        onMouseLeave={() => setHoverDay(null)}
        ariaLabel={`Daily rainfall for ${days.length} days, total ${formatAmount(series.metrics.total_mm, "mm")}`}
      >
        {({ x, y, slot, top, baseline, plotHeight, plotWidth, max }) => {
          const barWidth = Math.max(2, slot * 0.72);
          return (
            <>
              {onset ? (
                <g data-testid="subseasonal-onset-marker">
                  <rect
                    className="ss-chart-band onset"
                    x={x(onset.day - 1)}
                    y={top}
                    width={Math.min(series.thresholds.onset_window_days ?? 3, days.length - onset.day + 1) * slot}
                    height={plotHeight}
                  />
                  <line className="ss-chart-onset" x1={x(onset.day - 1)} x2={x(onset.day - 1)} y1={top} y2={baseline} />
                </g>
              ) : null}
              {spells.map((spell) => (
                <rect
                  key={`${spell.kind}-${spell.start_day}`}
                  className={`ss-chart-band ${spell.kind}`}
                  x={x(spell.start_day - 1)}
                  y={top}
                  width={(spell.end_day - spell.start_day + 1) * slot}
                  height={plotHeight}
                />
              ))}
              <line className="ss-chart-threshold" x1={x(0)} x2={x(0) + plotWidth} y1={y(threshold)} y2={y(threshold)} />
              {extremeMm ? (
                <line className={`ss-chart-threshold extreme${lineLabel ? " ss-amount-line" : ""}`} x1={x(0)} x2={x(0) + plotWidth} y1={y(extremeMm)} y2={y(extremeMm)} />
              ) : null}
              {ensemble ? (
                <>
                  {days.map((day, index) =>
                    day.day <= observedDays ? (
                      <ObservedBar
                        key={day.day}
                        value={day.value}
                        wet={(day.value ?? 0) >= threshold}
                        x={x(index) + (slot - barWidth) / 2}
                        width={barWidth}
                        y={y}
                        baseline={baseline}
                        className={`${day.day === currentDay ? " current" : ""}${hoverDay === day.day ? " hover" : ""}`}
                      />
                    ) : day.spread ? (
                      <SpreadBox
                        key={day.day}
                        spread={day.spread}
                        centre={x(index) + slot / 2}
                        width={Math.max(2, slot * 0.6)}
                        y={y}
                        axisMax={max}
                        className={`${day.day <= pastDays ? "past" : ""}${day.day === currentDay ? " current" : ""}${hoverDay === day.day ? " hover" : ""}`}
                      />
                    ) : null,
                  )}
                  {/* The members' mean (or median) through the forecast days only: observed days have no spread to summarise. */}
                  <polyline
                    className="ss-spread-mean"
                    points={days
                      .slice(observedDays)
                      .map((day, index) => `${x(index + observedDays) + slot / 2},${y(centreOf(day) ?? 0)}`)
                      .join(" ")}
                  />
                  {days.map((day, index) => (
                    <rect
                      key={`hit-${day.day}`}
                      className="ss-chart-hit"
                      x={x(index)}
                      y={top}
                      width={slot}
                      height={plotHeight}
                      onMouseEnter={() => setHoverDay(day.day)}
                      onClick={() => onSelectDay(day.day)}
                    >
                      <title>{dayTitle(day, day.observed ? day.value : centreOf(day))}</title>
                    </rect>
                  ))}
                </>
              ) : null}
              {ensemble ? null : days.map((day, index) => {
                const value = day.value ?? 0;
                const isPast = day.day <= pastDays;
                return (
                  <g key={day.day}>
                    {day.day <= observedDays ? (
                      <ObservedBar
                        value={day.value}
                        wet={Boolean(day.wet)}
                        x={x(index) + (slot - barWidth) / 2}
                        width={barWidth}
                        y={y}
                        baseline={baseline}
                        className={`${day.day === currentDay ? " current" : ""}${hoverDay === day.day ? " hover" : ""}`}
                      />
                    ) : (
                      <rect
                        className={`ss-chart-bar${day.wet ? " wet" : ""}${isPast ? " past" : ""}${day.day === currentDay ? " current" : ""}${hoverDay === day.day ? " hover" : ""}`}
                        x={x(index) + (slot - barWidth) / 2}
                        y={y(value)}
                        width={barWidth}
                        height={Math.max(baseline - y(value), value > 0 ? 1 : 0)}
                      />
                    )}
                    <rect
                      className="ss-chart-hit"
                      x={x(index)}
                      y={top}
                      width={slot}
                      height={plotHeight}
                      onMouseEnter={() => setHoverDay(day.day)}
                      onClick={() => onSelectDay(day.day)}
                    >
                      <title>{dayTitle(day, day.value)}</title>
                    </rect>
                  </g>
                );
              })}
            </>
          );
        }}
      </ChartFrame>
      <ChartLegend
        items={[
          ...(ensemble
            ? [
                { key: "spread-box", label: "25–75%" },
                { key: "spread-outer", label: "10–90%" },
                { key: "spread-whisker", label: "Min–max" },
                { key: "spread-mean", label: centre === "median" ? "Median" : "Mean" },
              ]
            : [
                { key: "rain-day", label: `≥${threshold} mm` },
                { key: "low-rain", label: `<${threshold} mm` },
              ]),
          ...(extremeMm ? [{ key: lineLabel ? "extreme-line amount-line" : "extreme-line", label: lineLabel ?? `${extremeMm} mm` }] : []),
          ...(onset !== undefined
            ? [{ key: "band-onset", label: "Onset" }]
            : [
                ...(bands === "both" || bands === "dry" ? [{ key: "band-dry", label: "Dry spell" }] : []),
                ...(bands === "both" || bands === "wet" ? [{ key: "band-wet", label: "Wet spell" }] : []),
              ]),
          ...pastLegend(pastDays, observedDays),
        ]}
      />
    </figure>
  );
}

/** Legend keys for the shaded past: observed rain, and elapsed days still awaiting observations. */
function pastLegend(pastDays: number, observedDays: number) {
  return [
    ...(observedDays > 0 ? [{ key: "observed", label: "Observed" }] : []),
    ...(pastDays > observedDays ? [observedDays > 0 ? { key: "awaiting", label: "Awaiting obs." } : { key: "past", label: "Elapsed" }] : []),
  ];
}

/** A day's tooltip: its amount, and for an observed day what had been forecast. */
function dayTitle(day: SubseasonalSeries["days"][number], amount: number | null | undefined) {
  const base = `${formatDay(day.date, "weekday")} · ${formatAmount(amount, "mm")}`;
  if (!day.observed) return base;
  const forecast = day.forecast_value !== null && day.forecast_value !== undefined ? `; forecast ${formatAmount(day.forecast_value, "mm")}` : "";
  return `${base} observed${forecast}`;
}

/**
 * One elapsed day's observed rain: a solid bar in the "observed" ink, so what has happened reads
 * apart from the forecast's boxes at a glance. Dry days get a pale stub rather than nothing.
 */
function ObservedBar({
  value,
  wet,
  x,
  width,
  y,
  baseline,
  className = "",
}: {
  value: number | null | undefined;
  wet: boolean;
  x: number;
  width: number;
  y: (value: number) => number;
  baseline: number;
  className?: string;
}) {
  const amount = value ?? 0;
  return (
    <rect
      className={`ss-observed-bar${wet ? " wet" : ""}${className}`}
      x={x}
      y={y(amount)}
      width={width}
      height={Math.max(baseline - y(amount), 1.5)}
    />
  );
}

/** "Week 1" for a full week; the short last week gets an asterisk, explained under the chart. */
export function weekTitle(week: SubseasonalSeries["weeks"][number]) {
  return week.partial ? `Week ${week.week}*` : `Week ${week.week}`;
}

export type WeeklyTone = "rain" | "dry" | "wet" | "rainy" | "extreme";

/**
 * One value per forecast week as a standard bar chart on the shared frame, with the value on each
 * bar: rainfall totals, or counts of dry-spell, wet-spell or rain days. The week shown on the map is
 * drawn darker; clicking a bar shows that week on the map.
 */
export function WeeklyChart({
  series,
  values,
  currentWeek,
  onSelectWeek,
  title,
  yLabel,
  legend,
  unit,
  tone,
  maxValue,
  spreads,
  centreLabel = "Ensemble mean",
  lineMm,
  lineLabel,
  lineTone = "amount",
}: {
  /** A dashed amount line (the amount a Chance view counts), with its legend words. */
  lineMm?: number;
  lineLabel?: string;
  /** "extreme": the red extreme-rain line, as on the daily chart; "amount": a chosen amount (dark). */
  lineTone?: "amount" | "extreme";
  series: SubseasonalSeries;
  /** One value per entry of `series.weeks`. */
  values: (number | null)[];
  /** Ensembles: a box-and-whisker per week (rain amounts or day counts), with `values` (mean or median) as the dot. */
  spreads?: (SubseasonalSpread | null | undefined)[];
  centreLabel?: string;
  currentWeek: number | null;
  onSelectWeek?: (week: number) => void;
  title: string;
  yLabel: string;
  legend: string;
  unit: "mm" | "days" | "%";
  tone: WeeklyTone;
  /** Top of the y-axis; defaults to the largest value plus headroom. */
  maxValue?: number;
}) {
  const weeks = series.weeks;
  const pastDays = pastDayCount(series, todayIso());
  const observedDays = observedDayCount(series);
  const partial = weeks.find((week) => week.partial);
  // The past boundary in week slots: whole weeks gone plus the gone share of the current one.
  const pastUnits = weekUnits(weeks, pastDays);
  const observedUnits = weekUnits(weeks, observedDays);
  // A week wholly observed has one certain value; one partly observed mixes observed and forecast days.
  const fullyObserved = (week: SubseasonalSeries["weeks"][number]) => observedDays >= week.end_day;
  const mixed = weeks.find((week) => !fullyObserved(week) && observedDays >= week.start_day);
  const describe = (value: number | null) =>
    unit === "mm" ? formatAmount(value, "mm") : unit === "%" ? `${Math.round(value ?? 0)}%` : `${dayCount(value ?? 0)} days`;
  const hasSpread = Boolean(spreads?.some(Boolean));

  return (
    <figure className={`ss-chart tone-${tone}`} data-testid="subseasonal-weekly-chart">
      <figcaption className="ss-frame-title">
        <strong>{title}</strong>
        <span className="ss-frame-period">{periodTitle(series)}</span>
      </figcaption>
      <div data-testid="subseasonal-weeks">
        <ChartFrame
          units={weeks.length}
          maxValue={
            maxValue ??
            Math.max(lineMm ? lineMm * 1.1 : 0, hasSpread ? spreadAxisMax(spreads ?? [], 1) : Math.max(1, ...values.map((value) => value ?? 0)) * 1.1)
          }
          pastUnits={pastUnits}
          observedUnits={observedUnits}
          xTicks={weeks.map((week, index) => ({
            at: index + 0.5,
            label: `Wk ${week.week}${week.partial ? "*" : ""}`,
            shortLabel: `W${week.week}${week.partial ? "*" : ""}`,
            sub: formatDay(week.start_date, "compact"),
          }))}
          xLabel="Week starting"
          xLabelTight={weeks[0] ? `Week (W1 starts ${formatDay(weeks[0].start_date, "compact")})` : "Week"}
          yLabel={yLabel}
          yTicks={unit === "days" ? [0, 1, 2, 3, 4, 5, 6, 7] : unit === "%" ? [0, 20, 40, 60, 80, 100] : undefined}
          height={264}
          ariaLabel={`${title} for ${weeks.length} weeks`}
        >
          {({ x, y, slot, baseline, top, plotHeight, max, plotWidth }) => {
            const barWidth = slot * 0.62;
            const marks = weeks.map((week, index) => {
              const raw = values[index] ?? null;
              const value = raw ?? 0;
              const centre = x(index) + slot / 2;
              const isPast = week.end_day <= pastDays;
              const observed = fullyObserved(week);
              return (
                <g
                  key={week.week}
                  className={`ss-week${week.week === currentWeek ? " current" : ""}${isPast ? " past" : ""}${observed ? " observed" : ""}${onSelectWeek ? " selectable" : ""}`}
                  onClick={() => onSelectWeek?.(week.week)}
                >
                  <title>
                    {observed
                      ? `${weekTitle(week)} · ${describe(raw)} observed`
                      : `${weekTitle(week)} · ${describe(raw)}${hasSpread && spreads?.[index] && unit !== "%" ? ` · ${spreadText(spreads[index], unit)}` : ""}`}
                  </title>
                  {observed ? (
                    <>
                      <rect
                        className="ss-observed-bar wet"
                        x={centre - barWidth / 2}
                        y={y(value)}
                        width={barWidth}
                        height={Math.max(baseline - y(value), 1.5)}
                      />
                      <text className="ss-week-value" x={centre} y={y(value) - 5} textAnchor="middle">
                        {raw === null || (unit === "%" && Math.round(value) === 0) ? "" : `${Math.round(value)}${unit === "%" ? "%" : ""}`}
                      </text>
                    </>
                  ) : hasSpread && spreads?.[index] ? (
                    <>
                      <SpreadBox spread={spreads[index]!} centre={centre} width={barWidth} y={y} axisMax={max} />
                      <circle className="ss-spread-mean-dot" cx={centre} cy={y(value)} r={3.5} />
                    </>
                  ) : (
                    <>
                      <rect
                        className="ss-week-bar"
                        x={centre - barWidth / 2}
                        y={y(value)}
                        width={barWidth}
                        height={baseline - y(value)}
                        style={unit === "%" ? { fill: chanceFill(value, tone) } : undefined}
                      />
                      <text className="ss-week-value" x={centre} y={y(value) - 5} textAnchor="middle">
                        {raw === null || (unit === "%" && Math.round(value) === 0) ? "" : `${Math.round(value)}${unit === "%" ? "%" : ""}`}
                      </text>
                    </>
                  )}
                  <rect className="ss-chart-hit" x={x(index)} y={top} width={slot} height={plotHeight} />
                </g>
              );
            });
            return (
              <>
                {unit === "%" ? <EvenOddsLine x1={x(0)} x2={x(0) + plotWidth} y={y(50)} /> : null}
                {marks}
                {lineMm ? (
                  <line
                    className={`ss-chart-threshold extreme${lineTone === "amount" ? " ss-amount-line" : ""}`}
                    x1={x(0)}
                    x2={x(0) + plotWidth}
                    y1={y(lineMm)}
                    y2={y(lineMm)}
                  />
                ) : null}
              </>
            );
          }}
        </ChartFrame>
      </div>
      <ChartLegend
        items={[
          ...(hasSpread
            ? [
                { key: "spread-box", label: "25–75%" },
                { key: "spread-outer", label: "10–90%" },
                { key: "spread-whisker", label: "Min–max" },
                { key: "spread-mean-dot", label: centreLabel },
              ]
            : [{ key: unit === "%" ? "chance" : "week", label: legend }]),
          ...(lineMm ? [{ key: lineTone === "amount" ? "extreme-line amount-line" : "extreme-line", label: lineLabel ?? `${lineMm} mm` }] : []),
          ...(currentWeek && !hasSpread ? [{ key: "week-current", label: "On map" }] : []),
          ...pastLegend(pastDays, observedDays),
        ]}
      />
      {partial || mixed ? (
        <p className="ss-frame-note">
          {partial ? `* ${partial.days} days (${formatRange(partial.start_date, partial.end_date)})` : null}
          {partial && mixed ? " · " : null}
          {mixed
            ? `Wk ${mixed.week} counts ${observedDays - mixed.start_day + 1} observed day${observedDays - mixed.start_day + 1 === 1 ? "" : "s"} with the forecast`
            : null}
        </p>
      ) : null}
    </figure>
  );
}

/** Each week's wettest day, against the extreme-rain amount: box plots across members for an ensemble. */
export function WeeklyWettestDayChart({
  series,
  currentWeek,
  onSelectWeek,
  thresholdMm,
}: {
  series: SubseasonalSeries;
  currentWeek: number | null;
  onSelectWeek?: (week: number) => void;
  thresholdMm: number;
}) {
  const wettest = weeklyWettestDay(series);
  const hasSpread = wettest.some((week) => week.spread);
  return (
    <WeeklyChart
      series={series}
      values={wettest.map((week) => week.value)}
      spreads={hasSpread ? wettest.map((week) => week.spread) : undefined}
      centreLabel="Mean"
      lineMm={thresholdMm}
      lineLabel={`${thresholdMm} mm`}
      lineTone="extreme"
      currentWeek={currentWeek}
      onSelectWeek={onSelectWeek}
      title="Wettest day each week (mm)"
      yLabel="Rainfall (mm)"
      legend="Wettest day"
      unit="mm"
      tone="rain"
    />
  );
}

/** Weekly rainfall totals. */
export function WeeklyRainChart({
  series,
  currentWeek,
  onSelectWeek,
  centre = "mean",
  lineMm,
  lineLabel,
  title = "Weekly rain (mm)",
}: {
  title?: string;
  series: SubseasonalSeries;
  currentWeek: number | null;
  onSelectWeek?: (week: number) => void;
  /** Ensemble runs: the dot marks the members' mean or their median. */
  centre?: "mean" | "median";
  lineMm?: number;
  lineLabel?: string;
}) {
  return (
    <WeeklyChart
      series={series}
      values={series.weeks.map((week) => (centre === "median" && week.spread ? (week.spread.p50 ?? null) : week.value))}
      spreads={series.weeks.map((week) => week.spread)}
      centreLabel={centre === "median" ? "Median" : "Mean"}
      lineMm={lineMm}
      lineLabel={lineLabel}
      currentWeek={currentWeek}
      onSelectWeek={onSelectWeek}
      title={title}
      yLabel="Rainfall (mm)"
      legend="Weekly total"
      unit="mm"
      tone="rain"
    />
  );
}

/**
 * A chance (0-100%) per day: of an extreme-rain day, a rain day, or a spell. For a single run the
 * bars are simply 0 or 100 (forecast or not). Observed (elapsed) days are certain, 0 or 100, and
 * drawn in the observed ink so they read as fact, not probability. With `line`, a second chance is
 * drawn over the bars as a line: the spell charts show the chance a spell *starts* each day as bars
 * and the chance of being *in* one as the line. Clicking a day seeks the map to it.
 */
export function DailyChanceChart({
  series,
  values,
  currentDay,
  onSelectDay,
  title,
  legend,
  tone,
  cumulative = false,
  line,
  lineLabel,
  judgeableUntil,
  observedWords,
  note,
}: {
  /** The values are a chance "by this date" (they only rise): same bars, worded "by" in the readout. */
  cumulative?: boolean;
  series: SubseasonalSeries;
  /** One % per entry of `series.days`. */
  values: (number | null | undefined)[];
  currentDay: number | null;
  onSelectDay: (day: number) => void;
  title: string;
  /** Legend words for the bars. */
  legend: string;
  tone: "extreme" | "dry" | "wet" | "rainy";
  /** A second chance per day, drawn as a line over the bars (0-100 on the same axis). */
  line?: (number | null | undefined)[];
  lineLabel?: string;
  /** Bars after this day cannot be judged inside the run (a spell starting there would run past its end): hatched. */
  judgeableUntil?: number;
  /** Readout words for an observed day: what happened ("In a dry spell") and what did not. */
  observedWords?: { yes: string; no: string };
  /** A line under the chart explaining what it shows. */
  note?: string;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const memberCount = series.members ?? 1;
  const days = series.days;
  const pastDays = pastDayCount(series, todayIso());
  const observedDays = observedDayCount(series);
  const focusDay = hoverDay ?? currentDay;
  const focus = focusDay ? days[focusDay - 1] : null;
  const focusValue = focusDay ? values[focusDay - 1] : null;
  const focusLine = focusDay && line ? line[focusDay - 1] : null;
  const focusObserved = Boolean(focus && focus.day <= observedDays);
  // An observed day is a plain yes or no, unless the spell it belongs to depends on days still ahead.
  const focusCertainValue = line ? focusLine : focusValue;
  const focusCertain = focusObserved && (Math.round(focusCertainValue ?? 0) === 0 || Math.round(focusCertainValue ?? 0) === 100);
  const unjudged = (day: number) => judgeableUntil !== undefined && day > judgeableUntil;
  const members = (value: number | null | undefined) =>
    memberCount > 1 && series.kind === "point" ? ` · ${Math.round(((value ?? 0) / 100) * memberCount)}/${memberCount} members` : "";
  return (
    <figure className={`ss-chart tone-${tone}${line ? " with-line" : ""}`} data-testid="subseasonal-chance-chart">
      <figcaption className="ss-frame-title">
        <strong>{title}</strong>
        <span className="ss-frame-period">{periodTitle(series)}</span>
      </figcaption>
      <div className="ss-chart-readout" aria-live="polite">
        {focus ? (
          focusCertain && observedWords ? (
            <>
              <strong>{focusCertainValue ? observedWords.yes : observedWords.no}</strong>
              <span>{formatDay(focus.date, "weekday")} · observed</span>
            </>
          ) : line ? (
            <>
              <strong>{Math.round(focusLine ?? 0)}%</strong>
              <span>
                {lineLabel ?? "line"} · {formatDay(focus.date, "weekday")}
              </span>
              <span className="ss-chart-spread-text">
                {unjudged(focus.day) ? "Too close to the end of the run to tell if one starts" : `${Math.round(focusValue ?? 0)}% ${legend.toLowerCase()}`}
                {members(focusValue)}
              </span>
            </>
          ) : (
            <>
              <strong>{Math.round(focusValue ?? 0)}%</strong>
              <span>
                {cumulative ? "by " : ""}
                {formatDay(focus.date, "weekday")}
                {focusObserved ? " · observed" : members(focusValue)}
              </span>
            </>
          )
        ) : null}
      </div>
      <ChartFrame
        units={days.length}
        maxValue={100}
        yTicks={[0, 20, 40, 60, 80, 100]}
        pastUnits={pastDays}
        observedUnits={observedDays}
        xTicks={series.weeks.map((week) => ({
          at: week.start_day - 1,
          label: formatDay(week.start_date, "compact"),
          shortLabel: numericDay(week.start_date),
        }))}
        xLabel="Date"
        yLabel="Chance (%)"
        height={line ? 224 : 204}
        onMouseLeave={() => setHoverDay(null)}
        ariaLabel={`${title} for ${days.length} days`}
      >
        {({ x, y, slot, top, baseline, plotHeight, plotWidth, hatch }) => {
          const barWidth = Math.max(2, slot * (line ? 0.6 : 0.72));
          const hits = days.map((day, index) => (
            <rect
              key={`hit-${day.day}`}
              className="ss-chart-hit"
              x={x(index)}
              y={top}
              width={slot}
              height={plotHeight}
              onMouseEnter={() => setHoverDay(day.day)}
              onClick={() => onSelectDay(day.day)}
            >
              <title>{chanceTitle(day, values[index], line?.[index], legend, lineLabel, cumulative, day.day <= observedDays, unjudged(day.day))}</title>
            </rect>
          ));
          const firstUnjudged = judgeableUntil !== undefined && judgeableUntil < days.length ? judgeableUntil : null;
          const bars = days.map((day, index) => {
            const value = values[index] ?? 0;
            const observed = day.day <= observedDays;
            if (unjudged(day.day)) {
              return null;
            }
            return (
              <rect
                key={day.day}
                className={`ss-chance-bar${observed ? " observed" : day.day <= pastDays ? " past" : ""}${day.day === currentDay ? " current" : ""}${hoverDay === day.day ? " hover" : ""}`}
                x={x(index) + (slot - barWidth) / 2}
                y={y(value)}
                width={barWidth}
                height={Math.max(baseline - y(value), value > 0 ? 1 : 0)}
                style={observed ? undefined : { fill: chanceFill(value, tone) }}
              />
            );
          });
          const linePoints = line
            ? days.map((day, index) => ({ day: day.day, cx: x(index) + slot / 2, cy: y(line[index] ?? 0) }))
            : [];
          const markedPoint = focusDay && line ? linePoints[focusDay - 1] : null;
          return (
            <>
              <EvenOddsLine x1={x(0)} x2={x(0) + plotWidth} y={y(50)} />
              {firstUnjudged !== null ? (
                <g className="ss-unjudged" aria-hidden="true">
                  <rect x={x(firstUnjudged)} y={top} width={x(days.length) - x(firstUnjudged)} height={plotHeight} style={{ fill: hatch }} />
                </g>
              ) : null}
              {bars}
              {line ? (
                <>
                  <polyline className="ss-chance-line" points={linePoints.map((point) => `${point.cx},${point.cy}`).join(" ")} />
                  {markedPoint ? <circle className="ss-chance-line-dot" cx={markedPoint.cx} cy={markedPoint.cy} r={4} /> : null}
                </>
              ) : null}
              {hits}
            </>
          );
        }}
      </ChartFrame>
      <ChartLegend
        items={[
          { key: "chance", label: legend },
          ...(line ? [{ key: "spell-line", label: lineLabel ?? "" }] : []),
          ...(judgeableUntil !== undefined && judgeableUntil < days.length ? [{ key: "unjudged", label: "Can't tell yet" }] : []),
          ...pastLegend(pastDays, observedDays),
        ]}
      />
      {note ? <p className="ss-frame-note">{note}</p> : null}
    </figure>
  );
}

/** A chance chart's tooltip for one day. */
function chanceTitle(
  day: SubseasonalSeries["days"][number],
  value: number | null | undefined,
  lineValue: number | null | undefined,
  legend: string,
  lineLabel: string | undefined,
  cumulative: boolean,
  observed: boolean,
  unjudged: boolean,
) {
  const when = `${cumulative ? "By " : ""}${formatDay(day.date, "weekday")}`;
  const parts = [`${when} · ${unjudged ? "can't tell yet" : `${Math.round(value ?? 0)}%`}${lineValue !== undefined && lineLabel ? ` ${legend.toLowerCase()}` : ""}`];
  if (lineValue !== undefined && lineLabel) {
    parts.push(`${Math.round(lineValue ?? 0)}% ${lineLabel.toLowerCase()}`);
  }
  return `${parts.join(" · ")}${observed ? " (observed)" : ""}`;
}

/** A faint 50% guide on chance charts: above it, more members reach the amount than not. */
function EvenOddsLine({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g className="ss-even-odds" aria-hidden="true">
      <line x1={x1} x2={x2} y1={y} y2={y} />
      <text x={x2 - 2} y={y - 4} textAnchor="end">
        50%
      </text>
    </g>
  );
}
