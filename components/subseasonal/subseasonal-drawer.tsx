"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AdvisoryPanel } from "@/components/subseasonal/advisory-panel";
import { DataInfo } from "@/components/subseasonal/data-info";
import { SpellControls } from "@/components/subseasonal/spell-controls";
import { StatControls } from "@/components/subseasonal/stat-controls";
import { DailyChanceChart, RainChart, WeeklyChart, WeeklyRainChart, WeeklyWettestDayChart } from "@/components/subseasonal/rain-chart";
import type { SubseasonalState } from "@/hooks/use-subseasonal";
import {
  availableLayers,
  downloadText,
  formatAmount,
  formatDay,
  formatRange,
  isEnsemble,
  LAYER_SHORT_LABELS,
  layerLabel,
  medianOf,
  membersAtLeast,
  seriesToCsv,
  spellOutlook,
  spellStatus,
  todayIso,
  chanceBasis,
  dayChance,
  extremeChanceByDate,
  totalChance,
  totalChanceByDate,
  weekChance,
  weeklyExtremeChance,
  dayCountSpread,
  observedDayCount,
} from "@/lib/subseasonal";
import type { SpellKind, SpellStat, SpellStatus, StatView, SubseasonalAggregation, SubseasonalLayerKey, SubseasonalSeries } from "@/lib/subseasonal";
import { useSiteContent } from "@/lib/content/content-context";
import type { AdvisoryContent } from "@/lib/content/advisory-content";
import { buildSubseasonalAdvisory, isCropKey } from "@/lib/subseasonal-advisory";
import type { CropKey } from "@/lib/subseasonal-advisory";

// v2: "All crops" became the default, so earlier stored picks start over from it.
const CROP_STORAGE_KEY = "ss-advisory-crop-v2";

/** The viewer's crop, remembered on this device only. */
function useCropPreference(content: AdvisoryContent) {
  const [crop, setCrop] = useState<CropKey>(content.crops[0]?.key ?? "all");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CROP_STORAGE_KEY);
      if (isCropKey(stored, content)) {
        setCrop(stored);
      }
    } catch {
      // Storage unavailable (private mode): keep the default.
    }
  }, [content]);
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
/**
 * Ensemble rainfall headline for the median or chance view, for the map's day, week or whole run;
 * null for the mean (the usual rainfall headline already shows it).
 */
