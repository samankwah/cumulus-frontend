import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const rawDistrictFeatures = JSON.parse(
  readFileSync("public/data/ghana_district_polygons_simplified.geojson", "utf8"),
).features as Array<{
  properties: {
    display_name: string;
    region: string;
    api_district: string | null;
  };
}>;

const rawRegionFeatures = JSON.parse(
  readFileSync("public/data/ghana_regions_simplified.geojson", "utf8"),
).features as Array<{
  properties: {
    display_name: string;
    region: string;
  };
}>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function profileLabel(profile: string) {
  if (profile === "northern_single") {
    return "Northern Uni Modal Seasonal";
  }
  if (profile === "southern_major") {
    return "Southern Major Season";
  }
  return "Southern Minor Season";
}

function buildMetric(theme: string, profile: string, mode = "seasonal", subseason: string | null = null) {
  const label = profileLabel(profile);
  if (theme === "onset") {
    const displayValue =
      profile === "northern_single" ? "24 Mar" : profile === "southern_major" ? "11 Feb" : "21 Aug";
    return {
      theme,
      theme_label: "Onset Date",
      category_code: "normal",
      category_label: "Normal",
      numeric_value: 0,
      display_value: displayValue,
      unit: "days_from_reference",
      criteria_note:
        profile === "southern_minor"
          ? "Detected from 15 Aug using 20 mm in 3 consecutive days and no dry spell longer than 10 days in the next 30 days."
          : `Detected from ${profile === "northern_single" ? "15 Mar" : "01 Feb"} using at least 20 mm in up to 3 days and no dry spell longer than 10 days in the next 30 days.`,
      interpretation: `${label} onset stays within the Ghana WMO timing band.`,
      color: "#c9962b",
    };
  }
  if (theme === "cessation") {
    return {
      theme,
      theme_label: "Cessation Date",
      category_code: "late",
      category_label: "Late",
      numeric_value: 7,
      display_value: profile === "southern_major" ? "25 Jul" : "12 Nov",
      unit: "days_from_reference",
      criteria_note: `Detected from ${profile === "southern_major" ? "01 Jul" : "01 Oct"} using soil water balance depletion from 70 mm with 4 mm/day evapotranspiration.`,
      interpretation: `${label} cessation extends later than the Ghana WMO timing band.`,
      color: "#c65a46",
    };
  }
  if (theme === "early_dry_spell") {
    return {
      theme,
      theme_label: "Early-Season Dry Spell",
      category_code: "moderate",
      category_label: "Moderate",
      numeric_value: 6.0,
      display_value: "6.0 day(s)",
      unit: "days",
      criteria_note: "Longest dry run from onset to day 50. Low below 5 days; Moderate from 5 to under 8; High from 8 days upward.",
      interpretation: "Early Dry Spell pressure is building and should be monitored.",
      color: "#c98b37",
    };
  }
  if (theme === "late_dry_spell") {
    return {
      theme,
      theme_label: "Late-Season Dry Spell",
      category_code: "low",
      category_label: "Low",
      numeric_value: 4.0,
      display_value: "4.0 day(s)",
      unit: "days",
      criteria_note: "Longest dry run from day 51 to cessation. Low below 6 days; Moderate from 6 to under 9; High from 9 days upward.",
      interpretation: "Late Dry Spell pressure remains limited in this regime run.",
      color: "#2f8f6e",
    };
  }
  if (theme === "rainfall_amount") {
    const numericValue = profile === "northern_single" ? 990.5 : profile === "southern_major" ? 555.2 : 289.4;
    return {
      theme,
      theme_label: "Seasonal Rainfall Total",
      category_code: profile === "southern_minor" ? "below_normal" : "above_normal",
      category_label: profile === "southern_minor" ? "Below Normal" : "Above Normal",
      numeric_value: numericValue,
      display_value: `${numericValue.toFixed(1)} mm`,
      unit: "mm",
      criteria_note:
        mode === "calendar" && subseason
          ? `Calendar rainfall is summed only within ${subseason}. Categories compare against a ${label.toLowerCase()} ${subseason} normal.`
          : `Seasonal rainfall is summed from detected onset to cessation. Categories compare against a ${label.toLowerCase()} normal.`,
      interpretation:
        mode === "calendar" && subseason
          ? profile === "southern_minor"
            ? `${label} rainfall is below the expected ${subseason} reporting window total.`
            : `${label} rainfall is above the expected ${subseason} reporting window total.`
          : profile === "southern_minor"
            ? `${label} rainfall is below the expected onset-to-cessation total.`
            : `${label} rainfall is above the expected onset-to-cessation total.`,
      color: profile === "southern_minor" ? "#c55a45" : "#1f8a5b",
    };
  }
  const numericValue = profile === "northern_single" ? 69.0 : profile === "southern_major" ? 43.0 : 21.0;
  return {
    theme,
    theme_label: "Number of Rainy Days",
    category_code: profile === "southern_minor" ? "fewer" : "more",
    category_label: profile === "southern_minor" ? "Fewer" : "More",
    numeric_value: numericValue,
    display_value: `${numericValue.toFixed(1)} day(s)`,
    unit: "days",
    criteria_note:
      mode === "calendar" && subseason
        ? `Rainy days are counted only within ${subseason} for the ${label.toLowerCase()} regime.`
        : `Rainy days are counted between detected onset and cessation for the ${label.toLowerCase()} regime.`,
    interpretation:
      mode === "calendar" && subseason
        ? profile === "southern_minor"
          ? `${label} rainy days are below the expected ${subseason} reporting window count.`
          : `${label} rainy days are above the expected ${subseason} reporting window count.`
        : profile === "southern_minor"
          ? `${label} rainy days are below the expected onset-to-cessation count.`
          : `${label} rainy days are above the expected onset-to-cessation count.`,
    color: profile === "southern_minor" ? "#c55a45" : "#1f8a5b",
  };
}

