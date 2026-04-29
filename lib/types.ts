import type { Feature, FeatureCollection, Geometry } from "geojson";

export type PointRequest = {
  latitude: number;
  longitude: number;
  location_id?: string;
  horizon_days?: number;
};

export type DailyForecastResponse = {
  date: string;
  rainfall_raw_mm: number;
  rainfall_corrected_mm: number;
};

export type PredictResponse = {
  location_id: string;
  latitude: number;
  longitude: number;
  model_version: string;
  generated_at: string;
  horizon_days: number;
  forecast_source: string | null;
  daily_forecast: DailyForecastResponse[];
};

export type FarmerAdvisoryItem = {
  level: string;
  headline: string;
  recommendation: string;
  reason: string;
  window_rainfall_mm?: number | null;
  rainfall_deficit_mm?: number | null;
  dry_spell_length_days?: number | null;
  avg_temperature_c?: number | null;
  temperature_band?: string | null;
};

export type PointAdvisoryResponse = {
  location_id: string;
  latitude: number;
  longitude: number;
  model_version: string;
  generated_at: string;
  planting_recommendation: FarmerAdvisoryItem;
  dry_spell_alert: FarmerAdvisoryItem;
  irrigation_advice: FarmerAdvisoryItem;
};

export type RawDistrictFeatureProperties = {
  display_name: string;
  region: string;
  api_district: string | null;
  match_resolution: string;
};

export type DistrictFeatureProperties = RawDistrictFeatureProperties & {
  api_district: string;
  location_id: string;
  latitude: number;
  longitude: number;
};

export type RegionFeatureProperties = {
  display_name: string;
  region: string;
  api_district: null;
  level: "region";
  latitude: number;
  longitude: number;
};

export type RawDistrictFeature = Feature<Geometry, RawDistrictFeatureProperties>;
export type DistrictFeature = Feature<Geometry, DistrictFeatureProperties>;
export type DistrictFeatureCollection = FeatureCollection<Geometry, DistrictFeatureProperties>;
export type RawDistrictFeatureCollection = FeatureCollection<Geometry, RawDistrictFeatureProperties>;
export type RegionFeature = Feature<Geometry, RegionFeatureProperties>;
export type RegionFeatureCollection = FeatureCollection<Geometry, RegionFeatureProperties>;

export type DistrictMetadata = {
  name: string;
  region: string;
  apiDistrict: string;
  locationId: string;
  latitude: number;
  longitude: number;
};

export type RegionMetadata = {
  name: string;
  latitude: number;
  longitude: number;
};

export type DashboardMode = "district" | "region";
export type ForecastViewMode = "probabilistic" | "deterministic";
export type ThematicMode = "rainfall" | "planting" | "dry_spell" | "irrigation";
export type ThematicBucket = "low" | "mid" | "high" | "missing";
export type AdvisorySeverityBucket = "low" | "moderate" | "high" | "missing";
export type SelectionState = "idle" | "loading" | "selected" | "error";
export type SeasonProfile = "northern_single" | "southern_major" | "southern_minor";
export type SeasonalMode = "seasonal" | "calendar";
export type CalendarSubseason = "MAM" | "AMJ" | "MJJ" | "JJA" | "JAS" | "SON";
export type DeterministicRasterVariable = "rainfall_daily_mm" | "temperature_c";
export type SeasonalTheme =
  | "onset"
  | "cessation"
  | "early_dry_spell"
  | "late_dry_spell"
  | "rainfall_amount"
  | "rainy_days";

export type LoadableSection<T> = {
  data: T | null;
  error: string | null;
};

export type RegionalForecastComposite = {
  location_id: string;
  latitude: number;
  longitude: number;
  model_version: string;
  generated_at: string;
  horizon_days: number;
  daily_forecast: DailyForecastResponse[];
  district_count: number;
  available_district_count: number;
  note: string;
};

export type RegionalAdvisoryCardComposite = FarmerAdvisoryItem & {
  severity_bucket: AdvisorySeverityBucket;
  available_district_count: number;
};

export type RegionalAdvisoryComposite = {
  location_id: string;
  latitude: number;
  longitude: number;
  model_version: string;
  generated_at: string;
  planting_recommendation: RegionalAdvisoryCardComposite;
  dry_spell_alert: RegionalAdvisoryCardComposite;
  irrigation_advice: RegionalAdvisoryCardComposite;
  district_count: number;
  available_district_count: number;
  note: string;
};

export type DistrictDashboardResult = {
  kind: "district";
  district: DistrictMetadata;
  forecast: LoadableSection<PredictResponse>;
  advisory: LoadableSection<PointAdvisoryResponse>;
};

export type RegionalDashboardResult = {
  kind: "region";
  regionName: string;
  districts: DistrictMetadata[];
  forecast: LoadableSection<RegionalForecastComposite>;
  advisory: LoadableSection<RegionalAdvisoryComposite>;
};

