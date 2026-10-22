import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import areaNorthern from "./fixtures/subseasonal/area-northern.json";
import areaValuesOnset from "./fixtures/subseasonal/area-values-onset.json";
import areaValuesOnsetDaily from "./fixtures/subseasonal/area-values-onset-daily.json";
import areaValuesRegion from "./fixtures/subseasonal/area-values-region.json";
import layerDaily from "./fixtures/subseasonal/layer-daily.json";
import layerDrySpell from "./fixtures/subseasonal/layer-dry-spell.json";
import layerOnset from "./fixtures/subseasonal/layer-onset.json";
import layerOnsetDaily from "./fixtures/subseasonal/layer-onset-daily.json";
import runs from "./fixtures/subseasonal/runs.json";
import samplePoint from "./fixtures/subseasonal/sample-point.json";

const API_BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:8000";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lR271wAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * `indicatorPeriods`: serve a backend whose indicators offer daily/weekly maps (the fixture predates them).
 * `onset`: serve a backend with the onset layer (the runs fixture predates it).
 * `issueDates`: also keep the run issued a week earlier, so the issue date can be chosen.
 */
type MockOptions = {
  failRuns?: boolean;
  indicatorPeriods?: boolean;
  onset?: boolean;
  issueDates?: boolean;
  ensembleArea?: boolean;
  /** Serve the model registry: S2S source x downscaler, as the backend describes it. */
  models?: boolean;
  /** The run and series as a 10-member ensemble down to each day (spreads, spell chances). */
  ensembleDays?: boolean;
  /** Observations (IMERG) fill the first OBSERVED_DAYS elapsed days. */
  observed?: boolean;
};

/** With `observed`: days 1-20 observed (to 14 Oct); 15-18 Oct are elapsed but still awaiting observations. */
const OBSERVED_DAYS = 20;

type ModelRow = [string, string, string, string, string, number, boolean];
const MODEL_ROWS: ModelRow[] = [
  ["aurora_imerg_unet", "aurora_imerg", "Aurora · IMERG head", "unet", "UNet", 1, true],
  ["aurora_imerg_diffusion", "aurora_imerg", "Aurora · IMERG head", "diffusion", "Diffusion", 10, true],
  ["aurora_imerg_bilinear", "aurora_imerg", "Aurora · IMERG head", "bilinear", "Bilinear", 1, true],
  ["aurora_era5_unet", "aurora_era5", "Aurora · ERA5 head", "unet", "UNet", 1, true],
  ["aurora_era5_diffusion", "aurora_era5", "Aurora · ERA5 head", "diffusion", "Diffusion", 10, true],
  ["aurora_era5_bilinear", "aurora_era5", "Aurora · ERA5 head", "bilinear", "Bilinear", 1, false],
  ["ifs_unet", "ifs", "ECMWF IFS", "unet", "UNet", 1, true],
  ["ifs_diffusion", "ifs", "ECMWF IFS", "diffusion", "Diffusion", 10, true],
  ["ifs_bilinear", "ifs", "ECMWF IFS", "bilinear", "Bilinear", 1, true],
];
const MODELS = {
  default_model: "aurora_imerg_unet",
  models: MODEL_ROWS.map(([id, family, family_label, downscaling, downscaling_label, members, available]) => ({
    id,
    label: id,
    source_label: id,
    family,
    family_label,
    downscaling,
    downscaling_label,
    available,
    members: available ? members : null,
    synthetic: false,
  })),
};

/** Days marked observed, with what had been forecast for them. */
function withObserved<T extends { days: { day: number; value: number | null }[] }>(series: T, enabled: boolean) {
  if (!enabled) return series;
  return {
    ...series,
    observed_days: OBSERVED_DAYS,
    observed_through: "2026-10-14",
    observed_source: "IMERG late run (NASA GPM)",
    days: series.days.map((day) => (day.day <= OBSERVED_DAYS ? { ...day, observed: true, forecast_value: 9.9 } : { ...day, observed: false })),
  };
}

/** Each day as a 10-member ensemble: a spread around the value, and spell chances (a dry spell begins on day 25). */
function withEnsembleDays<T extends { days: { day: number; value: number | null; spell?: string | null }[] }>(series: T, enabled: boolean) {
  if (!enabled) return series;
  return {
    ...series,
    members: 10,
    spell_ahead_days: 14,
    days: series.days.map((day) => {
      const value = day.value ?? 0;
      const inDry = day.spell === "dry" ? 100 : day.day > 36 ? 30 : 0;
      return {
        ...day,
        spread: { min: value * 0.2, p10: value * 0.4, p25: value * 0.7, p50: value, p75: value * 1.3, p90: value * 1.6, max: value * 2, mean: value },
        wet_prob: value >= 1 ? 80 : 10,
        spell_prob: { dry: inDry, wet: day.spell === "wet" ? 100 : 0 },
        spell_start_prob: { dry: day.day === 25 ? 70 : day.day === 37 ? 20 : 0, wet: 0 },
        spell_ahead_prob: { dry: day.day >= 12 && day.day <= 25 ? 70 : 20, wet: 0 },
        extreme_prob: 0,
        chance: { "10": value >= 10 ? 90 : 10, "25": 0, "50": 0 },
      };
    }),
  };
}

