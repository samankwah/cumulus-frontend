"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { formatAmount, formatDay, formatRange, pastDayCount, todayIso } from "@/lib/subseasonal";
import type { SpellKind, SubseasonalOnset, SubseasonalSeries } from "@/lib/subseasonal";

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
  y: (value: number) => number;
  slot: number;
  top: number;
  baseline: number;
  plotWidth: number;
  plotHeight: number;
};

/** An x-axis tick; the short label is used when ticks are packed too tightly for the full one. */
type XTick = { at: number; label: string; sub?: string; shortLabel?: string };

/** Day/month, e.g. "25/9": the compact date for crowded axes on phones. */
function numericDay(iso: string) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}

/** Below this spacing (px) between ticks the full "25 Sep" labels collide. */
const TIGHT_TICKS = 50;

// The top margin holds the "Past" and "Today" labels on their own line, clear of the bar values.
const PAD = { top: 38, right: 10, left: 52 };
const MARKER_LINE = PAD.top - 22;

/**
 * The shared frame of every 46-day chart, drawn to one standard (WMO style): a zero-based y-axis
 * with ticks, gridlines and unit, axis lines, an x-axis with ticks and title, and the forecast days
 * already gone shaded as "Past" up to a dashed "Today" line. Charts draw their marks inside it.
 */
