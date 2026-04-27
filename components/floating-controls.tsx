"use client";

import type { ReactNode } from "react";

import {
  forecastThemeAvailabilityReason,
  formatForecastThemeOptionLabel,
  FORECAST_VIEW_MODE_OPTIONS,
  seasonProfileLabel,
} from "@/lib/dashboard";
import type {
  CalendarSubseason,
  DashboardMode,
  ForecastArtifactTheme,
  ForecastDeterministicMapProduct,
  ForecastDeterministicSample,
  ForecastMapProduct,
  ForecastProbabilityMapProduct,
  ForecastProbabilitySample,
  ForecastProductColorRampStop,
  ForecastProductLegendItem,
  ForecastThemeOption,
  ForecastViewMode,
  SeasonProfile,
} from "@/lib/types";

function DropdownField({
  label,
  placeholder,
  selectedLabel,
  disabled,
  value,
  onChange,
  testId,
  displayTestId,
  children,
}: {
  label: string;
  placeholder: string;
  selectedLabel?: string | null;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  displayTestId?: string;
  children: ReactNode;
}) {
  return (
    <label className="control-field">
      <span className="control-label">{label}</span>
      <span className="control-select-shell">
        <select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {children}
        </select>
        <span className="control-select-value" data-testid={displayTestId}>
          {value ? selectedLabel ?? value : placeholder}
        </span>
        <span className="control-chevron" aria-hidden="true">
          <svg viewBox="0 0 12 8" focusable="false">
            <path d="M1 1.25 6 6.25 11 1.25" />
          </svg>
        </span>
      </span>
    </label>
  );
}

function isProbabilityProduct(product: ForecastMapProduct | null): product is ForecastProbabilityMapProduct {
  return Boolean(product && "legend" in product);
}

function isDeterministicProduct(product: ForecastMapProduct | null): product is ForecastDeterministicMapProduct {
  return Boolean(product && "color_ramp" in product);
}

function isProbabilitySample(sample: ForecastProbabilitySample | ForecastDeterministicSample | null): sample is ForecastProbabilitySample {
  return Boolean(sample && "category_probabilities" in sample);
}

function deterministicGradient(stops: ForecastProductColorRampStop[]) {
  if (!stops.length) {
    return "linear-gradient(90deg, #440154 0%, #3b528b 25%, #21918c 50%, #8fd744 75%, #fde725 100%)";
  }
  return `linear-gradient(90deg, ${stops.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(", ")})`;
}

function deterministicUnitLabel(unit: string) {
  if (unit === "day_of_year") {
    return "doy";
  }
  if (unit === "days") {
    return "d";
  }
  return unit;
}

function probabilitySampleLookup(sample: ForecastProbabilitySample | ForecastDeterministicSample | null) {
  if (!isProbabilitySample(sample)) {
    return null;
  }
  return new Map(sample.category_probabilities.map((entry) => [entry.category_code, entry.percentage]));
}