const EARLIER_RUN_ID = "ifs_unet_2026091800";

/**
 * The fixtures hold the run issued 25 Sep 2026 (forecast to 9 Nov). Everything that counts from
 * "today" (the default day, the Today line, elapsed days, the advice window) is pinned to a fixed
 * day inside that run, so the suite does not change meaning as the real date moves on.
 */
const FIXED_NOW = new Date("2026-10-19T09:00:00Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

/** The fixture run moved a week earlier, as if an older run were still kept. */
function earlierRun(run: (typeof runs.runs)[number]) {
  const shift = (iso: string) => {
    const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    date.setUTCDate(date.getUTCDate() - 7);
    return iso.length === 10 ? date.toISOString().slice(0, 10) : date.toISOString().replace(".000Z", "Z");
  };
  return {
    ...run,
    run_id: EARLIER_RUN_ID,
    active: false,
    init_time: shift(run.init_time),
    first_day: shift(run.first_day),
    last_day: shift(run.last_day),
    days: run.days.map((day) => ({ ...day, date: shift(day.date), period_start: shift(day.period_start), period_end: shift(day.period_end) })),
    weeks: run.weeks.map((week) => ({ ...week, start_date: shift(week.start_date), end_date: shift(week.end_date) })),
  };
}

const ONSET_THRESHOLDS = { onset_mm: 20, onset_window_days: 3, onset_guard_days: 30, onset_max_dry_days: 10 };
const SERIES_ONSET = { day: 2, date: "2026-09-26", rain_mm: 31.4, longest_dry_after: 9, guard_days: 30, provisional: false };

const runsWithOnset = {
  ...runs,
  runs: runs.runs.map((run) => ({
    ...run,
    thresholds: { ...run.thresholds, ...ONSET_THRESHOLDS },
    layers: [
      ...run.layers,
      { layer: "onset", label: "Onset", description: layerOnset.description, aggregations: ["daily", "total"] },
    ],
  })),
};

function runsPayload(options: MockOptions) {
  const base = options.onset ? runsWithOnset : options.indicatorPeriods ? runsWithIndicatorPeriods : runs;
  const kept = options.issueDates ? { ...base, runs: [...base.runs, ...base.runs.map(earlierRun)] } : base;
  if (!options.observed && !options.ensembleDays) return kept;
  return {
    ...kept,
    runs: kept.runs.map((run) => ({
      ...withObserved(run, Boolean(options.observed)),
      ...(options.ensembleDays
        ? {
            members: 10,
            ensemble: "ensemble",
            // An ensemble backend also offers the extreme-rain layer (the fixture predates it).
            layers: [
              ...run.layers,
              { layer: "extreme_rain", label: "Extreme rain", description: "Chance of a 50 mm+ day.", aggregations: ["total", "daily", "weekly"] },
            ],
          }
        : {}),
      ...(options.observed ? { observed_through: "2026-10-14", observed_source: "IMERG late run (NASA GPM)", observed_version: "v1" } : {}),
    })),
  };
}

/** Series responses from an onset-aware backend carry the onset and its rule. */
function withOnset<T extends { thresholds: object }>(series: T, enabled: boolean) {
  return enabled ? { ...series, thresholds: { ...series.thresholds, ...ONSET_THRESHOLDS }, onset: SERIES_ONSET } : series;
}

const runsWithIndicatorPeriods = {
  ...runs,
  runs: runs.runs.map((run) => ({
    ...run,
    layers: run.layers.map((item) => ({ ...item, aggregations: ["daily", "weekly", "total"] })),
  })),
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/**
 * The area fixture as a 10-member ensemble: each week carries the members' spread of days in a dry
 * spell, in a wet spell and with rain (week n: members between n-1 and n+1 days, mean n).
 */
function asEnsemble<T extends { weeks: { week: number; days: number }[]; spells: object[] }>(area: T) {
  const spread = (centre: number, limit: number) => {
    const at = (value: number) => Math.max(0, Math.min(limit, value));
    return { min: at(centre - 1), p10: at(centre - 1), p25: at(centre - 0.5), p50: at(centre), p75: at(centre + 0.5), p90: at(centre + 1), max: at(centre + 1), mean: at(centre) };
  };
  return {
    ...area,
    members: 10,
    spells: area.spells.map((spell) => ({ ...spell, probability: 80 })),
    weeks: area.weeks.map((week) => ({
      ...week,
      day_counts: { dry_spell: spread(week.week, week.days), wet_spell: spread(1, week.days), rainy: spread(2, week.days) },
    })),
  };
}

/** Serve the 46-day API from fixtures captured from the real backend; returns the request log. */
async function mockSubseasonal(page: Page, options: MockOptions = {}) {
  const requests: URL[] = [];
  const state = { failRuns: Boolean(options.failRuns) };
  await page.route(`${API_BASE_URL}/subseasonal/**`, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const params = url.searchParams;
    // Answer for the run that was asked for, as the backend does.
    const runId = params.get("run_id") ?? runs.active_run_id;
    if (url.pathname.startsWith("/subseasonal/tiles/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
    }
    switch (url.pathname) {
      case "/subseasonal/runs":
        return state.failRuns
          ? json(route, { detail: "boom", error_code: "service_error" }, 500)
          : json(route, runsPayload(options));
      case "/subseasonal/layer": {
        const layer = params.get("layer") ?? "rainfall";
        if (layer === "onset") {
          const byDay = params.get("aggregation") !== "total";
          return json(route, {
            ...(byDay ? layerOnsetDaily : layerOnset),
            run_id: runId,
            index: Number(params.get("index") ?? "1"),
            tile_url: `/subseasonal/tiles/{z}/{x}/{y}.png?${params.toString()}`,
          });
        }
        const aggregation = params.get("aggregation") ?? "daily";
        const index = Number(params.get("index") ?? "1");
        const base = layer === "rainfall" ? layerDaily : { ...layerDrySpell, layer };
        const title =
          aggregation === "total"
            ? `${base.layer_label} · 46 days (25 Sep–9 Nov)`
            : aggregation === "weekly"
              ? `Rainfall · Week ${index}`
              : `Rainfall · Day ${index}`;
        return json(route, {
          ...base,
          run_id: runId,
          aggregation,
          index,
          title,
          observed: Boolean(options.observed) && aggregation === "daily" && index <= OBSERVED_DAYS,
          observed_days: options.observed ? OBSERVED_DAYS : 0,
          index_count: aggregation === "daily" ? 46 : aggregation === "weekly" ? 7 : 1,
          tile_url: `/subseasonal/tiles/{z}/{x}/{y}.png?${params.toString()}`,
        });
      }
      case "/subseasonal/area-values":
        if (params.get("layer") === "onset") {
          const byDay = params.get("aggregation") !== "total";
          return json(route, {
            ...(byDay ? areaValuesOnsetDaily : areaValuesOnset),
            run_id: runId,
            level: params.get("level"),
            aggregation: params.get("aggregation") ?? "daily",
            index: Number(params.get("index") ?? "1"),
          });
        }
        return json(route, {
          ...areaValuesRegion,
          run_id: runId,
          level: params.get("level"),
          layer: params.get("layer"),
          aggregation: params.get("aggregation"),
          index: Number(params.get("index")),
        });
      case "/subseasonal/models":
        return options.models ? json(route, MODELS) : route.fulfill({ status: 404, body: "" });
      case "/subseasonal/sample":
        return json(route, withObserved(withOnset(samplePoint, Boolean(options.onset)), Boolean(options.observed)));
      case "/subseasonal/area": {
        const area = withOnset({ ...areaNorthern, name: params.get("name") ?? areaNorthern.name }, Boolean(options.onset));
        const ensemble = options.ensembleArea ? asEnsemble(area) : area;
        return json(route, withObserved(withEnsembleDays(ensemble, Boolean(options.ensembleDays)), Boolean(options.observed)));
      }
      default:
        return route.fulfill({ status: 404, body: "" });
    }
  });
  // The seasonal view must not be requested while the 46-day view is showing.
  const seasonalRequests: string[] = [];
  await page.route(`${API_BASE_URL}/forecast/**`, async (route) => {
    seasonalRequests.push(route.request().url());
    return json(route, []);
  });
  return { requests, seasonalRequests, state };
}

/** Frame index shown by the newest raster layer on the map (prefetches do not count). */
function shownTileIndex(page: Page) {
  return page.evaluate(() => {
    const layers = document.querySelectorAll(".crossfade-tile-layer");
    const image = layers[layers.length - 1]?.querySelector("img");
    return image ? new URL(image.src).searchParams.get("index") : null;
  });
}

test("46-day rainfall is the default view with run badge, timeline and stepped legend", async ({ page }) => {
  const { seasonalRequests } = await mockSubseasonal(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("dashboard-view-subseasonal")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("subseasonal-run")).toContainText("IFS-UNet");
  await expect(page.getByTestId("subseasonal-run")).toContainText("Issued 25 Sep 2026");
  await expect(page.getByTestId("subseasonal-stale")).toBeVisible();
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();
  await expect(page.getByTestId("subseasonal-legend")).toContainText("mm");
  await expect(page.getByTestId("subseasonal-legend")).toContainText("Below 1 mm not shown");
  await expect(page.getByTestId("ss-layer-rainfall")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".crossfade-tile-layer")).toHaveCount(1);
  expect(seasonalRequests).toHaveLength(0);
});

test("timeline buttons, slider keys and day links step the map tiles and the URL", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/?day=3", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("timeline-current")).toHaveText("Sun 27 Sep");
  await expect.poll(() => shownTileIndex(page)).toBe("3");

  await page.getByTestId("timeline-next").click();
  await expect(page.getByTestId("timeline-current")).toHaveText("Mon 28 Sep");
  await expect.poll(() => shownTileIndex(page)).toBe("4");
  await expect(page).toHaveURL(/day=4/);

  await page.getByTestId("timeline-slider").focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("timeline-current")).toHaveText("Mon 9 Nov");
  await expect(page.getByTestId("timeline-next")).toBeDisabled();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("timeline-current")).toHaveText("Fri 25 Sep");
  await expect(page.getByTestId("timeline-prev")).toBeDisabled();
});