export type DashboardResult = DistrictDashboardResult | RegionalDashboardResult;

export type LegendItem = {
  bucket: ThematicBucket;
  label: string;
  hint: string;
};

export type ThematicOption = {
  value: ThematicMode;
  label: string;
  description: string;
};

export type SeasonalThemeOption = {
  value: SeasonalTheme;
  label: string;
  description: string;
};

export type SeasonalLegendItem = {
  category_code: string;
  label: string;
  hint: string;
  color: string;
  family_label: string;
  display_order: number;
  reverse_probability_scale: boolean;
};

export type SeasonalProbabilityCategory = {
  category_code: string;
  label: string;
  hint: string;
  color: string;
  percentage: number;
};

export type SeasonalProbabilityMetric = {
  theme: SeasonalTheme;
  theme_label: string;
  category_code: string;
  category_label: string;
  dominant_category_code: string;
  dominant_category_label: string;
  dominant_percentage: number;
  display_value: string;
  unit: string | null;
  criteria_note: string;
  interpretation: string;
  color: string;
  category_probabilities: SeasonalProbabilityCategory[];
};

export type SeasonalDeterministicMetric = {
  theme: SeasonalTheme;
  theme_label: string;
  value: number | null;
  display_value: string;
  unit: string | null;
  criteria_note: string;
  interpretation: string;
  legend_label: string;
  color: string;
};

export type SeasonalProbabilityMapAreaItem = {
  location_id: string;
  geography_type: "district" | "region";
  geography_name: string;
  region_name: string;
  coverage_count: number;
  coverage_note: string;
  metric: SeasonalProbabilityMetric;
};

export type SeasonalDeterministicMapAreaItem = {
  location_id: string;
  geography_type: "district" | "region";
  geography_name: string;
  region_name: string;
  coverage_count: number;
  coverage_note: string;
  metric: SeasonalDeterministicMetric;
};

export type SeasonalMapAreaItem = SeasonalProbabilityMapAreaItem | SeasonalDeterministicMapAreaItem;

export type SeasonalMapSelection = {
  geographyType: "district" | "region";
  geographyKey: string;
  geographyName: string;
  regionName: string;
};

export type SeasonalProductRequest = {
  theme: SeasonalTheme;
  seasonProfile: SeasonProfile | null;
  seasonalMetricMode: SeasonalMode;
  calendarSubseason: CalendarSubseason | null;
};

export type SeasonalProbabilityMapProduct = {
  product_id: string;
  theme: SeasonalTheme;
  season_profile: SeasonProfile;
  mode: SeasonalMode;
  subseason: CalendarSubseason | null;
  mode_label: string;
  subseason_label: CalendarSubseason | null;
  generated_at: string;
  forecast_cycle: string;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  refresh_interval_seconds: number;
  freshness_threshold_hours: number;
  district_count: number;
  region_count: number;
  refresh_status: "fresh" | "stale";
  is_stale: boolean;
  legend: SeasonalLegendItem[];
  district_items: SeasonalProbabilityMapAreaItem[];
  region_items: SeasonalProbabilityMapAreaItem[];
};

export type SeasonalDeterministicMapProduct = {
  product_id: string;
  theme: SeasonalTheme;
  season_profile: SeasonProfile;
  mode: SeasonalMode;
  subseason: CalendarSubseason | null;
  mode_label: string;
  subseason_label: CalendarSubseason | null;
  generated_at: string;
  forecast_cycle: string;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  refresh_interval_seconds: number;
  freshness_threshold_hours: number;
  district_count: number;
  region_count: number;
  refresh_status: "fresh" | "stale";
  is_stale: boolean;
  legend: SeasonalLegendItem[];
  district_items: SeasonalDeterministicMapAreaItem[];
  region_items: SeasonalDeterministicMapAreaItem[];
};

export type SeasonalMapProduct = SeasonalProbabilityMapProduct | SeasonalDeterministicMapProduct;

export type ForecastRasterLegendStop = {
  offset: number;
  color: string;
};

export type ForecastRasterBounds = {
  latitude_min: number;
  latitude_max: number;
  longitude_min: number;
  longitude_max: number;
};

export type ForecastRasterGrid = {
  latitudes: number[];
  longitudes: number[];
  values: Array<Array<number | null>>;
};

export type ForecastRasterMetadata = {
  layer_id: string;
  tile_url: string;
  variable: DeterministicRasterVariable;
  variable_label: string;
  unit: string;
  horizon_day: number;
  valid_time: string;
  generated_at: string;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  data_origin: string | null;
  lower_bound: number;
  upper_bound: number;
  available_horizon_days: number[];
  legend_ticks: number[];
  color_ramp: ForecastRasterLegendStop[];
  bounds: ForecastRasterBounds;
  grid: ForecastRasterGrid;
};

export type ForecastRasterSelectionPoint = {
  latitude: number;
  longitude: number;
};

