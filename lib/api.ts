import type {
  ForecastDeterministicMapProduct,
  ForecastDeterministicSample,
  ForecastProbabilityMapProduct,
  ForecastProbabilitySample,
  ForecastThemeOption,
  ForecastRasterMetadata,
  ForecastRasterSample,
  PointAdvisoryResponse,
  PointRequest,
  PredictResponse,
  SeasonalDeterministicMapProduct,
  SeasonalProbabilityMapProduct,
} from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

type JsonRecord = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function isDailyForecast(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.date === "string" &&
    typeof value.rainfall_raw_mm === "number" &&
    typeof value.rainfall_corrected_mm === "number"
  );
}

function isAdvisoryItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.level === "string" &&
    typeof value.headline === "string" &&
    typeof value.recommendation === "string" &&
    typeof value.reason === "string"
  );
}

function isPredictResponse(value: unknown): value is PredictResponse {
  return (
    isRecord(value) &&
    typeof value.location_id === "string" &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    typeof value.model_version === "string" &&
    typeof value.generated_at === "string" &&
    typeof value.horizon_days === "number" &&
    Array.isArray(value.daily_forecast) &&
    value.daily_forecast.every(isDailyForecast)
  );
}

function isPointAdvisoryResponse(value: unknown): value is PointAdvisoryResponse {
  return (
    isRecord(value) &&
    typeof value.location_id === "string" &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    typeof value.model_version === "string" &&
    typeof value.generated_at === "string" &&
    isAdvisoryItem(value.planting_recommendation) &&
    isAdvisoryItem(value.dry_spell_alert) &&
    isAdvisoryItem(value.irrigation_advice)
  );
}

function isSeasonalLegendItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.category_code === "string" &&
    typeof value.label === "string" &&
    typeof value.hint === "string" &&
    typeof value.color === "string" &&
    typeof value.family_label === "string" &&
    typeof value.display_order === "number" &&
    typeof value.reverse_probability_scale === "boolean"
  );
}

function isSeasonalProbabilityCategory(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.category_code === "string" &&
    typeof value.label === "string" &&
    typeof value.hint === "string" &&
    typeof value.color === "string" &&
    typeof value.percentage === "number" &&
    Number.isFinite(value.percentage)
  );
}

function isSeasonalThemeMetric(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.theme === "string" &&
    typeof value.theme_label === "string" &&
    typeof value.category_code === "string" &&
    typeof value.category_label === "string" &&
    typeof value.dominant_category_code === "string" &&
    typeof value.dominant_category_label === "string" &&
    typeof value.dominant_percentage === "number" &&
    typeof value.display_value === "string" &&
    typeof value.criteria_note === "string" &&
    typeof value.interpretation === "string" &&
    typeof value.color === "string" &&
    Array.isArray(value.category_probabilities) &&
    value.category_probabilities.length > 0 &&
    value.category_probabilities.every(isSeasonalProbabilityCategory)
  );
}

function isSeasonalAreaItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.location_id === "string" &&
    typeof value.geography_type === "string" &&
    typeof value.geography_name === "string" &&
    typeof value.region_name === "string" &&
    typeof value.coverage_count === "number" &&
    typeof value.coverage_note === "string" &&
    isSeasonalThemeMetric(value.metric)
  );
}

function isSeasonalProbabilityMapProduct(value: unknown): value is SeasonalProbabilityMapProduct {
  return (
    isRecord(value) &&
    typeof value.product_id === "string" &&
    typeof value.theme === "string" &&
    typeof value.season_profile === "string" &&
    typeof value.mode === "string" &&
    (typeof value.subseason === "string" || value.subseason === null) &&
    typeof value.mode_label === "string" &&
    (typeof value.subseason_label === "string" || value.subseason_label === null) &&
    typeof value.generated_at === "string" &&
    typeof value.forecast_cycle === "string" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    typeof value.refresh_interval_seconds === "number" &&
    typeof value.freshness_threshold_hours === "number" &&
    typeof value.district_count === "number" &&
    typeof value.region_count === "number" &&
    typeof value.refresh_status === "string" &&
    typeof value.is_stale === "boolean" &&
    Array.isArray(value.legend) &&
    value.legend.every(isSeasonalLegendItem) &&
    Array.isArray(value.district_items) &&
    value.district_items.every(isSeasonalAreaItem) &&
    Array.isArray(value.region_items) &&
    value.region_items.every(isSeasonalAreaItem)
  );
}

