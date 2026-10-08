import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import areaNorthern from "./fixtures/subseasonal/area-northern.json";
import areaValuesRegion from "./fixtures/subseasonal/area-values-region.json";
import layerDaily from "./fixtures/subseasonal/layer-daily.json";
import layerDrySpell from "./fixtures/subseasonal/layer-dry-spell.json";
import runs from "./fixtures/subseasonal/runs.json";
import samplePoint from "./fixtures/subseasonal/sample-point.json";

const API_BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:8000";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lR271wAAAABJRU5ErkJggg==",
  "base64",
);

type MockOptions = { failRuns?: boolean };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Serve the 46-day API from fixtures captured from the real backend; returns the request log. */
async function mockSubseasonal(page: Page, options: MockOptions = {}) {
  const requests: URL[] = [];
  const state = { failRuns: Boolean(options.failRuns) };
  await page.route(`${API_BASE_URL}/subseasonal/**`, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const params = url.searchParams;
    if (url.pathname.startsWith("/subseasonal/tiles/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
    }
    switch (url.pathname) {
      case "/subseasonal/runs":
        return state.failRuns
          ? json(route, { detail: "boom", error_code: "service_error" }, 500)
          : json(route, runs);
      case "/subseasonal/layer": {
        const layer = params.get("layer") ?? "rainfall";
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
          aggregation,
          index,
          title,
          index_count: aggregation === "daily" ? 46 : aggregation === "weekly" ? 7 : 1,
          tile_url: `/subseasonal/tiles/{z}/{x}/{y}.png?${params.toString()}`,
        });
      }
      case "/subseasonal/area-values":
        return json(route, {
          ...areaValuesRegion,
          level: params.get("level"),
          layer: params.get("layer"),
          aggregation: params.get("aggregation"),
          index: Number(params.get("index")),
        });
      case "/subseasonal/sample":
        return json(route, samplePoint);
      case "/subseasonal/area":
        return json(route, { ...areaNorthern, name: params.get("name") ?? areaNorthern.name });
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
  await expect(page.getByTestId("subseasonal-run")).toContainText("Init 25 Sep 2026 00:00 UTC");
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
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("46-day rain");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Dry-spell days");
  await expect(page.getByTestId("subseasonal-chart")).toBeVisible();
  await expect(page.getByTestId("subseasonal-calendar").locator("button")).toHaveCount(46);
  await expect(page.getByTestId("subseasonal-spells")).toContainText(/Dry spell|Wet spell/);
  await expect(page.getByTestId("subseasonal-weeks")).toContainText("Week 1");
  await expect(page.getByTestId("subseasonal-guidance")).toContainText("deterministic");
  expect(requests.some((url) => url.pathname === "/subseasonal/area" && url.searchParams.get("level") === "region")).toBe(true);
  await expect(page).toHaveURL(/area=region/);

  const download = page.waitForEvent("download");
  await page.getByTestId("subseasonal-download").click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);

  // A calendar day jumps the map to that day's rainfall.
  await page.getByTestId("subseasonal-calendar").locator("button").nth(4).click();
  await expect(page.getByTestId("timeline-current")).toHaveText("Tue 29 Sep");

  await page.getByTestId("drawer-close").click();
  await expect(drawer).not.toHaveClass(/open/);
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
  await expect(tooltip).toContainText("Area mean");
});

test("deep links restore the layer and the selected area", async ({ page }) => {
  await mockSubseasonal(page);
  await page.goto("/?layer=dry_spell_days&area=region&name=Northern", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("ss-layer-dry_spell_days")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/);
  await expect(page.getByTestId("drawer-selected-geography")).toHaveText("Northern");
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
  await page.getByTestId("dashboard-view-seasonal").click();
  await expect(page.getByTestId("theme-select-button")).toBeVisible();
  await expect(page).toHaveURL(/view=seasonal/);
  await expect.poll(() => seasonalRequests.some((url) => url.includes("/forecast/products/options"))).toBe(true);
});

test("46-day view fits phones without horizontal overflow and summarises collapsed controls", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await mockSubseasonal(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("subseasonal-timeline")).toBeVisible();
  await expect(page.getByTestId("mobile-controls-summary")).toContainText("Rainfall · Daily");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId("mobile-controls-summary").click();
  await expect(page.getByTestId("ss-layer-rainfall")).toBeVisible();
});
