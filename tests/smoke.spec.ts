import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const rawDistrictFeatures = JSON.parse(
  readFileSync("public/data/ghana_district_polygons_simplified.geojson", "utf8"),
).features as Array<{
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
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
const NORTHERN_LATITUDE_THRESHOLD = 8.0;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function polygonArea(ring: number[][]) {
  if (ring.length < 3) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    total += x1 * y2 - x2 * y1;
  }

  return total / 2;
}

function polygonCentroid(ring: number[][]) {
  const area = polygonArea(ring);
  if (area === 0) {
    return null;
  }

  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const factor = x1 * y2 - x2 * y1;
    centroidX += (x1 + x2) * factor;
    centroidY += (y1 + y2) * factor;
  }

  return {
    longitude: centroidX / (6 * area),
    latitude: centroidY / (6 * area),
  };
}

function bboxCenter(points: number[][]) {
  const xs = points.map(([lon]) => lon);
  const ys = points.map(([, lat]) => lat);

  return {
    latitude: (Math.min(...ys) + Math.max(...ys)) / 2,
    longitude: (Math.min(...xs) + Math.max(...xs)) / 2,
  };
}

function representativePoint(geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] }) {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][]);
  const outerRings = polygons.map((polygon) => polygon[0]).filter(Boolean);
  if (!outerRings.length) {
    return { latitude: 0, longitude: 0 };
  }

  const largestRing = outerRings.reduce((largest, ring) =>
    Math.abs(polygonArea(ring)) > Math.abs(polygonArea(largest)) ? ring : largest,
  );
  return polygonCentroid(largestRing) ?? bboxCenter(largestRing);
}

function districtZone(latitude: number) {
  return latitude >= NORTHERN_LATITUDE_THRESHOLD ? "north" : "south";
}

function themeUsesRegimeFootprint(theme: string) {
  return theme === "onset" || theme === "cessation" || theme === "early_dry_spell" || theme === "late_dry_spell";
}

function profileNativeZone(profile: string) {
  return profile === "northern_single" ? "north" : "south";
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

const districtFixtures = (() => {
  const seenIds = new Map<string, number>();
  return rawDistrictFeatures.map((feature, index) => {
    const apiDistrict = feature.properties.api_district ?? feature.properties.display_name;
    const baseId = slugify(apiDistrict);
    const nextSuffix = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, nextSuffix + 1);
    const locationId = nextSuffix === 0 ? baseId : `${baseId}-${nextSuffix + 1}`;
    const point = representativePoint(feature.geometry);

    return {
      index,
      locationId,
      displayName: feature.properties.display_name,
      regionName: feature.properties.region,
      latitude: point.latitude,
      regimeZone: districtZone(point.latitude),
    };
  });
})();

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

function buildProduct(
  theme: string,
  seasonProfile: string,
  mode = "seasonal",
  subseason: string | null = null,
  options?: { restrictToFootprint?: boolean },
) {
  const metric = buildMetric(theme, seasonProfile, mode, subseason);
  const restrictToFootprint = Boolean(options?.restrictToFootprint);
  const includedDistricts = districtFixtures.filter((district) =>
    !restrictToFootprint || !themeUsesRegimeFootprint(theme) || district.regimeZone === profileNativeZone(seasonProfile),
  );
  const regionCoverage = includedDistricts.reduce<Record<string, number>>((accumulator, district) => {
    accumulator[district.regionName] = (accumulator[district.regionName] ?? 0) + 1;
    return accumulator;
  }, {});

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
    district_count: includedDistricts.length,
    region_count: Object.keys(regionCoverage).length,
    refresh_status: "fresh",
    is_stale: false,
    legend: buildLegend(theme),
    district_items: includedDistricts.map((district) => ({
        location_id: district.locationId,
        geography_type: "district" as const,
        geography_name: district.displayName,
        region_name: district.regionName,
        coverage_count: 1,
        coverage_note:
          restrictToFootprint && themeUsesRegimeFootprint(theme)
            ? "District classification is published only inside the matching agro-ecological footprint."
            : "District classification remains nationwide while the selected seasonal profile changes criteria and normals.",
        metric,
      })),
    region_items: rawRegionFeatures
      .filter((feature) => regionCoverage[feature.properties.region] !== undefined)
      .map((feature) => ({
      location_id: slugify(feature.properties.region),
      geography_type: "region" as const,
      geography_name: feature.properties.region,
      region_name: feature.properties.region,
      coverage_count: regionCoverage[feature.properties.region],
      coverage_note:
        restrictToFootprint && themeUsesRegimeFootprint(theme)
          ? "Regional classification aggregates in-footprint district outputs only."
          : "Regional classification aggregates all district outputs returned for the region.",
      metric,
    })),
  };
}

