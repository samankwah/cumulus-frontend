import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveBackendUrl } from "@/lib/api";
import { areaId } from "@/lib/area-id";
import { FORECAST_CACHE_TAG } from "@/lib/content/get-content";
import type { SubseasonalModelsResponse, SubseasonalRun, SubseasonalRunsResponse, SubseasonalSeries } from "@/lib/subseasonal";

/* ------------------------------------------------------------------------------------------
 * Data for the district bulletin (server only). Forecasts are fetched from the public backend
 * and kept in Next's data cache under the "forecast" tag: the ingest workflow revalidates it once
 * a new run is live, and it expires after an hour anyway, so a missed signal heals on its own.
 * ------------------------------------------------------------------------------------------ */

/** A fallback for a missed revalidation: never more than an hour behind the backend. */
const FORECAST_REVALIDATE_SECONDS = 3600;
const DISTRICTS_FILE = path.join(process.cwd(), "public", "data", "ghana_district_polygons_simplified.geojson");

export type BulletinDistrict = { id: string; name: string; region: string };

let districtsPromise: Promise<BulletinDistrict[]> | null = null;

/** Every district on the map, sorted by region then name. */
export function listDistricts(): Promise<BulletinDistrict[]> {
  districtsPromise ??= readFile(DISTRICTS_FILE, "utf-8").then((text) => {
    const collection = JSON.parse(text) as { features: { properties?: { display_name?: string; region?: string } }[] };
    const districts = collection.features
      .map((feature) => feature.properties ?? {})
      .filter((properties): properties is { display_name: string; region: string } => Boolean(properties.display_name && properties.region))
      .map((properties) => ({ id: areaId(properties.display_name, properties.region), name: properties.display_name, region: properties.region }));
    return districts.sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  });
  return districtsPromise;
}

export async function findDistrict(id: string) {
  return (await listDistricts()).find((district) => district.id === id) ?? null;
}

async function backend<T>(pathAndQuery: string): Promise<T> {
  const response = await fetch(resolveBackendUrl(pathAndQuery), {
    next: { tags: [FORECAST_CACHE_TAG], revalidate: FORECAST_REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new Error(`Backend ${response.status} for ${pathAndQuery}`);
  }
  return (await response.json()) as T;
}

export type Bulletin = {
  model: { id: string; label: string };
  run: SubseasonalRun;
  series: SubseasonalSeries;
};

/**
 * The official model's run (the active one, or `runId` if it is still kept) and the district's
 * series from it, exactly as the map's drawer shows them. `officialModel` "" means the backend default.
 */
export async function loadBulletin(district: BulletinDistrict, officialModel: string, runId?: string | null): Promise<Bulletin> {
  const models = await backend<SubseasonalModelsResponse>("/subseasonal/models");
  const known = (id: string) => models.models.find((model) => model.id === id && model.available);
  const chosen = (officialModel && known(officialModel)) || known(models.default_model) || models.models.find((model) => model.available);
  if (!chosen) {
    throw new Error("No forecast model has a run available.");
  }
  const runs = await backend<SubseasonalRunsResponse>(`/subseasonal/runs?model=${encodeURIComponent(chosen.id)}`);
  const run = runs.runs.find((item) => item.run_id === runId) ?? runs.runs.find((item) => item.run_id === runs.active_run_id) ?? runs.runs[0];
  if (!run) {
    throw new Error(`No run for ${chosen.id}.`);
  }
  const query = new URLSearchParams({ level: "district", name: district.name, run_id: run.run_id, model: chosen.id });
  const series = await backend<SubseasonalSeries>(`/subseasonal/area?${query}`);
  return { model: { id: chosen.id, label: chosen.label }, run, series };
}
