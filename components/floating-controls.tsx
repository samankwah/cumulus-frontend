"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  forecastThemeAvailabilityReason,
  forecastThemeUnitLabel,
  formatDayOfYearWeekLabel,
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

type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function DropdownField({
  label,
  placeholder,
  selectedLabel,
  disabled,
  value,
  onChange,
  testId,
  displayTestId,
  options,
  loading = false,
}: {
  label: string;
  placeholder: string;
  selectedLabel?: string | null;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  displayTestId?: string;
  options: DropdownOption[];
  loading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const labelId = useId();
  const listboxId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const displayLabel = value ? selectedLabel ?? selectedOption?.label ?? value : placeholder;

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (fieldRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function commitSelection(nextValue: string) {
    const option = options.find((item) => item.value === nextValue);
    if (!option || option.disabled) {
      return;
    }
    onChange(nextValue);
    setIsOpen(false);
    selectRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="control-field control-field-dropdown" ref={fieldRef}>
      <span className="control-label" id={labelId}>
        {label}
      </span>
      <span className={`control-select-shell${isOpen ? " open" : ""}`}>
        <select
          ref={selectRef}
          data-testid={testId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="control-select-button"
          aria-labelledby={labelId}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className={`control-select-value${loading ? " control-select-value-loading" : ""}`} data-testid={displayTestId}>
            {loading ? (
              <>
                <span className="control-skeleton control-skeleton-select" data-testid={`${testId}-skeleton`} aria-hidden="true" />
                <span className="sr-only">{displayLabel}</span>
              </>
            ) : (
              displayLabel
            )}
          </span>
          <span className="control-chevron" aria-hidden="true">
            <svg viewBox="0 0 12 8" focusable="false">
              <path d="M1 1.25 6 6.25 11 1.25" />
            </svg>
          </span>
        </button>
        {isOpen ? (
          <div className="control-select-menu" id={listboxId} role="listbox" aria-labelledby={labelId}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? "selected" : ""}
                disabled={option.disabled}
                onClick={() => commitSelection(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </span>
    </div>
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

function probabilitySampleLookup(sample: ForecastProbabilitySample | ForecastDeterministicSample | null) {
  if (!isProbabilitySample(sample)) {
    return null;
  }
  return new Map(sample.category_probabilities.map((entry) => [entry.category_code, entry.percentage]));
}

const PROBABILITY_AXIS_TICKS = [40, 50, 60, 70, 80];

function probabilityRamp(color: string) {
  return `linear-gradient(90deg, color-mix(in srgb, ${color} 24%, #f7fbf7) 0%, ${color} 56%, color-mix(in srgb, ${color} 72%, #10221d) 100%)`;
}

function probabilityMarkerOffset(percentage: number) {
  const lower = PROBABILITY_AXIS_TICKS[0];
  const upper = PROBABILITY_AXIS_TICKS[PROBABILITY_AXIS_TICKS.length - 1];
  const offset = ((percentage - lower) / (upper - lower)) * 100;
  return Math.max(0, Math.min(100, offset));
}

function deterministicTickLabel(product: ForecastDeterministicMapProduct, value: number) {
  if (product.unit === "day_of_year") {
    return formatDayOfYearWeekLabel(value, product.forecast_year);
  }
  if (product.unit === "days") {
    return String(Math.round(value));
  }
  return String(value);
}

function deterministicUnitLabel(product: ForecastDeterministicMapProduct) {
  if (product.unit === "day_of_year") {
    return null;
  }
  if (product.unit === "days") {
    return "days";
  }
  return product.unit;
}

function subseasonOptionLabel(option: CalendarSubseason, activeThemeOption: ForecastThemeOption | null) {
  if (!activeThemeOption?.requires_subseason) {
    return option;
  }
  const unit = forecastThemeUnitLabel(activeThemeOption.theme);
  return unit ? `${option} (${unit})` : option;
}

function LegendSkeleton() {
  return (
    <div className="legend-skeleton" data-testid="legend-skeleton" aria-hidden="true">
      <span className="control-skeleton legend-skeleton-bar" />
      <span className="control-skeleton legend-skeleton-line" />
    </div>
  );
}

function ProductStatusSkeleton() {
  return (
    <section className="control-status-panel control-status-panel-loading" data-testid="product-status-skeleton" aria-hidden="true">
      <span className="control-skeleton status-skeleton-kicker" />
      <span className="control-skeleton status-skeleton-line" />
    </section>
  );
}

export function FloatingControls({
  dashboardMode,
  setDashboardMode,
  viewMode,
  setViewMode,
  thematicMode,
  setThematicMode,
  themeOptions,
  isThemeOptionsLoading,
  themeOptionsError,
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
  isThemeOptionsLoading: boolean;
  themeOptionsError: string | null;
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
  const deterministicUnit = isDeterministicProduct(product) ? deterministicUnitLabel(product) : null;
  const availabilityReason = forecastThemeAvailabilityReason(activeThemeOption);
  const themeSelectUnavailable = isThemeOptionsLoading || Boolean(themeOptionsError);
  const themeSelectPlaceholder = isThemeOptionsLoading
    ? "Loading variables..."
    : themeOptionsError
      ? "Variable options unavailable"
      : "All Variables";
  const shouldShowSeasonSelect = !activeThemeOption || activeThemeOption.requires_season;
  const shouldShowLoadingSkeleton = isThemeOptionsLoading || (isProductLoading && !productError);
  const probabilityPercentages = probabilitySampleLookup(sample);
  const legendClassName = isDeterministicProduct(product)
    ? "floating-legend floating-legend-deterministic"
    : isProbabilityProduct(product)
      ? "floating-legend floating-legend-probability"
      : "floating-legend";
  const forecastLegend = (
    <>
      {shouldShowLoadingSkeleton ? (
        <LegendSkeleton />
      ) : !product ? (
        <div className="continuous-legend-empty" data-testid="legend-empty">
          Select a variable and season to load a forecast legend.
        </div>
      ) : isProbabilityProduct(product) ? (
        <div className="probability-colorbar" data-testid="probability-legend">
          <div className="probability-scale-grid">
            {product.legend.map((item) => {
              const percentage = probabilityPercentages?.get(item.category_code);
              const boundedPercentage = typeof percentage === "number" ? Math.max(0, Math.min(100, percentage)) : null;
              const markerOffset = boundedPercentage !== null ? probabilityMarkerOffset(boundedPercentage) : null;
              return (
                <div key={item.category_code} className="probability-scale-item" data-testid={`legend-item-${item.category_code}`}>
                  <div
                    className="probability-scale-track"
                    style={{ backgroundImage: probabilityRamp(item.color) }}
                    title={item.hint}
                    aria-label={`${item.label}: ${item.hint}`}
                  >
                    {boundedPercentage !== null ? (
                      <span className="probability-scale-marker" style={{ left: `${markerOffset}%` }} aria-hidden="true" />
                    ) : null}
                  </div>
                  <div className="probability-scale-axis" aria-hidden="true">
                    {PROBABILITY_AXIS_TICKS.map((tick) => (
                      <span key={tick}>{tick}</span>
                    ))}
                  </div>
                  <span className="probability-scale-label">{item.label} (%)</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="deterministic-colorbar" data-testid="deterministic-legend">
          {deterministicUnit ? <span className="deterministic-colorbar-unit">{deterministicUnit}</span> : null}
          <div className="deterministic-colorbar-shell">
            <div
              className="deterministic-colorbar-track"
              style={{
                backgroundImage: deterministicGradient(deterministicStops),
              }}
            />
          </div>
          <div
            className="deterministic-colorbar-ticks"
            style={{ gridTemplateColumns: `repeat(${deterministicTicks.length}, minmax(0, 1fr))` }}
          >
            {deterministicTicks.map((tick) => (
              <span key={tick}>{deterministicTickLabel(product, tick)}</span>
            ))}
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
              placeholder={themeSelectPlaceholder}
              selectedLabel={themeSelectUnavailable || !activeThemeOption ? null : formatForecastThemeOptionLabel(activeThemeOption)}
              value={thematicMode ?? ""}
              onChange={(value) => {
                setThematicMode(value ? (value as ForecastArtifactTheme) : null);
              }}
              testId="theme-select"
              displayTestId="theme-select-display"
              disabled={themeSelectUnavailable}
              loading={isThemeOptionsLoading}
              options={
                themeSelectUnavailable
                  ? []
                  : themeOptions.map((option) => ({
                      value: option.theme,
                      label: formatForecastThemeOptionLabel(option),
                      disabled: !option.enabled,
                    }))
              }
            />
            {isThemeOptionsLoading ? (
              <>
                <DropdownField
                  label="Season"
                  placeholder="Loading seasons..."
                  value=""
                  onChange={() => undefined}
                  testId="season-select"
                  displayTestId="season-select-display"
                  disabled
                  loading
                  options={[]}
                />
                <DropdownField
                  label="Sub-season"
                  placeholder="Loading sub-seasons..."
                  value=""
                  onChange={() => undefined}
                  testId="subseason-select"
                  displayTestId="subseason-select-display"
                  disabled
                  loading
                  options={[]}
                />
              </>
            ) : shouldShowSeasonSelect ? (
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
                options={(activeThemeOption?.seasons ?? []).map((option) => ({
                  value: option,
                  label: seasonProfileLabel(option),
                }))}
              />
            ) : null}
            {activeThemeOption?.requires_subseason ? (
              <DropdownField
                label="Sub-season"
                placeholder="All Sub-seasons"
                selectedLabel={subseason ? subseasonOptionLabel(subseason, activeThemeOption) : null}
                value={subseason ?? ""}
                onChange={(value) => {
                  setSubseason(value ? (value as CalendarSubseason) : null);
                }}
                testId="subseason-select"
                displayTestId="subseason-select-display"
                options={activeThemeOption.subseasons.map((option) => ({
                  value: option,
                  label: subseasonOptionLabel(option, activeThemeOption),
                }))}
              />
            ) : null}
            {themeOptionsError ? (
              <p className="control-inline-note" data-testid="theme-options-status-note">
                {themeOptionsError}
              </p>
            ) : availabilityReason ? (
              <p className="control-inline-note">{availabilityReason}</p>
            ) : product?.is_low_resolution_fallback ? (
              <p className="control-inline-note" data-testid="fallback-status-note">
                Derived low-resolution fallback.
              </p>
            ) : null}
          </div>

          {shouldShowLoadingSkeleton ? (
            <div className="control-group">
              <ProductStatusSkeleton />
            </div>
          ) : null}

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
