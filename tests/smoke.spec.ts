import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:8000";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lR271wAAAABJRU5ErkJggg==",
  "base64",
);

async function clickRasterMap(page: Page) {
  const box = await page.locator(".leaflet-container").boundingBox();
  if (!box) {
    throw new Error("Expected raster map bounding box.");
  }
  await page.mouse.click(box.x + box.width * 0.78, box.y + box.height * 0.52);
}

function probabilityProduct(theme: "onset" | "early_dry_spell") {
  const themeLabel = theme === "onset" ? "Onset Date" : "Early-Season Dry Spell";
  const legend =
    theme === "onset"
      ? [
          { category_code: "PB", label: "Early", hint: "Earlier than the climatological timing window.", color: "#2f8f86", display_order: 0 },
          { category_code: "PN", label: "Near-Normal", hint: "Within the climatological timing window.", color: "#b8b9b4", display_order: 1 },
          { category_code: "PA", label: "Late", hint: "Later than the climatological timing window.", color: "#b47a34", display_order: 2 },
        ]
      : [
          { category_code: "PB", label: "Short", hint: "Shorter early-season dry-spell duration.", color: "#2f8f86", display_order: 0 },
          { category_code: "PN", label: "Near-Normal", hint: "Near the climatological dry-spell duration.", color: "#b8b9b4", display_order: 1 },
          { category_code: "PA", label: "Long", hint: "Longer early-season dry-spell duration.", color: "#b47a34", display_order: 2 },
        ];

  return {
    product_id: `${theme}_probability_2025`,
    theme,
    theme_label: themeLabel,
    season_profile: "southern_major",
    season_label: "Southern Major Season",
    subseason: null,
    subseason_label: null,
    forecast_year: 2025,
    valid_time: "2026-02-01T00:00:00Z",
    generated_at: "2026-04-26T22:00:00Z",
    forecast_source: "cumulus_bridge",
    forecast_source_label: "Cumulus Bridge Product",
    source_run_id: `${theme}-probability-run`,
    generation_backend: "bridge_generated",
    refresh_interval_seconds: 1800,
    freshness_threshold_hours: 18,
    tile_url: `${API_BASE_URL}/forecast/probability/tiles/{z}/{x}/{y}.png?theme=${theme}`,
    preview_url: null,
    bounds: { latitude_min: 4, latitude_max: 11, longitude_min: -3.4, longitude_max: 1.5 },
    legend,
  };
}

function deterministicProduct(theme: "onset" | "early_dry_spell") {
  return {
    product_id: `${theme}_deterministic_2025`,
    theme,
    theme_label: theme === "onset" ? "Onset Date" : "Early-Season Dry Spell",
    season_profile: "southern_major",
    season_label: "Southern Major Season",
    subseason: null,
    subseason_label: null,
    forecast_year: 2025,
    valid_time: "2026-02-01T00:00:00Z",
    generated_at: "2026-04-26T22:00:00Z",
    forecast_source: "cumulus_bridge",
    forecast_source_label: "Cumulus Bridge Product",
    source_run_id: `${theme}-deterministic-run`,
    generation_backend: "bridge_generated",
    refresh_interval_seconds: 1800,
    freshness_threshold_hours: 18,
    tile_url: `${API_BASE_URL}/forecast/deterministic/tiles/{z}/{x}/{y}.png?theme=${theme}`,
    preview_url: null,
    bounds: { latitude_min: 4, latitude_max: 11, longitude_min: -3.4, longitude_max: 1.5 },
    unit: theme === "onset" ? "day_of_year" : "days",
    lower_bound: theme === "onset" ? 45.3 : 6.8,
    upper_bound: theme === "onset" ? 128.2 : 11.2,
    legend_ticks: theme === "onset" ? [45.3, 66, 86.8, 107.5, 128.2] : [6.8, 7.9, 9.0, 10.1, 11.2],
    color_ramp: [
      { offset: 0, color: "#440154" },
      { offset: 0.25, color: "#3b528b" },
      { offset: 0.5, color: "#21918c" },
      { offset: 0.75, color: "#8fd744" },
      { offset: 1, color: "#fde725" },
    ],
  };
}