export function FloatingControls({
  dashboardMode,
  setDashboardMode,
  viewMode,
  setViewMode,
  thematicMode,
  setThematicMode,
  themeOptions,
  activeThemeOption,
  seasonProfile,
  setSeasonProfile,
  subseason,
  setSubseason,
  legend,
  product,
  sample,
  productError,
  isProductLoading,
  isRefreshing,
  onRetryProduct,
}: {
  dashboardMode: DashboardMode;
  setDashboardMode: (mode: DashboardMode) => void;
  viewMode: ForecastViewMode;
  setViewMode: (mode: ForecastViewMode) => void;
  thematicMode: ForecastArtifactTheme | null;
  setThematicMode: (theme: ForecastArtifactTheme | null) => void;
  themeOptions: ForecastThemeOption[];
  activeThemeOption: ForecastThemeOption | null;
  seasonProfile: SeasonProfile | null;
  setSeasonProfile: (value: SeasonProfile | null) => void;
  subseason: CalendarSubseason | null;
  setSubseason: (value: CalendarSubseason | null) => void;
  legend: ForecastProductLegendItem[] | ForecastProductColorRampStop[];
  product: ForecastMapProduct | null;
  sample: ForecastProbabilitySample | ForecastDeterministicSample | null;
  productError: string | null;
  isProductLoading: boolean;
  isRefreshing: boolean;
  onRetryProduct: () => void;
}) {
  const deterministicStops = isDeterministicProduct(product) ? product.color_ramp : [];
  const deterministicTicks = isDeterministicProduct(product) ? product.legend_ticks : [];
  const availabilityReason = forecastThemeAvailabilityReason(activeThemeOption);
  const shouldShowSeasonSelect = !activeThemeOption || activeThemeOption.requires_season;
  const probabilityPercentages = probabilitySampleLookup(sample);
  const legendClassName = product ? "floating-legend floating-legend-compact" : "floating-legend";
  const forecastLegend = (
    <>
      {!product ? (
        <div className="continuous-legend-empty" data-testid="legend-empty">
          Select a variable and season to load a forecast legend.
        </div>
      ) : isProbabilityProduct(product) ? (
        <div className="probability-colorbar" data-testid="probability-legend">
          <div className="probability-colorbar-shell">
            <span className="probability-colorbar-unit">%</span>
            <div
              className="probability-colorbar-track"
              style={{ gridTemplateColumns: `repeat(${product.legend.length}, minmax(0, 1fr))` }}
            >
              {product.legend.map((item) => (
                <span
                  key={item.category_code}
                  className="probability-colorbar-segment"
                  style={{ backgroundColor: item.color }}
                  title={item.hint}
                  aria-label={`${item.label}: ${item.hint}`}
                  data-testid={`legend-item-${item.category_code}`}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          {probabilityPercentages ? (
            <div
              className="probability-colorbar-ticks"
              style={{ gridTemplateColumns: `repeat(${product.legend.length}, minmax(0, 1fr))` }}
            >
              {product.legend.map((item) => {
                const percentage = probabilityPercentages.get(item.category_code);
                return <span key={item.category_code}>{typeof percentage === "number" ? `${Math.round(percentage)}%` : ""}</span>;
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="deterministic-colorbar" data-testid="deterministic-legend">
          <div className="deterministic-colorbar-shell">
            <span className="deterministic-colorbar-unit">{deterministicUnitLabel(product.unit)}</span>
            <div
              className="deterministic-colorbar-track"
              style={{
                backgroundImage: deterministicGradient(deterministicStops),
                gridTemplateColumns: `repeat(${deterministicTicks.length}, minmax(0, 1fr))`,
              }}
            >
              {deterministicTicks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="floating-controls">
        <div className="control-card">
          <div className="brand-block">
            <span className="eyebrow">
              {viewMode === "probabilistic"
                ? "Cumulus probability forecast artifact"
                : "Cumulus deterministic forecast artifact"}
            </span>
            <h1>Forecast Map</h1>
          </div>

          <div className="control-group">
            <div className="control-field">
              <span className="control-label">Forecast view</span>
              <div className="segmented segmented-dual" role="tablist" aria-label="Forecast view">
                {FORECAST_VIEW_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === option.value}
                    className={viewMode === option.value ? "active" : ""}
                    data-testid={`view-mode-${option.value}`}
                    onClick={() => setViewMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="control-group">
            <div className="control-field">
              <span className="control-label">Geography</span>
              <div className="segmented segmented-dual" role="tablist" aria-label="Forecast geography">
                <button
                  type="button"
                  role="tab"
                  aria-selected={dashboardMode === "region"}
                  className={dashboardMode === "region" ? "active" : ""}
                  data-testid="dashboard-mode-region"
                  onClick={() => setDashboardMode("region")}
                >
                  Region
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={dashboardMode === "district"}
                  className={dashboardMode === "district" ? "active" : ""}
                  data-testid="dashboard-mode-district"
                  onClick={() => setDashboardMode("district")}
                >
                  District
                </button>
              </div>
            </div>
          </div>

          <div className="control-group control-group-primary">
            <DropdownField
              label="Variable"
              placeholder="All Variables"
              selectedLabel={activeThemeOption?.label}
              value={thematicMode ?? ""}
              onChange={(value) => {
                setThematicMode(value ? (value as ForecastArtifactTheme) : null);
              }}
              testId="theme-select"
              displayTestId="theme-select-display"
            >
              <option value="" disabled>
                All Variables
              </option>
              {themeOptions.map((option) => (
                <option key={option.theme} value={option.theme} disabled={!option.enabled}>
                  {formatForecastThemeOptionLabel(option)}
                </option>
              ))}
            </DropdownField>
            {shouldShowSeasonSelect ? (
              <DropdownField
                label="Season"
                placeholder="All Seasons"
                selectedLabel={seasonProfile ? seasonProfileLabel(seasonProfile) : null}
                value={seasonProfile ?? ""}
                onChange={(value) => {
                  setSeasonProfile(value ? (value as SeasonProfile) : null);
                }}
                testId="season-select"
                displayTestId="season-select-display"
                disabled={!activeThemeOption?.requires_season}
              >
                <option value="" disabled>
                  All Seasons
                </option>
                {(activeThemeOption?.seasons ?? []).map((option) => (
                  <option key={option} value={option}>
                    {seasonProfileLabel(option)}
                  </option>
                ))}
              </DropdownField>
            ) : null}
            {activeThemeOption?.requires_subseason ? (
              <DropdownField
                label="Sub-season"
                placeholder="All Sub-seasons"
                selectedLabel={subseason}
                value={subseason ?? ""}
                onChange={(value) => {
                  setSubseason(value ? (value as CalendarSubseason) : null);
                }}
                testId="subseason-select"
                displayTestId="subseason-select-display"
              >
                <option value="" disabled>
                  All Sub-seasons
                </option>
                {activeThemeOption.subseasons.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </DropdownField>
            ) : null}
            {availabilityReason ? <p className="control-inline-note">{availabilityReason}</p> : null}
          </div>

          {productError ? (
            <div className="control-group">
              <section
                className="control-status-panel control-status-panel-warning"
                data-testid="product-status-note"
                aria-live="polite"
              >
                <span className="control-status-kicker">
                  {viewMode === "probabilistic" ? "Probability product unavailable" : "Deterministic product unavailable"}
                </span>
                <p>{productError}</p>
                <div className="control-status-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={onRetryProduct}
                    disabled={isProductLoading || isRefreshing}
                  >
                    {isProductLoading || isRefreshing ? "Retrying..." : "Retry product"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
      <section className={legendClassName} aria-label="Forecast legend">
        {forecastLegend}
      </section>
    </>
  );
}