export type ForecastRasterSample = {
  latitude: number;
  longitude: number;
  nearest_latitude: number | null;
  nearest_longitude: number | null;
  value: number | null;
  unit: string;
  variable: DeterministicRasterVariable;
  variable_label: string;
  horizon_day: number;
  valid_time: string;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  data_origin: string | null;
};

export type ForecastArtifactTheme =
  | "onset"
  | "early_dry_spell"
  | "cessation"
  | "late_dry_spell"
  | "rainfall_amount"
  | "rainy_days";

export type ForecastProductBounds = {
  latitude_min: number;
  latitude_max: number;
  longitude_min: number;
  longitude_max: number;
};

export type ForecastProductLegendItem = {
  category_code: string;
  label: string;
  hint: string;
  color: string;
  display_order: number;
};

export type ForecastProductColorRampStop = {
  offset: number;
  color: string;
};

export type ForecastProductSourceArtifactType = "final_netcdf" | "daily_wass2s_derived";

export type ForecastProductGridShape = {
  y: number;
  x: number;
};

export type ForecastProductGridResolution = {
  latitude: number | null;
  longitude: number | null;
};

export type ForecastProbabilityMapProduct = {
  product_id: string;
  theme: ForecastArtifactTheme;
  theme_label: string;
  season_profile: SeasonProfile | null;
  season_label: string | null;
  subseason: CalendarSubseason | null;
  subseason_label: string | null;
  forecast_year: number;
  valid_time: string;
  generated_at: string;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  generation_backend: string;
  source_artifact_type: ForecastProductSourceArtifactType;
  grid_shape: ForecastProductGridShape;
  grid_resolution_degrees: ForecastProductGridResolution;
  is_low_resolution_fallback: boolean;
  refresh_interval_seconds: number;
  freshness_threshold_hours: number;
  tile_url: string;
  preview_url: string | null;
  bounds: ForecastProductBounds;
  legend: ForecastProductLegendItem[];
};

export type ForecastDeterministicMapProduct = {
  product_id: string;
  theme: ForecastArtifactTheme;
  theme_label: string;
  season_profile: SeasonProfile | null;
  season_label: string | null;
  subseason: CalendarSubseason | null;
  subseason_label: string | null;
  forecast_year: number;
  valid_time: string;
  generated_at: string;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  generation_backend: string;
  source_artifact_type: ForecastProductSourceArtifactType;
  grid_shape: ForecastProductGridShape;
  grid_resolution_degrees: ForecastProductGridResolution;
  is_low_resolution_fallback: boolean;
  refresh_interval_seconds: number;
  freshness_threshold_hours: number;
  tile_url: string;
  preview_url: string | null;
  bounds: ForecastProductBounds;
  unit: string;
  lower_bound: number;
  upper_bound: number;
  legend_ticks: number[];
  color_ramp: ForecastProductColorRampStop[];
};

export type ForecastMapProduct = ForecastProbabilityMapProduct | ForecastDeterministicMapProduct;

export type ForecastProbabilitySampleCategory = {
  category_code: string;
  label: string;
  hint: string;
  color: string;
  percentage: number;
};

export type ForecastProbabilitySample = {
  theme: ForecastArtifactTheme;
  theme_label: string;
  season_profile: SeasonProfile | null;
  season_label: string | null;
  subseason: CalendarSubseason | null;
  subseason_label: string | null;
  latitude: number;
  longitude: number;
  nearest_latitude: number;
  nearest_longitude: number;
  dominant_category_code: string;
  dominant_category_label: string;
  dominant_percentage: number;
  display_value: string;
  interpretation: string;
  criteria_note: string;
  category_probabilities: ForecastProbabilitySampleCategory[];
  valid_time: string;
  forecast_year: number;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  generation_backend: string;
};

export type ForecastDeterministicSample = {
  theme: ForecastArtifactTheme;
  theme_label: string;
  season_profile: SeasonProfile | null;
  season_label: string | null;
  subseason: CalendarSubseason | null;
  subseason_label: string | null;
  latitude: number;
  longitude: number;
  nearest_latitude: number;
  nearest_longitude: number;
  value: number;
  display_value: string;
  unit: string;
  interpretation: string;
  criteria_note: string;
  valid_time: string;
  forecast_year: number;
  forecast_source: string;
  forecast_source_label: string;
  source_run_id: string;
  generation_backend: string;
};

export type ForecastPointSelection = {
  latitude: number;
  longitude: number;
};

export type ForecastGeographySelection = {
  mode: DashboardMode;
  geographyKey: string;
  geographyName: string;
  regionName: string;
  latitude: number;
  longitude: number;
};

export type ForecastSample = ForecastProbabilitySample | ForecastDeterministicSample;

export type ForecastThemeOption = {
  theme: ForecastArtifactTheme;
  label: string;
  title: string;
  requires_season: boolean;
  requires_subseason: boolean;
  enabled: boolean;
  reason: string | null;
  seasons: SeasonProfile[];
  subseasons: CalendarSubseason[];
};