function isSeasonalDeterministicMetric(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.theme === "string" &&
    typeof value.theme_label === "string" &&
    (typeof value.value === "number" || value.value === null) &&
    typeof value.display_value === "string" &&
    typeof value.criteria_note === "string" &&
    typeof value.interpretation === "string" &&
    typeof value.legend_label === "string" &&
    typeof value.color === "string"
  );
}

function isSeasonalDeterministicAreaItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.location_id === "string" &&
    typeof value.geography_type === "string" &&
    typeof value.geography_name === "string" &&
    typeof value.region_name === "string" &&
    typeof value.coverage_count === "number" &&
    typeof value.coverage_note === "string" &&
    isSeasonalDeterministicMetric(value.metric)
  );
}

function isSeasonalDeterministicMapProduct(value: unknown): value is SeasonalDeterministicMapProduct {
  return (
    isRecord(value) &&
    typeof value.product_id === "string" &&
    typeof value.theme === "string" &&
    typeof value.season_profile === "string" &&
    typeof value.mode === "string" &&
    (typeof value.subseason === "string" || value.subseason === null) &&
    typeof value.mode_label === "string" &&
    (typeof value.subseason_label === "string" || value.subseason_label === null) &&
    typeof value.generated_at === "string" &&
    typeof value.forecast_cycle === "string" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    typeof value.refresh_interval_seconds === "number" &&
    typeof value.freshness_threshold_hours === "number" &&
    typeof value.district_count === "number" &&
    typeof value.region_count === "number" &&
    typeof value.refresh_status === "string" &&
    typeof value.is_stale === "boolean" &&
    Array.isArray(value.legend) &&
    value.legend.every(isSeasonalLegendItem) &&
    Array.isArray(value.district_items) &&
    value.district_items.every(isSeasonalDeterministicAreaItem) &&
    Array.isArray(value.region_items) &&
    value.region_items.every(isSeasonalDeterministicAreaItem)
  );
}

function isForecastRasterLegendStop(value: unknown) {
  return isRecord(value) && typeof value.offset === "number" && typeof value.color === "string";
}

function isForecastRasterBounds(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.latitude_min === "number" &&
    typeof value.latitude_max === "number" &&
    typeof value.longitude_min === "number" &&
    typeof value.longitude_max === "number"
  );
}

function isForecastRasterGrid(value: unknown) {
  return (
    isRecord(value) &&
    Array.isArray(value.latitudes) &&
    value.latitudes.every((item) => typeof item === "number") &&
    Array.isArray(value.longitudes) &&
    value.longitudes.every((item) => typeof item === "number") &&
    Array.isArray(value.values) &&
    value.values.every(
      (row) =>
        Array.isArray(row) &&
        row.every((item) => item === null || (typeof item === "number" && Number.isFinite(item))),
    )
  );
}

function isForecastRasterMetadata(value: unknown): value is ForecastRasterMetadata {
  return (
    isRecord(value) &&
    typeof value.layer_id === "string" &&
    typeof value.tile_url === "string" &&
    typeof value.variable === "string" &&
    typeof value.variable_label === "string" &&
    typeof value.unit === "string" &&
    typeof value.horizon_day === "number" &&
    typeof value.valid_time === "string" &&
    typeof value.generated_at === "string" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    (typeof value.data_origin === "string" || value.data_origin === null) &&
    typeof value.lower_bound === "number" &&
    typeof value.upper_bound === "number" &&
    Array.isArray(value.available_horizon_days) &&
    value.available_horizon_days.every((item) => typeof item === "number") &&
    Array.isArray(value.legend_ticks) &&
    value.legend_ticks.every((item) => typeof item === "number") &&
    Array.isArray(value.color_ramp) &&
    value.color_ramp.every(isForecastRasterLegendStop) &&
    isForecastRasterBounds(value.bounds) &&
    isForecastRasterGrid(value.grid)
  );
}

