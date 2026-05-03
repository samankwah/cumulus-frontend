import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:8000";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lR271wAAAABJRU5ErkJggg==",
  "base64",
);

async function clickRasterMap(page: Page) {
  const geographyLayer = page.locator('[class*="forecast-feature"] .leaflet-interactive').first();
  await geographyLayer.waitFor({ state: "attached", timeout: 30_000 });
  await geographyLayer.click({ force: true });
}

async function clickOutsideGhanaBoundary(page: Page) {
  const map = page.locator(".leaflet-container").first();
  await map.waitFor({ state: "visible", timeout: 30_000 });
  const box = await map.boundingBox();
  if (!box) {
    throw new Error("Leaflet map bounds are unavailable.");
  }
  await page.mouse.click(box.x + box.width * 0.92, box.y + box.height * 0.5);
}

async function hoverRasterMap(page: Page) {
  const geographyLayer = page.locator('[class*="forecast-feature"] .leaflet-interactive').first();
  await geographyLayer.waitFor({ state: "attached", timeout: 30_000 });
  await geographyLayer.hover({ force: true });
  const tooltip = page.locator(".leaflet-tooltip").last();
  await expect(tooltip).toBeVisible({ timeout: 30_000 });
  return tooltip;
}

type MockTheme = "onset" | "early_dry_spell" | "cessation" | "late_dry_spell" | "rainfall_amount" | "rainy_days";

const THEME_LABELS: Record<MockTheme, string> = {
  onset: "Onset Date",
  early_dry_spell: "Early-Season Dry Spell",
  cessation: "Cessation Date",
  late_dry_spell: "Late-Season Dry Spell",
  rainfall_amount: "Seasonal Rainfall Total",
  rainy_days: "Number of Rainy Days",
};

function themeFromUrl(url: string): MockTheme {
  const theme = new URL(url).searchParams.get("theme");
  if (theme === "early_dry_spell" || theme === "cessation" || theme === "late_dry_spell" || theme === "rainfall_amount" || theme === "rainy_days") {
    return theme;
  }
  return "onset";
}

function probabilityLegend(theme: MockTheme) {
  if (theme === "onset") {
    return [
      { category_code: "PB", label: "Early", hint: "Earlier than the climatological timing window.", color: "#2f8f86", display_order: 0 },
      { category_code: "PN", label: "Near-Normal", hint: "Within the climatological timing window.", color: "#b8b9b4", display_order: 1 },
      { category_code: "PA", label: "Late", hint: "Later than the climatological timing window.", color: "#b47a34", display_order: 2 },
    ];
  }
  if (theme === "cessation") {
    return [
      { category_code: "PB", label: "Early", hint: "Earlier than the climatological timing window.", color: "#b47a34", display_order: 0 },
      { category_code: "PN", label: "Near-Normal", hint: "Within the climatological timing window.", color: "#b8b9b4", display_order: 1 },
      { category_code: "PA", label: "Late", hint: "Later than the climatological timing window.", color: "#2f8f86", display_order: 2 },
    ];
  }
  if (theme === "early_dry_spell" || theme === "late_dry_spell") {
    return [
      { category_code: "PB", label: "Short", hint: "Shorter dry-spell duration.", color: "#2f8f86", display_order: 0 },
      { category_code: "PN", label: "Near-Normal", hint: "Near the climatological dry-spell duration.", color: "#b8b9b4", display_order: 1 },
      { category_code: "PA", label: "Long", hint: "Longer dry-spell duration.", color: "#b47a34", display_order: 2 },
    ];
  }
  return [
    { category_code: "PB", label: "BELOW-AVERAGE", hint: "Below the climatological normal.", color: "#b47a34", display_order: 0 },
    { category_code: "PN", label: "NEAR-AVERAGE", hint: "Near the climatological normal.", color: "#b8b9b4", display_order: 1 },
    { category_code: "PA", label: "ABOVE-AVERAGE", hint: "Above the climatological normal.", color: "#2f8f86", display_order: 2 },
  ];
}

