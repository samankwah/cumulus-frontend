"use client";

import { seasonalModeLabel, seasonProfileLabel, thematicTitle } from "@/lib/dashboard";
import type { CalendarSubseason, SeasonProfile, SeasonalMode, SeasonalTheme } from "@/lib/types";

export function ProductRequestContext({
  thematicMode,
  seasonProfile,
  seasonalMetricMode,
  calendarSubseason,
  geographyTypeLabel,
}: {
  thematicMode: SeasonalTheme;
  seasonProfile: SeasonProfile;
  seasonalMetricMode: SeasonalMode;
  calendarSubseason: CalendarSubseason | null;
  geographyTypeLabel?: string;
}) {
  return (
    <div className="meta-row product-request-meta">
      {geographyTypeLabel ? <span className="meta-pill">Mode: {geographyTypeLabel}</span> : null}
      <span className="meta-pill">Variable: {thematicTitle(thematicMode)}</span>
      <span className="meta-pill">Seasonal regime: {seasonProfileLabel(seasonProfile)}</span>
      <span className="meta-pill">Product mode: {seasonalModeLabel(seasonalMetricMode)}</span>
      {calendarSubseason ? <span className="meta-pill">Sub-season: {calendarSubseason}</span> : null}
    </div>
  );
}