test("play animates through days and pauses", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/?day=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("timeline-current")).toHaveText("Fri 25 Sep");

  await page.getByTestId("timeline-play").click();
  await expect(page.getByTestId("timeline-play")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Number(await shownTileIndex(page)), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  await page.getByTestId("timeline-play").click();
  await expect(page.getByTestId("timeline-play")).toHaveAttribute("aria-pressed", "false");
});

test("weekly, total and outlook layers switch period controls and legends", async ({ page }) => {
  const { requests } = await mockSubseasonal(page);
  await page.goto("/?day=10", { waitUntil: "domcontentloaded" });

  await page.getByTestId("ss-agg-weekly").click();
  await expect(page.getByTestId("timeline-current")).toHaveText("Week 2");
  await expect.poll(() => requests.some((url) => url.searchParams.get("aggregation") === "weekly")).toBe(true);

  await page.getByTestId("ss-agg-total").click();
  await expect(page.getByTestId("subseasonal-timeline")).toHaveCount(0);
  await expect(page.getByTestId("subseasonal-layer-title")).toContainText("46 days");

  await page.getByTestId("ss-layer-dry_spell_days").click();
  await expect(page.getByTestId("ss-agg-daily")).toHaveCount(0);
  await expect(page.getByTestId("subseasonal-legend")).toContainText("days");
  await expect(page).toHaveURL(/layer=dry_spell_days/);
});