function probabilityProduct(
  theme: MockTheme,
  seasonProfile: string | null = "southern_major",
  subseason: string | null = null,
  isFallback = false,
) {
  const isSubseason = theme === "rainfall_amount" || theme === "rainy_days";

  return {
    product_id: `${theme}_probability_2026`,
    theme,
    theme_label: THEME_LABELS[theme],
    season_profile: isSubseason ? null : seasonProfile,
    season_label: isSubseason ? null : "Southern Major Season",
    subseason,
    subseason_label: subseason,
    forecast_year: 2026,
    valid_time: "2026-04-01T00:00:00Z",
    generated_at: "2026-04-26T22:00:00Z",
    forecast_source: "cumulus_bridge",
    forecast_source_label: "Cumulus Bridge Product",
    source_run_id: `${theme}-probability-run`,
    generation_backend: "bridge_generated",
    source_artifact_type: isFallback ? "daily_wass2s_derived" : "final_netcdf",
    grid_shape: isFallback ? { y: 5, x: 6 } : { y: 23, x: 16 },
    grid_resolution_degrees: isFallback ? { latitude: 1.5, longitude: 1.0 } : { latitude: 0.4, longitude: 0.4 },
    is_low_resolution_fallback: isFallback,
    refresh_interval_seconds: 1800,
    freshness_threshold_hours: 18,
    tile_url: `${API_BASE_URL}/forecast/probability/tiles/{z}/{x}/{y}.png?theme=${theme}`,
    preview_url: null,
    bounds: { latitude_min: 4, latitude_max: 11, longitude_min: -3.4, longitude_max: 1.5 },
    legend: probabilityLegend(theme),
  };
}

function deterministicProduct(
  theme: MockTheme,
  seasonProfile: string | null = "southern_major",
  subseason: string | null = null,
  isFallback = false,
) {
  const unit = theme === "onset" || theme === "cessation" ? "day_of_year" : theme === "rainfall_amount" ? "mm" : "days";
  const isSubseason = theme === "rainfall_amount" || theme === "rainy_days";
  return {
    product_id: `${theme}_deterministic_2026`,
    theme,
    theme_label: THEME_LABELS[theme],
    season_profile: isSubseason ? null : seasonProfile,
    season_label: isSubseason ? null : "Southern Major Season",
    subseason,
    subseason_label: subseason,
    forecast_year: 2026,
    valid_time: "2026-04-01T00:00:00Z",
    generated_at: "2026-04-26T22:00:00Z",
    forecast_source: "cumulus_bridge",
    forecast_source_label: "Cumulus Bridge Product",
    source_run_id: `${theme}-deterministic-run`,
    generation_backend: "bridge_generated",
    source_artifact_type: isFallback ? "daily_wass2s_derived" : "final_netcdf",
    grid_shape: isFallback ? { y: 5, x: 6 } : { y: 23, x: 16 },
    grid_resolution_degrees: isFallback ? { latitude: 1.5, longitude: 1.0 } : { latitude: 0.4, longitude: 0.4 },
    is_low_resolution_fallback: isFallback,
    refresh_interval_seconds: 1800,
    freshness_threshold_hours: 18,
    tile_url: `${API_BASE_URL}/forecast/deterministic/tiles/{z}/{x}/{y}.png?theme=${theme}`,
    preview_url: null,
    bounds: { latitude_min: 4, latitude_max: 11, longitude_min: -3.4, longitude_max: 1.5 },
    unit,
    lower_bound: unit === "mm" ? 120.0 : unit === "days" ? 6.8 : 45.3,
    upper_bound: unit === "mm" ? 620.0 : unit === "days" ? 11.2 : 128.2,
    legend_ticks: unit === "mm" ? [120, 245, 370, 495, 620] : unit === "days" ? [6.8, 7.9, 9.0, 10.1, 11.2] : [45.3, 66, 86.8, 107.5, 128.2],
    color_ramp: [
      { offset: 0, color: "#440154" },
      { offset: 0.25, color: "#3b528b" },
      { offset: 0.5, color: "#21918c" },
      { offset: 0.75, color: "#8fd744" },
      { offset: 1, color: "#fde725" },
    ],
  };
}

