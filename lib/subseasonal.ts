import { ApiError, getJson, resolveBackendUrl } from "@/lib/api";

/* ------------------------------------------------------------------------------------------
 * Sub-seasonal (46-day) IFS-UNet rainfall: types, API client, formatting and URL state.
 * ------------------------------------------------------------------------------------------ */

export type SubseasonalLayerKey = "rainfall" | "rainy_days" | "dry_spell_days" | "wet_spell_days" | "extreme_rain" | "onset";
export type SubseasonalAggregation = "daily" | "weekly" | "total";
export type SubseasonalAreaLevel = "region" | "district";
export type SpellKind = "dry" | "wet";

export type SubseasonalThresholds = {
  wet_day_mm: number;
  dry_spell_min_days: number;
  wet_spell_min_days: number;
  /** Onset rule; absent from backends that predate the onset layer. */
  onset_mm?: number;
  onset_window_days?: number;
  onset_guard_days?: number;
  onset_max_dry_days?: number;
  /** Extreme rain layer: 24-hour rain at or above this. */
  extreme_rain_mm?: number;
};

/** Ensemble spread of a daily or weekly amount (mm). */
export type SubseasonalSpread = {
  min?: number | null;
  p10?: number | null;
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  p90?: number | null;
  max?: number | null;
  mean?: number | null;
};

/** First day of the rainy season found inside the forecast (see the backend onset rule). */
export type SubseasonalOnset = {
  day: number;
  date: string;
  rain_mm: number | null;
  longest_dry_after: number | null;
  /** Days the dry-spell check could cover before the forecast ended. */
  guard_days: number;
  /** The check was cut short by the end of the forecast. */
  provisional: boolean;
  /** Ensemble only: % of members with an onset in the forecast (`day` is their median). */
  probability?: number | null;
};

export type SubseasonalDay = {
  day: number;
  date: string; // YYYY-MM-DD rain day (00-24 UTC)
  period_start: string;
  period_end: string;
  value: number | null;
  wet?: boolean | null;
  spell?: SpellKind | null;
  /** Ensemble only: spread across members, and % of members with a rain day / inside a spell. */
  spread?: SubseasonalSpread | null;
  wet_prob?: number | null;
  spell_prob?: { dry: number; wet: number } | null;
  /** % of members (0 or 100 for a single run) at or above the extreme-rain threshold. */
  extreme_prob?: number | null;
  /** Ensemble only: each member's amount (mm). */
  members?: (number | null)[] | null;
  /**
   * Chances worked out per grid cell and averaged over the place, as on the map (keys are mm):
   * reaching each daily amount, a 50 mm+ day by this date, and each whole-run amount by this date.
   */
  chance?: Record<string, number | null> | null;
  extreme_by_date?: number | null;
  total_by_date?: Record<string, number | null> | null;
};

export type SubseasonalWeek = {
  week: number;
  start_day: number;
  end_day: number;
  start_date: string;
  end_date: string;
  days: number;
  partial: boolean;
  value: number | null;
  spread?: SubseasonalSpread | null;
  members?: (number | null)[] | null;
  chance?: Record<string, number | null> | null;
  extreme_prob?: number | null;
};

export type SubseasonalLayerOption = {
  layer: SubseasonalLayerKey;
  label: string;
  description: string;
  aggregations: SubseasonalAggregation[];
};

/** Which downscaling model produced a run, parsed upstream from its directory names. */
export type SubseasonalProvenance = {
  source_path?: string | null;
  model_dir?: string | null;
  model_type?: string | null;
  checkpoint_dir?: string | null;
  checkpoint?: string | null;
  checkpoint_step?: number | null;
  sampler?: string | null;
  sampler_steps?: number | null;
  guidance_scale?: number | null;
  ensemble_size?: number | null;
  source_attrs?: Record<string, string>;
};

