import type {
  CalendarSubseason,
  ForecastArtifactTheme,
  ForecastDeterministicSample,
  ForecastProbabilitySample,
  ForecastThemeOption,
  ForecastViewMode,
  SeasonProfile,
} from "@/lib/types";

export const FORECAST_VIEW_MODE_OPTIONS: Array<{ value: ForecastViewMode; label: string }> = [
  { value: "probabilistic", label: "Probability" },
  { value: "deterministic", label: "Deterministic" },
];

export const DEFAULT_THEMATIC_OPTIONS: ForecastThemeOption[] = [
  { value: "onset", label: "Onset Date", description: "Seasonal onset timing forecast across Ghana.", enabled: true, requiresSeason: true, requiresSubseason: false },
  {
    value: "early_dry_spell",
    label: "Early-Season Dry Spell",
    description: "Early-season dry-spell duration forecast across Ghana.",
    enabled: true,
    requiresSeason: true,
    requiresSubseason: false,
  },
  {
    value: "cessation",
    label: "Cessation Date",
    description: "Seasonal cessation timing forecast across Ghana.",
    enabled: false,
    requiresSeason: true,
    requiresSubseason: false,
  },
  {
    value: "late_dry_spell",
    label: "Late-Season Dry Spell",
    description: "Late-season dry-spell duration forecast across Ghana.",
    enabled: false,
    requiresSeason: true,
    requiresSubseason: false,
  },
  {
    value: "rainfall_amount",
    label: "Seasonal Rainfall Total",
    description: "Seasonal rainfall amount forecast across Ghana.",
    enabled: false,
    requiresSeason: false,
    requiresSubseason: true,
  },
  {
    value: "rainy_days",
    label: "Number of Rainy Days",
    description: "Seasonal rainy-day count forecast across Ghana.",
    enabled: false,
    requiresSeason: false,
    requiresSubseason: true,
  },
].map((item) => ({
  theme: item.value as ForecastArtifactTheme,
  label: item.label,
  title: item.description,
  requires_season: item.requiresSeason,
  requires_subseason: item.requiresSubseason,
  enabled: item.enabled,
  reason: item.enabled ? null : "artifacts_not_generated",
  seasons: item.requiresSeason ? (["northern_single", "southern_major", "southern_minor"] as SeasonProfile[]) : [],
  subseasons: item.requiresSubseason ? (["MAM", "AMJ", "MJJ", "JJA", "JAS", "SON"] as CalendarSubseason[]) : [],
}));

const SEASON_LABELS: Record<SeasonProfile, string> = {
  northern_single: "Northern Single Season",
  southern_major: "Southern Major Season",
  southern_minor: "Southern Minor Season",
};

export function thematicTitle(theme: ForecastArtifactTheme) {
  return DEFAULT_THEMATIC_OPTIONS.find((option) => option.theme === theme)?.label ?? "Onset Date";
}

export function formatForecastThemeOptionLabel(option: ForecastThemeOption) {
  return option.enabled ? option.label : `${option.label} (Not ready)`;
}

export function forecastThemeAvailabilityReason(option: ForecastThemeOption | null) {
  if (!option || option.enabled) {
    return null;
  }
  if (option.reason === "artifacts_not_generated") {
    return "Generated forecast artifacts for this variable are not available yet.";
  }
  return "This forecast variable is not ready yet.";
}

export function seasonProfileLabel(value: SeasonProfile) {
  return SEASON_LABELS[value] ?? value;
}

export function deterministicScaleLabels(theme: ForecastArtifactTheme) {
  if (theme === "onset") {
    return { low: "Earlier timing", high: "Later timing" };
  }
  if (theme === "cessation") {
    return { low: "Earlier timing", high: "Later timing" };
  }
  if (theme === "early_dry_spell" || theme === "late_dry_spell") {
    return { low: "Shorter duration", high: "Longer duration" };
  }
  if (theme === "rainfall_amount") {
    return { low: "Lower total", high: "Higher total" };
  }
  return { low: "Fewer days", high: "More days" };
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function formatProbabilityPercentage(sample: ForecastProbabilitySample) {
  return `${Math.round(sample.dominant_percentage)}%`;
}

export function formatDeterministicMetricDisplayValue(sample: ForecastDeterministicSample) {
  return sample.display_value;
}

export function formatContinuousValue(value: number, unit: string) {
  const formatter = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${formatter.format(value)} ${unit}`;
}