function forecastOptions() {
  return [
    {
      theme: "onset",
      label: "Onset Date",
      title: "Seasonal onset timing forecast across Ghana.",
      requires_season: true,
      requires_subseason: false,
      enabled: true,
      reason: null,
      seasons: ["northern_single", "southern_major", "southern_minor"],
      subseasons: [],
    },
    {
      theme: "early_dry_spell",
      label: "Early-Season Dry Spell",
      title: "Early-season dry-spell duration forecast across Ghana.",
      requires_season: true,
      requires_subseason: false,
      enabled: true,
      reason: null,
      seasons: ["northern_single", "southern_major", "southern_minor"],
      subseasons: [],
    },
    {
      theme: "cessation",
      label: "Cessation Date",
      title: "Seasonal cessation timing forecast across Ghana.",
      requires_season: true,
      requires_subseason: false,
      enabled: false,
      reason: "artifacts_not_generated",
      seasons: ["northern_single", "southern_major", "southern_minor"],
      subseasons: [],
    },
    {
      theme: "late_dry_spell",
      label: "Late-Season Dry Spell",
      title: "Late-season dry-spell duration forecast across Ghana.",
      requires_season: true,
      requires_subseason: false,
      enabled: false,
      reason: "artifacts_not_generated",
      seasons: ["northern_single", "southern_major", "southern_minor"],
      subseasons: [],
    },
    {
      theme: "rainfall_amount",
      label: "Seasonal Rainfall Total",
      title: "Seasonal rainfall amount forecast across Ghana.",
      requires_season: false,
      requires_subseason: true,
      enabled: false,
      reason: "artifacts_not_generated",
      seasons: [],
      subseasons: ["MAM", "AMJ", "MJJ", "JJA", "JAS", "SON"],
    },
    {
      theme: "rainy_days",
      label: "Number of Rainy Days",
      title: "Seasonal rainy-day count forecast across Ghana.",
      requires_season: false,
      requires_subseason: true,
      enabled: false,
      reason: "artifacts_not_generated",
      seasons: [],
      subseasons: ["MAM", "AMJ", "MJJ", "JJA", "JAS", "SON"],
    },
  ];
}

test("probability tab uses forecast artifact endpoints and opens a sampled drawer", async ({ page }) => {
  test.setTimeout(90_000);
  const legacyRequests: string[] = [];
  const probabilityRequests: string[] = [];
  const sampleRequests: string[] = [];

  await page.route(`${API_BASE_URL}/forecast/probability/active*`, async (route) => {
    probabilityRequests.push(route.request().url());
    const theme = new URL(route.request().url()).searchParams.get("theme") === "early_dry_spell" ? "early_dry_spell" : "onset";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probabilityProduct(theme)) });
  });
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/sample*`, async (route) => {
    sampleRequests.push(route.request().url());
    const theme = new URL(route.request().url()).searchParams.get("theme") === "early_dry_spell" ? "early_dry_spell" : "onset";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        theme,
        theme_label: theme === "onset" ? "Onset Date" : "Early-Season Dry Spell",
        season_profile: "southern_major",
        season_label: "Southern Major Season",
        subseason: null,
        subseason_label: null,
        latitude: 7.5,
        longitude: -1.0,
        nearest_latitude: 7.4,
        nearest_longitude: -1.1,
        dominant_category_code: theme === "onset" ? "PA" : "PA",
        dominant_category_label: theme === "onset" ? "Late" : "Long",
        dominant_percentage: 72,
        display_value: theme === "onset" ? "Late 72%" : "Long 72%",
        interpretation: "Forecast signal from the nearest grid cell.",
        criteria_note: "Category confidence is sampled from the nearest generated forecast grid cell.",
        category_probabilities:
          theme === "onset"
            ? [
                { category_code: "PB", label: "Early", hint: "Earlier than normal.", color: "#2f8f86", percentage: 8 },
                { category_code: "PN", label: "Near-Normal", hint: "Within normal.", color: "#b8b9b4", percentage: 20 },
                { category_code: "PA", label: "Late", hint: "Later than normal.", color: "#b47a34", percentage: 72 },
              ]
            : [
                { category_code: "PB", label: "Short", hint: "Short.", color: "#2f8f86", percentage: 12 },
                { category_code: "PN", label: "Near-Normal", hint: "Normal.", color: "#b8b9b4", percentage: 16 },
                { category_code: "PA", label: "Long", hint: "Long.", color: "#b47a34", percentage: 72 },
              ],
        valid_time: "2026-02-01T00:00:00Z",
        forecast_year: 2025,
        forecast_source: "cumulus_bridge",
        forecast_source_label: "Cumulus Bridge Product",
        source_run_id: `${theme}-probability-run`,
        generation_backend: "bridge_generated",
      }),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/tiles/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });
  await page.route(`${API_BASE_URL}/forecast/deterministic/tiles/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });
  await page.route(`${API_BASE_URL}/seasonal-map/**`, async (route) => {
    legacyRequests.push(route.request().url());
    await route.abort();
  });
  await page.route(`${API_BASE_URL}/forecast/raster**`, async (route) => {
    legacyRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("view-mode-probabilistic")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("dashboard-mode-region")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[aria-label="Forecast geography"] button').nth(0)).toHaveText("Region");
  await expect(page.locator('[aria-label="Forecast geography"] button').nth(1)).toHaveText("District");
  await expect(page.getByText("Variable", { exact: true })).toBeVisible();
  await expect(page.getByText("Season", { exact: true })).toBeVisible();
  await expect(page.getByTestId("theme-select")).toHaveValue("");
  await expect(page.getByTestId("season-select")).toHaveValue("");
  await expect(page.getByTestId("theme-select-display")).toHaveText("All Variables");
  await expect(page.getByTestId("season-select-display")).toHaveText("All Seasons");
  await expect(page.getByTestId("legend-empty")).toBeVisible();
  expect(probabilityRequests).toHaveLength(0);

  await page.getByTestId("theme-select").selectOption("onset");
  await expect(page.getByTestId("theme-select-display")).toHaveText("Onset Date");
  await expect(page.getByTestId("season-select")).toBeEnabled();
  await expect(page.getByTestId("season-select")).toHaveValue("");
  expect(probabilityRequests).toHaveLength(0);

  await page.getByTestId("season-select").selectOption("southern_major");
  await expect(page.getByTestId("season-select-display")).toHaveText("Southern Major Season");
  await expect(page.getByTestId("probability-legend")).toContainText("Late");
  expect(probabilityRequests.length).toBeGreaterThan(0);
  expect(probabilityRequests.some((request) => request.includes("season_profile=southern_major"))).toBeTruthy();
  expect(legacyRequests).toHaveLength(0);

  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date");
  await expect(page.getByTestId("selection-summary")).toContainText("Late");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Selection mode");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Region");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Cell latitude");
  await expect(page.getByTestId("drawer-publication-grid")).toContainText("Cumulus Bridge Product");
  expect(sampleRequests.length).toBeGreaterThan(0);

  await page.getByTestId("dashboard-mode-region").click();
  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Region");
});