export type SubseasonalRun = {
  run_id: string;
  active: boolean;
  source_id: string;
  source_label: string;
  model_label: string;
  ensemble: string;
  /** 1 for a single run; missing from older backends. */
  members?: number;
  /** A made-up demo run, not model output. */
  synthetic?: boolean;
  init_time: string;
  ingested_at: string | null;
  /** Missing from backends older than provenance tracking. */
  provenance?: SubseasonalProvenance;
  lead_days: number;
  expected_lead_days: number;
  missing_lead_days: number[];
  first_day: string;
  last_day: string;
  age_days: number;
  is_stale: boolean;
  unit: string;
  grid_resolution_degrees: number | null;
  thresholds: SubseasonalThresholds;
  days: SubseasonalDay[];
  weeks: SubseasonalWeek[];
  layers: SubseasonalLayerOption[];
  guidance: string;
};

/** One entry of the model picker; `available` is false until the model has an ingested run. */
export type SubseasonalModelOption = {
  id: string;
  label: string;
  source_label: string;
  description?: string | null;
  available: boolean;
  active_run_id?: string | null;
  init_time?: string | null;
  members?: number | null;
  synthetic?: boolean;
};

export type SubseasonalModelsResponse = {
  default_model: string;
  models: SubseasonalModelOption[];
};

/** How an ensemble's rainfall is mapped: the members' mean, their median, or the chance of an amount. */
export type RainStat = "mean" | "median" | "chance";
export const RAIN_STATS: RainStat[] = ["mean", "median", "chance"];
export const RAIN_STAT_LABELS: Record<RainStat, string> = { mean: "Mean", median: "Median", chance: "Chance" };
/** Amounts (mm) a chance map can count members against, per period; mirrors the backend list. */
export const CHANCE_THRESHOLDS: Record<SubseasonalAggregation, number[]> = {
  daily: [10, 25, 50],
  weekly: [25, 50, 100],
  total: [100, 200, 300],
};

export type SubseasonalRunsResponse = {
  active_run_id: string;
  runs: SubseasonalRun[];
};

export type LegendBin = {
  min: number;
  max: number | null;
  color: string;
  label: string;
};

export type SubseasonalLegend = {
  key: string;
  unit: string;
  note: string | null;
  /** Bins are named classes ("In a dry spell"), not numeric ranges. */
  categorical?: boolean;
  bins: LegendBin[];
};

export type SubseasonalLayer = {
  run_id: string;
  layer: SubseasonalLayerKey;
  layer_label: string;
  aggregation: SubseasonalAggregation;
  index: number;
  index_count: number;
  title: string;
  start_day: number;
  end_day: number;
  start_date: string;
  end_date: string;
  unit: string;
  legend: SubseasonalLegend;
  tile_url: string;
  stats: {
    mean: number | null;
    max: number | null;
    min: number | null;
    /**
     * Onset layer. Whole window: `share` = % of Ghana with an onset in the forecast. By day: `share` =
     * % where the rains have set in by that day, `upcoming_share` = % where they are still to come.
     */
    share?: number | null;
    upcoming_share?: number | null;
    provisional_share?: number | null;
  };
  description: string;
  /** Onset only: % of Ghana where the rains have set in by each day. */
  progress?: number[] | null;
  /** How the members are combined: one run, ensemble mean/median, or % of members. */
  statistic?: "single" | "mean" | "median" | "probability";
  members?: number;
  /** Ensemble rainfall chance maps: the amount counted, and the amounts offered for this period. */
  threshold_mm?: number | null;
  chance_thresholds?: number[];
  /** Ensemble rainfall median / chance: the national value per day or week, for the dock timeline. */
  timeline?: (number | null)[] | null;
  timeline_unit?: string | null;
};

export type SubseasonalAreaValues = {
  run_id: string;
  level: SubseasonalAreaLevel;
  layer: SubseasonalLayerKey;
  aggregation: SubseasonalAggregation;
  index: number;
  unit: string;
  values: Record<string, number | null>;
};

export type SubseasonalSpell = {
  kind: SpellKind;
  start_day: number;
  end_day: number;
  days: number;
  start_date: string;
  end_date: string;
  open_start: boolean;
  open_end: boolean;
  total_mm: number | null;
  /** Ensemble only: % of members with a spell over these days. */
  probability?: number | null;
};

