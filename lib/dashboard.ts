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

const FORECAST_THEME_DISPLAY_ORDER: ForecastArtifactTheme[] = [
  "onset",
  "early_dry_spell",
  "late_dry_spell",
  "cessation",
  "rainfall_amount",
  "rainy_days",
];

export const DEFAULT_THEMATIC_OPTIONS: ForecastThemeOption[] = [
  { value: "onset", label: "Onset Date", description: "Seasonal onset timing forecast across Ghana.", enabled: false, requiresSeason: true, requiresSubseason: false },
  {
    value: "early_dry_spell",
    label: "Early-Season Dry Spell",
    description: "Early-season dry-spell duration forecast across Ghana.",
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
    value: "cessation",
    label: "Cessation Date",
    description: "Seasonal cessation timing forecast across Ghana.",
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
  seasons: item.enabled && item.requiresSeason ? (["northern_single", "southern_major", "southern_minor"] as SeasonProfile[]) : [],
  subseasons: item.enabled && item.requiresSubseason ? (["MAM", "AMJ", "MJJ", "JJA", "JAS", "SON"] as CalendarSubseason[]) : [],
}));

const SEASON_LABELS: Record<SeasonProfile, string> = {
  northern_single: "Northern Single Season",
  southern_major: "Southern Major Season",
  southern_minor: "Southern Minor Season",
};

export function thematicTitle(theme: ForecastArtifactTheme) {
  return DEFAULT_THEMATIC_OPTIONS.find((option) => option.theme === theme)?.label ?? "Onset Date";
}

function forecastThemeOptionMenuBaseLabel(option: ForecastThemeOption) {
  if (option.theme === "rainfall_amount") {
    return "Rainfall Total";
  }
  return option.label;
}

export function formatForecastThemeOptionLabel(option: ForecastThemeOption) {
  const unit = option.requires_subseason ? forecastThemeUnitLabel(option.theme) : null;
  const baseLabel = forecastThemeOptionMenuBaseLabel(option);
  const label = unit ? `${baseLabel} (${unit})` : baseLabel;
  return option.enabled ? label : `${label} (Not ready)`;
}

export function sortForecastThemeOptions(options: ForecastThemeOption[]) {
  const order = new Map(FORECAST_THEME_DISPLAY_ORDER.map((theme, index) => [theme, index]));
  return [...options].sort((left, right) => {
    const leftIndex = order.get(left.theme) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.theme) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.label.localeCompare(right.label);
  });
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

export function forecastThemeUnitLabel(theme: ForecastArtifactTheme) {
  if (theme === "rainfall_amount") {
    return "mm";
  }
  if (theme === "rainy_days") {
    return "days";
  }
  return null;
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
  if (sample.unit === "day_of_year") {
    return formatDayOfYearWeekLabel(sample.value, sample.forecast_year);
  }
  return sample.display_value;
}

export function formatDayOfYearWeekLabel(value: number, forecastYear: number) {
  const roundedDay = Math.max(1, Math.round(value));
  const date = new Date(Date.UTC(forecastYear, 0, roundedDay));
  const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const weekOfMonth = Math.min(4, Math.max(1, Math.ceil(date.getUTCDate() / 7)));
  return `${month} week ${weekOfMonth}`;
}

export function formatContinuousValue(value: number, unit: string) {
  const formatter = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${formatter.format(value)} ${unit}`;
}
