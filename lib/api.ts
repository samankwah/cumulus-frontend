import type { PointAdvisoryResponse, PointRequest, PredictResponse, SeasonalMapProduct } from "@/lib/types";

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
    typeof value.color === "string"
  );
}

function isSeasonalThemeMetric(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.theme === "string" &&
    typeof value.theme_label === "string" &&
    typeof value.category_code === "string" &&
    typeof value.category_label === "string" &&
    typeof value.display_value === "string" &&
    typeof value.criteria_note === "string" &&
    typeof value.interpretation === "string" &&
    typeof value.color === "string"
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

function isSeasonalMapProduct(value: unknown): value is SeasonalMapProduct {
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
  if (!isSeasonalMapProduct(data)) {
    throw new ApiError("Backend returned an unexpected seasonal-map response shape.", 502, "invalid_response");
  }

  return data;
}

export function formatApiError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "seasonal_map_artifacts_not_available") {
      return "No active seasonal product exists for this selection. That combination has not been generated or published yet.";
    }
    if (error.code === "invalid_response") {
      return "Backend seasonal artifact lookup failed because the response shape was invalid.";
    }
    if (error.status >= 500) {
      return `Backend seasonal artifact lookup failed. ${error.message}`;
    }
    return `Seasonal product request is invalid. ${error.message}`;
  }

  if (error instanceof Error) {
    return `Frontend seasonal product request failed. ${error.message}`;
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