const firstNorthernDistrictIndex = districtFixtures.find((district) => district.regimeZone === "north")?.index ?? 0;
const firstSouthernDistrictIndex = districtFixtures.find((district) => district.regimeZone === "south")?.index ?? 0;

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
  await expect(page.getByText("Seasonal Advisory Map")).toBeVisible();
  await expect(page.locator(".control-label", { hasText: "Season" })).toBeVisible();
  await expect(page.getByTestId("theme-select")).toHaveValue("");
  await expect(page.getByTestId("season-profile-select")).toHaveValue("");
  await expect(page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId("theme-select").selectOption("onset");
  await page.getByTestId("season-profile-select").selectOption("northern_single");
  await expect.poll(() => requests.length).toBeGreaterThan(0);

  await page.getByTestId("mode-district").click();
  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });

  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByText("Mode: District")).toBeVisible();
  await expect(page.getByText("Variable: Onset Date")).toBeVisible();
  await expect(page.getByText("Seasonal regime: Northern Uni Modal Seasonal")).toBeVisible();
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date");

  expect(
    requests.some(
      (request) =>
        request.theme === "onset" &&
        request.seasonProfile === "northern_single" &&
        request.mode === "seasonal" &&
        request.subseason === null,
    ),
  ).toBeTruthy();

  await expect(page.getByTestId("drawer-close")).toHaveAttribute("aria-label", "Close details panel");
  await page.getByTestId("drawer-close").click();
  await expect(page.getByTestId("dashboard-drawer")).not.toHaveClass(/open/, { timeout: 30_000 });

  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });

  const rainfallRequestCountBeforeSelection = requests.length;
  await page.getByTestId("theme-select").selectOption("rainfall_amount");
  await expect(page.getByTestId("subseason-select")).toBeVisible();
  await expect(page.getByTestId("subseason-select")).toHaveValue("");
  await page.waitForTimeout(300);
  expect(requests).toHaveLength(rainfallRequestCountBeforeSelection);
  await expect(page.getByTestId("product-configuration-needed")).toContainText("Configuration needed");
  await expect(page.getByTestId("dashboard-drawer")).toContainText(
    "Select a sub-season to load the published calendar-based product for this seasonal regime.",
  );
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
  await expect(page.getByTestId("product-error")).toContainText("Published product unavailable");
  await expect(page.getByTestId("product-request-metadata")).toContainText("Requested selection");
  await expect(page.getByTestId("product-request-metadata")).toContainText("Variable: Onset Date");
  await expect(page.getByTestId("product-request-metadata")).toContainText("Seasonal regime: Northern Uni Modal Seasonal");
  await expect(page.getByTestId("product-request-metadata")).toContainText("Product mode: Seasonal");
  await expect(page.getByTestId("product-error")).toContainText(
    "Backend seasonal artifact lookup failed. Active seasonal product is temporarily unavailable.",
  );
  const desktopCopyBox = await page.getByTestId("product-error-copy").boundingBox();
  const desktopActionsBox = await page.getByTestId("product-error-actions").boundingBox();
  expect(desktopCopyBox).not.toBeNull();
  expect(desktopActionsBox).not.toBeNull();
  if (!desktopCopyBox || !desktopActionsBox) {
    throw new Error("Expected product error banner layout boxes to exist.");
  }
  expect(desktopActionsBox.y).toBeGreaterThan(desktopCopyBox.y + desktopCopyBox.height - 1);

  await page.getByTestId("mode-region").click();
  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });

  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("selection-unavailable")).toContainText(
    "Backend seasonal artifact lookup failed. Active seasonal product is temporarily unavailable.",
  );
  await expect(page.getByTestId("selection-unavailable")).toContainText(
    "Published product unavailable",
  );
  await expect(page.getByTestId("dashboard-drawer").getByText("Seasonal regime: Northern Uni Modal Seasonal")).toBeVisible();
  await expect(page.getByTestId("dashboard-drawer").getByText("Product mode: Seasonal")).toBeVisible();

  await page.getByRole("button", { name: "Retry seasonal product" }).click();
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date", { timeout: 30_000 });

  await page.getByTestId("season-profile-select").selectOption("southern_minor");
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date", { timeout: 30_000 });
  await expect(page.getByText("Seasonal regime: Southern Minor Season")).toBeVisible();

  expect(
    requests.some(
      (request) =>
        request.theme === "onset" &&
        request.seasonProfile === "southern_minor" &&
        request.mode === "seasonal" &&
        request.subseason === null,
    ),
  ).toBeTruthy();
});