test("deterministic tab uses forecast artifact endpoints and renders continuous legend values", async ({ page }) => {
  test.setTimeout(90_000);
  const deterministicRequests: string[] = [];
  const legacyRequests: string[] = [];

  await page.route(`${API_BASE_URL}/forecast/probability/active*`, async (route) => {
    const theme = new URL(route.request().url()).searchParams.get("theme") === "early_dry_spell" ? "early_dry_spell" : "onset";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(probabilityProduct(theme)) });
  });
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });
  await page.route(`${API_BASE_URL}/forecast/deterministic/active*`, async (route) => {
    deterministicRequests.push(route.request().url());
    const theme = new URL(route.request().url()).searchParams.get("theme") === "early_dry_spell" ? "early_dry_spell" : "onset";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deterministicProduct(theme)) });
  });
  await page.route(`${API_BASE_URL}/forecast/deterministic/sample*`, async (route) => {
    const theme = new URL(route.request().url()).searchParams.get("theme") === "early_dry_spell" ? "early_dry_spell" : "onset";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        theme,
        theme_label: theme === "onset" ? "Onset Date" : "Early-Season Dry Spell",
        season_profile: "southern_major",
        season_label: "Southern Major Season",
        subseason: null,
        subseason_label: null,
        latitude: 7.5,
        longitude: -1.0,
        nearest_latitude: 7.4,
        nearest_longitude: -1.1,
        value: theme === "onset" ? 83.2 : 9.1,
        display_value: theme === "onset" ? "24 Mar" : "9.1 day(s)",
        unit: theme === "onset" ? "day_of_year" : "days",
        interpretation: "Deterministic value sampled from the nearest grid cell.",
        criteria_note: "Deterministic value is sampled from the nearest generated forecast grid cell.",
        valid_time: "2026-02-01T00:00:00Z",
        forecast_year: 2025,
        forecast_source: "cumulus_bridge",
        forecast_source_label: "Cumulus Bridge Product",
        source_run_id: `${theme}-deterministic-run`,
        generation_backend: "bridge_generated",
      }),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/tiles/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });
  await page.route(`${API_BASE_URL}/forecast/deterministic/tiles/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });
  await page.route(`${API_BASE_URL}/seasonal-map/**`, async (route) => {
    legacyRequests.push(route.request().url());
    await route.abort();
  });
  await page.route(`${API_BASE_URL}/forecast/raster**`, async (route) => {
    legacyRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("view-mode-deterministic").click();
  await expect(page.getByTestId("theme-select")).toHaveValue("");
  await expect(page.getByTestId("season-select")).toHaveValue("");
  await expect(page.getByTestId("legend-empty")).toBeVisible();
  expect(deterministicRequests).toHaveLength(0);

  await page.getByTestId("theme-select").selectOption("early_dry_spell");
  await expect(page.getByTestId("theme-select-display")).toHaveText("Early-Season Dry Spell");
  await expect(page.getByTestId("season-select")).toBeEnabled();
  expect(deterministicRequests).toHaveLength(0);

  await page.getByTestId("season-select").selectOption("southern_major");
  await page.getByTestId("dashboard-mode-region").click();

  await expect(page.getByTestId("season-select-display")).toHaveText("Southern Major Season");
  await expect(page.getByTestId("deterministic-legend")).toBeVisible();
  await expect(page.getByTestId("deterministic-legend")).toContainText("11.2");
  expect(
    deterministicRequests.some(
      (request) => request.includes("theme=early_dry_spell") && request.includes("season_profile=southern_major"),
    ),
  ).toBeTruthy();
  expect(legacyRequests).toHaveLength(0);

  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText("Early-Season Dry Spell");
  await expect(page.getByTestId("selection-summary")).toContainText("9.1 day(s)");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Region");
  await expect(page.getByTestId("deterministic-legend")).not.toContainText("9.1 day(s)");
});
