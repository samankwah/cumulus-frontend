"use client";

import type { ReactNode } from "react";

import {
  calendarSubseasonOptions,
  SEASON_PROFILE_OPTIONS,
  seasonalThemeDescription,
  supportsCalendarMode,
  THEMATIC_OPTIONS,
} from "@/lib/dashboard";
import type {
  CalendarSubseason,
  DashboardMode,
  SeasonProfile,
  SeasonalLegendItem,
  SeasonalTheme,
} from "@/lib/types";

function DropdownField({
  label,
  help,
  value,
  onChange,
  testId,
  children,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <label className="control-field">
      <span className="control-label">{label}</span>
      {help ? <span className="control-help">{help}</span> : null}
      <span className="control-select-shell">
        <select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
        <span className="control-chevron" aria-hidden="true">
          <svg viewBox="0 0 12 8" focusable="false">
            <path d="M1 1.25 6 6.25 11 1.25" />
          </svg>
        </span>
      </span>
    </label>
  );
}

export function FloatingControls({
  mode,
  setMode,
  thematicMode,
  setThematicMode,
  seasonProfile,
  setSeasonProfile,
  seasonalMetricMode,
  calendarSubseason,
  setCalendarSubseason,
  thematicLegend,
}: {
  mode: DashboardMode;
  setMode: (mode: DashboardMode) => void;
  thematicMode: SeasonalTheme | null;
  setThematicMode: (mode: SeasonalTheme | null) => void;
  seasonProfile: SeasonProfile | null;
  setSeasonProfile: (seasonProfile: SeasonProfile | null) => void;
  seasonalMetricMode: "seasonal" | "calendar";
  calendarSubseason: CalendarSubseason | null;
  setCalendarSubseason: (subseason: CalendarSubseason | null) => void;
  thematicLegend: SeasonalLegendItem[];
}) {
  const activeThemeDescription =
    thematicMode && seasonProfile
      ? seasonalThemeDescription(thematicMode, seasonProfile, seasonalMetricMode, calendarSubseason)
      : "";
  const showSubseasonControl = supportsCalendarMode(thematicMode) && Boolean(seasonProfile);

  return (
    <div className="floating-controls">
      <div className="control-card">
        <div className="brand-block">
          <span className="eyebrow">Operational seasonal outlook</span>
          <h1>Ghana Seasonal Advisory Map</h1>
        </div>

        <div className="control-group">
          <div className="control-field">
            <span className="control-label">Map level</span>
            <span className="control-help">Switch directly between regional boundaries and district polygons.</span>
            <div className="segmented segmented-dual" role="tablist" aria-label="Map level">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "region"}
                className={mode === "region" ? "active" : ""}
                data-testid="mode-region"
                onClick={() => setMode("region")}
              >
                Region
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "district"}
                className={mode === "district" ? "active" : ""}
                data-testid="mode-district"
                onClick={() => setMode("district")}
              >
                District
              </button>
            </div>
          </div>
        </div>

        <div className="control-group">
          <DropdownField
            label="Variables"
            help={activeThemeDescription}
            value={thematicMode ?? ""}
            onChange={(value) => setThematicMode(value ? (value as SeasonalTheme) : null)}
            testId="theme-select"
          >
            <option value="">Select variable</option>
            {THEMATIC_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </DropdownField>
        </div>

        <div className="control-group">
          <DropdownField
            label="Season"
            help=""
            value={seasonProfile ?? ""}
            onChange={(value) => setSeasonProfile(value ? (value as SeasonProfile) : null)}
            testId="season-profile-select"
          >
            <option value="">Select season</option>
            {SEASON_PROFILE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </DropdownField>
        </div>

        {showSubseasonControl ? (
          <div className="control-group">
            <DropdownField
              label="Sub-season"
              help="Available windows depend on the selected seasonal regime."
              value={calendarSubseason ?? ""}
              onChange={(value) => setCalendarSubseason(value ? (value as CalendarSubseason) : null)}
              testId="subseason-select"
            >
              <option value="">Seasonal total</option>
              {calendarSubseasonOptions(seasonProfile).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </DropdownField>
          </div>
        ) : null}

        <div className="control-group">
          <div className="legend-header">
            <span className="control-label">Legend</span>
          </div>
          <div className="legend-grid">
            {thematicLegend.map((item) => (
              <div key={item.category_code} className="legend-row">
                <i className="legend-swatch" style={{ backgroundColor: item.color }} />
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