export type SubseasonalSeries = {
  kind: "point" | SubseasonalAreaLevel;
  name: string;
  region: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  nearest_latitude: number | null;
  nearest_longitude: number | null;
  inside_ghana: boolean;
  cell_count: number;
  support: string;
  run_id: string;
  init_time: string;
  unit: string;
  days: SubseasonalDay[];
  weeks: SubseasonalWeek[];
  metrics: {
    total_mm: number | null;
    rainy_days: number;
    dry_spell_days: number;
    wet_spell_days: number;
    max_day_mm: number | null;
    max_day: number | null;
    /** Days at or above the extreme threshold (mean over members for an ensemble). */
    extreme_days?: number | null;
  };
  onset?: SubseasonalOnset | null;
  spells: SubseasonalSpell[];
  thresholds: SubseasonalThresholds;
  guidance: string;
  members?: number;
  /** Ensemble only: each member's whole-run total (mm). */
  member_totals?: (number | null)[] | null;
  /** Whole run, per cell and averaged over the place: % reaching each whole-run amount (keys mm). */
  total_chance?: Record<string, number | null> | null;
};

/** The ensemble statistic the map shows, so the drawer's charts and headline can follow it. */
export type StatView = { stat: RainStat; threshold: number | null };

function finiteValues(values: (number | null)[] | null | undefined) {
  return (values ?? []).filter((value): value is number => value !== null && Number.isFinite(value));
}

/** Median of the members' amounts; null without members. */
export function medianOf(values: (number | null)[] | null | undefined) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** % of members with at least `mm`; null without members. */
export function chanceAtLeast(values: (number | null)[] | null | undefined, mm: number) {
  const finite = finiteValues(values);
  return finite.length ? (finite.filter((value) => value >= mm).length / finite.length) * 100 : null;
}

/** Members at or above `mm`, as "3 of 10". */
export function membersAtLeast(values: (number | null)[] | null | undefined, mm: number) {
  const finite = finiteValues(values);
  return `${finite.filter((value) => value >= mm).length} of ${finite.length}`;
}

/** Per day: % of members whose running total has reached `mm` by the end of that day. */
export function cumulativeChance(series: SubseasonalSeries, mm: number) {
  const memberCount = series.days[0]?.members?.length ?? 0;
  if (!memberCount) return series.days.map(() => null);
  const running = new Array<number>(memberCount).fill(0);
  return series.days.map((day) => {
    (day.members ?? []).forEach((value, member) => {
      running[member] += value ?? 0;
    });
    return (running.filter((total) => total >= mm).length / memberCount) * 100;
  });
}

/** Days from `start` to `end` (1-based, inclusive) where a member (or the single run) reaches `mm`. */
function reachesWithin(series: SubseasonalSeries, start: number, end: number, mm: number) {
  const days = series.days.filter((day) => day.day >= start && day.day <= end);
  const memberCount = days[0]?.members?.length ?? 0;
  if (!memberCount) {
    return days.some((day) => (day.value ?? 0) >= mm) ? 100 : 0;
  }
  let hit = 0;
  for (let member = 0; member < memberCount; member += 1) {
    if (days.some((day) => (day.members?.[member] ?? 0) >= mm)) hit += 1;
  }
  return (hit / memberCount) * 100;
}

/** Per week: % of members with at least one day of `mm` or more (0/100 for a single run). */
export function weeklyDayChance(series: SubseasonalSeries, mm: number) {
  return series.weeks.map((week) => reachesWithin(series, week.start_day, week.end_day, mm));
}

/** Per day: % of members that have had at least one day of `mm` or more by that date. */
export function firstDayChanceByDate(series: SubseasonalSeries, mm: number) {
  return series.days.map((day) => reachesWithin(series, 1, day.day, mm));
}

/*
 * Chances for the drawer, preferring the backend's cell-by-cell figures (the same as the map, so a
 * local storm is not averaged away over a region) and falling back to the place's member series.
 */
export function dayChance(series: SubseasonalSeries, day: SubseasonalDay, mm: number) {
  return day.chance?.[String(mm)] ?? chanceAtLeast(day.members, mm);
}

export function weekChance(week: SubseasonalWeek, mm: number) {
  return week.chance?.[String(mm)] ?? chanceAtLeast(week.members, mm);
}

export function totalChance(series: SubseasonalSeries, mm: number) {
  return series.total_chance?.[String(mm)] ?? chanceAtLeast(series.member_totals, mm);
}