test("clicking a region opens the 46-day drawer with chart, spells, weeks and export", async ({ page }) => {
  const { requests } = await mockSubseasonal(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const region = page.locator('[class*="forecast-feature"] .leaflet-interactive').first();
  await region.waitFor({ state: "attached", timeout: 30_000 });
  await region.click({ force: true });

  const drawer = page.getByTestId("dashboard-drawer");
  await expect(drawer).toHaveClass(/open/);
  // The drawer only shows the selected layer: rainfall by default.
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Rainfall ·");
  await expect(page.getByTestId("subseasonal-chart")).toBeVisible();
  await expect(page.getByTestId("subseasonal-calendar")).toHaveCount(0);
  // Rainfall follows the map's period: the day's rain by day, the week's total and table by week.
  await expect(page.getByTestId("subseasonal-weeks")).toHaveCount(0);
  await page.getByTestId("ss-agg-weekly").click();
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Week ");
  await expect(page.getByTestId("subseasonal-weeks")).toContainText("Week 1");
  await expect(page.getByTestId("subseasonal-chart")).toHaveCount(0);
  await expect(page.getByTestId("subseasonal-weekly-chart")).toBeVisible();
  await page.getByTestId("ss-agg-total").click();
  await expect(page.getByTestId("subseasonal-chart")).toBeVisible();
  await expect(page.getByTestId("subseasonal-weeks")).toBeVisible();
  await page.getByTestId("ss-agg-daily").click();
  await expect(page.getByTestId("subseasonal-advisory")).toContainText("What to do");
  // Laid out like an agromet bulletin: validity, outlook, impact, then grouped advice.
  await expect(page.getByTestId("subseasonal-advisory-validity")).toContainText("Valid");
  await expect(page.getByTestId("subseasonal-advisory-outlook")).toContainText("mm of rain");
  await expect(page.getByTestId("subseasonal-advisory-impact")).not.toBeEmpty();
  await expect(page.getByTestId("subseasonal-advisory-crops")).toBeVisible();
  // The model's caveat paragraph is not shown in the drawer.
  await expect(page.getByTestId("subseasonal-guidance")).toHaveCount(0);
  expect(requests.some((url) => url.pathname === "/subseasonal/area" && url.searchParams.get("level") === "region")).toBe(true);
  await expect(page).toHaveURL(/area=region/);

  // Download and copy-link are switched off in the drawer for now.
  await expect(page.getByTestId("subseasonal-download")).toHaveCount(0);

  // Switching layer swaps the drawer to that layer's content and advice.
  const rainHeadline = await page.getByTestId("subseasonal-advisory-headline").textContent();
  await page.getByTestId("ss-layer-dry_spell_days").click();
  // Answer first (a spell on now, or the next one), then the spell chart and the spell list.
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("dry spell");
  // The whole run shows both the day chart and the week chart.
  await expect(page.getByTestId("subseasonal-chart")).toContainText("dry spells");
  await expect(page.getByTestId("subseasonal-weekly-chart")).toContainText("dry spells per week");
  await expect(page.getByTestId("subseasonal-spells")).toBeVisible();
  await expect(page.getByTestId("subseasonal-advisory-headline")).not.toHaveText(rainHeadline ?? "");

  // The day-by-day calendar is folded away; a day in it jumps the map back to that day's rainfall.
  await expect(page.getByTestId("subseasonal-calendar")).toBeHidden();
  await page.getByTestId("subseasonal-calendar-fold").locator("summary").click();
  await expect(page.getByTestId("subseasonal-calendar").locator("button")).toHaveCount(46);
  await page.getByTestId("subseasonal-calendar").locator("button").nth(4).click();
  await expect(page.getByTestId("timeline-current")).toHaveText("Tue 29 Sep");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Rainfall ·");

  await page.getByTestId("drawer-close").click();
  await expect(drawer).not.toHaveClass(/open/);
});

test("indicators follow the period picker when the backend offers their daily and weekly maps", async ({ page }) => {
  const { requests } = await mockSubseasonal(page, { indicatorPeriods: true });
  await page.goto("/?layer=dry_spell_days", { waitUntil: "domcontentloaded" });
  // A link without a period still opens an indicator on the whole window.
  await expect(page.getByTestId("ss-agg-total")).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("ss-agg-weekly").click();
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();
  await expect(page).toHaveURL(/layer=dry_spell_days.*agg=weekly|agg=weekly.*layer=dry_spell_days/);
  await expect
    .poll(() => requests.some((url) => url.pathname === "/subseasonal/layer" && url.searchParams.get("layer") === "dry_spell_days" && url.searchParams.get("aggregation") === "weekly"))
    .toBe(true);

  // The period is shared: another indicator keeps it.
  await page.getByTestId("ss-layer-wet_spell_days").click();
  await expect(page.getByTestId("ss-agg-weekly")).toHaveAttribute("aria-selected", "true");
});

test("onset opens by day: where the rains have set in, how soon elsewhere, and the onset date", async ({ page }) => {
  const { requests } = await mockSubseasonal(page, { onset: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();

  await page.getByTestId("ss-layer-onset").click();
  await expect(page).toHaveURL(/layer=onset/);
  await expect(page).not.toHaveURL(/agg=/);
  // By day is the default, with the timeline to step through the forecast.
  await expect(page.getByTestId("ss-agg-daily")).toHaveText("By day");
  await expect(page.getByTestId("ss-agg-daily")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();
  const legend = page.getByTestId("subseasonal-legend");
  await expect(legend).toContainText("Started");
  await expect(legend).toContainText("None");
  await expect(legend).toContainText(/Set in across \d+% of Ghana by \w{3} \d+ \w{3}/);
  await expect(legend).toContainText(/\d+% still to come/);

  await page.getByTestId("timeline-next").click();
  await expect
    .poll(() => requests.filter((url) => url.pathname === "/subseasonal/layer" && url.searchParams.get("layer") === "onset" && url.searchParams.get("aggregation") === "daily").length)
    .toBeGreaterThanOrEqual(2);

  const region = page.locator('[class*="forecast-feature"] .leaflet-interactive').first();
  await region.waitFor({ state: "attached", timeout: 30_000 });
  await region.hover({ force: true });
  await expect(page.locator(".leaflet-tooltip").last()).toContainText(/Rains have set in|Onset in \d+ days?|Not in this forecast/);

  await region.click({ force: true });
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/);
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Onset · day 2 of the forecast");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Sat 26 Sep");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText(/before|after|the day shown/);
  await expect(page.getByTestId("subseasonal-onset-marker")).toHaveCount(1);
  await expect(page.getByTestId("subseasonal-onset-rule")).toContainText("20 mm falls within 3 days");
  await expect(page.getByTestId("subseasonal-advisory-headline")).toContainText("Sat 26 Sep");

  // The whole-run view maps the onset date itself.
  await page.getByTestId("ss-agg-total").click();
  await expect(page).toHaveURL(/agg=total/);
  await expect(page.getByTestId("subseasonal-timeline")).toHaveCount(0);
  await expect(legend).toContainText("25 Sep");
  await expect(legend).toContainText(/Onset across \d+% of Ghana/);
});

test("the forecast issue date can be changed and keeps the shown day", async ({ page }) => {
  const { requests } = await mockSubseasonal(page, { onset: true, issueDates: true });
  await page.goto("/?day=14", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("timeline-current")).toHaveText("Thu 8 Oct");
  await page.getByTestId("ss-issue-date").click();
  const menu = page.getByTestId("ss-issue-date-menu");
  await expect(menu.getByRole("option")).toHaveCount(2);
  await expect(menu.getByRole("option").first()).toContainText("Fri 25 Sep 2026");
  await expect(menu.getByRole("option").first()).toContainText("Latest");

  await page.getByTestId(`ss-issue-date-option-${EARLIER_RUN_ID}`).click();
  await expect(page).toHaveURL(new RegExp(`run=${EARLIER_RUN_ID}`));
  await expect(page.getByTestId("timeline-current")).toHaveText("Thu 8 Oct");
  await expect(page).toHaveURL(/day=21/);
  await expect
    .poll(() => requests.some((url) => url.pathname === "/subseasonal/layer" && url.searchParams.get("run_id") === EARLIER_RUN_ID))
    .toBe(true);

  // A shared link opens the same issue date.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("ss-issue-date")).toHaveAttribute("data-value", EARLIER_RUN_ID);
});

test("a backend without the onset layer hides it, and an onset link falls back to rainfall", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/?layer=onset", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("subseasonal-legend")).toContainText("Below 1 mm not shown");
  await expect(page).not.toHaveURL(/layer=onset/);
  await expect(page.getByTestId("ss-layer-rainfall")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("ss-layer-onset")).toHaveCount(0);
});

test("hovering a region shows its area value instantly", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const region = page.locator('[class*="forecast-feature"] .leaflet-interactive').first();
  await region.waitFor({ state: "attached", timeout: 30_000 });
  await expect(page.getByTestId("subseasonal-legend")).toBeVisible();
  await region.hover({ force: true });
  const tooltip = page.locator(".leaflet-tooltip").last();
  await expect(tooltip).toContainText(/\d+(\.\d)? mm/);
  await expect(tooltip).toContainText("area mean");
});

