import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:8000";

async function clickRasterMap(page: Page) {
  const box = await page.locator(".leaflet-container").boundingBox();
  if (!box) {
    throw new Error("Expected raster map bounding box.");
  }
  await page.mouse.click(box.x + box.width * 0.78, box.y + box.height * 0.52);
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

  await Promise.all([
    waitForProbabilityProduct(page, "onset"),
    page.goto("/", { waitUntil: "domcontentloaded" }),
  ]);

  await expect(page.getByTestId("map-frame")).toBeVisible();
  await expect(page.getByTestId("dashboard-mode-region")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("theme-select")).toHaveValue("onset");
  await expect(page.getByTestId("season-select")).toHaveValue("southern_major");
  await expect(page.getByTestId("probability-legend")).toContainText(/Early|Late/);
  expect(legacyRequests).toHaveLength(0);

  await clickRasterMap(page);
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText("Onset Date", { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText(/Early|Near-Normal|Late/, { timeout: 30_000 });
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Region");
  await expect(page.getByTestId("drawer-publication-grid")).toContainText("Cumulus Bridge Product");

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
  await expect(page.getByTestId("selection-summary")).toContainText("Early-Season Dry Spell", { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toContainText("day(s)", { timeout: 30_000 });
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Region");
  await expect(page.getByTestId("drawer-metadata-grid")).toContainText("Cell latitude");
  expect(legacyRequests).toHaveLength(0);
});