test("missing seasonal products stay strict, show the exact request, and keep selection state on mobile", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 430, height: 932 });
  let requestCount = 0;
  const requests: Array<{ theme: string; seasonProfile: string; mode: string; subseason: string | null }> = [];

  await page.route("http://127.0.0.1:8000/seasonal-map/active*", async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    const theme = url.searchParams.get("theme") ?? "rainfall_amount";
    const seasonProfile = url.searchParams.get("season_profile") ?? "northern_single";
    const mode = url.searchParams.get("mode") ?? "seasonal";
    const subseason = url.searchParams.get("subseason");
    requests.push({ theme, seasonProfile, mode, subseason });

    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail:
          `No active seasonal map product is available for theme=${theme} season_profile=${seasonProfile} mode=${mode}${subseason ? ` subseason=${subseason}` : ""} under /tmp/seasonal-map.`,
        error_code: "seasonal_map_artifacts_not_available",
      }),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("theme-select").selectOption("rainfall_amount");
  await page.getByTestId("season-profile-select").selectOption("northern_single");
  await expect(page.getByTestId("product-configuration-needed")).toContainText("Configuration needed");
  await expect(page.getByTestId("product-error")).toHaveCount(0);
  await page.getByTestId("subseason-select").selectOption("MJJ");

  await expect(page.getByTestId("product-error")).toContainText(
    "No active seasonal product exists for this selection. That combination has not been generated or published yet.",
  );
  await expect(page.getByTestId("product-request-metadata")).toContainText("Variable: Seasonal Rainfall Total");
  await expect(page.getByTestId("product-request-metadata")).toContainText("Seasonal regime: Northern Uni Modal Seasonal");
  await expect(page.getByTestId("product-request-metadata")).toContainText("Product mode: Calendar");
  await expect(page.getByTestId("product-request-metadata")).toContainText("Sub-season: MJJ");
  const mobileCopyBox = await page.getByTestId("product-error-copy").boundingBox();
  const mobileActionsBox = await page.getByTestId("product-error-actions").boundingBox();
  expect(mobileCopyBox).not.toBeNull();
  expect(mobileActionsBox).not.toBeNull();
  if (!mobileCopyBox || !mobileActionsBox) {
    throw new Error("Expected mobile product error banner layout boxes to exist.");
  }
  expect(mobileActionsBox.y).toBeGreaterThan(mobileCopyBox.y + mobileCopyBox.height - 1);

  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").last().evaluate((node) => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("selection-unavailable")).toContainText(
    "No active seasonal product exists for this selection. That combination has not been generated or published yet.",
  );
  await expect(page.getByTestId("dashboard-drawer").getByText("Product mode: Calendar")).toBeVisible();
  await expect(page.getByTestId("dashboard-drawer").getByText("Sub-season: MJJ")).toBeVisible();

  const selectedTitle = await page.locator(".drawer-header h2").textContent();
  await page.getByRole("button", { name: "Retry seasonal product" }).click();
  await expect.poll(() => requestCount).toBeGreaterThan(1);
  await expect(page.locator(".drawer-header h2")).toHaveText(selectedTitle ?? "");
  await expect(page.getByTestId("theme-select")).toHaveValue("rainfall_amount");
  await expect(page.getByTestId("season-profile-select")).toHaveValue("northern_single");
  await expect(page.getByTestId("subseason-select")).toHaveValue("MJJ");
  const calendarRequests = requests.filter(
    (request) =>
      request.theme === "rainfall_amount" &&
      request.seasonProfile === "northern_single" &&
      request.mode === "calendar" &&
      request.subseason === "MJJ",
  );
  expect(calendarRequests.length).toBeGreaterThanOrEqual(2);
  expect(calendarRequests.at(-1)).toEqual({
    theme: "rainfall_amount",
    seasonProfile: "northern_single",
    mode: "calendar",
    subseason: "MJJ",
  });
});