test("deep links restore the layer and the selected area", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/?layer=dry_spell_days&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("ss-layer-dry_spell_days")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/);
  await expect(page.getByTestId("drawer-selected-geography")).toHaveText("Northern");
});

test("a shared district link switches the map to districts so the area is outlined", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/?area=district&name=Tamale", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/);
  await expect(page.getByTestId("dashboard-mode-district")).toHaveAttribute("aria-selected", "true");
});

test("on phones the drawer switches layers in place", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSubseasonal(page);
  await page.goto("/?area=region&name=Northern", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("subseasonal-advisory")).toBeVisible();
  await page.getByTestId("drawer-layer-dry_spell_days").click();
  await expect(page.getByTestId("drawer-layer-dry_spell_days")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("dry spell");
  await expect(page).toHaveURL(/layer=dry_spell_days/);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/);
});

test("run failures show a retry that recovers", async ({ page }) => {
  const { state } = await mockSubseasonal(page, { failRuns: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("subseasonal-error")).toContainText("unavailable");
  state.failRuns = false;
  await page.getByTestId("subseasonal-error").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();
});

test("switching to the seasonal outlook keeps the seasonal controls working", async ({ page }) => {
  const { seasonalRequests } = await mockSubseasonal(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The view tabs are server-rendered; a click before hydration is dropped, so wait for the live app.
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();
  await page.getByTestId("dashboard-view-seasonal").click();
  await expect(page.getByTestId("theme-select-button")).toBeVisible();
  await expect(page).toHaveURL(/view=seasonal/);
  await expect.poll(() => seasonalRequests.some((url) => url.includes("/forecast/products/options"))).toBe(true);
});

test("on phones the 46-day map keeps one bottom card with layer chips and folded options", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await mockSubseasonal(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  // The desktop side panel is replaced by a top bar and chips.
  await expect(page.getByTestId("ss-layer-rainfall")).toBeHidden();
  await expect(page.getByTestId("ss-topbar-run")).toContainText("days old");
  await expect(page.getByTestId("ss-mlayer-rainfall")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("ss-mlayer-dry_spell_days").click();
  await expect(page).toHaveURL(/layer=dry_spell_days/);
  await expect(page.getByTestId("subseasonal-legend")).toContainText("days");

  // Period and areas sit behind the options button.
  await expect(page.getByTestId("ss-mgeo-district")).toHaveCount(0);
  await page.getByTestId("ss-mobile-options").click();
  await page.getByTestId("ss-mgeo-district").click();
  await expect(page.getByTestId("ss-mgeo-district")).toHaveAttribute("aria-checked", "true");
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByTestId("ss-topbar-seasonal").click();
  await expect(page).toHaveURL(/view=seasonal/);
});

test("area search finds districts, regions and regional capitals and selects them", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByTestId("area-search-button").click();
  const input = page.getByTestId("area-search-input");
  await expect(input).toBeFocused();

  // A district: switches the map to districts, opens the drawer and names the tab after it.
  await input.fill("accra");
  await expect(page.getByTestId("area-search-result").first()).toContainText("Accra");
  await expect(page.getByTestId("area-search-result").first()).toContainText("District");
  await page.getByTestId("area-search-result").first().click();
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId("dashboard-mode-district")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("drawer-selected-geography")).toHaveText("Accra");
  await expect(page).toHaveURL(/area=district/);
  await expect(page).toHaveTitle("Accra Rainfall - Accra Metro District, Ghana");

  // A region, picked with the keyboard.
  await page.getByTestId("area-search-button").click();
  await page.getByTestId("area-search-input").fill("ashanti");
  await expect(page.getByTestId("area-search-result").first()).toContainText("Region");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dashboard-mode-region")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("drawer-selected-geography")).toHaveText("Ashanti");
  await expect(page).toHaveTitle("Ashanti Rainfall - Ashanti Region, Ghana");

  // A regional capital named unlike its district selects the district it lies in.
  await page.getByTestId("area-search-button").click();
  await page.getByTestId("area-search-input").fill("koforidua");
  await expect(page.getByTestId("area-search-result").first()).toContainText("Eastern regional capital");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("drawer-selected-geography")).toHaveText("New Juaben South");

  // No match, then Escape closes the search.
  await page.getByTestId("area-search-button").click();
  await page.getByTestId("area-search-input").fill("zzz");
  await expect(page.getByTestId("area-search-empty")).toContainText("No region or district matches");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("area-search-input")).toHaveCount(0);
});


