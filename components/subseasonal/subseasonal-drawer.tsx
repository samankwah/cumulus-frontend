"use client";

import { useState } from "react";

import { RainChart } from "@/components/subseasonal/rain-chart";
import type { SubseasonalState } from "@/hooks/use-subseasonal";
import { downloadText, formatAmount, formatDay, formatRange, seriesToCsv } from "@/lib/subseasonal";
import type { SubseasonalSeries } from "@/lib/subseasonal";

function formatCoordinate(value: number | null, positive: string, negative: string) {
  if (value === null) {
    return "";
  }
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

function headerFor(state: SubseasonalState) {
  const { selection, series } = state;
  if (!selection) {
    return { heading: "Pick a location", detail: "Click the map, a region or a district to see its 46-day outlook." };
  }
  if (selection.kind === "point") {
    const place = series?.district ? `${series.district}, ${series.region}` : "Selected point";
    return {
      heading: place,
      detail: `${formatCoordinate(selection.latitude, "N", "S")} ${formatCoordinate(selection.longitude, "E", "W")} · ${series?.support ?? "grid cell"}`,
    };
  }
  const levelLabel = selection.level === "district" ? "District" : "Region";
  const where = selection.level === "district" && series?.region ? ` in ${series.region} Region` : "";
  return {
    heading: series?.name ?? selection.name,
    detail: `${levelLabel}${where}${series ? ` · ${series.support}` : ""}`,
  };
}

function SpellCalendar({ series, currentDay, onSelectDay }: { series: SubseasonalSeries; currentDay: number | null; onSelectDay: (day: number) => void }) {
  const firstWeekday = (new Date(`${series.days[0]?.date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return (
    <div className="ss-calendar" data-testid="subseasonal-calendar">
      <div className="ss-calendar-weekdays" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((label, position) => (
          <span key={`${label}-${position}`}>{label}</span>
        ))}
      </div>
      <div className="ss-calendar-grid" aria-label="Daily wet and dry pattern">
        {Array.from({ length: firstWeekday }, (_, position) => (
          <span key={`pad-${position}`} className="ss-calendar-pad" aria-hidden="true" />
        ))}
        {series.days.map((day) => {
          const state = day.spell === "dry" ? "dry-spell" : day.spell === "wet" ? "wet-spell" : day.wet ? "wet" : "dry";
          const label = `${formatDay(day.date, "weekday")}: ${formatAmount(day.value, "mm")}${day.spell ? `, ${day.spell} spell` : ""}`;
          return (
            <button
              key={day.day}
              type="button"
              className={`ss-calendar-day ${state}${day.day === currentDay ? " current" : ""}`}
              aria-label={label}
              title={label}
              onClick={() => onSelectDay(day.day)}
            >
              {new Date(`${day.date}T00:00:00Z`).getUTCDate()}
            </button>
          );
        })}
      </div>
      <div className="ss-calendar-key" aria-hidden="true">
        <span className="key wet">Rain day</span>
        <span className="key dry">Dry day</span>
        <span className="key wet-spell">Wet spell</span>
        <span className="key dry-spell">Dry spell</span>
      </div>
    </div>
  );
}

function SpellList({ series }: { series: SubseasonalSeries }) {
  if (!series.spells.length) {
    return <p className="ss-muted">No spells meet the thresholds in this forecast window.</p>;
  }
  return (
    <ul className="ss-spell-list" data-testid="subseasonal-spells">
      {series.spells.map((spell) => (
        <li key={`${spell.kind}-${spell.start_day}`} className={`ss-spell ${spell.kind}`}>
          <span className="ss-spell-kind">{spell.kind === "dry" ? "Dry spell" : "Wet spell"}</span>
          <span className="ss-spell-dates">
            {spell.open_start ? "from " : ""}
            {formatRange(spell.start_date, spell.end_date)}
            {spell.open_end ? " +" : ""}
          </span>
          <span className="ss-spell-length">
            {spell.days} days · {formatAmount(spell.total_mm, "mm")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeeklyTable({ series }: { series: SubseasonalSeries }) {
  const max = Math.max(1, ...series.weeks.map((week) => week.value ?? 0));
  return (
    <table className="ss-weeks" data-testid="subseasonal-weeks">
      <caption className="sr-only">Weekly rainfall totals</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">Dates</th>
          <th scope="col" className="num">
            Rain
          </th>
        </tr>
      </thead>
      <tbody>
        {series.weeks.map((week) => (
          <tr key={week.week}>
            <th scope="row">{week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`}</th>
            <td>{formatRange(week.start_date, week.end_date)}</td>
            <td className="num">
              <span className="ss-week-bar" style={{ width: `${((week.value ?? 0) / max) * 100}%` }} aria-hidden="true" />
              {formatAmount(week.value, "mm")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SubseasonalDrawer({ state, onSeekDay }: { state: SubseasonalState; onSeekDay: (day: number) => void }) {
  const { series, run } = state;
  const header = headerFor(state);
  const [copied, setCopied] = useState(false);
  const currentDay = state.aggregation === "daily" ? state.index : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside data-testid="dashboard-drawer" className={state.isDrawerOpen ? "drawer open" : "drawer"} aria-label="Location forecast">
      <div className="drawer-header">
        <div>
          <span className="section-kicker">{run ? `${run.lead_days}-day outlook` : "46-day outlook"}</span>
          <h2 data-testid="drawer-selected-geography">{header.heading}</h2>
          <p>{header.detail}</p>
        </div>
        <button
          type="button"
          className="ghost-button icon-button"
          data-testid="drawer-close"
          onClick={state.closeDrawer}
          aria-label="Close details panel"
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M5 5 15 15M15 5 5 15" />
          </svg>
        </button>
      </div>

      {state.seriesError ? (
        <div className="drawer-scroll">
          <article className="empty-card drawer-error" data-testid="selection-unavailable">
            <p>{state.seriesError}</p>
            <span>The map stays in place while you retry.</span>
          </article>
          <div className="drawer-actions">
            <button type="button" className="ghost-button" onClick={state.retrySeries} disabled={state.isSeriesLoading}>
              {state.isSeriesLoading ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      ) : !series ? (
        <div className="drawer-scroll" aria-busy={state.isSeriesLoading}>
          {state.isSeriesLoading ? (
            <div className="ss-drawer-skeleton" data-testid="subseasonal-drawer-loading">
              <span className="control-skeleton" />
              <span className="control-skeleton" />
              <span className="control-skeleton tall" />
              <span className="control-skeleton" />
            </div>
          ) : (
            <div className="drawer-empty">
              <p>No location selected yet</p>
              <span>Click the map, a region or a district to see daily rain, weekly totals and wet/dry spells.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="drawer-scroll" aria-busy={state.isSeriesLoading}>
          <section className="drawer-section drawer-summary-section">
            <dl className="drawer-summary-strip ss-kpis" data-testid="drawer-summary-strip">
              <div className="drawer-summary-metric">
                <dt>{series.days.length}-day rain</dt>
                <dd>{formatAmount(series.metrics.total_mm, "mm")}</dd>
              </div>
              <div className="drawer-summary-metric">
                <dt>Rainy days</dt>
                <dd>
                  {series.metrics.rainy_days}
                  <small> / {series.days.length}</small>
                </dd>
              </div>
              <div className="drawer-summary-metric ss-kpi-dry">
                <dt>Dry-spell days</dt>
                <dd>{series.metrics.dry_spell_days}</dd>
              </div>
              <div className="drawer-summary-metric ss-kpi-wet">
                <dt>Wet-spell days</dt>
                <dd>{series.metrics.wet_spell_days}</dd>
              </div>
            </dl>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Daily rainfall</span>
                <h3>
                  Wettest day {series.metrics.max_day ? formatDay(series.days[series.metrics.max_day - 1].date, "weekday") : "–"}
                  {series.metrics.max_day_mm !== null ? ` · ${formatAmount(series.metrics.max_day_mm, "mm")}` : ""}
                </h3>
              </div>
            </div>
            <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} />
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Wet &amp; dry spells</span>
                <h3>
                  Dry spell ≥{series.thresholds.dry_spell_min_days} days · wet spell ≥{series.thresholds.wet_spell_min_days} days
                </h3>
              </div>
            </div>
            <SpellCalendar series={series} currentDay={currentDay} onSelectDay={onSeekDay} />
            <SpellList series={series} />
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Weekly totals</span>
                <h3>Rainfall by week</h3>
              </div>
            </div>
            <WeeklyTable series={series} />
          </section>

          <section className="drawer-section">
            <p className="ss-guidance" data-testid="subseasonal-guidance">
              {series.guidance}
            </p>
            <div className="drawer-actions ss-drawer-actions">
              <button
                type="button"
                className="ghost-button"
                data-testid="subseasonal-download"
                onClick={() =>
                  downloadText(
                    `${series.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${series.run_id}.csv`,
                    seriesToCsv(series, run),
                  )
                }
              >
                Download CSV
              </button>
              <button type="button" className="ghost-button" onClick={copyLink}>
                {copied ? "Link copied" : "Copy link"}
              </button>
            </div>
            {run ? (
              <p className="ss-source">
                {run.source_label} · run {run.run_id} · {run.grid_resolution_degrees ?? 0.1}° grid
              </p>
            ) : null}
          </section>
        </div>
      )}
    </aside>
  );
}