function isForecastRasterSample(value: unknown): value is ForecastRasterSample {
  return (
    isRecord(value) &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    (typeof value.nearest_latitude === "number" || value.nearest_latitude === null) &&
    (typeof value.nearest_longitude === "number" || value.nearest_longitude === null) &&
    (typeof value.value === "number" || value.value === null) &&
    typeof value.unit === "string" &&
    typeof value.variable === "string" &&
    typeof value.variable_label === "string" &&
    typeof value.horizon_day === "number" &&
    typeof value.valid_time === "string" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    (typeof value.data_origin === "string" || value.data_origin === null)
  );
}

function isForecastProductBounds(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.latitude_min === "number" &&
    typeof value.latitude_max === "number" &&
    typeof value.longitude_min === "number" &&
    typeof value.longitude_max === "number"
  );
}

function isForecastProductLegendItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.category_code === "string" &&
    typeof value.label === "string" &&
    typeof value.hint === "string" &&
    typeof value.color === "string" &&
    typeof value.display_order === "number"
  );
}

function isForecastProductColorRampStop(value: unknown) {
  return isRecord(value) && typeof value.offset === "number" && typeof value.color === "string";
}

function isForecastProbabilityMapProduct(value: unknown): value is ForecastProbabilityMapProduct {
  return (
    isRecord(value) &&
    typeof value.product_id === "string" &&
    typeof value.theme === "string" &&
    typeof value.theme_label === "string" &&
    (typeof value.season_profile === "string" || value.season_profile === null) &&
    (typeof value.season_label === "string" || value.season_label === null) &&
    (typeof value.subseason === "string" || value.subseason === null) &&
    (typeof value.subseason_label === "string" || value.subseason_label === null) &&
    typeof value.forecast_year === "number" &&
    typeof value.valid_time === "string" &&
    typeof value.generated_at === "string" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    typeof value.generation_backend === "string" &&
    typeof value.refresh_interval_seconds === "number" &&
    typeof value.freshness_threshold_hours === "number" &&
    typeof value.tile_url === "string" &&
    (typeof value.preview_url === "string" || value.preview_url === null) &&
    isForecastProductBounds(value.bounds) &&
    Array.isArray(value.legend) &&
    value.legend.every(isForecastProductLegendItem)
  );
}

function isForecastDeterministicMapProduct(value: unknown): value is ForecastDeterministicMapProduct {
  return (
    isRecord(value) &&
    typeof value.product_id === "string" &&
    typeof value.theme === "string" &&
    typeof value.theme_label === "string" &&
    (typeof value.season_profile === "string" || value.season_profile === null) &&
    (typeof value.season_label === "string" || value.season_label === null) &&
    (typeof value.subseason === "string" || value.subseason === null) &&
    (typeof value.subseason_label === "string" || value.subseason_label === null) &&
    typeof value.forecast_year === "number" &&
    typeof value.valid_time === "string" &&
    typeof value.generated_at === "string" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    typeof value.generation_backend === "string" &&
    typeof value.refresh_interval_seconds === "number" &&
    typeof value.freshness_threshold_hours === "number" &&
    typeof value.tile_url === "string" &&
    (typeof value.preview_url === "string" || value.preview_url === null) &&
    isForecastProductBounds(value.bounds) &&
    typeof value.unit === "string" &&
    typeof value.lower_bound === "number" &&
    typeof value.upper_bound === "number" &&
    Array.isArray(value.legend_ticks) &&
    value.legend_ticks.every((item) => typeof item === "number") &&
    Array.isArray(value.color_ramp) &&
    value.color_ramp.every(isForecastProductColorRampStop)
  );
}

function isForecastProbabilitySampleCategory(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.category_code === "string" &&
    typeof value.label === "string" &&
    typeof value.hint === "string" &&
    typeof value.color === "string" &&
    typeof value.percentage === "number"
  );
}