/** Per day: chance the whole-run amount `mm` has been reached by that date. */
export function totalChanceByDate(series: SubseasonalSeries, mm: number) {
  return series.days[0]?.total_by_date ? series.days.map((day) => day.total_by_date?.[String(mm)] ?? null) : cumulativeChance(series, mm);
}

/** Per week: chance of a day at or above the extreme amount. */
export function weeklyExtremeChance(series: SubseasonalSeries, mm: number) {
  return series.weeks[0]?.extreme_prob !== undefined && series.weeks[0]?.extreme_prob !== null
    ? series.weeks.map((week) => week.extreme_prob ?? 0)
    : weeklyDayChance(series, mm);
}

/** Per day: chance of at least one extreme day by that date. */
export function extremeChanceByDate(series: SubseasonalSeries, mm: number) {
  return series.days[0]?.extreme_by_date !== undefined && series.days[0]?.extreme_by_date !== null
    ? series.days.map((day) => day.extreme_by_date ?? 0)
    : firstDayChanceByDate(series, mm);
}

/** How a chance for this place is counted, in words: members at a point, cells over an area. */
export function chanceBasis(series: SubseasonalSeries) {
  return series.kind === "point" ? `share of ${series.members ?? 1} members` : `area average of ${series.cell_count} cells, as on the map`;
}

/** Ensemble runs carry a per-member spread; single runs do not. */
export function isEnsemble(value: { members?: number } | null | undefined) {
  return (value?.members ?? 1) > 1;
}

/* ----------------------------------------------------------------------- shape guards */

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null;
const isNumberOrNull = (value: unknown) => value === null || typeof value === "number";
const isString = (value: unknown): value is string => typeof value === "string";

function isDay(value: unknown) {
  return isRecord(value) && typeof value.day === "number" && isString(value.date) && isNumberOrNull(value.value);
}

function isWeek(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.week === "number" &&
    typeof value.start_day === "number" &&
    typeof value.end_day === "number" &&
    isString(value.start_date) &&
    isNumberOrNull(value.value)
  );
}

function isThresholds(value: unknown) {
  return isRecord(value) && typeof value.wet_day_mm === "number" && typeof value.dry_spell_min_days === "number";
}

function isRun(value: unknown): value is SubseasonalRun {
  return (
    isRecord(value) &&
    isString(value.run_id) &&
    isString(value.init_time) &&
    typeof value.lead_days === "number" &&
    typeof value.is_stale === "boolean" &&
    isThresholds(value.thresholds) &&
    Array.isArray(value.days) &&
    value.days.every(isDay) &&
    Array.isArray(value.weeks) &&
    value.weeks.every(isWeek) &&
    Array.isArray(value.layers)
  );
}

function isModelsResponse(value: unknown): value is SubseasonalModelsResponse {
  return (
    isRecord(value) &&
    isString(value.default_model) &&
    Array.isArray(value.models) &&
    value.models.every((item) => isRecord(item) && isString(item.id) && isString(item.label) && typeof item.available === "boolean")
  );
}

function isRunsResponse(value: unknown): value is SubseasonalRunsResponse {
  return isRecord(value) && isString(value.active_run_id) && Array.isArray(value.runs) && value.runs.every(isRun);
}

function isLegend(value: unknown) {
  return (
    isRecord(value) &&
    isString(value.unit) &&
    Array.isArray(value.bins) &&
    value.bins.every((bin) => isRecord(bin) && typeof bin.min === "number" && isString(bin.color) && isString(bin.label))
  );
}

function isLayer(value: unknown): value is SubseasonalLayer {
  return (
    isRecord(value) &&
    isString(value.run_id) &&
    isString(value.layer) &&
    isString(value.aggregation) &&
    typeof value.index === "number" &&
    isString(value.tile_url) &&
    isString(value.title) &&
    isLegend(value.legend) &&
    isRecord(value.stats)
  );
}

function isAreaValues(value: unknown): value is SubseasonalAreaValues {
  return isRecord(value) && isString(value.level) && isRecord(value.values);
}