function buildLegend(theme: string) {
  if (theme === "onset" || theme === "cessation") {
    return [
      { category_code: "early", label: "Early", hint: "Earlier than the Ghana WMO timing band.", color: "#1f8a5b" },
      { category_code: "normal", label: "Normal", hint: "Within the Ghana WMO timing band.", color: "#c9962b" },
      { category_code: "late", label: "Late", hint: "Later than the Ghana WMO timing band.", color: "#c65a46" },
    ];
  }
  if (theme === "rainfall_amount") {
    return [
      { category_code: "below_normal", label: "Below Normal", hint: "Below the regime normal.", color: "#c55a45" },
      { category_code: "near_normal", label: "Near Normal", hint: "Within the regime normal band.", color: "#c9962b" },
      { category_code: "above_normal", label: "Above Normal", hint: "Above the regime normal.", color: "#1f8a5b" },
    ];
  }
  if (theme === "rainy_days") {
    return [
      { category_code: "fewer", label: "Fewer", hint: "Below the regime normal.", color: "#c55a45" },
      { category_code: "normal", label: "Normal", hint: "Within the regime normal band.", color: "#c9962b" },
      { category_code: "more", label: "More", hint: "Above the regime normal.", color: "#1f8a5b" },
    ];
  }
  return [
    { category_code: "low", label: "Low", hint: "Limited dry-spell pressure.", color: "#2f8f6e" },
    { category_code: "moderate", label: "Moderate", hint: "Watch dry-spell pressure.", color: "#c98b37" },
    { category_code: "high", label: "High", hint: "Elevated dry-spell pressure.", color: "#c45143" },
  ];
}

function buildProduct(theme: string, seasonProfile: string, mode = "seasonal", subseason: string | null = null) {
  const seenIds = new Map<string, number>();
  const metric = buildMetric(theme, seasonProfile, mode, subseason);

  return {
    product_id: `seasonal_mocked_${seasonProfile}_${theme}_${mode}${subseason ? `_${subseason.toLowerCase()}` : ""}_20260423T120000Z`,
    theme,
    season_profile: seasonProfile,
    mode,
    subseason,
    mode_label: mode === "calendar" ? "Calendar" : "Seasonal",
    subseason_label: subseason,
    generated_at: "2026-04-23T12:00:00Z",
    forecast_cycle: "23 Apr 2026 12:00 UTC",
    forecast_source: "mocked-browser-smoke",
    forecast_source_label: "MOCKED-BROWSER-SMOKE",
    source_run_id: "mocked-run",
    refresh_interval_seconds: 1800,
    freshness_threshold_hours: 18,
    district_count: 261,
    region_count: 16,
    refresh_status: "fresh",
    is_stale: false,
    legend: buildLegend(theme),
    district_items: rawDistrictFeatures.map((feature) => {
      const apiDistrict = feature.properties.api_district ?? feature.properties.display_name;
      const baseId = slugify(apiDistrict);
      const nextSuffix = seenIds.get(baseId) ?? 0;
      seenIds.set(baseId, nextSuffix + 1);
      const locationId = nextSuffix === 0 ? baseId : `${baseId}-${nextSuffix + 1}`;

      return {
        location_id: locationId,
        geography_type: "district" as const,
        geography_name: feature.properties.display_name,
        region_name: feature.properties.region,
        coverage_count: 1,
        coverage_note: "District classification uses the selected Ghana seasonal regime.",
        metric,
      };
    }),
    region_items: rawRegionFeatures.map((feature) => ({
      location_id: slugify(feature.properties.region),
      geography_type: "region" as const,
      geography_name: feature.properties.region,
      region_name: feature.properties.region,
      coverage_count: 16,
      coverage_note: "Regional classification aggregates district outputs generated under the selected regime.",
      metric,
    })),
  };
}