test("an ensemble's weekly spell days show box plots around the members' mean", async ({ page }) => {
  await mockSubseasonal(page, { ensembleArea: true, indicatorPeriods: true });
  await page.goto("/?layer=dry_spell_days&agg=weekly&week=4&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  const chart = page.getByTestId("subseasonal-weekly-chart");
  await expect(chart).toContainText("Days in 5+ day dry spells per week");
  // One box per week, and the legend explains them.
  await expect(chart.locator(".ss-spread-box")).toHaveCount(7);
  await expect(chart).toContainText("25–75%");
  await expect(chart).toContainText("Mean");
  // The week's headline is the members' mean (week 4 in the fixture: 4 days, members 3 to 5).
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Mean of 10 members");
  // Each run of dry days says how likely it is across the members.
  await expect(page.getByText("Runs of dry days")).toBeVisible();
  await expect(page.getByTestId("subseasonal-spells").first()).toContainText("Chance 80% · 8 of 10 members");
});

test("runs of dry and wet days are listed only in their own spell layers", async ({ page }) => {
  await mockSubseasonal(page, { ensembleArea: true });
  await page.goto("/?layer=wet_spell_days&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Runs of wet days")).toBeVisible();
  await expect(page.getByTestId("subseasonal-spells")).toHaveCount(1);
  // Rainfall and rain days do not repeat them.
  for (const layer of ["rainfall", "rainy_days"]) {
    await page.goto(`/?layer=${layer}&area=region&name=Northern`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("subseasonal-chart").first()).toBeVisible();
    await expect(page.getByTestId("subseasonal-spells")).toHaveCount(0);
  }
});

