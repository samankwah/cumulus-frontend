import { ApiError, getJson, resolveBackendUrl } from "@/lib/api";

/* ------------------------------------------------------------------------------------------
 * Sub-seasonal (46-day) IFS-UNet rainfall: types, API client, formatting and URL state.
 * ------------------------------------------------------------------------------------------ */

export type SubseasonalLayerKey = "rainfall" | "rainy_days" | "dry_spell_days" | "wet_spell_days" | "onset";
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
};

/** First day of the rainy season found inside the forecast (see the backend onset rule). */
export type SubseasonalOnset = {
  day: number;
  date: string;
  rain_mm: number | null;
  longest_dry_after: number;
  /** Days the dry-spell check could cover before the forecast ended. */
  guard_days: number;
  /** The check was cut short by the end of the forecast. */
  provisional: boolean;
};

export type SubseasonalDay = {
  day: number;
  date: string; // YYYY-MM-DD rain day (00-24 UTC)
  period_start: string;
  period_end: string;
  value: number | null;
  wet?: boolean | null;
  spell?: SpellKind | null;
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
};

export type SubseasonalLayerOption = {
  layer: SubseasonalLayerKey;
  label: string;
  description: string;
  aggregations: SubseasonalAggregation[];
};

export type SubseasonalRun = {
  run_id: string;
  active: boolean;
  source_id: string;
  source_label: string;
  model_label: string;
  ensemble: string;
  init_time: string;
  ingested_at: string | null;
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
  };
  onset?: SubseasonalOnset | null;
  spells: SubseasonalSpell[];
  thresholds: SubseasonalThresholds;
  guidance: string;
};

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
  runId: string;
  layer: SubseasonalLayerKey;
  aggregation: SubseasonalAggregation;
  index: number;
};

export function getSubseasonalRuns(signal?: AbortSignal) {
  return getJson("/subseasonal/runs", {}, isRunsResponse, { signal });
}

export async function getSubseasonalLayer(query: LayerQuery, signal?: AbortSignal) {
  const layer = await getJson(
    "/subseasonal/layer",
    { run_id: query.runId, layer: query.layer, aggregation: query.aggregation, index: query.index },
    isLayer,
    { signal },
  );
  return { ...layer, tile_url: resolveBackendUrl(layer.tile_url) };
}

export function getSubseasonalAreaValues(query: LayerQuery & { level: SubseasonalAreaLevel }, signal?: AbortSignal) {
  return getJson(
    "/subseasonal/area-values",
    { run_id: query.runId, level: query.level, layer: query.layer, aggregation: query.aggregation, index: query.index },
    isAreaValues,
    { signal },
  );
}

export function sampleSubseasonalPoint(runId: string, latitude: number, longitude: number, signal?: AbortSignal) {
  return getJson(
    "/subseasonal/sample",
    { run_id: runId, latitude: latitude.toFixed(4), longitude: longitude.toFixed(4) },
    isSeries,
    { signal },
  );
}

export function sampleSubseasonalArea(runId: string, level: SubseasonalAreaLevel, name: string, signal?: AbortSignal) {
  return getJson("/subseasonal/area", { run_id: runId, level, name }, isSeries, { signal });
}

/** Tile URL for any selection, built client-side so neighbouring days can be prefetched. */
export function subseasonalTileUrl(query: LayerQuery) {
  const params = new URLSearchParams({
    run_id: query.runId,
    layer: query.layer,
    aggregation: query.aggregation,
    index: String(query.index),
  });
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
  onset: "Onset",
};

/** Compact names for chips and tabs where space is tight (phones). */
export const LAYER_SHORT_LABELS: Record<SubseasonalLayerKey, string> = {
  rainfall: "Rain",
  rainy_days: "Rain days",
  dry_spell_days: "Dry spells",
  wet_spell_days: "Wet spells",
  onset: "Onset",
};

/** Display order of the layer pickers. */
export const LAYER_ORDER: SubseasonalLayerKey[] = ["onset", "rainfall", "wet_spell_days", "dry_spell_days", "rainy_days"];

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
  return {
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
  for (const key of ["view", "run", "layer", "agg", "day", "week", "lat", "lon", "area", "name"]) {
    params.delete(key);
  }
  if (state.view === "seasonal") {
    params.set("view", "seasonal");
  } else {
    if (state.run) params.set("run", state.run);
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