function isForecastProbabilitySample(value: unknown): value is ForecastProbabilitySample {
  return (
    isRecord(value) &&
    typeof value.theme === "string" &&
    typeof value.theme_label === "string" &&
    (typeof value.season_profile === "string" || value.season_profile === null) &&
    (typeof value.season_label === "string" || value.season_label === null) &&
    (typeof value.subseason === "string" || value.subseason === null) &&
    (typeof value.subseason_label === "string" || value.subseason_label === null) &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    typeof value.nearest_latitude === "number" &&
    typeof value.nearest_longitude === "number" &&
    typeof value.dominant_category_code === "string" &&
    typeof value.dominant_category_label === "string" &&
    typeof value.dominant_percentage === "number" &&
    typeof value.display_value === "string" &&
    typeof value.interpretation === "string" &&
    typeof value.criteria_note === "string" &&
    Array.isArray(value.category_probabilities) &&
    value.category_probabilities.every(isForecastProbabilitySampleCategory) &&
    typeof value.valid_time === "string" &&
    typeof value.forecast_year === "number" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    typeof value.generation_backend === "string"
  );
}

function isForecastDeterministicSample(value: unknown): value is ForecastDeterministicSample {
  return (
    isRecord(value) &&
    typeof value.theme === "string" &&
    typeof value.theme_label === "string" &&
    (typeof value.season_profile === "string" || value.season_profile === null) &&
    (typeof value.season_label === "string" || value.season_label === null) &&
    (typeof value.subseason === "string" || value.subseason === null) &&
    (typeof value.subseason_label === "string" || value.subseason_label === null) &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    typeof value.nearest_latitude === "number" &&
    typeof value.nearest_longitude === "number" &&
    typeof value.value === "number" &&
    typeof value.display_value === "string" &&
    typeof value.unit === "string" &&
    typeof value.interpretation === "string" &&
    typeof value.criteria_note === "string" &&
    typeof value.valid_time === "string" &&
    typeof value.forecast_year === "number" &&
    typeof value.forecast_source === "string" &&
    typeof value.forecast_source_label === "string" &&
    typeof value.source_run_id === "string" &&
    typeof value.generation_backend === "string"
  );
}

function isForecastThemeOption(value: unknown): value is ForecastThemeOption {
  return (
    isRecord(value) &&
    typeof value.theme === "string" &&
    typeof value.label === "string" &&
    typeof value.title === "string" &&
    typeof value.requires_season === "boolean" &&
    typeof value.requires_subseason === "boolean" &&
    typeof value.enabled === "boolean" &&
    (typeof value.reason === "string" || value.reason === null) &&
    Array.isArray(value.seasons) &&
    value.seasons.every((item) => typeof item === "string") &&
    Array.isArray(value.subseasons) &&
    value.subseasons.every((item) => typeof item === "string")
  );
}

function resolveApiUrl(pathOrUrl: string | null) {
  if (pathOrUrl === null) {
    return null;
  }
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  if (!API_BASE_URL) {
    return pathOrUrl;
  }
  return `${API_BASE_URL}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function normalizeForecastProductUrls<T extends { tile_url: string; preview_url: string | null }>(value: T): T {
  return {
    ...value,
    tile_url: resolveApiUrl(value.tile_url) ?? value.tile_url,
    preview_url: resolveApiUrl(value.preview_url),
  };
}

async function parseError(response: Response) {
  let message = `${response.status} ${response.statusText}`;
  let code: string | null = null;

  try {
    const payload = (await response.json()) as unknown;
    if (isRecord(payload)) {
      if (typeof payload.detail === "string") {
        message = payload.detail;
      }
      if (typeof payload.error_code === "string") {
        code = payload.error_code;
      }
    }
  } catch {
    // Ignore JSON parsing failures and fall back to HTTP status text.
  }

  throw new ApiError(message, response.status, code);
}

async function postJson<T>(
  path: string,
  payload: JsonRecord,
  validate: (value: unknown) => value is T,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    await parseError(response);
  }

  const data = (await response.json()) as unknown;
  if (!validate(data)) {
    throw new ApiError("Backend returned an unexpected response shape.", 502, "invalid_response");
  }

  return data;
}

export function predictPoint(request: PointRequest) {
  return postJson("/predict", request, isPredictResponse);
}

export function getPointAdvisory(request: PointRequest) {
  return postJson("/advisory", request, isPointAdvisoryResponse);
}

export async function getActiveSeasonalMap(
  theme: string,
  seasonProfile: string,
  mode: string,
  subseason?: string | null,
) {
  const params = new URLSearchParams({
    theme,
    season_profile: seasonProfile,
    mode,
  });
  if (subseason) {
    params.set("subseason", subseason);
  }
  const response = await fetch(`${API_BASE_URL}/seasonal-map/active?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    await parseError(response);
  }

  const data = (await response.json()) as unknown;
  if (!isSeasonalProbabilityMapProduct(data)) {
    throw new ApiError("Backend returned an unexpected seasonal-map response shape.", 502, "invalid_response");
  }

  return data;
}