function statHero(series: SubseasonalSeries, period: { aggregation: SubseasonalAggregation; index: number }, view: StatView | null): Hero | null {
  if (!view || view.stat === "mean" || !isEnsemble(series)) {
    return null;
  }
  const amount = view.threshold ?? 0;
  let members: (number | null)[] | null | undefined;
  let when: string;
  let mean: number | null;
  let chance: number | null;
  if (period.aggregation === "daily") {
    const day = series.days[period.index - 1];
    if (!day) return null;
    members = day.members;
    when = formatDay(day.date, "weekday");
    mean = day.value;
    chance = dayChance(series, day, amount);
  } else if (period.aggregation === "weekly") {
    const week = series.weeks.find((item) => item.week === period.index);
    if (!week) return null;
    members = week.members;
    when = `${week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`} (${formatRange(week.start_date, week.end_date)})`;
    mean = week.value;
    chance = weekChance(week, amount);
  } else {
    members = series.member_totals;
    when = `${series.days.length} days`;
    mean = series.metrics.total_mm;
    chance = totalChance(series, amount);
  }
  if (view.stat === "median") {
    const median = medianOf(members);
    return {
      label: `Rainfall (median) · ${when}`,
      value: formatAmount(median, "mm").replace(/ mm$/, ""),
      unit: "mm",
      context: `Half of the ${series.members} members get more, half less`,
      whole: `Ensemble mean ${formatAmount(mean, "mm")}`,
    };
  }
  return {
    label: `Chance of ${amount} mm or more · ${when}`,
    value: String(Math.round(chance ?? 0)),
    unit: "%",
    context: series.kind === "point" ? `${membersAtLeast(members, amount)} members reach ${amount} mm` : "Area average, as on the map",
    whole: `Median ${formatAmount(medianOf(members), "mm")} · mean ${formatAmount(mean, "mm")}`,
  };
}

/**
 * The headline for an elapsed day that has been observed: what happened, not a chance. Onset keeps
 * its own headline (it is about the whole run); null when the shown day is not an observed one.
 */
function observedDayHero(
  layer: SubseasonalLayerKey,
  series: SubseasonalSeries,
  period: { aggregation: SubseasonalAggregation; index: number },
): Hero | null {
  if (period.aggregation !== "daily" || layer === "onset") {
    return null;
  }
  const day = series.days[period.index - 1];
  if (!day?.observed) {
    return null;
  }
  const when = formatDay(day.date, "weekday");
  const ensemble = isEnsemble(series);
  const wetDay = series.thresholds.wet_day_mm;
  const forecast =
    day.forecast_value !== null && day.forecast_value !== undefined
      ? `forecast${ensemble ? " mean" : ""} was ${formatAmount(day.forecast_value, "mm")}`
      : null;
  const whole = `Observed · day ${day.day} of ${series.days.length}`;
  if (layer === "extreme_rain") {
    const threshold = series.thresholds.extreme_rain_mm ?? 50;
    return {
      label: `${threshold} mm+ on ${when}?`,
      value: (day.value ?? 0) >= threshold ? "Yes" : "No",
      unit: "",
      context: [`${formatAmount(day.value, "mm")} fell`, forecast].filter(Boolean).join(" · "),
      whole,
    };
  }
  if (layer === "rainy_days") {
    return {
      label: `Rain day on ${when}?`,
      value: (day.value ?? 0) >= wetDay ? "Yes" : "No",
      unit: "",
      context: [`${formatAmount(day.value, "mm")} fell`, forecast].filter(Boolean).join(" · "),
      whole,
    };
  }
  if (layer === "dry_spell_days" || layer === "wet_spell_days") {
    const kind: SpellKind = layer === "dry_spell_days" ? "dry" : "wet";
    const chance = ensemble ? day.spell_prob?.[kind] : day.spell === kind ? 100 : 0;
    const certain = chance === 0 || chance === 100 || chance === null || chance === undefined;
    if (!certain) {
      // Observed so far, but whether these days add up to a spell depends on the days ahead.
      return {
        label: `Chance of being in a ${kind} spell on ${when}`,
        value: String(Math.round(chance ?? 0)),
        unit: "%",
        context: `${formatAmount(day.value, "mm")} fell · whether it makes a ${kind} spell depends on the coming days`,
        whole,
      };
    }
    return {
      label: `In a ${kind} spell on ${when}?`,
      value: chance ? "Yes" : "No",
      unit: "",
      context: `${formatAmount(day.value, "mm")} fell`,
      whole,
    };
  }
  return {
    label: `Rainfall · ${when}`,
    value: formatAmount(day.value, "mm").replace(/ mm$/, ""),
    unit: "mm",
    context: forecast ? forecast.charAt(0).toUpperCase() + forecast.slice(1) : "Observed rainfall",
    whole,
  };
}

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
  spellStat: SpellStat = "chance",
): Hero | null {
  if (layer === "extreme_rain") {
    return extremePeriodHero(series, period);
  }
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
    if (isEnsemble(series)) {
      // An ensemble answers "how likely", not yes or no.
      const chance = kind ? day.spell_prob?.[kind] : day.wet_prob;
      const starts = kind ? day.spell_start_prob?.[kind] : null;
      const ahead = kind ? day.spell_ahead_prob?.[kind] : null;
      const members = `${chance === null || chance === undefined ? "–" : Math.round(((chance ?? 0) / 100) * (series.members ?? 1))} of ${series.members} members`;
      return {
        label: kind ? `Chance of being in a ${name} on ${when}` : `Chance of a rain day on ${when}`,
        value: String(Math.round(chance ?? 0)),
        unit: "%",
        // Spells ahead: how likely one begins that day, and within the next two weeks.
        context:
          kind && starts !== null && starts !== undefined
            ? `Starts that day ${Math.round(starts)}%${ahead !== null && ahead !== undefined ? ` · starts within ${series.spell_ahead_days ?? 14} days ${Math.round(ahead)}%` : ""}`
            : `${members} · mean ${formatAmount(day.value, "mm")}`,
        whole: kind && starts !== null && starts !== undefined ? members : `Day ${day.day} of ${series.days.length}`,
      };
    }
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
  if (period.aggregation === "total" && kind && spellStat === "chance" && series.spell_chance_total) {
    // The whole run, as on the map: the chance of at least one spell of the chosen length, with the
    // most likely one (if most members agree on one) as context.
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    const chance = series.spell_chance_total[kind];
    const today = todayIso();
    const next = series.spells.find((item) => item.kind === kind && item.end_date >= today);
    return {
      label: `Chance of a ${minDays}+ day ${name} · ${series.days.length} days`,
      value: String(Math.round(chance)),
      unit: "%",
      context: next
        ? `Most likely ${formatRange(next.start_date, next.end_date)}${next.probability !== null && next.probability !== undefined ? ` (${Math.round(next.probability)}% of members)` : ""}`
        : chance > 0
          ? `Fewer than half of the members agree on when`
          : `No ${minDays}+ day ${name} in ${isEnsemble(series) ? "any member" : "this run"}`,
      whole: isEnsemble(series) ? `${Math.round((chance / 100) * (series.members ?? 1))} of ${series.members} members` : null,
    };
  }
  if (period.aggregation === "weekly") {
    const week = series.weeks.find((item) => item.week === period.index);
    if (!week) {
      return null;
    }
    const days = series.days.filter((day) => day.day >= week.start_day && day.day <= week.end_day);
    const weekName = `${week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`} (${formatRange(week.start_date, week.end_date)})`;
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    const chance = kind && spellStat === "chance" ? week.spell_chance?.[kind] : null;
    if (kind && chance !== null && chance !== undefined) {
      // The chance of a spell of the chosen length touching this week, as on the map.
      return {
        label: `Chance of a ${minDays}+ day ${name} · ${weekName}`,
        value: String(Math.round(chance)),
        unit: "%",
        context: isEnsemble(series) ? `${Math.round((chance / 100) * (series.members ?? 1))} of ${series.members} members` : chance ? "This run has one" : "None in this run",
        whole: series.spell_chance_total ? `Whole run: ${Math.round(series.spell_chance_total[kind])}%` : null,
      };
    }
    const spread = isEnsemble(series) ? dayCountSpread(week, kind) : null;
    if (spread) {
      const round = (value: number | null | undefined) => String(Math.round((value ?? 0) * 10) / 10);
      return {
        label: `${kind === "dry" ? "Dry-spell" : kind === "wet" ? "Wet-spell" : "Rain"} days · ${weekName}`,
        value: round(spread.mean),
        unit: `/ ${week.days} days`,
        context: `Mean of ${series.members} members · from ${round(spread.min)} to ${round(spread.max)} days`,
        whole: null,
      };
    }
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

/** Extreme rain for the shown day or week: the chance (ensemble) or whether the run forecasts it. */
function extremePeriodHero(series: SubseasonalSeries, period: { aggregation: SubseasonalAggregation; index: number }): Hero | null {
  const threshold = series.thresholds.extreme_rain_mm ?? 50;
  const ensemble = isEnsemble(series);
  if (period.aggregation === "daily") {
    const day = series.days[period.index - 1];
    if (!day) {
      return null;
    }
    const when = formatDay(day.date, "weekday");
    if (ensemble) {
      return {
        label: `Chance of ${threshold} mm+ on ${when}`,
        value: String(Math.round(day.extreme_prob ?? 0)),
        unit: "%",
        context: `Wettest member ${formatAmount(day.spread?.max, "mm")} · mean ${formatAmount(day.value, "mm")}`,
        whole: `Day ${day.day} of ${series.days.length}`,
      };
    }
    return {
      label: `${threshold} mm+ on ${when}?`,
      value: (day.value ?? 0) >= threshold ? "Yes" : "No",
      unit: "",
      context: `${formatAmount(day.value, "mm")} forecast`,
      whole: `Day ${day.day} of ${series.days.length}`,
    };
  }
  if (period.aggregation === "weekly") {
    const week = series.weeks.find((item) => item.week === period.index);
    if (!week) {
      return null;
    }
    const days = series.days.filter((day) => day.day >= week.start_day && day.day <= week.end_day);
    const peak = days.reduce<SubseasonalSeries["days"][number] | null>(
      (best, day) => ((day.extreme_prob ?? 0) > (best?.extreme_prob ?? 0) ? day : best),
      null,
    );
    const weekName = `${week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`} (${formatRange(week.start_date, week.end_date)})`;
    const weekValue = weeklyExtremeChance(series, threshold)[week.week - 1] ?? 0;
    return {
      label: `Chance of a ${threshold} mm+ day · ${weekName}`,
      value: String(Math.round(weekValue)),
      unit: "%",
      context:
        peak && (peak.extreme_prob ?? 0) > 0
          ? `Most likely ${formatDay(peak.date, "weekday")} (${Math.round(peak.extreme_prob ?? 0)}% that day)`
          : `No day of ${threshold} mm or more this week`,
      whole: ensemble || series.kind !== "point" ? sentenceCase(chanceBasis(series)) : null,
    };
  }
  // Whole run: the figure the map and the chart show (a 50 mm+ day anywhere in the run), with
  // what is still ahead of today as context.
  const byDate = extremeChanceByDate(series, threshold);
  const wholeRun = byDate[byDate.length - 1] ?? 0;
  const peak = series.days.reduce<SubseasonalSeries["days"][number] | null>(
    (best, day) => ((day.extreme_prob ?? 0) > (best?.extreme_prob ?? 0) ? day : best),
    null,
  );
  const today = todayIso();
  const ahead = series.days.filter((day) => day.date >= today && (day.extreme_prob ?? 0) > 0);
  return {
    label: `Chance of a ${threshold} mm+ day · ${series.days.length} days`,
    value: String(Math.round(wholeRun)),
    unit: "%",
    context:
      peak && (peak.extreme_prob ?? 0) > 0
        ? `Most likely ${formatDay(peak.date, "weekday")}${ensemble ? ` (${Math.round(peak.extreme_prob ?? 0)}% that day)` : ""}`
        : `No day of ${threshold} mm or more ${ensemble ? "in any member" : "in this run"}`,
    whole: ahead.length
      ? `Still ahead: ${ahead.length} day${ahead.length === 1 ? "" : "s"} with some chance, from ${formatDay(ahead[0].date, "weekday")}`
      : peak && (peak.extreme_prob ?? 0) > 0
        ? "None of it is still ahead of today"
        : null,
  };
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
  if (layer === "extreme_rain") {
    // Answer first: the riskiest day ahead and how likely it is.
    const threshold = thresholds.extreme_rain_mm ?? 50;
    const ahead = all.filter((day) => day.date >= today);
    const peak = (ahead.length ? ahead : all).reduce<SubseasonalSeries["days"][number] | null>(
      (best, day) => ((day.extreme_prob ?? 0) > (best?.extreme_prob ?? 0) ? day : best),
      null,
    );
    const risky = (ahead.length ? ahead : all).filter((day) => (day.extreme_prob ?? 0) >= 10).length;
    if (!peak || (peak.extreme_prob ?? 0) <= 0) {
      // Nothing ahead; still say so if the run had a flood-level day before today.
      const earlier = all
        .filter((day) => day.date < today)
        .reduce<SubseasonalSeries["days"][number] | null>((best, day) => ((day.extreme_prob ?? 0) > (best?.extreme_prob ?? 0) ? day : best), null);
      return {
        label: `Extreme rain · ${span}`,
        value: "None",
        unit: "",
        context: `No day of ${threshold} mm or more ahead ${isEnsemble(series) ? "in any member" : "in this forecast"}`,
        whole:
          earlier && (earlier.extreme_prob ?? 0) > 0
            ? `Earlier in this run: ${isEnsemble(series) ? `${Math.round(earlier.extreme_prob ?? 0)}% chance` : formatAmount(earlier.value, "mm")} on ${formatDay(earlier.date, "weekday")}`
            : null,
      };
    }
    return isEnsemble(series)
      ? {
          label: `Highest chance of ${threshold} mm+ in a day`,
          value: String(Math.round(peak.extreme_prob ?? 0)),
          unit: `% · ${formatDay(peak.date, "weekday")}`,
          context: `${risky} day${risky === 1 ? "" : "s"} with a 10% chance or more`,
          whole: `Whole run: ${formatAmount(metrics.extreme_days, "days")} of ${threshold} mm+ per member on average`,
        }
      : {
          label: `Next ${threshold} mm+ day`,
          value: formatDay(peak.date, "weekday"),
          unit: `· ${formatAmount(peak.value, "mm")}`,
          context: `${formatAmount(metrics.extreme_days, "days")} of ${threshold} mm or more in this run`,
          whole: null,
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
    const notes = [
      status,
      onset.probability !== null && onset.probability !== undefined ? `${Math.round(onset.probability)}% of members have an onset` : null,
      onset.provisional ? `Provisional: dry-spell check covers ${onset.guard_days} of ${thresholds.onset_guard_days ?? 30} days` : null,
    ];
    return {
      label: `Onset · day ${onset.day} of the forecast`,
      value: formatDay(onset.date, "weekday"),
      unit: onset.date < today ? "(passed)" : "",
      context:
        onset.longest_dry_after === null
          ? `Median of the members' onset days · ${formatAmount(onset.rain_mm, "mm")} within ${windowDays} days (median)`
          : `${formatAmount(onset.rain_mm, "mm")} within ${windowDays} days · longest dry run after: ${formatAmount(onset.longest_dry_after, "days")}`,
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
  // Observed days keep their real wet/dry colours (they happened); only elapsed days still awaiting
  // observations are greyed out as past.
  const hasObserved = series.days.some((day) => day.observed);
  const hasPast = series.days.some((day) => day.date < today && !day.observed);
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
          const when = day.observed ? " observed" : day.date < today ? " past" : day.date === today ? " today" : "";
          const date = new Date(`${day.date}T00:00:00Z`).getUTCDate();
          const value = day.value ?? 0;
          const label = `${formatDay(day.date, "weekday")}${day.date === today ? " (today)" : ""}: ${formatAmount(day.value, "mm")}${day.observed ? " observed" : ""}${spell ? `, ${spell} spell` : ""}`;
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
        {hasObserved ? <span className="key cal-observed">Observed</span> : null}
        {hasPast ? <span className="key past">{hasObserved ? "Awaiting obs." : "Past"}</span> : null}
        {hasToday ? <span className="key cal-today">Today</span> : null}
      </div>
    </div>
  );
}

const SPELL_STATUS_LABELS: Record<SpellStatus, string> = { past: "Past", now: "Now", coming: "Coming" };

/** "Runs of dry days (5+ days)": the heading of a spell list. */
function runsTitle(series: SubseasonalSeries, kind: SpellKind) {
  const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
  return `Runs of ${kind} days (${minDays}+ days)`;
}


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
  const observedDays = observedDayCount(series);
  return (
    <>
      <ul className="ss-spell-list" data-testid="subseasonal-spells">
        {spells.map((spell) => {
          const status = spellStatus(spell, today);
          // A spell wholly inside the observed days happened: say so rather than just "Past".
          const observed = status === "past" && spell.end_day <= observedDays;
          return (
            <li key={`${spell.kind}-${spell.start_day}`} className={`ss-spell ${spell.kind} ${status}${observed ? " observed" : ""}`}>
              <span className={`ss-spell-status ${status}${observed ? " observed" : ""}`}>{observed ? "Observed" : SPELL_STATUS_LABELS[status]}</span>
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
              {spell.probability !== null && spell.probability !== undefined ? (
                <span
                  className={`ss-spell-chance ${spell.probability >= 66 ? "high" : spell.probability >= 33 ? "mid" : "low"}`}
                  title="Share of ensemble members with a spell over these days"
                >
                  {observed ? (
                    "Happened"
                  ) : (
                    <>
                      Chance {Math.round(spell.probability)}%
                      {series.members ? ` · ${Math.round((spell.probability / 100) * series.members)} of ${series.members} members` : ""}
                    </>
                  )}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {isEnsemble(series) ? (
        <p className="ss-spell-note">
          Each run is the days at least half of the {series.members} members agree on; its chance is the share of members with a {kind} spell then.
        </p>
      ) : null}
      {runsOn || runsIn ? (
        <p className="ss-spell-note">
          {runsIn ? `← began before ${formatDay(series.days[0]?.date ?? "", "short")}. ` : ""}
          {runsOn && last ? `→ runs past ${formatDay(last.date, "short")}.` : ""}
        </p>
      ) : null}
    </>
  );
}

/** One drawer card: a short title, then its chart or list. */
/** One drawer card. Chart cards leave the title to each chart; list cards have a heading. */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="drawer-section ss-card">
      {title ? (
        <div className="section-heading ss-section-heading">
          <h3>{title}</h3>
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The selected layer's sections, most important first. The drawer shows the first one straight under
 * the headline (so a change of layer, period or statistic is visible without scrolling) and the
 * rest after the advice.
 *
 * One rule for every layer and period: the amount first, then one answer about it (its chance, or
 * for a single run its weekly counts), so a period shows at most two charts. Week-by-week charts
 * belong to the Weekly period and are not repeated under the whole run.
 */
function layerSections({
  layer,
  series,
  aggregation,
  currentDay,
  currentWeek,
  onSeekDay,
  onSelectWeek,
  view = null,
  spellStat = "chance",
}: {
  /** Ensemble rainfall: the statistic chosen for the map (mean, median or chance). */
  view?: StatView | null;
  /** Spell layers, for a week: the chance of a spell of the chosen length, or the days in spells. */
  spellStat?: SpellStat;
  layer: SubseasonalLayerKey;
  series: SubseasonalSeries;
  aggregation: SubseasonalAggregation;
  currentDay: number | null;
  currentWeek: number | null;
  onSeekDay: (day: number) => void;
  onSelectWeek: (week: number) => void;
}): { charts: ReactNode[]; details: ReactNode[] } {
  if (layer === "rainy_days" || layer === "dry_spell_days" || layer === "wet_spell_days") {
    // The day charts when daily or for the whole run, the week chart when weekly (and for a single
    // run's whole run); then the spell list (spells), and the day-by-day calendar folded last.
    const kind: SpellKind | null = layer === "dry_spell_days" ? "dry" : layer === "wet_spell_days" ? "wet" : null;
    const wetDay = series.thresholds.wet_day_mm;
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    // Spells, two answers on one chart: bars for the chance a spell *begins* that day ("dry spells
    // ahead"), a line for the chance the day lies *inside* one (what the map shows). Older backends
    // without start chances keep the single "inside a spell" chart.
    const withStarts = Boolean(kind && series.days.some((day) => day.spell_start_prob));
    const spellChart = kind ? (
      withStarts ? (
        <DailyChanceChart
          series={series}
          values={series.days.map((day) => day.spell_start_prob?.[kind])}
          line={series.days.map((day) => day.spell_prob?.[kind])}
          currentDay={currentDay}
          onSelectDay={onSeekDay}
          title={`${kind === "dry" ? "Dry" : "Wet"} spells of ${minDays}+ days: chance (%)`}
          legend="Starts that day"
          lineLabel={`In a ${kind} spell`}
          judgeableUntil={series.days.length - minDays + 1}
          observedWords={{ yes: `In a ${kind} spell`, no: `No ${kind} spell` }}
          tone={kind}
          note={`A ${kind} spell is ${minDays}+ days in a row ${kind === "dry" ? `under ${wetDay} mm` : `of ${wetDay} mm or more`} (WMO/ETCCDI dry day: under ${wetDay} mm). Bars: the chance one begins that day; line: the chance the day is inside one, as on the map.`}
        />
      ) : (
        <DailyChanceChart
          series={series}
          values={series.days.map((day) => day.spell_prob?.[kind])}
          currentDay={currentDay}
          onSelectDay={onSeekDay}
          title={`Chance of being in a ${minDays}+ day ${kind} spell (%)`}
          legend={sentenceCase(chanceBasis(series))}
          observedWords={{ yes: `In a ${kind} spell`, no: `No ${kind} spell` }}
          tone={kind}
        />
      )
    ) : (
      <DailyChanceChart
        series={series}
        values={series.days.map((day) => day.wet_prob)}
        currentDay={currentDay}
        onSelectDay={onSeekDay}
        title="Chance of a rain day (%)"
        legend={sentenceCase(chanceBasis(series))}
        observedWords={{ yes: "Rain day", no: "Dry day" }}
        tone="rainy"
      />
    );
    const daySection = (
      <Section>
        <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} bands={kind ?? "none"} />
        {isEnsemble(series) ? spellChart : null}
      </Section>
    );
    const spreads = isEnsemble(series) && series.weeks.some((week) => dayCountSpread(week, kind)) ? series.weeks.map((week) => dayCountSpread(week, kind)) : null;
    // Spells, for a week, in Chance: the chance of a spell of the chosen length touching each week.
    const weekChance = Boolean(kind && spellStat === "chance" && series.weeks.some((week) => week.spell_chance));
    const weekSection = weekChance && kind ? (
      <Section>
        <WeeklyChart
          series={series}
          values={series.weeks.map((week) => week.spell_chance?.[kind] ?? null)}
          currentWeek={currentWeek}
          onSelectWeek={aggregation === "weekly" ? onSelectWeek : undefined}
          title={`Chance of a ${minDays}+ day ${kind} spell each week (%)`}
          yLabel="Chance (%)"
          legend={sentenceCase(chanceBasis(series))}
          unit="%"
          tone={kind}
          maxValue={100}
        />
      </Section>
    ) : (
      <Section>
        <WeeklyChart
          series={series}
          // Ensembles: each member's own count, spread as box plots around the members' mean (as on the map).
          values={
            spreads
              ? series.weeks.map((week) => dayCountSpread(week, kind)?.mean ?? null)
              : weeklyDayCounts(series, (day) => (kind ? day.spell === kind : Boolean(day.wet)))
          }
          spreads={spreads ?? undefined}
          centreLabel="Mean"
          currentWeek={currentWeek}
          onSelectWeek={aggregation === "weekly" ? onSelectWeek : undefined}
          title={kind ? `Days in ${minDays}+ day ${kind} spells per week` : "Rain days per week"}
          yLabel="Days"
          legend={kind === "dry" ? "Dry-spell days" : kind === "wet" ? "Wet-spell days" : `Days ≥${wetDay} mm`}
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
    return {
      charts: [
        aggregation === "weekly" ? null : <Fragment key="day">{daySection}</Fragment>,
        // Whole run: an ensemble's day section already pairs the rain with its chance chart; the
        // per-week counts belong to the Weekly period. A single run has no chance chart, so its
        // week counts stand in as the second chart.
        aggregation === "daily" || (aggregation === "total" && isEnsemble(series)) ? null : (
          <Fragment key="week">{weekSection}</Fragment>
        ),
      ].filter(Boolean),
      details: [
        kind ? (
          <Section key="runs" title={runsTitle(series, kind)}>
            <SpellList series={series} kind={kind} />
            {calendar}
          </Section>
        ) : (
          // Rain days: the calendar only; the runs of dry and wet days are the spell layers' own.
          <Section key="calendar">{calendar}</Section>
        ),
      ],
    };
  }
  if (layer === "extreme_rain") {
    // Follows the map's period like every other layer: days, weeks, or the whole run by date.
    const threshold = series.thresholds.extreme_rain_mm ?? 50;
    const ensemble = isEnsemble(series);
    const share =
      ensemble || series.kind !== "point" ? sentenceCase(chanceBasis(series)) : "Single run (0 or 100%)";
    const weekly = weeklyExtremeChance(series, threshold);
    const weekChart = (
      <WeeklyChart
        series={series}
        values={weekly}
        currentWeek={currentWeek}
        onSelectWeek={aggregation === "weekly" ? onSelectWeek : undefined}
        title={`Weekly chance of a ${threshold} mm+ day (%)`}
        yLabel="Chance (%)"
        legend={share}
        unit="%"
        tone="extreme"
        maxValue={100}
      />
    );
    if (aggregation === "weekly") {
      return {
        charts: [
          <Section key="wettest-week">
            <WeeklyWettestDayChart series={series} currentWeek={currentWeek} onSelectWeek={onSelectWeek} thresholdMm={threshold} />
          </Section>,
          <Section key="extreme-week">
            {weekChart}
          </Section>,
        ],
        details: [],
      };
    }
    if (aggregation === "total") {
      return {
        charts: [
        <Section key="rain">
          <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} bands="none" extremeMm={threshold} />
        </Section>,
        <Section key="extreme-total">
          {/* Like the spell charts: bars for each day's chance, a line for at least one by that date. */}
          <DailyChanceChart
            series={series}
            values={series.days.map((day) => day.extreme_prob)}
            line={extremeChanceByDate(series, threshold)}
            currentDay={currentDay}
            onSelectDay={onSeekDay}
            title={`Chance of a ${threshold} mm+ day (%)`}
            legend="That day"
            lineLabel="At least one by this date"
            observedWords={{ yes: `${threshold} mm+ fell`, no: `No ${threshold} mm+ day` }}
            tone="extreme"
          />
        </Section>,
        // The week-by-week charts are the Weekly period's; the whole run keeps its two answers.
        ],
        details: [],
      };
    }
    return {
      charts: [
      <Section key="rain">
        <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} bands="none" extremeMm={threshold} />
      </Section>,
      <Section key="extreme">
        <DailyChanceChart
          series={series}
          values={series.days.map((day) => day.extreme_prob)}
          currentDay={currentDay}
          onSelectDay={onSeekDay}
          title={`Chance of ${threshold} mm+ in a day (%)`}
          legend={share}
          observedWords={{ yes: `${threshold} mm+ fell`, no: `No ${threshold} mm+ day` }}
          tone="extreme"
        />
      </Section>,
      ],
      details: [],
    };
  }
  if (layer === "onset") {
    const { thresholds } = series;
    return {
      charts: [
      <Section key="onset">
        <RainChart series={series} currentDay={currentDay} onSelectDay={onSeekDay} onset={series.onset ?? null} />
        <p className="ss-onset-rule" data-testid="subseasonal-onset-rule">
          Onset: the first rain day after which {thresholds.onset_mm ?? 20} mm falls within {thresholds.onset_window_days ?? 3} days, with no dry
          spell over {thresholds.onset_max_dry_days ?? 10} days in the next {thresholds.onset_guard_days ?? 30}. Forecast days only.
        </p>
      </Section>,
      ],
      details: [],
    };
  }
  // Rainfall follows the map's period (days when daily, weeks when weekly, days plus one more for the whole run)
  // and, for an ensemble, the map's statistic: the charts centre on the mean or median, and the
  // chance view adds the probability of reaching the chosen amount under the amounts it counts.
  const centre = view?.stat === "median" ? "median" : "mean";
  const amount = view?.stat === "chance" ? (view.threshold ?? 0) : null;
  const chanceSection =
    amount === null || !isEnsemble(series) ? null : aggregation === "weekly" ? (
      <Section key="chance">
        <WeeklyChart
          key={`chance-${amount}`}
          series={series}
          values={series.weeks.map((week) => weekChance(week, amount))}
          currentWeek={currentWeek}
          onSelectWeek={onSelectWeek}
          title={`Chance of ${amount} mm+ in a week (%)`}
          yLabel="Chance (%)"
          legend={sentenceCase(chanceBasis(series))}
          unit="%"
          tone="rain"
          maxValue={100}
        />
      </Section>
    ) : (
      <Section key="chance">
        <DailyChanceChart
          key={`chance-${aggregation}-${amount}`}
          series={series}
          values={aggregation === "daily" ? series.days.map((day) => dayChance(series, day, amount)) : totalChanceByDate(series, amount)}
          cumulative={aggregation !== "daily"}
          currentDay={currentDay}
          onSelectDay={onSeekDay}
          title={aggregation === "daily" ? `Chance of ${amount} mm+ in a day (%)` : `Chance of ${amount} mm+ in total, so far (%)`}
          legend={sentenceCase(chanceBasis(series))}
          tone="rainy"
        />
      </Section>
    );
  // In the Chance view the amount being counted is drawn across the member boxes of the matching
  // period (daily amounts on the day chart, weekly amounts on the week chart), so the boxes show
  // which members reach it. Whole-run amounts have no matching day or week chart, so none is drawn.
  const dayLine = amount !== null && aggregation === "daily" ? amount : undefined;
  const weekLine = amount !== null && aggregation === "weekly" ? amount : undefined;
  const lineWords = (mm: number) => `${mm} mm`;
  const rainTitle = (base: string, line: number | undefined) =>
    `${base}${!isEnsemble(series) ? "" : line !== undefined ? ` vs ${line} mm` : `, ${centre}`} (mm)`;
  return {
    // The amount first, then its chance: the same order as every other panel (Extreme rain, spells).
    charts: [
    aggregation === "weekly" ? null : (
      <Section key="rain-day">
        <RainChart
          title={rainTitle("Daily rain", dayLine)}
          key={`${centre}-${dayLine ?? ""}`}
          series={series}
          currentDay={currentDay}
          onSelectDay={onSeekDay}
          centre={centre}
          bands={dayLine !== undefined ? "none" : "both"}
          extremeMm={dayLine}
          lineLabel={dayLine !== undefined ? lineWords(dayLine) : undefined}
        />
      </Section>
    ),
    aggregation === "weekly" ? null : chanceSection,
    // Whole run: at most two charts, the amount and one more. With a chance shown that is the
    // chance; otherwise the weekly totals, which add up to the run's total.
    aggregation === "daily" || (aggregation === "total" && chanceSection) ? null : (
      <Section key="rain-week">
        <WeeklyRainChart
          title={rainTitle("Weekly rain", weekLine)}
          key={`${centre}-${weekLine ?? ""}`}
          series={series}
          currentWeek={currentWeek}
          onSelectWeek={aggregation === "weekly" ? onSelectWeek : undefined}
          centre={centre}
          lineMm={weekLine}
          lineLabel={weekLine !== undefined ? lineWords(weekLine) : undefined}
        />
      </Section>
    ),
    aggregation === "weekly" ? chanceSection : null,
    ].filter(Boolean),
    details: [],
  };
}

/** Dragging the phone sheet down further than this closes it. */
const SHEET_CLOSE_DRAG_PX = 110;

/**
 * Phone sheet behaviour (iOS-style): drag the header down to pull the sheet with the finger, and let
 * go past a threshold to close it. Desktop ignores it (the drawer is a side card there).
 */
function useSheetDrag(onClose: () => void) {
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; dy: number } | null>(null);

  const setOffset = (px: number) => {
    sheetRef.current?.style.setProperty("--ss-sheet-drag", `${px}px`);
  };
  const onPointerDown = (event: React.PointerEvent) => {
    if (window.innerWidth > 860 || (event.target as HTMLElement).closest("button")) {
      return;
    }
    drag.current = { startY: event.clientY, dy: 0 };
    sheetRef.current?.classList.add("dragging");
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY);
    setOffset(drag.current.dy);
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    sheetRef.current?.classList.remove("dragging");
    setOffset(0);
    if (dy > SHEET_CLOSE_DRAG_PX) {
      onClose();
    }
  };
  return { sheetRef, handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } };
}

/** "Download CSV" and "Copy link" in the drawer footer: switched off for now, at the user's request. */
const SHOW_DRAWER_ACTIONS = false;

export function SubseasonalDrawer({ state, onSeekDay }: { state: SubseasonalState; onSeekDay: (day: number) => void }) {
  const { series, run, layer } = state;
  const header = headerFor(state);
  const [copied, setCopied] = useState(false);
  const sheet = useSheetDrag(state.closeDrawer);
  const currentDay = state.aggregation === "daily" ? state.index : null;
  const { advisory: advisoryContent } = useSiteContent();
  const [crop, setCrop] = useCropPreference(advisoryContent);
  const advisory = useMemo(
    () => (series ? buildSubseasonalAdvisory(layer, series, crop, undefined, advisoryContent) : null),
    [advisoryContent, crop, layer, series],
  );
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
  const view: StatView | null = state.stat ? { stat: state.stat, threshold: state.threshold } : null;
  const periodHero = series
    ? (observedDayHero(layer, series, period) ??
      (layer === "rainfall"
        ? (statHero(series, period, view) ?? rainPeriodHero(series, period))
        : indicatorPeriodHero(layer, series, period, state.spellStat)))
    : null;
  const hero = series ? periodHero ?? heroFor(layer, series, todayIso(), currentDay) : null;
  const sections = series
    ? layerSections({
        layer,
        series,
        aggregation: state.aggregation,
        currentDay,
        currentWeek,
        onSeekDay,
        onSelectWeek: state.setIndex,
        view,
        spellStat: state.spellStat,
      })
    : { charts: [], details: [] };

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
    <>
    {/* Phones: the map dims behind the sheet; tapping it closes the sheet. */}
    <div className={`ss-sheet-backdrop${state.isDrawerOpen ? " open" : ""}`} aria-hidden="true" onClick={state.closeDrawer} />
    <aside
      ref={sheet.sheetRef}
      data-testid="dashboard-drawer"
      className={`drawer ss-drawer ss-layer-${layer}${state.isDrawerOpen ? " open" : ""}`}
      aria-label="Location forecast"
    >
      <span className="ss-sheet-grabber" aria-hidden="true" {...sheet.handlers} />
      <div className="drawer-header" {...sheet.handlers}>
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

            {layer === "rainfall" ? <StatControls state={state} variant="compact" /> : null}
            {state.spellKind ? <SpellControls state={state} variant="compact" /> : null}
            {sections.charts}

            <AdvisoryPanel
              advisory={advisory}
              crop={crop}
              onCropChange={setCrop}
              period={advisoryPeriod}
              issued={run ? formatDay(run.init_time.slice(0, 10), "short") : undefined}
            />

            {sections.details}

            <section className="ss-drawer-notes">{run ? <DataInfo run={run} layer={layer} /> : null}</section>
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
    </>
  );
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