function samplePayload(theme: MockTheme, mode: "probability" | "deterministic", seasonProfile: string | null, subseason: string | null) {
  const isSubseason = theme === "rainfall_amount" || theme === "rainy_days";
  if (mode === "probability") {
    const legend = probabilityLegend(theme);
    const dominant = legend[2];
    return {
      theme,
      theme_label: THEME_LABELS[theme],
      season_profile: isSubseason ? null : seasonProfile,
      season_label: isSubseason ? null : "Southern Major Season",
      subseason,
      subseason_label: subseason,
      latitude: 7.5,
      longitude: -1.0,
      nearest_latitude: 7.4,
      nearest_longitude: -1.1,
      dominant_category_code: dominant.category_code,
      dominant_category_label: dominant.label,
      dominant_percentage: 72,
      display_value: `${dominant.label} 72%`,
      interpretation: "Forecast signal from the nearest grid cell.",
      criteria_note: "Category confidence is sampled from the nearest generated forecast grid cell.",
      category_probabilities: legend.map((item, index) => ({ ...item, percentage: index === 2 ? 72 : index === 1 ? 20 : 8 })),
      valid_time: "2026-04-01T00:00:00Z",
      forecast_year: 2026,
      forecast_source: "cumulus_bridge",
      forecast_source_label: "Cumulus Bridge Product",
      source_run_id: `${theme}-probability-run`,
      generation_backend: "bridge_generated",
    };
  }

  const unit = theme === "onset" || theme === "cessation" ? "day_of_year" : theme === "rainfall_amount" ? "mm" : "days";
  const value = unit === "mm" ? 345.6 : unit === "days" ? 9.1 : 83.2;
  return {
    theme,
    theme_label: THEME_LABELS[theme],
    season_profile: isSubseason ? null : seasonProfile,
    season_label: isSubseason ? null : "Southern Major Season",
    subseason,
    subseason_label: subseason,
    latitude: 7.5,
    longitude: -1.0,
    nearest_latitude: 7.4,
    nearest_longitude: -1.1,
    value,
    display_value: unit === "mm" ? "345.6 mm" : unit === "days" ? "9.1 day(s)" : "24 Mar",
    unit,
    interpretation: "Deterministic value sampled from the nearest grid cell.",
    criteria_note: "Deterministic value is sampled from the nearest generated forecast grid cell.",
    valid_time: "2026-04-01T00:00:00Z",
    forecast_year: 2026,
    forecast_source: "cumulus_bridge",
    forecast_source_label: "Cumulus Bridge Product",
    source_run_id: `${theme}-deterministic-run`,
    generation_backend: "bridge_generated",
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
      enabled: true,
      reason: null,
      seasons: ["northern_single", "southern_major", "southern_minor"],
      subseasons: [],
    },
    {
      theme: "late_dry_spell",
      label: "Late-Season Dry Spell",
      title: "Late-season dry-spell duration forecast across Ghana.",
      requires_season: true,
      requires_subseason: false,
      enabled: true,
      reason: null,
      seasons: ["northern_single", "southern_major", "southern_minor"],
      subseasons: [],
    },
    {
      theme: "rainfall_amount",
      label: "Seasonal Rainfall Total",
      title: "Seasonal rainfall amount forecast across Ghana.",
      requires_season: false,
      requires_subseason: true,
      enabled: true,
      reason: null,
      seasons: [],
      subseasons: ["MAM", "AMJ", "MJJ", "JJA", "JAS", "SON"],
    },
    {
      theme: "rainy_days",
      label: "Number of Rainy Days",
      title: "Seasonal rainy-day count forecast across Ghana.",
      requires_season: false,
      requires_subseason: true,
      enabled: true,
      reason: null,
      seasons: [],
      subseasons: ["MAM", "AMJ", "MJJ", "JJA", "JAS", "SON"],
    },
  ];
}

function forecastOptionsWithRainfallSubseasons(subseasons: string[]) {
  return forecastOptions().map((option) =>
    option.theme === "rainfall_amount"
      ? {
          ...option,
          enabled: subseasons.length > 0,
          reason: subseasons.length > 0 ? null : "artifacts_not_generated",
          subseasons,
        }
      : option,
  );
}

