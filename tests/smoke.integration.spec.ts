import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:8000";

async function clickRasterMap(page: Page) {
  const geographyLayer = page.locator('[class*="forecast-feature"] .leaflet-interactive').first();
  await geographyLayer.waitFor({ state: "attached", timeout: 30_000 });
  await geographyLayer.click({ force: true });
}

async function hoverRasterMap(page: Page) {
  const geographyLayer = page.locator('[class*="forecast-feature"] .leaflet-interactive').first();
  await geographyLayer.waitFor({ state: "attached", timeout: 30_000 });
  await geographyLayer.hover({ force: true });
  const tooltip = page.locator(".leaflet-tooltip").last();
  await expect(tooltip).toBeVisible({ timeout: 30_000 });
  return tooltip;
}

async function refreshProducts(request: APIRequestContext) {
  const response = await request.post(`${API_BASE_URL}/forecast/products/refresh`);
  if (!response.ok()) {
    throw new Error(`forecast product refresh failed (${response.status()}): ${await response.text()}`);
  }
}

async function waitForProbabilityProduct(page: Page, theme: string) {
  await page.waitForResponse((response) => {
    if (!response.ok() || response.request().method() !== "GET") {
      return false;
    }
    const url = new URL(response.url());
    return (
      url.pathname === "/forecast/probability/active" &&
      url.searchParams.get("theme") === theme &&
      url.searchParams.get("season_profile") === "southern_major"
    );
  });
}

async function waitForDeterministicProduct(page: Page, theme: string) {
  await page.waitForResponse((response) => {
    if (!response.ok() || response.request().method() !== "GET") {
      return false;
    }
    const url = new URL(response.url());
    return (
      url.pathname === "/forecast/deterministic/active" &&
      url.searchParams.get("theme") === theme &&
      url.searchParams.get("season_profile") === "southern_major"
    );
  });
}

test("probability and deterministic tabs work against the real forecast artifact backend", async ({ page, request }) => {
  test.setTimeout(360_000);
  const legacyRequests: string[] = [];

  await refreshProducts(request);

  page.on("request", (requestEvent) => {
    const url = new URL(requestEvent.url());
    if (url.pathname.startsWith("/seasonal-map") || url.pathname.startsWith("/forecast/raster")) {
      legacyRequests.push(requestEvent.url());
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("map-frame")).toBeVisible();
  await expect(page.getByTestId("dashboard-mode-region")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("theme-select")).toHaveValue("");
  await expect(page.getByTestId("season-select")).toHaveValue("");

  await page.getByTestId("theme-select").selectOption("onset");
  await Promise.all([
    waitForProbabilityProduct(page, "onset"),
    page.getByTestId("season-select").selectOption("southern_major"),
  ]);

  await expect(page.getByTestId("theme-select")).toHaveValue("onset");
  await expect(page.getByTestId("season-select")).toHaveValue("southern_major");
  await expect(page.getByTestId("probability-legend")).toContainText(/Early|Late/);
  expect(legacyRequests).toHaveLength(0);

  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-selected-geography")).not.toHaveText(/Select a geography|Forecast point/);
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Forecast signal", { timeout: 30_000 });
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Confidence", { timeout: 30_000 });
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Nearest cell", { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date", { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText(/Early|Near-Normal|Late/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Region");
  await expect(page.getByTestId("drawer-publication-grid")).toContainText("Cumulus Bridge Product");
  const probabilityTooltip = await hoverRasterMap(page);
  await expect(probabilityTooltip).not.toContainText("Sample district representative point");
  await expect(probabilityTooltip).not.toContainText("Sample region representative point");

  await Promise.all([
    waitForDeterministicProduct(page, "early_dry_spell"),
    page.getByTestId("view-mode-deterministic").click().then(async () => {
      await page.getByTestId("theme-select").selectOption("early_dry_spell");
      await page.getByTestId("season-select").selectOption("southern_major");
      await page.getByTestId("dashboard-mode-region").click();
    }),
  ]);

  await expect(page.getByTestId("deterministic-legend")).toBeVisible();
  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-selected-geography")).not.toHaveText(/Select a geography|Forecast point/);
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Forecast signal", { timeout: 30_000 });
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Value", { timeout: 30_000 });
  await expect(page.getByTestId("drawer-summary-strip")).toContainText("Nearest cell", { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText("Early-Season Dry Spell", { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText("day(s)", { timeout: 30_000 });
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Region");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Cell latitude");
  const deterministicTooltip = await hoverRasterMap(page);
  await expect(deterministicTooltip).not.toContainText("Sample district representative point");
  await expect(deterministicTooltip).not.toContainText("Sample region representative point");
  expect(legacyRequests).toHaveLength(0);
});