function isSeries(value: unknown): value is SubseasonalSeries {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.run_id) &&
    Array.isArray(value.days) &&
    value.days.every(isDay) &&
    Array.isArray(value.weeks) &&
    isRecord(value.metrics) &&
    Array.isArray(value.spells)
  );
}

/* ----------------------------------------------------------------------------- client */

export type LayerQuery = {
  /** Model id; null = the backend's default model. */
  model: string | null;
  runId: string;
  layer: SubseasonalLayerKey;
  aggregation: SubseasonalAggregation;
  index: number;
  /** Ensemble rainfall only. */
  stat?: RainStat | null;
  threshold?: number | null;
};

/** Query parameters every layer request shares; optional ones are left out when unset. */
function layerParams(query: LayerQuery) {
  const params: Record<string, string> = {
    run_id: query.runId,
    layer: query.layer,
    aggregation: query.aggregation,
    index: String(query.index),
  };
  if (query.model) params.model = query.model;
  if (query.stat) params.stat = query.stat;
  if (query.stat === "chance" && query.threshold !== null && query.threshold !== undefined) params.threshold = String(query.threshold);
  return params;
}

function modelParam(model: string | null): Record<string, string> {
  return model ? { model } : {};
}

export function getSubseasonalModels(signal?: AbortSignal) {
  return getJson("/subseasonal/models", {}, isModelsResponse, { signal });
}

export function getSubseasonalRuns(model: string | null = null, signal?: AbortSignal) {
  return getJson("/subseasonal/runs", modelParam(model), isRunsResponse, { signal });
}

export async function getSubseasonalLayer(query: LayerQuery, signal?: AbortSignal) {
  const layer = await getJson("/subseasonal/layer", layerParams(query), isLayer, { signal });
  return { ...layer, tile_url: resolveBackendUrl(layer.tile_url) };
}

export function getSubseasonalAreaValues(query: LayerQuery & { level: SubseasonalAreaLevel }, signal?: AbortSignal) {
  return getJson("/subseasonal/area-values", { ...layerParams(query), level: query.level }, isAreaValues, { signal });
}

export function sampleSubseasonalPoint(model: string | null, runId: string, latitude: number, longitude: number, signal?: AbortSignal) {
  return getJson(
    "/subseasonal/sample",
    { ...modelParam(model), run_id: runId, latitude: latitude.toFixed(4), longitude: longitude.toFixed(4) },
    isSeries,
    { signal },
  );
}

export function sampleSubseasonalArea(model: string | null, runId: string, level: SubseasonalAreaLevel, name: string, signal?: AbortSignal) {
  return getJson("/subseasonal/area", { ...modelParam(model), run_id: runId, level, name }, isSeries, { signal });
}

/** Tile URL for any selection, built client-side so neighbouring days can be prefetched. */
export function subseasonalTileUrl(query: LayerQuery) {
  const params = new URLSearchParams(layerParams(query));
  return resolveBackendUrl(`/subseasonal/tiles/{z}/{x}/{y}.png?${params.toString()}`);
}

export function formatSubseasonalError(error: unknown, subject = "46-day forecast") {
  if (error instanceof DOMException && error.name === "AbortError") {
    return null;
  }
  if (error instanceof ApiError) {
    switch (error.code) {
      case "subseasonal_run_not_available":
        return "No 46-day forecast run has been published yet.";
      case "subseasonal_run_not_found":
        return "This forecast run is no longer available. Reload to get the latest run.";
      case "invalid_coordinates":
        return "That point is outside the forecast area. Pick a location inside Ghana.";
      case "subseasonal_area_not_found":
        return "This area is not in the forecast boundaries.";
      case "invalid_response":
        return `The ${subject} response was incomplete.`;
      default:
        return error.status >= 500 ? `The ${subject} service is unavailable right now.` : error.message;
    }
  }
  if (error instanceof TypeError) {
    return `Could not reach the ${subject} service. Check your connection.`;
  }
  return error instanceof Error ? error.message : `The ${subject} could not be loaded.`;
}

/* ------------------------------------------------------------------------- formatting */

// Fixed three-letter names: locale data varies ("Sept" vs "Sep") and must match the backend's titles.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDay(isoDate: string) {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
}

