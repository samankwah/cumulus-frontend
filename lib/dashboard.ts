import type { CalendarSubseason, SeasonProfile, SeasonalMode, SeasonalTheme, SeasonalThemeOption } from "@/lib/types";

export const SEASON_PROFILE_OPTIONS: Array<{ value: SeasonProfile; label: string }> = [
  { value: "northern_single", label: "Northern Uni Modal Seasonal" },
  { value: "southern_major", label: "Southern Major Season" },
  { value: "southern_minor", label: "Southern Minor Season" },
];

export const SEASONAL_MODE_OPTIONS: Array<{ value: SeasonalMode; label: string }> = [
  { value: "seasonal", label: "Seasonal" },
  { value: "calendar", label: "Calendar" },
];

export const CALENDAR_SUBSEASON_OPTIONS: Record<SeasonProfile, CalendarSubseason[]> = {
  northern_single: ["MJJ", "JJA", "JAS"],
  southern_major: ["MAM", "AMJ", "MJJ"],
  southern_minor: ["SON"],
};

export const THEMATIC_OPTIONS: SeasonalThemeOption[] = [
  { value: "onset", label: "Onset Date", description: "" },
  { value: "cessation", label: "Cessation Date", description: "" },
  { value: "early_dry_spell", label: "Early-Season Dry Spell", description: "" },
  { value: "late_dry_spell", label: "Late-Season Dry Spell", description: "" },
  { value: "rainfall_amount", label: "Seasonal Rainfall Total", description: "" },
  { value: "rainy_days", label: "Number of Rainy Days", description: "" },
];

const DISPLAY_COPY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bNorthern Single Season\b/g, "Northern Uni Modal Seasonal"],
  [/\bSingle Season\b/g, "Northern Uni Modal Seasonal"],
  [/\bEarly Dry Spell\b/g, "Early-Season Dry Spell"],
  [/\bLate Dry Spell\b/g, "Late-Season Dry Spell"],
  [/\bRainfall Amount\b/g, "Seasonal Rainfall Total"],
  [/\bRainy Days\b/g, "Number of Rainy Days"],
  [/\bOnset\b/g, "Onset Date"],
  [/\bCessation\b/g, "Cessation Date"],
];

export function thematicTitle(theme: SeasonalTheme) {
  return THEMATIC_OPTIONS.find((option) => option.value === theme)?.label ?? "Onset";
}

export function seasonProfileLabel(profile: SeasonProfile) {
  return SEASON_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ?? "Northern Uni Modal Seasonal";
}

export function supportsCalendarMode(theme: SeasonalTheme | null) {
  return theme === "rainfall_amount" || theme === "rainy_days";
}

export function requiresCalendarSubseason(theme: SeasonalTheme | null) {
  return supportsCalendarMode(theme);
}

export function usesRegimeBoundFootprint(theme: SeasonalTheme) {
  return theme === "onset" || theme === "cessation" || theme === "early_dry_spell" || theme === "late_dry_spell";
}

export function seasonalModeLabel(mode: SeasonalMode) {
  return SEASONAL_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Seasonal";
}

export function calendarSubseasonOptions(profile: SeasonProfile | null) {
  if (!profile) {
    return [];
  }
  return CALENDAR_SUBSEASON_OPTIONS[profile];
}

export function normalizeSeasonalCopy(text: string) {
  return DISPLAY_COPY_REPLACEMENTS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text,
  );
}

export function seasonalThemeDescription(
  theme: SeasonalTheme,
  profile: SeasonProfile,
  mode: SeasonalMode = "seasonal",
  subseason: CalendarSubseason | null = null,
) {
  const profileLabel = seasonProfileLabel(profile);
  if (theme === "onset") {
    if (profile === "southern_minor") {
      return `${profileLabel} onset date monitoring starts from 15 Aug using 20 mm in 3 consecutive days, with no dry spell longer than 10 days in the next 30 days. Map shading appears only inside the matching agro-ecological footprint.`;
    }
    const startDate = profile === "northern_single" ? "15 Mar" : "01 Feb";
    return `${profileLabel} onset date monitoring starts from ${startDate} using at least 20 mm in up to 3 days, with no dry spell longer than 10 days in the next 30 days. Map shading appears only inside the matching agro-ecological footprint.`;
  }
  if (theme === "cessation") {
    const startDate = profile === "southern_major" ? "01 Jul" : "01 Oct";
    return `${profileLabel} cessation date monitoring starts from ${startDate} using soil water balance depletion from 70 mm with 4 mm/day evapotranspiration. Map shading appears only inside the matching agro-ecological footprint.`;
  }
  if (theme === "early_dry_spell") {
    return `${profileLabel} early-season dry spell is the longest dry run from onset date to day 50. Map shading appears only inside the matching agro-ecological footprint.`;
  }
  if (theme === "late_dry_spell") {
    return `${profileLabel} late-season dry spell is the longest dry run from day 51 to cessation date. Map shading appears only inside the matching agro-ecological footprint.`;
  }
  if (theme === "rainfall_amount") {
    if (!subseason) {
      return `${profileLabel} rainfall totals are published only for calendar reporting windows. Select a sub-season to load this map.`;
    }
    if (mode === "calendar") {
      return `${profileLabel} calendar rainfall total is accumulated only within the ${subseason} reporting window. Map shading remains nationwide even when this seasonal profile is selected.`;
    }
    return `${profileLabel} seasonal rainfall total is accumulated from detected onset date to detected cessation date under the selected Ghana seasonal regime. Map shading remains nationwide even when this seasonal profile is selected.`;
  }
  if (!subseason) {
    return `${profileLabel} rainy-day totals are published only for calendar reporting windows. Select a sub-season to load this map.`;
  }
  if (mode === "calendar" && subseason) {
    return `${profileLabel} rainy days are counted only within the ${subseason} reporting window. Map shading remains nationwide even when this seasonal profile is selected.`;
  }
  return `${profileLabel} number of rainy days is counted from detected onset date to detected cessation date under the selected Ghana seasonal regime. Map shading remains nationwide even when this seasonal profile is selected.`;
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

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