test("drawer close hides the panel without losing the selected geography and queries use theme plus season profile", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const requests: Array<{ theme: string; seasonProfile: string; mode: string; subseason: string | null }> = [];

  await page.route("http://127.0.0.1:8000/seasonal-map/active*", async (route) => {
    const url = new URL(route.request().url());
    const theme = url.searchParams.get("theme") ?? "onset";
    const seasonProfile = url.searchParams.get("season_profile") ?? "northern_single";
    const mode = url.searchParams.get("mode") ?? "seasonal";
    const subseason = url.searchParams.get("subseason");
    requests.push({ theme, seasonProfile, mode, subseason });

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildProduct(theme, seasonProfile, mode, subseason)),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("map-frame")).toBeVisible();
  await expect(page.getByText("Ghana Seasonal Advisory Map")).toBeVisible();
  await expect(page.locator(".control-label", { hasText: "Season" })).toBeVisible();
  await expect(page.getByTestId("theme-select")).toHaveValue("");
  await expect(page.getByTestId("season-profile-select")).toHaveValue("");
  await expect(page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId("theme-select").selectOption("onset");
  await page.getByTestId("season-profile-select").selectOption("northern_single");
  await expect(page.getByText("Forecast cycle: 23 Apr 2026 12:00 UTC")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("mode-district").click();
  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });

  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByText("Mode: District")).toBeVisible();
  await expect(page.getByText("Variable: Onset Date")).toBeVisible();
  await expect(page.getByText("Seasonal regime: Northern Uni Modal Seasonal")).toBeVisible();
  await expect(page.getByTestId("selection-summary")).toContainText("Northern Uni Modal Seasonal onset stays within the Ghana WMO timing band.");

  expect(
    requests.some(
      (request) =>
        request.theme === "onset" &&
        request.seasonProfile === "northern_single" &&
        request.mode === "seasonal",
    ),
  ).toBeTruthy();

  await expect(page.getByTestId("drawer-close")).toHaveAttribute("aria-label", "Close details panel");
  await page.getByTestId("drawer-close").click();
  await expect(page.getByTestId("dashboard-drawer")).not.toHaveClass(/open/, { timeout: 30_000 });

  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });

  await page.getByTestId("theme-select").selectOption("rainfall_amount");
  await expect(page.getByTestId("subseason-select")).toBeVisible();
  await expect(page.getByTestId("subseason-select")).toHaveValue("");
  await expect(page.getByTestId("selection-summary")).toContainText("Northern Uni Modal Seasonal rainfall is above the expected onset-to-cessation total.");
  await page.getByTestId("subseason-select").selectOption("MJJ");
  await expect(page.getByText("Sub-season: MJJ")).toBeVisible();
  expect(
    requests.some(
      (request) =>
        request.theme === "rainfall_amount" &&
        request.seasonProfile === "northern_single" &&
        request.mode === "calendar" &&
        request.subseason === "MJJ",
    ),
  ).toBeTruthy();
});

test("switching season profile refreshes the selected metric and retry preserves selection", async ({ page }) => {
  test.setTimeout(90_000);

  let requestCount = 0;
  const requests: Array<{ theme: string; seasonProfile: string; mode: string; subseason: string | null }> = [];

  await page.route("http://127.0.0.1:8000/seasonal-map/active*", async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    const theme = url.searchParams.get("theme") ?? "onset";
    const seasonProfile = url.searchParams.get("season_profile") ?? "northern_single";
    const mode = url.searchParams.get("mode") ?? "seasonal";
    const subseason = url.searchParams.get("subseason");
    requests.push({ theme, seasonProfile, mode, subseason });

    if (requestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Active seasonal product is temporarily unavailable.",
          error_code: "seasonal_product_unavailable",
        }),
      });
      return;
    }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildProduct(theme, seasonProfile, mode, subseason)),
      });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("theme-select")).toHaveValue("");
  await expect(page.getByTestId("season-profile-select")).toHaveValue("");
  await expect(page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("theme-select").selectOption("onset");
  await page.getByTestId("season-profile-select").selectOption("northern_single");
  await expect(page.getByTestId("product-error")).toContainText("Active seasonal product is temporarily unavailable.");

  await page.getByTestId("mode-region").click();
  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });

  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("selection-unavailable")).toContainText(
    "Active seasonal product is temporarily unavailable.",
  );
  await expect(page.getByText("Seasonal regime: Northern Uni Modal Seasonal")).toBeVisible();

  await page.getByRole("button", { name: "Retry seasonal product" }).click();
  await expect(page.getByTestId("selection-summary")).toContainText("Northern Uni Modal Seasonal onset stays within the Ghana WMO timing band.", { timeout: 30_000 });

  await page.getByTestId("season-profile-select").selectOption("southern_minor");
  await expect(page.getByTestId("selection-summary")).toContainText("Southern Minor Season onset stays within the Ghana WMO timing band.", { timeout: 30_000 });
  await expect(page.getByText("Seasonal regime: Southern Minor Season")).toBeVisible();

  expect(
    requests.some(
      (request) =>
        request.theme === "onset" &&
        request.seasonProfile === "southern_minor" &&
        request.mode === "seasonal",
    ),
  ).toBeTruthy();
});