test("regime-bound products leave out-of-footprint districts neutral while rainfall stays nationwide", async ({ page }) => {
  test.setTimeout(90_000);
  const requests: Array<{ theme: string; seasonProfile: string; mode: string; subseason: string | null }> = [];

  await page.route("http://127.0.0.1:8000/seasonal-map/active*", async (route) => {
    const url = new URL(route.request().url());
    const theme = url.searchParams.get("theme") ?? "onset";
    const seasonProfile = url.searchParams.get("season_profile") ?? "northern_single";
    const mode = url.searchParams.get("mode") ?? "seasonal";
    const subseason = url.searchParams.get("subseason");
    requests.push({ theme, seasonProfile, mode, subseason });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildProduct(theme, seasonProfile, mode, subseason, { restrictToFootprint: true })),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId("mode-district").click();
  await page.getByTestId("theme-select").selectOption("onset");
  await page.getByTestId("season-profile-select").selectOption("northern_single");

  const districtPaths = page.locator(".leaflet-overlay-pane svg path.leaflet-interactive");
  const northDistrictPath = districtPaths.nth(firstNorthernDistrictIndex);
  const southDistrictPath = districtPaths.nth(firstSouthernDistrictIndex);
  const southDistrictHandle = await southDistrictPath.elementHandle();
  if (!southDistrictHandle) {
    throw new Error("Expected stable district handles for hover actions.");
  }

  await expect
    .poll(() => northDistrictPath.evaluate((node) => node.getAttribute("fill")))
    .toBe("#c9962b");
  await expect
    .poll(() => southDistrictPath.evaluate((node) => node.getAttribute("fill")))
    .toBe("#7b877f");
  await expect
    .poll(() => northDistrictPath.evaluate((node) => node.getAttribute("fill-opacity")))
    .toBe("0.64");
  await expect
    .poll(() => southDistrictPath.evaluate((node) => node.getAttribute("fill-opacity")))
    .toBe("0.64");

  await southDistrictHandle.hover();
  await expect(
    page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#7b877f"][fill-opacity="0.64"][stroke-width="2.8"]'),
  ).toHaveCount(1);

  await page.getByTestId("theme-select").hover();
  await expect(
    page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#7b877f"][fill-opacity="0.64"][stroke-width="2.8"]'),
  ).toHaveCount(0);

  await page.getByTestId("season-profile-select").selectOption("southern_major");
  await expect(page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#7b877f"]').first()).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#c9962b"]').first()).toBeVisible();

  await page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#7b877f"]').first().hover();
  await expect(
    page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#7b877f"][fill-opacity="0.64"][stroke-width="2.8"]'),
  ).toHaveCount(1);

  await page.getByTestId("theme-select").selectOption("rainfall_amount");
  const rainfallRequestCountBeforeSelection = requests.length;
  await page.waitForTimeout(300);
  expect(requests).toHaveLength(rainfallRequestCountBeforeSelection);
  await page.getByTestId("subseason-select").selectOption("MAM");
  await expect(page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#1f8a5b"]').first()).toBeVisible();

  await page.getByTestId("theme-select").selectOption("rainy_days");
  const rainyDayRequestCountBeforeSelection = requests.length;
  await page.waitForTimeout(300);
  expect(requests).toHaveLength(rainyDayRequestCountBeforeSelection);
  await page.getByTestId("subseason-select").selectOption("MAM");
  await expect(page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#7b877f"]')).toHaveCount(0);
  await expect(page.locator('.leaflet-overlay-pane svg path.leaflet-interactive[fill="#1f8a5b"]').first()).toBeVisible();
});