function dayMonth(date: Date) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function formatDay(isoDate: string, style: "short" | "long" | "weekday" | "compact" = "short") {
  const date = parseDay(isoDate);
  if (style === "long") {
    return `${WEEKDAYS[date.getUTCDay()]} ${dayMonth(date)} ${date.getUTCFullYear()}`;
  }
  if (style === "weekday") {
    return `${WEEKDAYS[date.getUTCDay()]} ${dayMonth(date)}`;
  }
  return dayMonth(date);
}

/** Calendar date of a 1-based lead day, counted from the run's first day. */
export function leadDayDate(firstIso: string, day: number) {
  const date = parseDay(firstIso);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

/** Countdown value the backend uses for "no onset in this forecast". */
export const NO_ONSET = 999;

/** A by-day onset value (days from the shown day to onset; <= 0 started) as a short status. */
export function describeCountdown(value: number | null | undefined, dayIso: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { status: "–", detail: "" };
  }
  if (value >= NO_ONSET) {
    return { status: "Not in this forecast", detail: "No onset within the 46 days" };
  }
  const days = Math.round(value);
  const onsetIso = leadDayDate(dayIso, days + 1);
  if (days <= 0) {
    return {
      status: "Rains have set in",
      detail: days === 0 ? `Onset ${formatDay(onsetIso, "weekday")}` : `Since ${formatDay(onsetIso, "weekday")}, ${-days} day${days === -1 ? "" : "s"} earlier`,
    };
  }
  return { status: `Onset in ${days} day${days === 1 ? "" : "s"}`, detail: formatDay(onsetIso, "weekday") };
}

/** An onset map value (lead day, 0 = none in the window) as a date. */
export function formatOnset(value: number | null | undefined, firstIso: string, lastIso: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "–";
  }
  return value >= 1 ? formatDay(leadDayDate(firstIso, Math.round(value)), "weekday") : `No onset by ${formatDay(lastIso, "short")}`;
}

export function formatRange(startIso: string, endIso: string) {
  const start = parseDay(startIso);
  const end = parseDay(endIso);
  const startLabel = start.getUTCMonth() === end.getUTCMonth() ? String(start.getUTCDate()) : dayMonth(start);
  return `${startLabel}–${dayMonth(end)}`;
}

/** Issue date of a run, e.g. "Fri 25 Sep 2026". */
export function formatIssueDate(iso: string) {
  return formatDay(iso.slice(0, 10), "long");
}

export function formatInitTime(iso: string) {
  const date = new Date(iso);
  return `${dayMonth(date)} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")}:00 UTC`;
}