export async function getActiveDeterministicSeasonalMap(
  theme: string,
  seasonProfile: string,
  mode: string,
  subseason?: string | null,
) {
  const params = new URLSearchParams({
    theme,
    season_profile: seasonProfile,
    mode,
  });
  if (subseason) {
    params.set("subseason", subseason);
  }
  const response = await fetch(`${API_BASE_URL}/seasonal-map/deterministic/active?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    await parseError(response);
  }

  const data = (await response.json()) as unknown;
  if (!isSeasonalDeterministicMapProduct(data)) {
    throw new ApiError("Backend returned an unexpected seasonal deterministic response shape.", 502, "invalid_response");
  }

  return data;
}

export async function getForecastRasterMetadata(variable: string, horizonDay: number) {
  const params = new URLSearchParams({
    variable,
    horizon_day: String(horizonDay),
  });
  const response = await fetch(`${API_BASE_URL}/forecast/raster?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    await parseError(response);
  }

  const data = (await response.json()) as unknown;
  if (!isForecastRasterMetadata(data)) {
    throw new ApiError("Backend returned an unexpected raster metadata response shape.", 502, "invalid_response");
  }

  return data;
}

export async function getActiveForecastProbabilityProduct(theme: string, seasonProfile?: string | null, subseason?: string | null) {
  const params = new URLSearchParams({ theme });
  if (seasonProfile) {
    params.set("season_profile", seasonProfile);
  }
  if (subseason) {
    params.set("subseason", subseason);
  }
  const response = await fetch(`${API_BASE_URL}/forecast/probability/active?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    await parseError(response);
  }
  const data = (await response.json()) as unknown;
  if (!isForecastProbabilityMapProduct(data)) {
    throw new ApiError("Backend returned an unexpected probability product response shape.", 502, "invalid_response");
  }
  return normalizeForecastProductUrls(data);
}

export async function getForecastProductOptions() {
  const response = await fetch(`${API_BASE_URL}/forecast/products/options`, {
    cache: "no-store",
  });
  if (!response.ok) {
    await parseError(response);
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data) || !data.every(isForecastThemeOption)) {
    throw new ApiError("Backend returned an unexpected forecast options response shape.", 502, "invalid_response");
  }
  return data;
}

export async function getActiveForecastDeterministicProduct(theme: string, seasonProfile?: string | null, subseason?: string | null) {
  const params = new URLSearchParams({ theme });
  if (seasonProfile) {
    params.set("season_profile", seasonProfile);
  }
  if (subseason) {
    params.set("subseason", subseason);
  }
  const response = await fetch(`${API_BASE_URL}/forecast/deterministic/active?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    await parseError(response);
  }
  const data = (await response.json()) as unknown;
  if (!isForecastDeterministicMapProduct(data)) {
    throw new ApiError("Backend returned an unexpected deterministic product response shape.", 502, "invalid_response");
  }
  return normalizeForecastProductUrls(data);
}

