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

export type DashboardMode = "district" | "region";
export type ThematicMode = "rainfall" | "planting" | "dry_spell" | "irrigation";
export type ThematicBucket = "low" | "mid" | "high" | "missing";
export type AdvisorySeverityBucket = "low" | "moderate" | "high" | "missing";
export type SelectionState = "idle" | "loading" | "selected" | "error";
export type SeasonProfile = "northern_single" | "southern_major" | "southern_minor";
export type SeasonalMode = "seasonal" | "calendar";
export type CalendarSubseason = "MAM" | "AMJ" | "MJJ" | "JJA" | "JAS" | "SON";
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
};

export type SeasonalThemeMetric = {
  theme: SeasonalTheme;
  theme_label: string;
  category_code: string;
  category_label: string;
  numeric_value: number | null;
  display_value: string;
  unit: string | null;
  criteria_note: string;
  interpretation: string;
  color: string;
};

export type SeasonalMapAreaItem = {
  location_id: string;
  geography_type: "district" | "region";
  geography_name: string;
  region_name: string;
  coverage_count: number;
  coverage_note: string;
  metric: SeasonalThemeMetric;
};

export type SeasonalMapSelection = {
  geographyType: "district" | "region";
  geographyKey: string;
  geographyName: string;
  regionName: string;
};

export type SeasonalMapProduct = {
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
  district_items: SeasonalMapAreaItem[];
  region_items: SeasonalMapAreaItem[];
};