test("forecast controls and legend fit phone viewports without horizontal overflow", async ({ page }) => {
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("theme-select-display")).toHaveText("All Variables");
    await expect(page.getByTestId("legend-empty")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const controls = document.querySelector<HTMLElement>(".floating-controls");
      const legend = document.querySelector<HTMLElement>(".floating-legend");
      const forecastButtons = Array.from(document.querySelectorAll<HTMLElement>('[aria-label="Forecast view"] button'));

      if (!controls || !legend || forecastButtons.length < 2) {
        throw new Error("Responsive map chrome is missing.");
      }

      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const controlRect = controls.getBoundingClientRect();
      const legendRect = legend.getBoundingClientRect();
      const firstButtonRect = forecastButtons[0].getBoundingClientRect();
      const secondButtonRect = forecastButtons[1].getBoundingClientRect();

      return {
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewportWidth,
        controlLeft: controlRect.left,
        controlRight: controlRect.right,
        controlBottom: controlRect.bottom,
        legendTop: legendRect.top,
        legendBottom: legendRect.bottom,
        viewportWidth,
        viewportHeight,
        forecastButtonsShareRow: Math.abs(firstButtonRect.top - secondButtonRect.top) <= 2,
      };
    });

    expect(metrics.horizontalOverflow, `${viewport.width}x${viewport.height} should not overflow horizontally`).toBeLessThanOrEqual(1);
    expect(metrics.controlLeft, `${viewport.width}x${viewport.height} controls should stay inside left edge`).toBeGreaterThanOrEqual(0);
    expect(metrics.controlRight, `${viewport.width}x${viewport.height} controls should stay inside right edge`).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.legendBottom, `${viewport.width}x${viewport.height} legend should stay inside the viewport`).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.controlBottom, `${viewport.width}x${viewport.height} controls should not collide with the legend`).toBeLessThanOrEqual(metrics.legendTop - 8);

    if (viewport.width >= 360) {
      expect(metrics.forecastButtonsShareRow, `${viewport.width}x${viewport.height} dual controls should stay compact`).toBeTruthy();
    }
  }
});

test("mobile controls collapse above the legend and drawer fills the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/active*`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(probabilityProduct(themeFromUrl(route.request().url()), url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/sample*`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(samplePayload(themeFromUrl(route.request().url()), "probability", url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/tiles/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("legend-empty")).toBeVisible();
  await expect(page.locator(".floating-controls")).toBeVisible();
  await expect(page.locator(".leaflet-control-attribution")).not.toBeVisible();
  const initialToggleMetrics = await page.evaluate(() => {
    const toggle = document.querySelector<HTMLElement>('[data-testid="mobile-controls-toggle"]');
    const controls = document.querySelector<HTMLElement>(".floating-controls");
    const legend = document.querySelector<HTMLElement>(".floating-legend");
    if (!toggle || !controls || !legend) {
      throw new Error("Mobile toggle, controls, or legend is missing.");
    }
    const controlsRect = controls.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    return {
      toggleTop: toggleRect.top,
      toggleBottom: toggleRect.bottom,
      controlsTop: controlsRect.top,
      controlsBottom: controlsRect.bottom,
      toggleInsideControls: controls.contains(toggle),
      toggleInsideLegend: legend.contains(toggle),
    };
  });
  expect(initialToggleMetrics.toggleInsideLegend).toBeFalsy();
  expect(initialToggleMetrics.toggleInsideControls).toBeTruthy();
  expect(initialToggleMetrics.toggleBottom).toBeLessThanOrEqual(initialToggleMetrics.controlsBottom);

  await page.getByTestId("theme-select-button").click();
  const variableMenuMetrics = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>(".control-select-menu");
    const controls = document.querySelector<HTMLElement>(".floating-controls");
    const legend = document.querySelector<HTMLElement>(".floating-legend");
    if (!menu || !controls || !legend) {
      throw new Error("Mobile controls menu is missing.");
    }
    const controlRect = controls.getBoundingClientRect();
    const legendRect = legend.getBoundingClientRect();
    return {
      optionCount: menu.querySelectorAll("button").length,
      hasInternalScroll: menu.scrollHeight > menu.clientHeight + 1,
      controlBottom: controlRect.bottom,
      legendTop: legendRect.top,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
    };
  });
  expect(variableMenuMetrics.optionCount).toBe(6);
  expect(variableMenuMetrics.hasInternalScroll).toBeFalsy();
  expect(variableMenuMetrics.controlBottom).toBeLessThanOrEqual(variableMenuMetrics.legendTop - 8);
  expect(variableMenuMetrics.horizontalOverflow).toBeLessThanOrEqual(1);

  await page.getByRole("option", { name: "Onset Date" }).click();
  await page.getByTestId("season-select-button").click();
  const seasonMenuMetrics = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>(".control-select-menu");
    if (!menu) {
      throw new Error("Season menu is missing.");
    }
    return {
      optionCount: menu.querySelectorAll("button").length,
      hasInternalScroll: menu.scrollHeight > menu.clientHeight + 1,
    };
  });
  expect(seasonMenuMetrics.optionCount).toBe(3);
  expect(seasonMenuMetrics.hasInternalScroll).toBeFalsy();

  await page.getByRole("option", { name: "Southern Major Season" }).click();
  await expect(page.getByTestId("probability-legend")).toContainText("Late");
  await expect(page.locator(".floating-controls")).toBeVisible();
  await expect(page.getByTestId("mobile-control-content")).not.toBeVisible();
  await expect(page.locator(".floating-legend")).toBeVisible();

  await page.getByTestId("mobile-controls-toggle").click();
  await expect(page.getByTestId("mobile-control-content")).toBeVisible();
  const reopenedMetrics = await page.evaluate(() => {
    const controls = document.querySelector<HTMLElement>(".floating-controls");
    const legend = document.querySelector<HTMLElement>(".floating-legend");
    if (!controls || !legend) {
      throw new Error("Mobile chrome is missing after reopening controls.");
    }
    return {
      controlBottom: controls.getBoundingClientRect().bottom,
      legendTop: legend.getBoundingClientRect().top,
    };
  });
  expect(reopenedMetrics.controlBottom).toBeLessThanOrEqual(reopenedMetrics.legendTop - 8);

  await page.getByTestId("theme-select-button").click();
  await page.getByRole("option", { name: "Rainfall Total (mm)" }).click();
  await page.getByTestId("subseason-select-button").click();
  const subseasonMenuMetrics = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>(".control-select-menu");
    if (!menu) {
      throw new Error("Sub-season menu is missing.");
    }
    return {
      optionCount: menu.querySelectorAll("button").length,
      hasInternalScroll: menu.scrollHeight > menu.clientHeight + 1,
    };
  });
  expect(subseasonMenuMetrics.optionCount).toBe(6);
  expect(subseasonMenuMetrics.hasInternalScroll).toBeFalsy();

  await page.getByRole("option", { name: "MAM (mm)" }).click();
  await expect(page.getByTestId("probability-legend")).toContainText("ABOVE-AVERAGE");
  await expect(page.locator(".floating-controls")).toBeVisible();
  await expect(page.getByTestId("mobile-control-content")).not.toBeVisible();

  await clickRasterMap(page);
  const drawer = page.getByTestId("dashboard-drawer");
  await expect(drawer).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-close")).toBeVisible();
  await page.waitForTimeout(260);
  const drawerMetrics = await drawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(drawerMetrics.top).toBeLessThanOrEqual(1);
  expect(drawerMetrics.left).toBeLessThanOrEqual(1);
  expect(drawerMetrics.right).toBeGreaterThanOrEqual(drawerMetrics.viewportWidth - 1);
  expect(drawerMetrics.bottom).toBeGreaterThanOrEqual(drawerMetrics.viewportHeight - 1);

  await page.getByTestId("drawer-close").click();
  await expect(drawer).not.toHaveClass(/open/);
});

