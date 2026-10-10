"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdvisoryPanel } from "@/components/subseasonal/advisory-panel";
import { RainChart, WeeklyChart, WeeklyRainChart } from "@/components/subseasonal/rain-chart";
import type { SubseasonalState } from "@/hooks/use-subseasonal";
import { availableLayers, downloadText, formatAmount, formatDay, formatRange, LAYER_SHORT_LABELS, layerLabel, seriesToCsv, spellOutlook, spellStatus, todayIso } from "@/lib/subseasonal";
import type { SpellKind, SpellStatus, SubseasonalAggregation, SubseasonalLayerKey, SubseasonalSeries } from "@/lib/subseasonal";
import { buildSubseasonalAdvisory, isCropKey } from "@/lib/subseasonal-advisory";
import type { CropKey } from "@/lib/subseasonal-advisory";

// v2: "All crops" became the default, so earlier stored picks start over from it.
const CROP_STORAGE_KEY = "ss-advisory-crop-v2";

/** The viewer's crop, remembered on this device only. */
function useCropPreference() {
  const [crop, setCrop] = useState<CropKey>("all");
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
/** Rainfall for the shown day or week, so the headline matches the map's period. */
function rainPeriodHero(series: SubseasonalSeries, period: { aggregation: SubseasonalAggregation; index: number }): Hero | null {
  if (period.aggregation === "daily") {
    const day = series.days[period.index - 1];
    if (!day) {
      return null;
    }
    const wet = (day.value ?? 0) >= series.thresholds.wet_day_mm;
    return {
      label: `Rainfall · ${formatDay(day.date, "weekday")}`,
      value: formatAmount(day.value, "mm").replace(/ mm$/, ""),
      unit: "mm",
      context: wet ? `A rain day: ${series.thresholds.wet_day_mm} mm or more` : "Little or no rain this day",
      whole: `Day ${day.day} of ${series.days.length}`,
    };
  }
  if (period.aggregation === "weekly") {
    const week = series.weeks.find((item) => item.week === period.index);
    if (!week) {
      return null;
    }
    const days = series.days.filter((day) => day.day >= week.start_day && day.day <= week.end_day);
    const wettest = days.reduce<SubseasonalSeries["days"][number] | null>(
      (best, day) => ((day.value ?? 0) > (best?.value ?? 0) ? day : best),
      null,
    );
    return {
      label: `Rainfall · ${week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`} (${formatRange(week.start_date, week.end_date)})`,
      value: formatAmount(week.value, "mm").replace(/ mm$/, ""),
      unit: "mm",
      context:
        wettest && (wettest.value ?? 0) > 0
          ? `Wettest day ${formatDay(wettest.date, "weekday")} · ${formatAmount(wettest.value, "mm")}`
          : "Little or no rain this week",
      whole: null,
    };
  }
  return null;
}

/** Days of each forecast week that match: in a spell of one kind, or a rain day. */
function weeklyDayCounts(series: SubseasonalSeries, matches: (day: SubseasonalSeries["days"][number]) => boolean) {
  return series.weeks.map((week) => series.days.filter((day) => day.day >= week.start_day && day.day <= week.end_day && matches(day)).length);
}

/**
 * The headline for the day or week shown on the map, for the spell and rain-day layers, so the
 * drawer answers for the same period as the map. Null for the whole run (the layer's own hero).
 */
function indicatorPeriodHero(
  layer: SubseasonalLayerKey,
  series: SubseasonalSeries,
  period: { aggregation: SubseasonalAggregation; index: number },
): Hero | null {
  if (layer !== "dry_spell_days" && layer !== "wet_spell_days" && layer !== "rainy_days") {
    return null;
  }
  const wetDay = series.thresholds.wet_day_mm;
  const kind: SpellKind | null = layer === "dry_spell_days" ? "dry" : layer === "wet_spell_days" ? "wet" : null;
  const name = kind === "dry" ? "dry spell" : "wet spell";
  if (period.aggregation === "daily") {
    const day = series.days[period.index - 1];
    if (!day) {
      return null;
    }
    const when = formatDay(day.date, "weekday");
    if (!kind) {
      return {
        label: `Rain day on ${when}?`,
        value: day.wet ? "Yes" : "No",
        unit: "",
        context: `${formatAmount(day.value, "mm")} forecast · a rain day has ${wetDay} mm or more`,
        whole: `Day ${day.day} of ${series.days.length}`,
      };
    }
    const spell = series.spells.find((item) => item.kind === kind && item.start_day <= day.day && item.end_day >= day.day);
    const next = series.spells.find((item) => item.kind === kind && item.start_day > day.day);
    return {
      label: `In a ${name} on ${when}?`,
      value: spell ? "Yes" : "No",
      unit: "",
      context: spell
        ? `Day ${day.day - spell.start_day + 1} of ${spell.days}${spell.open_end ? "+" : ""} · ${formatRange(spell.start_date, spell.end_date)}`
        : next
          ? `Next ${name} from ${formatDay(next.start_date, "weekday")}`
          : `No ${name} after this day in the forecast`,
      whole: `Day ${day.day} of ${series.days.length}`,
    };
  }
  if (period.aggregation === "weekly") {
    const week = series.weeks.find((item) => item.week === period.index);
    if (!week) {
      return null;
    }
    const days = series.days.filter((day) => day.day >= week.start_day && day.day <= week.end_day);
    const weekName = `${week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`} (${formatRange(week.start_date, week.end_date)})`;
    if (!kind) {
      return {
        label: `Rain days · ${weekName}`,
        value: String(days.filter((day) => day.wet).length),
        unit: `/ ${week.days} days`,
        context: `${formatAmount(week.value, "mm")} of rain this week`,
        whole: null,
      };
    }
    const spells = series.spells.filter((item) => item.kind === kind && item.start_day <= week.end_day && item.end_day >= week.start_day);
    return {
      label: `${kind === "dry" ? "Dry-spell" : "Wet-spell"} days · ${weekName}`,
      value: String(days.filter((day) => day.spell === kind).length),
      unit: `/ ${week.days} days`,
      context: spells.length
        ? `Part of the ${spells.map((item) => formatRange(item.start_date, item.end_date)).join(" and ")} ${name}${spells.length === 1 ? "" : "s"}`
        : `No ${name} this week`,
      whole: null,
    };
  }
  return null;
}

function heroFor(layer: SubseasonalLayerKey, series: SubseasonalSeries, today: string, shownDay: number | null = null): Hero {
  const all = series.days;
  const upcoming = all.filter((day) => day.date >= today);
  const partial = upcoming.length > 0 && upcoming.length < all.length;
  const days = partial ? upcoming : all;
  const span = partial ? `Next ${days.length} days` : `${all.length} days`;
  const { metrics, thresholds } = series;

  if (layer === "rainy_days") {
    // Answer first: when is the next rain day. The count comes second.
    const rainy = days.filter((day) => day.wet).length;
    const next = all.find((day) => day.date >= today && day.wet) ?? null;
    const counts = `${rainy} of the ${partial ? "next " : ""}${days.length} days are rain days (${Math.round((rainy / Math.max(1, days.length)) * 100)}%)`;
    return {
      label: next?.date === today ? "Rain day today" : "Next rain day",
      value: next ? formatDay(next.date, "weekday") : "None",
      unit: next ? `· ${formatAmount(next.value, "mm")}` : "",
      context: next ? counts : `No day with ${thresholds.wet_day_mm} mm or more ahead in this forecast`,
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
    // Answer first: is a spell on now, or when is the next one. The counts come second.
    const kind: SpellKind = layer === "dry_spell_days" ? "dry" : "wet";
    const outlook = spellOutlook(series, kind, today);
    const minDays = kind === "dry" ? thresholds.dry_spell_min_days : thresholds.wet_spell_min_days;
    const name = kind === "dry" ? "dry spell" : "wet spell";
    const counts = `${outlook.spells.length} ${name}${outlook.spells.length === 1 ? "" : "s"} · ${outlook.spellDays} of ${all.length} days in ${name}s`;
    if (outlook.now) {
      const left = all.filter((day) => day.date >= today && day.day <= outlook.now!.end_day).length;
      return {
        label: `In a ${name} now`,
        value: String(left),
        unit: `day${left === 1 ? "" : "s"} left`,
        context: `Until ${formatDay(outlook.now.end_date, "weekday")}${outlook.now.open_end ? ", maybe longer" : ""}`,
        whole: counts,
      };
    }
    if (outlook.next) {
      return {
        label: `Next ${name}`,
        value: formatRange(outlook.next.start_date, outlook.next.end_date),
        unit: `· ${outlook.next.days}${outlook.next.open_end ? "+" : ""} days`,
        context: `Starts ${formatDay(outlook.next.start_date, "weekday")}`,
        whole: counts,
      };
    }
    return {
      label: `Next ${name}`,
      value: "None",
      unit: "",
      context: `No ${name}s of ${minDays}+ days ahead in this forecast`,
      whole: outlook.spells.length ? counts : null,
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
  const wetDay = series.thresholds.wet_day_mm;
  const first = series.days[0];
  const last = series.days[series.days.length - 1];
  const month = (iso: string) => formatDay(iso, "compact").split(" ")[1] ?? "";
  const hasPast = Boolean(first && first.date < today);
  const hasToday = series.days.some((day) => day.date === today);
  return (
    <div className="ss-calendar" data-testid="subseasonal-calendar">
      {first && last ? (
        <p className="ss-calendar-head">
          {month(first.date)} – {month(last.date)} {last.date.slice(0, 4)}
        </p>
      ) : null}
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
          const date = new Date(`${day.date}T00:00:00Z`).getUTCDate();
          const value = day.value ?? 0;
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
              <span className="ss-cal-date">
                {date}
                {/* Month changes are marked on their first day (and on the run's first day). */}
                {date === 1 || day.day === 1 ? <small> {month(day.date)}</small> : null}
              </span>
              <span className="ss-cal-amount">{value >= wetDay ? `${Math.round(value)} mm` : "–"}</span>
            </button>
          );
        })}
      </div>
      <div className="ss-frame-legend ss-calendar-legend" aria-hidden="true">
        <span className="key cal-wet">Rain day ({wetDay} mm or more)</span>
        <span className="key cal-dry">Dry day</span>
        {focus === "dry" ? <span className="key cal-dry-spell">Dry spell</span> : null}
        {focus === "wet" ? <span className="key cal-wet-spell">Wet spell</span> : null}
        {hasPast ? <span className="key past">Past</span> : null}
        {hasToday ? <span className="key cal-today">Today</span> : null}
      </div>
    </div>
  );
}

const SPELL_STATUS_LABELS: Record<SpellStatus, string> = { past: "Past", now: "Now", coming: "Coming" };

/** Every spell of one kind with its status, dates, length and rain; open ends are spelled out. */
function SpellList({ series, kind }: { series: SubseasonalSeries; kind: SpellKind }) {
  const today = todayIso();
  const spells = series.spells.filter((spell) => spell.kind === kind);
  if (!spells.length) {
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    return <p className="ss-muted">No {kind} spells of {minDays}+ days in this forecast window.</p>;
  }
  const last = series.days[series.days.length - 1];
  const runsOn = spells.some((spell) => spell.open_end);
  const runsIn = spells.some((spell) => spell.open_start);
  return (
    <>
      <ul className="ss-spell-list" data-testid="subseasonal-spells">
        {spells.map((spell) => {
          const status = spellStatus(spell, today);
          return (
            <li key={`${spell.kind}-${spell.start_day}`} className={`ss-spell ${spell.kind} ${status}`}>
              <span className={`ss-spell-status ${status}`}>{SPELL_STATUS_LABELS[status]}</span>
              <span className="ss-spell-dates">
                {spell.open_start ? "← " : ""}
                {formatRange(spell.start_date, spell.end_date)}
                {spell.open_end ? " →" : ""}
              </span>
              <span className="ss-spell-length">
                <strong>
                  {spell.days}
                  {spell.open_start || spell.open_end ? "+" : ""} days
                </strong>
                {formatAmount(spell.total_mm, "mm")}
              </span>
            </li>
          );
        })}
      </ul>
      {runsOn || runsIn ? (
        <p className="ss-spell-note">
          {runsIn ? `← started before ${formatDay(series.days[0]?.date ?? "", "short")}, the first forecast day. ` : ""}
          {runsOn && last ? `→ continues past ${formatDay(last.date, "short")}, the end of this forecast.` : ""}
        </p>
      ) : null}
    </>
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
  aggregation,
  currentDay,
  currentWeek,
  onSeekDay,
  onSelectWeek,
}: {
  layer: SubseasonalLayerKey;
  series: SubseasonalSeries;
  aggregation: SubseasonalAggregation;
  currentDay: number | null;
  currentWeek: number | null;
  onSeekDay: (day: number) => void;
  onSelectWeek: (week: number) => void;
}) {
  if (layer === "rainy_days" || layer === "dry_spell_days" || layer === "wet_spell_days") {
    // One rule for the day-count layers: the day chart when daily, the week chart when weekly, both
    // for the whole run; then the spell list (spells), and the day-by-day calendar folded last.
    const kind: SpellKind | null = layer === "dry_spell_days" ? "dry" : layer === "wet_spell_days" ? "wet" : null;
    const wetDay = series.thresholds.wet_day_mm;
    const kicker = kind === "dry" ? "Dry spells" : kind === "wet" ? "Wet spells" : "Rain days";
    const daySection = (
      <Section
        kicker={kicker}
        title={kind === "dry" ? "Rain and dry spells by day" : kind === "wet" ? "Rain and wet spells by day" : "Rain by day"}
      >
        <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} bands={kind ?? "none"} />
      </Section>
    );
    const weekSection = (
      <Section kicker={kicker} title={kind === "dry" ? "Dry-spell days by week" : kind === "wet" ? "Wet-spell days by week" : "Rain days by week"}>
        <WeeklyChart
          series={series}
          values={weeklyDayCounts(series, (day) => (kind ? day.spell === kind : Boolean(day.wet)))}
          currentWeek={currentWeek}
          onSelectWeek={aggregation === "weekly" ? onSelectWeek : undefined}
          title={kind === "dry" ? "Days in dry spells per week" : kind === "wet" ? "Days in wet spells per week" : "Rain days per week"}
          yLabel="Days"
          legend={
            kind === "dry" ? "Dry-spell days in the week" : kind === "wet" ? "Wet-spell days in the week" : `Rain days in the week (${wetDay} mm or more)`
          }
          unit="days"
          tone={kind ?? "rainy"}
          maxValue={7}
        />
      </Section>
    );
    const calendar = (
      <details className="ss-fold" data-testid="subseasonal-calendar-fold">
        <summary>Day-by-day calendar</summary>
        <SpellCalendar series={series} currentDay={currentDay} onSelectDay={onSeekDay} focus={kind ?? undefined} />
      </details>
    );
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    return (
      <>
        {aggregation === "weekly" ? null : daySection}
        {aggregation === "daily" ? null : weekSection}
        {kind ? (
          <Section kicker={kicker} title={`Runs of ${minDays}+ ${kind} days`}>
            <SpellList series={series} kind={kind} />
            {calendar}
          </Section>
        ) : (
          <Section kicker={kicker} title={`Days with ${wetDay} mm or more`}>
            {calendar}
          </Section>
        )}
      </>
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
  // Rainfall follows the map's period: days when daily, weeks when weekly, both for the whole run.
  return (
    <>
      {aggregation === "weekly" ? null : (
        <Section kicker="Daily rainfall" title="Rain by day">
          <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} />
        </Section>
      )}
      {aggregation === "daily" ? null : (
        <Section kicker="Weekly totals" title="Rainfall by week">
          <WeeklyRainChart
            series={series}
            currentWeek={currentWeek}
            onSelectWeek={aggregation === "weekly" ? onSelectWeek : undefined}
          />
        </Section>
      )}
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
  const currentWeek = state.aggregation === "weekly" ? state.index : null;
  // The day or week on the map, so the advisory can mark the advice that falls in it.
  const advisoryPeriod = useMemo(() => {
    if (!series) return null;
    if (currentDay) {
      const day = series.days[currentDay - 1];
      return day ? { from: day.date, to: day.date, label: formatDay(day.date, "weekday") } : null;
    }
    if (currentWeek) {
      const week = series.weeks.find((item) => item.week === currentWeek);
      return week
        ? { from: week.start_date, to: week.end_date, label: `${week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`} (${formatRange(week.start_date, week.end_date)})` }
        : null;
    }
    return null;
  }, [currentDay, currentWeek, series]);
  // The headline answers for the period on the map: the day, the week, or (null) the whole run.
  const period = { aggregation: state.aggregation, index: state.index };
  const periodHero = series ? (layer === "rainfall" ? rainPeriodHero(series, period) : indicatorPeriodHero(layer, series, period)) : null;
  const hero = series ? periodHero ?? heroFor(layer, series, todayIso(), currentDay) : null;

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

            <AdvisoryPanel
              advisory={advisory}
              crop={crop}
              onCropChange={setCrop}
              period={advisoryPeriod}
              issued={run ? formatDay(run.init_time.slice(0, 10), "short") : undefined}
            />

            <LayerSections
              layer={layer}
              series={series}
              aggregation={state.aggregation}
              currentDay={currentDay}
              currentWeek={currentWeek}
              onSeekDay={onSeekDay}
              onSelectWeek={state.setIndex}
            />

            <section className="ss-drawer-notes">
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
