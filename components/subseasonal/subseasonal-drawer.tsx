"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdvisoryPanel } from "@/components/subseasonal/advisory-panel";
import { RainChart } from "@/components/subseasonal/rain-chart";
import type { SubseasonalState } from "@/hooks/use-subseasonal";
import { availableLayers, downloadText, formatAmount, formatDay, formatRange, LAYER_SHORT_LABELS, layerLabel, seriesToCsv, todayIso } from "@/lib/subseasonal";
import type { SpellKind, SubseasonalLayerKey, SubseasonalSeries } from "@/lib/subseasonal";
import { buildSubseasonalAdvisory, isCropKey } from "@/lib/subseasonal-advisory";
import type { CropKey } from "@/lib/subseasonal-advisory";

const CROP_STORAGE_KEY = "ss-advisory-crop";

/** The viewer's crop, remembered on this device only. */
function useCropPreference() {
  const [crop, setCrop] = useState<CropKey>("maize");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CROP_STORAGE_KEY);
      if (isCropKey(stored)) {
        setCrop(stored);
      }
    } catch {
      // Storage unavailable (private mode): keep the default.
    }
  }, []);
  const update = useCallback((next: CropKey) => {
    setCrop(next);
    try {
      window.localStorage.setItem(CROP_STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  }, []);
  return [crop, update] as const;
}

function formatCoordinate(value: number | null, positive: string, negative: string) {
  if (value === null) {
    return "";
  }
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

function headerFor(state: SubseasonalState): { heading: string; chips: string[]; detail?: string } {
  const { selection, series } = state;
  if (!selection) {
    return { heading: "Pick a location", chips: [], detail: "Click the map, a region or a district to see its 46-day outlook." };
  }
  if (selection.kind === "point") {
    const place = series?.district ? `${series.district}, ${series.region}` : "Selected point";
    const coordinates = `${formatCoordinate(selection.latitude, "N", "S")} ${formatCoordinate(selection.longitude, "E", "W")}`;
    return { heading: place, chips: [coordinates] };
  }
  const levelLabel = selection.level === "district" ? "District" : "Region";
  const chips = [levelLabel];
  if (selection.level === "district" && series?.region) {
    chips.push(`${series.region} Region`);
  }
  return { heading: series?.name ?? selection.name, chips };
}

type Hero = { label: string; value: string; unit: string; context: string; whole: string | null };

/**
 * The one number the selected layer is about. A run that started before today counts from
 * today, so the number agrees with the forward-looking advice; the whole-run figure (what the
 * map shows) stays alongside it.
 */
function heroFor(layer: SubseasonalLayerKey, series: SubseasonalSeries, today: string, shownDay: number | null = null): Hero {
  const all = series.days;
  const upcoming = all.filter((day) => day.date >= today);
  const partial = upcoming.length > 0 && upcoming.length < all.length;
  const days = partial ? upcoming : all;
  const span = partial ? `Next ${days.length} days` : `${all.length} days`;
  const { metrics, thresholds } = series;

  if (layer === "rainy_days") {
    const rainy = days.filter((day) => day.wet).length;
    return {
      label: `Rainy days · ${span}`,
      value: String(rainy),
      unit: `/ ${days.length} days`,
      context: `${Math.round((rainy / Math.max(1, days.length)) * 100)}% of days reach ${thresholds.wet_day_mm} mm or more`,
      whole: partial ? `Whole run ${metrics.rainy_days} / ${all.length} days` : null,
    };
  }
  if (layer === "onset") {
    // One date for the whole run, so it is not re-counted from today like the totals.
    const onset = series.onset;
    const last = all[all.length - 1];
    const windowDays = thresholds.onset_window_days ?? 3;
    if (!onset) {
      return {
        label: `Onset · ${all.length}-day forecast`,
        value: "None",
        unit: last ? `by ${formatDay(last.date, "short")}` : "",
        context: `No ${thresholds.onset_mm ?? 20} mm burst without a long dry spell after it`,
        whole: null,
      };
    }
    // Where the shown day stands relative to the onset, as on the map.
    const shown = shownDay ? all[shownDay - 1] : null;
    const gap = shown ? onset.day - shown.day : null;
    const status =
      shown && gap !== null
        ? gap > 0
          ? `${gap} day${gap === 1 ? "" : "s"} after ${formatDay(shown.date, "weekday")}`
          : gap === 0
            ? `On ${formatDay(shown.date, "weekday")}, the day shown`
            : `Set in ${-gap} day${gap === -1 ? "" : "s"} before ${formatDay(shown.date, "weekday")}`
        : null;
    const notes = [status, onset.provisional ? `Provisional: dry-spell check covers ${onset.guard_days} of ${thresholds.onset_guard_days ?? 30} days` : null];
    return {
      label: `Onset · day ${onset.day} of the forecast`,
      value: formatDay(onset.date, "weekday"),
      unit: onset.date < today ? "(passed)" : "",
      context: `${formatAmount(onset.rain_mm, "mm")} within ${windowDays} days · longest dry run after: ${formatAmount(onset.longest_dry_after, "days")}`,
      whole: notes.filter(Boolean).join(" · ") || null,
    };
  }
  if (layer === "dry_spell_days" || layer === "wet_spell_days") {
    const kind: SpellKind = layer === "dry_spell_days" ? "dry" : "wet";
    const inSpell = days.filter((day) => day.spell === kind).length;
    const firstDay = days[0]?.day ?? 1;
    const count = series.spells.filter((spell) => spell.kind === kind && spell.end_day >= firstDay).length;
    const minDays = kind === "dry" ? thresholds.dry_spell_min_days : thresholds.wet_spell_min_days;
    const wholeDays = kind === "dry" ? metrics.dry_spell_days : metrics.wet_spell_days;
    return {
      label: `${kind === "dry" ? "Dry-spell" : "Wet-spell"} days · ${span}`,
      value: String(inSpell),
      unit: `/ ${days.length} days`,
      context: count ? `${count} ${kind} spell${count === 1 ? "" : "s"} of ${minDays}+ days` : `No ${kind} spells of ${minDays}+ days`,
      whole: partial ? `Whole run ${wholeDays} / ${all.length} days` : null,
    };
  }
  const total = days.reduce((sum, day) => sum + (day.value ?? 0), 0);
  const wettest = days.reduce<SubseasonalSeries["days"][number] | null>(
    (best, day) => ((day.value ?? 0) > (best?.value ?? 0) ? day : best),
    null,
  );
  return {
    label: `Rainfall · ${span}`,
    value: formatAmount(total, "mm").replace(/ mm$/, ""),
    unit: "mm",
    context: wettest ? `Wettest day ${formatDay(wettest.date, "weekday")} · ${formatAmount(wettest.value, "mm")}` : "No rain day stands out",
    whole: partial ? `Whole run ${formatAmount(metrics.total_mm, "mm")}` : null,
  };
}

function SpellCalendar({
  series,
  currentDay,
  onSelectDay,
  focus,
}: {
  series: SubseasonalSeries;
  currentDay: number | null;
  onSelectDay: (day: number) => void;
  /** Only highlight spells of this kind; omit to show plain rain/dry days. */
  focus?: SpellKind;
}) {
  const firstWeekday = (new Date(`${series.days[0]?.date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const today = todayIso();
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
          const spell = focus && day.spell === focus ? day.spell : null;
          const state = spell ? `${spell}-spell` : day.wet ? "wet" : "dry";
          const when = day.date < today ? " past" : day.date === today ? " today" : "";
          const label = `${formatDay(day.date, "weekday")}${day.date === today ? " (today)" : ""}: ${formatAmount(day.value, "mm")}${spell ? `, ${spell} spell` : ""}`;
          return (
            <button
              key={day.day}
              type="button"
              className={`ss-calendar-day ${state}${when}${day.day === currentDay ? " current" : ""}`}
              aria-current={day.date === today ? "date" : undefined}
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
        <span className="key today">Today</span>
        <span className="key wet">Rain day</span>
        <span className="key dry">Dry day</span>
        {focus === "wet" ? <span className="key wet-spell">Wet spell</span> : null}
        {focus === "dry" ? <span className="key dry-spell">Dry spell</span> : null}
      </div>
    </div>
  );
}

function SpellList({ series, kind }: { series: SubseasonalSeries; kind: SpellKind }) {
  const spells = series.spells.filter((spell) => spell.kind === kind);
  if (!spells.length) {
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    return <p className="ss-muted">No {kind} spells of {minDays}+ days in this forecast window.</p>;
  }
  return (
    <ul className="ss-spell-list" data-testid="subseasonal-spells">
      {spells.map((spell) => (
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

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="drawer-section ss-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h3>{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function LayerSections({
  layer,
  series,
  currentDay,
  onSeekDay,
}: {
  layer: SubseasonalLayerKey;
  series: SubseasonalSeries;
  currentDay: number | null;
  onSeekDay: (day: number) => void;
}) {
  if (layer === "rainy_days") {
    return (
      <Section kicker="Rain days" title={`Days with ${series.thresholds.wet_day_mm} mm or more`}>
        <SpellCalendar series={series} currentDay={currentDay} onSelectDay={onSeekDay} />
      </Section>
    );
  }
  if (layer === "dry_spell_days" || layer === "wet_spell_days") {
    const kind: SpellKind = layer === "dry_spell_days" ? "dry" : "wet";
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    return (
      <Section kicker={kind === "dry" ? "Dry spells" : "Wet spells"} title={`Runs of ${minDays}+ ${kind} days`}>
        <SpellCalendar series={series} currentDay={currentDay} onSelectDay={onSeekDay} focus={kind} />
        <SpellList series={series} kind={kind} />
      </Section>
    );
  }
  if (layer === "onset") {
    const { thresholds } = series;
    return (
      <Section kicker="Onset" title="Rain by day, onset marked">
        <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} onset={series.onset ?? null} />
        <p className="ss-onset-rule" data-testid="subseasonal-onset-rule">
          Onset is the first rain day from which at least {thresholds.onset_mm ?? 20} mm falls within {thresholds.onset_window_days ?? 3} days,
          with no dry spell longer than {thresholds.onset_max_dry_days ?? 10} days in the {thresholds.onset_guard_days ?? 30} days after. Only this
          forecast is searched: rain before {formatDay(series.days[0]?.date ?? "", "short")} is not counted.
        </p>
      </Section>
    );
  }
  return (
    <>
      <Section kicker="Daily rainfall" title="Rain by day">
        <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} />
      </Section>
      <Section kicker="Weekly totals" title="Rainfall by week">
        <WeeklyTable series={series} />
      </Section>
    </>
  );
}

/** "Download CSV" and "Copy link" in the drawer footer: switched off for now, at the user's request. */
const SHOW_DRAWER_ACTIONS = false;

export function SubseasonalDrawer({ state, onSeekDay }: { state: SubseasonalState; onSeekDay: (day: number) => void }) {
  const { series, run, layer } = state;
  const header = headerFor(state);
  const [copied, setCopied] = useState(false);
  const currentDay = state.aggregation === "daily" ? state.index : null;
  const [crop, setCrop] = useCropPreference();
  const advisory = useMemo(() => (series ? buildSubseasonalAdvisory(layer, series, crop) : null), [crop, layer, series]);
  const hero = series ? heroFor(layer, series, todayIso(), currentDay) : null;

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
    <aside
      data-testid="dashboard-drawer"
      className={`drawer ss-drawer ss-layer-${layer}${state.isDrawerOpen ? " open" : ""}`}
      aria-label="Location forecast"
    >
      <div className="drawer-header">
        <div>
          <span className="ss-drawer-layer">
            <span className="ss-drawer-layer-dot" aria-hidden="true" />
            {layerLabel(run, layer)} · {run ? `${run.lead_days}-day outlook` : "46-day outlook"}
          </span>
          <h2 data-testid="drawer-selected-geography">{header.heading}</h2>
          {header.chips.length ? (
            <div className="ss-drawer-chips">
              {header.chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          ) : null}
          {header.detail ? <p>{header.detail}</p> : null}
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

      <div className="ss-drawer-tabs" role="group" aria-label="Map layer">
        {availableLayers(run).map((key) => (
          <button
            key={key}
            type="button"
            className={`ss-drawer-tab ss-tab-${key}`}
            aria-pressed={layer === key}
            data-testid={`drawer-layer-${key}`}
            onClick={() => state.setLayer(key)}
          >
            {LAYER_SHORT_LABELS[key]}
          </button>
        ))}
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
      ) : !series || !hero || !advisory ? (
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
        <>
          <div key={layer} className="drawer-scroll ss-drawer-body" aria-busy={state.isSeriesLoading}>
            <section className="ss-hero" data-testid="drawer-summary-strip">
              <span className="ss-hero-label">{hero.label}</span>
              <p className="ss-hero-value">
                {hero.value}
                <small> {hero.unit}</small>
              </p>
              <span className="ss-hero-context">{hero.context}</span>
              {hero.whole ? <span className="ss-hero-whole">{hero.whole}</span> : null}
            </section>

            <AdvisoryPanel advisory={advisory} crop={crop} onCropChange={setCrop} />

            <LayerSections layer={layer} series={series} currentDay={currentDay} onSeekDay={onSeekDay} />

            <section className="ss-drawer-notes">
              <p className="ss-guidance" data-testid="subseasonal-guidance">
                {series.guidance}
              </p>
              {run ? (
                <p className="ss-source">
                  {series.support} · {run.source_label} · run {run.run_id} · {run.grid_resolution_degrees ?? 0.1}° grid
                </p>
              ) : null}
            </section>
          </div>
          {SHOW_DRAWER_ACTIONS ? (
            <div className="drawer-actions ss-drawer-actions ss-drawer-footer">
              <button
                type="button"
                className="ghost-button"
                data-testid="subseasonal-download"
                onClick={() =>
                  downloadText(`${series.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${series.run_id}.csv`, seriesToCsv(series, run))
                }
              >
                Download CSV
              </button>
              <button type="button" className="ghost-button" onClick={copyLink}>
                {copied ? "Link copied" : "Copy link"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