test("variable selector shows loading state while forecast options load", async ({ page }) => {
  let releaseOptions!: () => void;
  const pendingOptions = new Promise<void>((resolve) => {
    releaseOptions = resolve;
  });

  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await pendingOptions;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(forecastOptions()),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("theme-select")).toBeDisabled();
  await expect(page.getByTestId("theme-select-display")).toHaveText("Loading variables...");
  await expect(page.getByTestId("theme-select-skeleton")).toBeVisible();
  await expect(page.getByTestId("season-select-skeleton")).toBeVisible();
  await expect(page.getByTestId("subseason-select-skeleton")).toBeVisible();
  await expect(page.getByTestId("legend-skeleton")).toBeVisible();

  releaseOptions();

  await expect(page.getByTestId("theme-select")).toBeEnabled();
  await expect(page.getByTestId("theme-select-display")).toHaveText("All Variables");
  await expect(page.getByTestId("theme-select-skeleton")).toHaveCount(0);
});

test("variable selector reports backend availability when forecast options fail", async ({ page }) => {
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Forecast options unavailable.", error_code: "service_error" }),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("theme-select")).toBeDisabled();
  await expect(page.getByTestId("theme-select-display")).toHaveText("Variable options unavailable");
  await expect(page.getByTestId("theme-select").locator("option")).toHaveText(["Variable options unavailable"]);
  await expect(page.getByTestId("theme-options-status-note")).toContainText("backend API");
  await expect(page.getByTestId("theme-select-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("legend-skeleton")).toHaveCount(0);
});

test("onset season selector includes southern minor when backend reports it ready", async ({ page }) => {
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(forecastOptions()),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("theme-select").selectOption("onset");

  await expect(page.getByTestId("season-select")).toBeVisible();
  await expect(page.getByTestId("season-select").locator("option")).toHaveText([
    "All Seasons",
    "Northern Single Season",
    "Southern Major Season",
    "Southern Minor Season",
  ]);
});

test("sub-season selector offers high-resolution AMJ and JJA when backend reports them ready", async ({ page }) => {
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(forecastOptionsWithRainfallSubseasons(["AMJ", "JJA"])),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("theme-select").selectOption("rainfall_amount");

  await expect(page.getByTestId("subseason-select")).toBeVisible();
  await expect(page.getByTestId("subseason-select").locator("option")).toHaveText(["All Sub-seasons", "AMJ (mm)", "JJA (mm)"]);
});

test("sub-season selector omits AMJ and JJA when backend does not report final products", async ({ page }) => {
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(forecastOptionsWithRainfallSubseasons(["MAM", "MJJ", "JAS"])),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("theme-select").selectOption("rainfall_amount");

  await expect(page.getByTestId("subseason-select")).toBeVisible();
  await expect(page.getByTestId("subseason-select").locator("option")).toHaveText([
    "All Sub-seasons",
    "MAM (mm)",
    "MJJ (mm)",
    "JAS (mm)",
  ]);
});

test("fallback forecast products show a low-resolution status note", async ({ page }) => {
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/active*`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(probabilityProduct(themeFromUrl(route.request().url()), url.searchParams.get("season_profile"), url.searchParams.get("subseason"), true)),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/tiles/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("theme-select").selectOption("onset");
  await page.getByTestId("season-select").selectOption("southern_major");

  await expect(page.getByTestId("fallback-status-note")).toHaveText("Derived low-resolution fallback.");
});

test("blank raster clicks outside Ghana do not open the drawer", async ({ page }) => {
  const sampleRequests: string[] = [];

  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/active*`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(probabilityProduct(themeFromUrl(route.request().url()), url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/sample*`, async (route) => {
    sampleRequests.push(route.request().url());
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Should not sample outside Ghana." }) });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/tiles/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("theme-select").selectOption("onset");
  await page.getByTestId("season-select").selectOption("southern_major");
  await page.locator('[class*="forecast-feature"] .leaflet-interactive').first().waitFor({ state: "attached", timeout: 30_000 });

  await clickOutsideGhanaBoundary(page);
  await page.waitForTimeout(500);

  await expect(page.getByTestId("dashboard-drawer")).not.toHaveClass(/open/);
  expect(sampleRequests).toHaveLength(0);
});

test("probability tab uses forecast artifact endpoints and opens a sampled drawer", async ({ page }) => {
  test.setTimeout(90_000);
  const legacyRequests: string[] = [];
  const probabilityRequests: string[] = [];
  const sampleRequests: string[] = [];

  await page.route(`${API_BASE_URL}/forecast/probability/active*`, async (route) => {
    probabilityRequests.push(route.request().url());
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(probabilityProduct(themeFromUrl(route.request().url()), url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });
  await page.route(`${API_BASE_URL}/forecast/probability/sample*`, async (route) => {
    sampleRequests.push(route.request().url());
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(samplePayload(themeFromUrl(route.request().url()), "probability", url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
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
  await expect(page.getByTestId("drawer-selected-geography")).not.toHaveText(/Select a geography|Forecast point/);
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Forecast signal");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Confidence");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Advisory area");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Late");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("72%");
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date");
  await expect(page.getByTestId("selection-summary")).toContainText("Late");
  await expect(page.getByTestId("selection-summary")).toContainText("72%");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Audience");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("advisory teams");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Forecast period");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Dissemination use");
  await expect(page.getByTestId("dashboard-drawer")).not.toContainText("Nearest cell");
  await expect(page.getByTestId("dashboard-drawer")).not.toContainText("Cell latitude");
  await expect(page.getByTestId("dashboard-drawer")).not.toContainText("Freshness");
  expect(sampleRequests.length).toBeGreaterThan(0);
  const probabilityTooltip = await hoverRasterMap(page);
  await expect(probabilityTooltip).not.toContainText("Sample district representative point");
  await expect(probabilityTooltip).not.toContainText("Sample region representative point");
  await expect(probabilityTooltip).toContainText("Late");
  await expect(probabilityTooltip).toContainText("72%");

  await page.getByTestId("theme-select").selectOption("cessation");
  await expect(page.getByTestId("probability-legend")).toContainText("Late");
  await page.getByTestId("theme-select").selectOption("late_dry_spell");
  await expect(page.getByTestId("probability-legend")).toContainText("Long");
  await page.getByTestId("theme-select").selectOption("rainfall_amount");
  await page.getByTestId("subseason-select").selectOption("MAM");
  await expect(page.getByTestId("subseason-select-display")).toHaveText("MAM (mm)");
  await expect(page.getByTestId("probability-legend")).toContainText("ABOVE-AVERAGE");
  await clickRasterMap(page);
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("ABOVE-AVERAGE", { timeout: 30_000 });
  await page.getByTestId("theme-select").selectOption("rainy_days");
  await expect(page.getByTestId("probability-legend")).toContainText("ABOVE-AVERAGE");

  await page.getByTestId("dashboard-mode-region").click();
  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("advisory teams");
});

test("deterministic tab uses forecast artifact endpoints and renders continuous legend values", async ({ page }) => {
  test.setTimeout(90_000);
  const deterministicRequests: string[] = [];
  const legacyRequests: string[] = [];

  await page.route(`${API_BASE_URL}/forecast/probability/active*`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(probabilityProduct(themeFromUrl(route.request().url()), url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/products/options`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forecastOptions()) });
  });
  await page.route(`${API_BASE_URL}/forecast/deterministic/active*`, async (route) => {
    deterministicRequests.push(route.request().url());
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deterministicProduct(themeFromUrl(route.request().url()), url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
    });
  });
  await page.route(`${API_BASE_URL}/forecast/deterministic/sample*`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(samplePayload(themeFromUrl(route.request().url()), "deterministic", url.searchParams.get("season_profile"), url.searchParams.get("subseason"))),
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

  await page.getByTestId("theme-select").selectOption("onset");
  await expect(page.getByTestId("theme-select-display")).toHaveText("Onset Date");
  await expect(page.getByTestId("season-select")).toBeEnabled();
  expect(deterministicRequests).toHaveLength(0);

  await page.getByTestId("season-select").selectOption("southern_major");
  await page.getByTestId("dashboard-mode-region").click();

  await expect(page.getByTestId("season-select-display")).toHaveText("Southern Major Season");
  await expect(page.getByTestId("deterministic-legend")).toBeVisible();
  await expect(page.getByTestId("deterministic-legend")).toContainText("Feb week 2");
  await expect(page.getByTestId("deterministic-legend")).toContainText("May week 2");
  await expect(page.getByTestId("deterministic-legend")).not.toContainText("Mar week 5");
  await expect(page.getByTestId("deterministic-legend")).not.toContainText("128.2");
  await expect(page.getByTestId("deterministic-legend")).not.toContainText("doy");
  expect(
    deterministicRequests.some(
      (request) => request.includes("theme=onset") && request.includes("season_profile=southern_major"),
    ),
  ).toBeTruthy();
  expect(legacyRequests).toHaveLength(0);

  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-selected-geography")).not.toHaveText(/Select a geography|Forecast point/);
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Forecast signal");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Value");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Advisory area");
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Mar week 4");
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date");
  await expect(page.getByTestId("selection-summary")).toContainText("Mar week 4");
  await expect(page.getByTestId("selection-summary")).not.toContainText("day_of_year");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Audience");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Forecast period");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Mar week 4");
  await expect(page.getByTestId("dashboard-drawer")).not.toContainText("Published product");
  const deterministicTooltip = await hoverRasterMap(page);
  await expect(deterministicTooltip).not.toContainText("Sample district representative point");
  await expect(deterministicTooltip).not.toContainText("Sample region representative point");
  await expect(deterministicTooltip).toContainText("Mar week 4");

  await page.getByTestId("theme-select").selectOption("early_dry_spell");
  await page.getByTestId("season-select").selectOption("southern_major");
  await expect(page.getByTestId("deterministic-legend")).toContainText("11");
  await expect(page.getByTestId("deterministic-legend")).not.toContainText("11.2");

  await page.getByTestId("theme-select").selectOption("rainfall_amount");
  await page.getByTestId("subseason-select").selectOption("MAM");
  await expect(page.getByTestId("deterministic-legend")).toContainText("620");
  await clickRasterMap(page);
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("345.6 mm", { timeout: 30_000 });
});