function ChartFrame({
  units,
  maxValue,
  pastUnits,
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
    x: (unit) => left + unit * slot,
    y: (value) => baseline - (Math.min(Math.max(value, 0), max) / max) * plotHeight,
    slot,
    top: PAD.top,
    baseline,
    plotWidth,
    plotHeight,
  };
  const pastX = pastUnits > 0 ? scale.x(Math.min(pastUnits, units)) : null;
  const hasToday = pastX !== null && pastUnits < units;

  return (
    <div ref={ref} className="ss-frame">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={onMouseLeave}>
          {pastX !== null ? (
            <g className="ss-frame-past" aria-hidden="true">
              <rect x={left} y={PAD.top} width={pastX - left} height={plotHeight} />
              {/* Room for "Past" left of the "Today" label, or none when the band is too narrow. */}
              {pastX - left > (pastUnits < units ? 76 : 36) ? (
                <text className="ss-frame-past-label" x={left + 4} y={MARKER_LINE}>
                  Past
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
}: {
  series: SubseasonalSeries;
  currentDay: number | null;
  onSelectDay: (day: number) => void;
  /** Marks the onset burst and replaces the spell bands (onset layer). */
  onset?: SubseasonalOnset | null;
  /** Which spell bands to shade: a spell layer shows its own kind only. */
  bands?: "both" | "none" | SpellKind;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const days = series.days;
  const pastDays = pastDayCount(series, todayIso());
  const threshold = series.thresholds.wet_day_mm;
  const focus = days[(hoverDay ?? currentDay ?? 0) - 1] ?? null;
  const spells =
    onset !== undefined || bands === "none" ? [] : series.spells.filter((spell) => bands === "both" || spell.kind === bands);
  const title =
    onset !== undefined
      ? "Daily rainfall and onset (mm)"
      : bands === "dry"
        ? "Daily rainfall and dry spells (mm)"
        : bands === "wet"
          ? "Daily rainfall and wet spells (mm)"
          : "Daily rainfall (mm)";

  return (
    <figure className="ss-chart" data-testid="subseasonal-chart">
      <figcaption className="ss-frame-title">
        {title}, {periodTitle(series)}
      </figcaption>
      <div className="ss-chart-readout" aria-live="polite">
        {focus ? (
          <>
            <strong>{formatAmount(focus.value, "mm")}</strong>
            <span>
              {formatDay(focus.date, "weekday")} · day {focus.day}
              {focus.spell ? ` · ${focus.spell} spell` : ""}
            </span>
          </>
        ) : null}
      </div>
      <ChartFrame
        units={days.length}
        maxValue={Math.max(threshold * 2, ...days.map((day) => day.value ?? 0))}
        pastUnits={pastDays}
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
        {({ x, y, slot, top, baseline, plotHeight, plotWidth }) => {
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
              {days.map((day, index) => {
                const value = day.value ?? 0;
                const isPast = day.day <= pastDays;
                return (
                  <g key={day.day}>
                    <rect
                      className={`ss-chart-bar${day.wet ? " wet" : ""}${isPast ? " past" : ""}${day.day === currentDay ? " current" : ""}${hoverDay === day.day ? " hover" : ""}`}
                      x={x(index) + (slot - barWidth) / 2}
                      y={y(value)}
                      width={barWidth}
                      height={Math.max(baseline - y(value), value > 0 ? 1 : 0)}
                    />
                    <rect
                      className="ss-chart-hit"
                      x={x(index)}
                      y={top}
                      width={slot}
                      height={plotHeight}
                      onMouseEnter={() => setHoverDay(day.day)}
                      onClick={() => onSelectDay(day.day)}
                    >
                      <title>{`${formatDay(day.date, "weekday")}: ${formatAmount(day.value, "mm")}`}</title>
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
          { key: "rain-day", label: `Rain day (${threshold} mm or more)` },
          { key: "low-rain", label: `Below ${threshold} mm` },
          ...(onset !== undefined
            ? [{ key: "band-onset", label: "Onset rains" }]
            : [
                ...(bands === "both" || bands === "dry" ? [{ key: "band-dry", label: "Dry spell" }] : []),
                ...(bands === "both" || bands === "wet" ? [{ key: "band-wet", label: "Wet spell" }] : []),
              ]),
          ...(pastDays > 0 ? [{ key: "past", label: "Past" }] : []),
        ]}
      />
    </figure>
  );
}

/** "Week 1" for a full week; the short last week gets an asterisk, explained under the chart. */
export function weekTitle(week: SubseasonalSeries["weeks"][number]) {
  return week.partial ? `Week ${week.week}*` : `Week ${week.week}`;
}

export type WeeklyTone = "rain" | "dry" | "wet" | "rainy";

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
}: {
  series: SubseasonalSeries;
  /** One value per entry of `series.weeks`. */
  values: (number | null)[];
  currentWeek: number | null;
  onSelectWeek?: (week: number) => void;
  title: string;
  yLabel: string;
  legend: string;
  unit: "mm" | "days";
  tone: WeeklyTone;
  /** Top of the y-axis; defaults to the largest value plus headroom. */
  maxValue?: number;
}) {
  const weeks = series.weeks;
  const pastDays = pastDayCount(series, todayIso());
  const partial = weeks.find((week) => week.partial);
  // The past boundary in week slots: whole weeks gone plus the gone share of the current one.
  const pastWeekIndex = weeks.findIndex((week) => week.end_day > pastDays);
  const pastUnits =
    pastDays <= 0
      ? 0
      : pastWeekIndex === -1
        ? weeks.length
        : pastWeekIndex + (pastDays - weeks[pastWeekIndex].start_day + 1) / weeks[pastWeekIndex].days;
  const describe = (value: number | null) => (unit === "mm" ? formatAmount(value, "mm") : `${value ?? 0} days`);

  return (
    <figure className={`ss-chart tone-${tone}`} data-testid="subseasonal-weekly-chart">
      <figcaption className="ss-frame-title">
        {title}, {periodTitle(series)}
      </figcaption>
      <div data-testid="subseasonal-weeks">
        <ChartFrame
          units={weeks.length}
          maxValue={maxValue ?? Math.max(1, ...values.map((value) => value ?? 0)) * 1.1}
          pastUnits={pastUnits}
          xTicks={weeks.map((week, index) => ({
            at: index + 0.5,
            label: `Wk ${week.week}${week.partial ? "*" : ""}`,
            shortLabel: `W${week.week}${week.partial ? "*" : ""}`,
            sub: formatDay(week.start_date, "compact"),
          }))}
          xLabel="Week starting"
          xLabelTight={weeks[0] ? `Week (W1 starts ${formatDay(weeks[0].start_date, "compact")})` : "Week"}
          yLabel={yLabel}
          yTicks={unit === "days" ? [0, 1, 2, 3, 4, 5, 6, 7] : undefined}
          height={264}
          ariaLabel={`${title} for ${weeks.length} weeks`}
        >
          {({ x, y, slot, baseline, top, plotHeight }) => {
            const barWidth = slot * 0.62;
            return weeks.map((week, index) => {
              const raw = values[index] ?? null;
              const value = raw ?? 0;
              const centre = x(index) + slot / 2;
              const isPast = week.end_day <= pastDays;
              return (
                <g
                  key={week.week}
                  className={`ss-week${week.week === currentWeek ? " current" : ""}${isPast ? " past" : ""}${onSelectWeek ? " selectable" : ""}`}
                  onClick={() => onSelectWeek?.(week.week)}
                >
                  <title>{`${weekTitle(week)} (${formatRange(week.start_date, week.end_date)}): ${describe(raw)}`}</title>
                  <rect className="ss-week-bar" x={centre - barWidth / 2} y={y(value)} width={barWidth} height={baseline - y(value)} />
                  <text className="ss-week-value" x={centre} y={y(value) - 5} textAnchor="middle">
                    {raw === null ? "" : Math.round(value)}
                  </text>
                  <rect className="ss-chart-hit" x={x(index)} y={top} width={slot} height={plotHeight} />
                </g>
              );
            });
          }}
        </ChartFrame>
      </div>
      <ChartLegend
        items={[
          { key: "week", label: legend },
          ...(currentWeek ? [{ key: "week-current", label: "Week shown on map" }] : []),
          ...(pastDays > 0 ? [{ key: "past", label: "Past" }] : []),
        ]}
      />
      {partial ? (
        <p className="ss-frame-note">
          * Week {partial.week} covers {partial.days} days ({formatRange(partial.start_date, partial.end_date)}).
        </p>
      ) : null}
    </figure>
  );
}

/** Weekly rainfall totals. */
export function WeeklyRainChart({
  series,
  currentWeek,
  onSelectWeek,
}: {
  series: SubseasonalSeries;
  currentWeek: number | null;
  onSelectWeek?: (week: number) => void;
}) {
  return (
    <WeeklyChart
      series={series}
      values={series.weeks.map((week) => week.value)}
      currentWeek={currentWeek}
      onSelectWeek={onSelectWeek}
      title="Weekly total rainfall (mm)"
      yLabel="Rainfall (mm)"
      legend="Forecast weekly total"
      unit="mm"
      tone="rain"
    />
  );
}
