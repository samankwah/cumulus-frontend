"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatAmount, formatDay } from "@/lib/subseasonal";
import type { SubseasonalOnset, SubseasonalSeries } from "@/lib/subseasonal";

const HEIGHT = 168;
const PAD = { top: 22, right: 8, bottom: 24, left: 30 };

function niceMax(value: number) {
  // Even steps so the mid gridline is a whole number.
  if (value <= 4) return 4;
  const steps = [6, 10, 16, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300];
  return steps.find((step) => step >= value) ?? Math.ceil(value / 100) * 100;
}

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

/**
 * Daily rainfall bars with dry/wet spell bands and weekly totals. The current timeline day is
 * highlighted; clicking a bar seeks the map to that day.
 */
export function RainChart({
  series,
  currentDay,
  onSelectDay,
  onset,
}: {
  series: SubseasonalSeries;
  currentDay: number | null;
  onSelectDay: (day: number) => void;
  /** Marks the onset burst and replaces the spell bands (onset layer). */
  onset?: SubseasonalOnset | null;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const days = series.days;
  const count = days.length;
  const maxValue = niceMax(Math.max(0, ...days.map((day) => day.value ?? 0)));
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = count ? plotWidth / count : 0;
  const barWidth = Math.max(2, slot * 0.72);
  const x = (day: number) => PAD.left + (day - 1) * slot;
  const y = (value: number) => PAD.top + plotHeight - (Math.min(value, maxValue) / maxValue) * plotHeight;
  const ticks = useMemo(() => [0, maxValue / 2, maxValue], [maxValue]);
  const threshold = series.thresholds.wet_day_mm;
  const focusDay = hoverDay ?? currentDay;
  const focus = focusDay ? days[focusDay - 1] : null;

  return (
    <div className="ss-chart" ref={containerRef} data-testid="subseasonal-chart">
      <div className="ss-chart-readout" aria-live="polite">
        {focus ? (
          <>
            <strong>{formatAmount(focus.value, "mm")}</strong>
            <span>
              {formatDay(focus.date, "weekday")} · day {focus.day}
              {focus.spell ? ` · ${focus.spell} spell` : ""}
            </span>
          </>
        ) : (
          <span>Hover a bar for daily detail</span>
        )}
      </div>
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Daily rainfall for ${count} days, total ${formatAmount(series.metrics.total_mm, "mm")}`}
          onMouseLeave={() => setHoverDay(null)}
        >
          {/* onset burst, or spell bands */}
          {onset ? (
            <g data-testid="subseasonal-onset-marker">
              <rect
                className="ss-chart-band onset"
                x={x(onset.day)}
                y={PAD.top}
                width={Math.min(series.thresholds.onset_window_days ?? 3, count - onset.day + 1) * slot}
                height={plotHeight}
              />
              <line className="ss-chart-onset" x1={x(onset.day)} x2={x(onset.day)} y1={PAD.top - 14} y2={PAD.top + plotHeight} />
            </g>
          ) : null}
          {(onset !== undefined ? [] : series.spells).map((spell) => (
            <rect
              key={`${spell.kind}-${spell.start_day}`}
              className={`ss-chart-band ${spell.kind}`}
              x={x(spell.start_day)}
              y={PAD.top}
              width={(spell.end_day - spell.start_day + 1) * slot}
              height={plotHeight}
            />
          ))}
          {/* grid */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="ss-chart-grid" x1={PAD.left} x2={PAD.left + plotWidth} y1={y(tick)} y2={y(tick)} />
              <text className="ss-chart-axis" x={PAD.left - 6} y={y(tick) + 3} textAnchor="end">
                {Math.round(tick)}
              </text>
            </g>
          ))}
          <line className="ss-chart-threshold" x1={PAD.left} x2={PAD.left + plotWidth} y1={y(threshold)} y2={y(threshold)} />
          {/* week separators + weekly totals */}
          {series.weeks.map((week) => (
            <g key={week.week}>
              {week.start_day > 1 ? (
                <line className="ss-chart-week" x1={x(week.start_day)} x2={x(week.start_day)} y1={PAD.top - 14} y2={PAD.top + plotHeight} />
              ) : null}
              <text className="ss-chart-week-total" x={x(week.start_day) + (week.days * slot) / 2} y={PAD.top - 6} textAnchor="middle">
                {week.value === null ? "" : `${Math.round(week.value)}`}
              </text>
              <text className="ss-chart-axis" x={x(week.start_day) + 1} y={HEIGHT - 6}>
                {formatDay(week.start_date, "compact")}
              </text>
            </g>
          ))}
          {/* bars */}
          {days.map((day) => {
            const value = day.value ?? 0;
            const top = y(value);
            const isCurrent = day.day === currentDay;
            return (
              <g key={day.day}>
                <rect
                  className={`ss-chart-bar${day.wet ? " wet" : ""}${isCurrent ? " current" : ""}${hoverDay === day.day ? " hover" : ""}`}
                  x={x(day.day) + (slot - barWidth) / 2}
                  y={top}
                  width={barWidth}
                  height={Math.max(PAD.top + plotHeight - top, value > 0 ? 1 : 0)}
                  rx={Math.min(2, barWidth / 3)}
                />
                <rect
                  className="ss-chart-hit"
                  x={x(day.day)}
                  y={PAD.top}
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
          <text className="ss-chart-axis ss-chart-unit" x={PAD.left - 6} y={PAD.top - 8} textAnchor="end">
            mm
          </text>
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      <div className="ss-chart-key" aria-hidden="true">
        <span className="key wet">Rain day ≥{threshold} mm</span>
        {onset !== undefined ? (
          <span className="key band-onset">Onset rains</span>
        ) : (
          <>
            <span className="key band-dry">Dry spell</span>
            <span className="key band-wet">Wet spell</span>
          </>
        )}
        <span className="key week">Weekly total (mm)</span>
      </div>
    </div>
  );
}
