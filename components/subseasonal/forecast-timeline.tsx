"use client";

import { useId, useMemo } from "react";
import type { KeyboardEvent } from "react";

import { formatAmount, formatDay, formatRange, todayIso } from "@/lib/subseasonal";
import type { SubseasonalAggregation, SubseasonalRun } from "@/lib/subseasonal";

type Frame = {
  index: number;
  value: number | null;
  label: string; // aria / title
  shortLabel: string;
  startDate: string;
  isWeekStart: boolean;
  partial: boolean;
};

function buildFrames(run: SubseasonalRun, aggregation: SubseasonalAggregation): Frame[] {
  if (aggregation === "weekly") {
    return run.weeks.map((week) => ({
      index: week.week,
      value: week.value,
      label: `${week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`}, ${formatRange(week.start_date, week.end_date)}`,
      shortLabel: week.partial ? `D${week.start_day}–${week.end_day}` : `Wk ${week.week}`,
      startDate: week.start_date,
      isWeekStart: true,
      partial: week.partial,
    }));
  }
  return run.days.map((day) => ({
    index: day.day,
    value: day.value,
    label: `${formatDay(day.date, "weekday")}, day ${day.day} of ${run.lead_days}`,
    shortLabel: formatDay(day.date, "compact"),
    startDate: day.date,
    isWeekStart: (day.day - 1) % 7 === 0,
    partial: false,
  }));
}

export function ForecastTimeline({
  run,
  aggregation,
  index,
  onIndexChange,
  isPlaying,
  onTogglePlaying,
  isBusy,
  progress,
}: {
  run: SubseasonalRun;
  aggregation: SubseasonalAggregation;
  index: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlaying: () => void;
  isBusy: boolean;
  /** Daily % of Ghana where the rains have set in: replaces the rain bars with the onset front. */
  progress?: number[] | null;
}) {
  const sliderId = useId();
  const showProgress = Boolean(progress?.length) && aggregation === "daily";
  const frames = useMemo(() => {
    const built = buildFrames(run, aggregation);
    return showProgress && progress ? built.map((frame) => ({ ...frame, value: progress[frame.index - 1] ?? null })) : built;
  }, [aggregation, progress, run, showProgress]);
  const count = frames.length;
  const current = frames[Math.min(Math.max(index, 1), count) - 1];
  const maxValue = showProgress ? 100 : Math.max(1, ...frames.map((frame) => frame.value ?? 0));
  const today = todayIso();
  const todayFrame =
    aggregation === "weekly"
      ? run.weeks.find((week) => today >= week.start_date && today <= week.end_date)?.week ?? null
      : run.days.find((day) => day.date === today)?.day ?? null;
  // Every frame owns an equal slot; the range input is inset by half a slot (minus half a thumb)
  // so the native thumb centre lands exactly on each slot centre, whatever the frame count.
  const at = (frameIndex: number) => `${((frameIndex - 0.5) / count) * 100}%`;
  const barWidth = `${(100 / count) * 0.74}%`;
  const rangeStyle = {
    left: `calc(${50 / count}% - var(--ss-thumb) / 2)`,
    width: `calc(${100 - 100 / count}% + var(--ss-thumb))`,
  };
  const unitNoun = aggregation === "weekly" ? "week" : "day";

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " " || event.key === "k") {
      if ((event.target as HTMLElement).tagName === "BUTTON") {
        return; // native button activation
      }
      event.preventDefault();
      onTogglePlaying();
    }
  };

  if (!current) {
    return null;
  }

  return (
    <div className="ss-timeline" data-testid="subseasonal-timeline" onKeyDown={handleKeyDown}>
      <div className="ss-timeline-head">
        <div className="ss-timeline-buttons">
          <button
            type="button"
            className="ss-icon-button ss-play"
            data-testid="timeline-play"
            aria-label={isPlaying ? "Pause animation" : "Play animation"}
            aria-pressed={isPlaying}
            onClick={onTogglePlaying}
          >
            {isPlaying ? (
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <rect x="5" y="4" width="3.5" height="12" rx="1" />
                <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M6.5 4.2v11.6a.6.6 0 0 0 .9.5l9-5.8a.6.6 0 0 0 0-1L7.4 3.7a.6.6 0 0 0-.9.5Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="ss-icon-button"
            data-testid="timeline-prev"
            aria-label={`Previous ${unitNoun}`}
            disabled={index <= 1}
            onClick={() => onIndexChange(index - 1)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </button>
          <button
            type="button"
            className="ss-icon-button"
            data-testid="timeline-next"
            aria-label={`Next ${unitNoun}`}
            disabled={index >= count}
            onClick={() => onIndexChange(index + 1)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M7.5 4.5 13 10l-5.5 5.5" />
            </svg>
          </button>
        </div>
        <div className="ss-timeline-readout" aria-live={isPlaying ? "off" : "polite"}>
          <strong data-testid="timeline-current">
            {aggregation === "weekly"
              ? current.label.split(", ")[0]
              : formatDay(current.startDate, "weekday")}
          </strong>
          <span>
            {aggregation === "weekly"
              ? formatRange(run.weeks[current.index - 1].start_date, run.weeks[current.index - 1].end_date)
              : `Day ${current.index} of ${count}`}
            {isBusy ? <span className="ss-busy-dot" aria-hidden="true" /> : null}
          </span>
        </div>
        {todayFrame && todayFrame !== index ? (
          <button type="button" className="ss-chip-button" data-testid="timeline-today" onClick={() => onIndexChange(todayFrame)}>
            Today
          </button>
        ) : null}
      </div>

      <div className="ss-track">
        <div className={`ss-bars${showProgress ? " progress" : ""}`} aria-hidden="true">
          {frames.map((frame) => (
            <span
              key={frame.index}
              className={[
                "ss-bar",
                frame.index === current.index ? "current" : "",
                frame.index < current.index ? "past" : "",
                frame.isWeekStart && frame.index > 1 && aggregation === "daily" ? "week-start" : "",
                frame.partial ? "partial" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: at(frame.index),
                width: showProgress ? `${100 / count}%` : barWidth,
                height: `${Math.max(showProgress ? 2 : 6, ((frame.value ?? 0) / maxValue) * 100)}%`,
              }}
              title={
                showProgress
                  ? `${frame.label}: rains set in across ${Math.round(frame.value ?? 0)}% of Ghana`
                  : `${frame.label}: ${formatAmount(frame.value, "mm")} Ghana mean`
              }
            />
          ))}
        </div>
        {todayFrame ? <span className="ss-today" style={{ left: at(todayFrame) }} title="Today" aria-hidden="true" /> : null}
        <label htmlFor={sliderId} className="sr-only">
          {aggregation === "weekly" ? "Forecast week" : "Forecast day"}
        </label>
        <input
          id={sliderId}
          className="ss-range"
          data-testid="timeline-slider"
          type="range"
          min={1}
          max={count}
          step={1}
          value={current.index}
          aria-valuetext={current.label}
          style={rangeStyle}
          onChange={(event) => onIndexChange(Number(event.target.value))}
        />
      </div>

      <div className="ss-ticks" aria-hidden="true">
        {frames
          .filter((frame) => (aggregation === "weekly" ? true : frame.isWeekStart))
          .map((frame) => (
            <span key={frame.index} style={{ left: at(frame.index) }}>
              {aggregation === "weekly" ? frame.shortLabel : formatDay(frame.startDate, "compact")}
            </span>
          ))}
      </div>
    </div>
  );
}