test("the model picker offers the forecast model and its downscaling as two choices", async ({ page }) => {
  const { requests } = await mockSubseasonal(page, { models: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const family = page.getByTestId("ss-family");
  const method = page.getByTestId("ss-downscaling");
  await expect(family).toContainText("Aurora-IMERG");
  await expect(method).toContainText("UNet");
  // The default model is not named in requests or the URL.
  expect(requests.filter((url) => url.pathname === "/subseasonal/runs").every((url) => !url.searchParams.has("model"))).toBe(true);
  await family.click();
  await page.getByTestId("ss-family-option-aurora_era5").click();
  await expect(page).toHaveURL(/model=aurora_era5_unet/);
  // Aurora-ERA5 has no bilinear run yet: listed, but disabled.
  await method.click();
  await expect(page.getByTestId("ss-downscaling-option-bilinear")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("ss-downscaling-option-bilinear")).toContainText("No Aurora · ERA5 head run yet");
  // Picking the ensemble keeps the S2S source; switching the source keeps the downscaler.
  await page.getByTestId("ss-downscaling-option-diffusion").click();
  await expect(page).toHaveURL(/model=aurora_era5_diffusion/);
  await family.click();
  await page.getByTestId("ss-family-option-ifs").click();
  await expect(page).toHaveURL(/model=ifs_diffusion/);
  await expect
    .poll(() => requests.some((url) => url.pathname === "/subseasonal/runs" && url.searchParams.get("model") === "ifs_diffusion"))
    .toBe(true);
});

test("observed days replace the forecast on elapsed days", async ({ page }) => {
  const { requests } = await mockSubseasonal(page, { observed: true, ensembleDays: true, ensembleArea: true });
  await page.goto("/?area=region&name=Northern&day=5", { waitUntil: "domcontentloaded" });
  // The headline says what fell, and what had been forecast.
  const strip = page.getByTestId("drawer-summary-strip");
  await expect(strip).toContainText("15");
  await expect(strip).toContainText("Forecast mean was 9.9 mm");
  // Observed days are bars, forecast days box plots; the legend names both, and the gap.
  const chart = page.getByTestId("subseasonal-chart").first();
  await expect(chart.locator(".ss-observed-bar")).toHaveCount(OBSERVED_DAYS);
  await expect(chart.locator(".ss-spread")).toHaveCount(46 - OBSERVED_DAYS);
  await expect(chart).toContainText("Observed");
  await expect(chart).toContainText("Awaiting obs.");
  // The map's day is observed: the dock says so, and requests carry the observations' version.
  await expect(page.getByTestId("ss-dock-observed")).toContainText("IMERG");
  await expect(page.getByTestId("timeline-observed")).toBeVisible();
  expect(requests.some((url) => url.pathname === "/subseasonal/area" && url.searchParams.get("obs") === "v1")).toBe(true);
  // About this data says how far the observations reach.
  await page.getByText("About this data").click();
  await expect(page.getByTestId("ss-data-observed")).toContainText("14 Oct 2026");
});

test("the spell chart shows the chance a spell starts with the chance of being in one", async ({ page }) => {
  await mockSubseasonal(page, { ensembleDays: true, ensembleArea: true, indicatorPeriods: true });
  await page.goto("/?layer=dry_spell_days&agg=daily&day=25&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  const chart = page.getByTestId("subseasonal-chance-chart");
  await expect(chart).toContainText("Dry spells of 5+ days: chance (%)");
  await expect(chart).toContainText("Starts that day");
  await expect(chart).toContainText("In a dry spell");
  await expect(chart.locator(".ss-chance-line")).toHaveCount(1);
  // Starts in the last four days cannot be judged inside the run: hatched.
  await expect(chart.locator(".ss-unjudged")).toHaveCount(1);
  // The headline gives the spell ahead: starts that day, and within two weeks.
  const strip = page.getByTestId("drawer-summary-strip");
  await expect(strip).toContainText("Starts that day 70%");
  await expect(strip).toContainText("within 14 days 70%");
});

test("the chance view shows the amounts before their chance, like every panel", async ({ page }) => {
  await mockSubseasonal(page, { ensembleDays: true, ensembleArea: true });
  await page.goto("/?stat=chance&thr=10&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  const titles = page.locator(".ss-drawer .ss-frame-title strong");
  await expect(titles.first()).toContainText("Daily rain");
  await expect(titles.nth(1)).toContainText("Chance of 10 mm+ in a day");
});

test("the spell length slider changes the map, the drawer and the advice", async ({ page }) => {
  const { requests } = await mockSubseasonal(page, { indicatorPeriods: true, ensembleArea: true });
  await page.goto("/?layer=dry_spell_days&agg=weekly&week=3&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  const value = page.getByTestId("ss-spell-value");
  await expect(value).toContainText("5+");
  // The official length is not written to the URL or sent.
  expect(page.url()).not.toContain("dsd=");
  await page.getByTestId("ss-spell-longer").click();
  await page.getByTestId("ss-spell-longer").click();
  await expect(value).toContainText("7+");
  await expect(page).toHaveURL(/dsd=7/);
  await expect(page.getByTestId("ss-layer-dry_spell_days")).toContainText("≥7 dry days");
  await expect
    .poll(() => requests.some((url) => url.pathname === "/subseasonal/layer" && url.searchParams.get("spell_days") === "7"))
    .toBe(true);
  await expect
    .poll(() => requests.some((url) => url.pathname === "/subseasonal/area" && url.searchParams.get("dry_spell_days") === "7"))
    .toBe(true);
  // For a week the map shows the chance of such a spell; Days switches to the days inside spells.
  await page.getByTestId("ss-spell-stat-days").click();
  await expect(page).toHaveURL(/ss=days/);
  await expect
    .poll(() => requests.some((url) => url.pathname === "/subseasonal/layer" && url.searchParams.get("stat") === "days"))
    .toBe(true);
  // Back to GMet's definition: the official length is not written to the URL.
  await page.getByTestId("ss-spell-shorter").click();
  await page.getByTestId("ss-spell-shorter").click();
  await expect(value).toContainText("5+");
  await expect(page).not.toHaveURL(/dsd=/);
});

test("the whole-run extreme chart shows each day's chance with the chance of one by that date", async ({ page }) => {
  await mockSubseasonal(page, { ensembleDays: true, ensembleArea: true, indicatorPeriods: true });
  await page.goto("/?layer=extreme_rain&agg=total&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  const chart = page.getByTestId("subseasonal-chance-chart");
  await expect(chart).toContainText("Chance of a 50 mm+ day (%)");
  await expect(chart).toContainText("That day");
  await expect(chart).toContainText("At least one by this date");
  await expect(chart.locator(".ss-chance-line")).toHaveCount(1);
  await expect(chart.locator(".ss-chance-bar").first()).toBeAttached();
});