export async function sampleForecastProbability(
  theme: string,
  latitude: number,
  longitude: number,
  seasonProfile?: string | null,
  subseason?: string | null,
) {
  const params = new URLSearchParams({
    theme,
    latitude: String(latitude),
    longitude: String(longitude),
  });
  if (seasonProfile) {
    params.set("season_profile", seasonProfile);
  }
  if (subseason) {
    params.set("subseason", subseason);
  }
  const response = await fetch(`${API_BASE_URL}/forecast/probability/sample?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    await parseError(response);
  }
  const data = (await response.json()) as unknown;
  if (!isForecastProbabilitySample(data)) {
    throw new ApiError("Backend returned an unexpected probability sample response shape.", 502, "invalid_response");
  }
  return data;
}

export async function sampleForecastDeterministic(
  theme: string,
  latitude: number,
  longitude: number,
  seasonProfile?: string | null,
  subseason?: string | null,
) {
  const params = new URLSearchParams({
    theme,
    latitude: String(latitude),
    longitude: String(longitude),
  });
  if (seasonProfile) {
    params.set("season_profile", seasonProfile);
  }
  if (subseason) {
    params.set("subseason", subseason);
  }
  const response = await fetch(`${API_BASE_URL}/forecast/deterministic/sample?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    await parseError(response);
  }
  const data = (await response.json()) as unknown;
  if (!isForecastDeterministicSample(data)) {
    throw new ApiError("Backend returned an unexpected deterministic sample response shape.", 502, "invalid_response");
  }
  return data;
}

export async function sampleForecastRaster(latitude: number, longitude: number, variable: string, horizonDay: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    variable,
    horizon_day: String(horizonDay),
  });
  const response = await fetch(`${API_BASE_URL}/forecast/raster/sample?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    await parseError(response);
  }

  const data = (await response.json()) as unknown;
  if (!isForecastRasterSample(data)) {
    throw new ApiError("Backend returned an unexpected raster sample response shape.", 502, "invalid_response");
  }

  return data;
}

export function formatApiError(error: unknown, mode: "probability" | "deterministic" = "probability") {
  if (error instanceof ApiError) {
    if (error.code === "forecast_product_artifacts_not_available") {
      return mode === "deterministic"
        ? "No active deterministic forecast product exists for this variable yet."
        : "No active probability forecast product exists for this variable yet.";
    }
    if (error.code === "invalid_forecast_product_theme") {
      return mode === "deterministic"
        ? `Deterministic forecast variable is not wired yet. ${error.message}`
        : `Probability forecast variable is not wired yet. ${error.message}`;
    }
    if (error.code === "invalid_forecast_product_selection") {
      return mode === "deterministic"
        ? `Deterministic forecast selection is invalid. ${error.message}`
        : `Probability forecast selection is invalid. ${error.message}`;
    }
    if (error.code === "seasonal_map_artifacts_not_available") {
      return mode === "deterministic"
        ? "No active deterministic seasonal product exists for this selection. That combination has not been generated or published yet."
        : "No active seasonal product exists for this selection. That combination has not been generated or published yet.";
    }
    if (error.code === "seasonal_probability_product_incomplete") {
      return "Published probability product is unavailable or incomplete. Category percentages are missing for this selection.";
    }
    if (error.code === "invalid_response") {
      return mode === "deterministic"
        ? "Published deterministic product is unavailable or incomplete. Expected deterministic forecast values were missing from the response."
        : "Published probability product is unavailable or incomplete. Expected forecast category percentages were missing from the response.";
    }
    if (error.status >= 500) {
      return mode === "deterministic"
        ? `Backend deterministic forecast artifact lookup failed. ${error.message}`
        : `Backend probability forecast artifact lookup failed. ${error.message}`;
    }
    return mode === "deterministic"
      ? `Deterministic forecast product request is invalid. ${error.message}`
      : `Probability forecast product request is invalid. ${error.message}`;
  }

  if (error instanceof Error) {
    return mode === "deterministic"
      ? `Frontend deterministic forecast product request failed. ${error.message}`
      : `Frontend probability forecast product request failed. ${error.message}`;
  }

  return "Unexpected frontend error.";
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getApiErrorCode(error: unknown) {
  if (error instanceof ApiError) {
    return error.code;
  }
  return null;
}
