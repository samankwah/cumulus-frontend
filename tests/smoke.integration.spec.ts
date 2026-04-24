import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function generateProduct(
  request: APIRequestContext,
  theme: string,
  seasonProfile: string,
  mode: string,
  subseason?: string,
) {
  const params = new URLSearchParams({ theme, season_profile: seasonProfile, mode });
  if (subseason) {
    params.set("subseason", subseason);
  }
  const response = await request.post(
    `http://127.0.0.1:8000/seasonal-map/generate?${params.toString()}`,
  );
  if (!response.ok()) {
    throw new Error(`seasonal-map generate failed (${response.status()}): ${await response.text()}`);
  }
}

test("seasonal map selections work against the real smoke backend", async ({ page, request }) => {
  test.setTimeout(120_000);

  await generateProduct(request, "onset", "northern_single", "seasonal");
  await generateProduct(request, "onset", "southern_minor", "seasonal");
  await generateProduct(request, "rainfall_amount", "southern_minor", "seasonal");
  await generateProduct(request, "rainfall_amount", "southern_major", "calendar", "MAM");

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("map-frame")).toBeVisible();
  await expect(page.getByTestId("theme-select")).toHaveValue("");
  await expect(page.getByTestId("season-profile-select")).toHaveValue("");
  await expect(page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("theme-select").selectOption("onset");
  await page.getByTestId("season-profile-select").selectOption("northern_single");
  await expect(page.getByText("Forecast cycle:")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("mode-district").click();
  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });

  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });
  await expect(page.getByTestId("selection-summary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Seasonal regime: Northern Uni Modal Seasonal")).toBeVisible();

  await page.getByTestId("drawer-close").click();
  await expect(page.getByTestId("dashboard-drawer")).not.toHaveClass(/open/, { timeout: 30_000 });

  await page.locator(".leaflet-overlay-pane svg path.leaflet-interactive").first().click({ force: true });
  await expect(page.getByTestId("dashboard-drawer")).toHaveClass(/open/, { timeout: 30_000 });

  await page.getByTestId("season-profile-select").selectOption("southern_minor");
  await expect(page.getByText("Seasonal regime: Southern Minor Season")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("theme-select").selectOption("rainfall_amount");
  await expect(page.getByTestId("selection-summary")).toContainText("Seasonal Rainfall Total", { timeout: 30_000 });
  await page.getByTestId("season-profile-select").selectOption("southern_major");
  await expect(page.getByTestId("subseason-select")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("subseason-select").selectOption("MAM");
  await expect(page.getByText("Sub-season: MAM")).toBeVisible({ timeout: 30_000 });
});