export function formatAmount(value: number | null | undefined, unit: string, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "–";
  }
  if (unit === "days") {
    const rounded = Math.round(value);
    return `${rounded} day${rounded === 1 ? "" : "s"}`;
  }
  const fixed = value >= 100 ? Math.round(value).toString() : value.toFixed(digits);
  return `${fixed} ${unit}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Forecast days already gone by `today`: a run is often read a week or two after it was issued. */
export function pastDayCount(series: SubseasonalSeries, today: string) {
  return series.days.filter((day) => day.date < today).length;
}

export type SpellStatus = "past" | "now" | "coming";

export function spellStatus(spell: SubseasonalSpell, today: string): SpellStatus {
  if (spell.end_date < today) {
    return "past";
  }
  return spell.start_date <= today ? "now" : "coming";
}

/** What a farmer asks of the spells of one kind: is one on now, when is the next, how many in all. */
export function spellOutlook(series: SubseasonalSeries, kind: SpellKind, today: string) {
  const spells = series.spells.filter((spell) => spell.kind === kind);
  return {
    spells,
    now: spells.find((spell) => spellStatus(spell, today) === "now") ?? null,
    next: spells.find((spell) => spellStatus(spell, today) === "coming") ?? null,
    spellDays: series.days.filter((day) => day.spell === kind).length,
  };
}

export function dayIndexForDate(run: SubseasonalRun, isoDate: string) {
  const match = run.days.find((day) => day.date === isoDate);
  return match ? match.day : null;
}

export function layerLabel(run: SubseasonalRun | null, layer: SubseasonalLayerKey) {
  return run?.layers.find((item) => item.layer === layer)?.label ?? LAYER_FALLBACK_LABELS[layer];
}

export const LAYER_FALLBACK_LABELS: Record<SubseasonalLayerKey, string> = {
  rainfall: "Rainfall",
  rainy_days: "Rainy days",
  dry_spell_days: "Dry-spell days",
  wet_spell_days: "Wet-spell days",
  extreme_rain: "Extreme rain",
  onset: "Onset",
};

/** Compact names for chips and tabs where space is tight (phones). */
export const LAYER_SHORT_LABELS: Record<SubseasonalLayerKey, string> = {
  rainfall: "Rain",
  rainy_days: "Rain days",
  dry_spell_days: "Dry spells",
  wet_spell_days: "Wet spells",
  extreme_rain: "Extreme",
  onset: "Onset",
};

/** Display order of the layer pickers: with Extreme rain, three cards a row. */
export const LAYER_ORDER: SubseasonalLayerKey[] = ["onset", "rainfall", "extreme_rain", "wet_spell_days", "dry_spell_days", "rainy_days"];

/** Layers this run offers, in display order; a backend without a layer simply does not list it. */
export function availableLayers(run: SubseasonalRun | null) {
  if (!run) {
    return LAYER_ORDER.filter((layer) => layer !== "onset");
  }
  return LAYER_ORDER.filter((layer) => run.layers.some((item) => item.layer === layer));
}

export const AGGREGATION_LABELS: Record<SubseasonalAggregation, string> = {
  daily: "Daily",
  weekly: "Weekly",
  total: "46-day total",
};

/** Period names as a layer reads them: onset is a status by day, or a single date for the run. */
export function aggregationLabel(layer: SubseasonalLayerKey, aggregation: SubseasonalAggregation, leadDays: number | null = null) {
  if (layer === "onset") {
    return aggregation === "total" ? "Onset date" : "By day";
  }
  return aggregation === "total" && leadDays ? `${leadDays}-day` : AGGREGATION_LABELS[aggregation];
}

export function legendColorFor(legend: SubseasonalLegend, value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  let match: LegendBin | null = null;
  for (const bin of legend.bins) {
    if (value >= bin.min) {
      match = bin;
    }
  }
  return match?.color ?? null;
}

/* ------------------------------------------------------------------------- URL state */

export type SubseasonalUrlState = {
  view: "subseasonal" | "seasonal";
  /** A model other than the default; null = the default model. */
  model: string | null;
  /** Ensemble rainfall statistic other than the mean, and its chance amount. */
  stat: RainStat | null;
  threshold: number | null;
  /** A kept run other than the latest; null = the latest run. */
  run: string | null;
  layer: SubseasonalLayerKey;
  aggregation: SubseasonalAggregation;
  day: number | null;
  week: number | null;
  point: { latitude: number; longitude: number } | null;
  area: { level: SubseasonalAreaLevel; name: string } | null;
};

const LAYER_KEYS = LAYER_ORDER;
const AGGREGATION_KEYS: SubseasonalAggregation[] = ["daily", "weekly", "total"];

function parsePositiveInt(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The period a layer opens with when none is chosen: rainfall by day, indicators over the whole
 * window. Also what a link without `agg` means, so links shared before indicators had periods
 * still open the 46-day view.
 */
export function defaultAggregation(layer: SubseasonalLayerKey): SubseasonalAggregation {
  // Onset opens by day: where the rains have set in by the shown day, and how soon elsewhere.
  return layer === "rainfall" || layer === "onset" ? "daily" : "total";
}

/** Periods the run offers for a layer, in display order (older runs: indicators are 46-day only). */
export function layerAggregations(run: SubseasonalRun | null, layer: SubseasonalLayerKey): SubseasonalAggregation[] {
  const listed = run?.layers.find((item) => item.layer === layer)?.aggregations;
  const offered = listed?.length ? listed : [defaultAggregation(layer)];
  return AGGREGATION_KEYS.filter((key) => offered.includes(key));
}

export function readUrlState(search: string): SubseasonalUrlState {
  const params = new URLSearchParams(search);
  const layer = LAYER_KEYS.find((key) => key === params.get("layer")) ?? "rainfall";
  const aggregation = AGGREGATION_KEYS.find((key) => key === params.get("agg")) ?? defaultAggregation(layer);
  const lat = Number.parseFloat(params.get("lat") ?? "");
  const lon = Number.parseFloat(params.get("lon") ?? "");
  const areaLevel = params.get("area");
  const areaName = params.get("name");
  const run = params.get("run");
  const model = params.get("model");
  const threshold = Number.parseFloat(params.get("thr") ?? "");
  return {
    model: model && /^[a-z0-9_]{1,64}$/i.test(model) ? model : null,
    stat: RAIN_STATS.find((key) => key === params.get("stat")) ?? null,
    threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
    run: run && /^[a-z0-9_]{1,64}$/i.test(run) ? run : null,
    view: params.get("view") === "seasonal" ? "seasonal" : "subseasonal",
    layer,
    aggregation,
    day: parsePositiveInt(params.get("day")),
    week: parsePositiveInt(params.get("week")),
    point: Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null,
    area:
      (areaLevel === "region" || areaLevel === "district") && areaName ? { level: areaLevel, name: areaName } : null,
  };
}

export function writeUrlState(state: SubseasonalUrlState) {
  if (typeof window === "undefined") {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  for (const key of ["view", "model", "run", "layer", "agg", "stat", "thr", "day", "week", "lat", "lon", "area", "name"]) {
    params.delete(key);
  }
  if (state.view === "seasonal") {
    params.set("view", "seasonal");
  } else {
    if (state.model) params.set("model", state.model);
    if (state.run) params.set("run", state.run);
    if (state.stat && state.stat !== "mean") params.set("stat", state.stat);
    if (state.stat === "chance" && state.threshold) params.set("thr", String(state.threshold));
    if (state.layer !== "rainfall") params.set("layer", state.layer);
    if (state.aggregation !== defaultAggregation(state.layer)) params.set("agg", state.aggregation);
    if (state.aggregation === "daily" && state.day) params.set("day", String(state.day));
    if (state.aggregation === "weekly" && state.week) params.set("week", String(state.week));
    if (state.area) {
      params.set("area", state.area.level);
      params.set("name", state.area.name);
    } else if (state.point) {
      params.set("lat", state.point.latitude.toFixed(3));
      params.set("lon", state.point.longitude.toFixed(3));
    }
  }
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}

/* ------------------------------------------------------------------------- CSV export */

export function seriesToCsv(series: SubseasonalSeries, run: SubseasonalRun | null) {
  const header = ["lead_day", "date", "rain_mm", "wet_day", "spell", "onset"];
  const rows = series.days.map((day) => [
    day.day,
    day.date,
    day.value ?? "",
    day.wet ? 1 : 0,
    day.spell ?? "",
    series.onset?.day === day.day ? 1 : 0,
  ]);
  const location =
    series.kind === "point"
      ? `${series.nearest_latitude},${series.nearest_longitude}`
      : `${series.kind}: ${series.name}`;
  const meta = [
    `# ${run?.model_label ?? "IFS-UNet"} 46-day rainfall forecast`,
    `# Run: ${series.run_id} (init ${series.init_time})`,
    ...(run?.provenance?.checkpoint_dir || run?.provenance?.model_dir
      ? [`# Downscaling model: ${[run.provenance.model_dir, run.provenance.checkpoint_dir].filter(Boolean).join("/")}`]
      : []),
    `# Location: ${location} (${series.support})`,
    `# Wet day >= ${series.thresholds.wet_day_mm} mm; dry spell >= ${series.thresholds.dry_spell_min_days} days; wet spell >= ${series.thresholds.wet_spell_min_days} days`,
  ];
  if (series.thresholds.onset_mm !== undefined) {
    meta.push(
      `# Onset: >= ${series.thresholds.onset_mm} mm within ${series.thresholds.onset_window_days} days, no dry spell over ${series.thresholds.onset_max_dry_days} days in the next ${series.thresholds.onset_guard_days}; ${
        series.onset ? `${series.onset.date}${series.onset.provisional ? " (provisional)" : ""}` : "none in this forecast"
      }`,
    );
  }
  return [...meta, header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
