"use client";

import { formatDateTime, formatDeterministicMetricDisplayValue, formatProbabilityPercentage } from "@/lib/dashboard";
import type {
  CalendarSubseason,
  DashboardMode,
  ForecastArtifactTheme,
  ForecastDeterministicMapProduct,
  ForecastDeterministicSample,
  ForecastGeographySelection,
  ForecastMapProduct,
  ForecastProbabilityMapProduct,
  ForecastProbabilitySample,
  ForecastViewMode,
  SeasonProfile,
} from "@/lib/types";

function isProbabilityProduct(product: ForecastMapProduct | null): product is ForecastProbabilityMapProduct {
  return Boolean(product && "legend" in product);
}

function isDeterministicProduct(product: ForecastMapProduct | null): product is ForecastDeterministicMapProduct {
  return Boolean(product && "color_ramp" in product);
}

function isProbabilitySample(sample: ForecastProbabilitySample | ForecastDeterministicSample | null): sample is ForecastProbabilitySample {
  return Boolean(sample && "category_probabilities" in sample);
}

function selectionModeLabel(value: DashboardMode) {
  return value === "district" ? "District" : "Region";
}

function nearestCellLabel(sample: ForecastProbabilitySample | ForecastDeterministicSample) {
  return `${sample.nearest_latitude.toFixed(3)}, ${sample.nearest_longitude.toFixed(3)}`;
}

function selectedGeographyContext(
  selectedGeography: ForecastGeographySelection | null,
  dashboardMode: DashboardMode,
  sample: ForecastProbabilitySample | ForecastDeterministicSample | null,
) {
  const geographyLabel = dashboardMode === "district" ? "district" : "region";

  if (!selectedGeography) {
    if (sample) {
      return {
        heading: "Forecast point",
        detail: `Nearest forecast cell ${nearestCellLabel(sample)}`,
      };
    }

    return {
      heading: "Select a geography",
      detail: `Click a ${geographyLabel} on the map to inspect the nearest forecast grid cell.`,
    };
  }

  if (selectedGeography.mode === "district") {
    return {
      heading: selectedGeography.geographyName,
      detail: `${selectionModeLabel(selectedGeography.mode)} in ${selectedGeography.regionName} Region`,
    };
  }

  return {
    heading: selectedGeography.geographyName,
    detail: selectionModeLabel(selectedGeography.mode),
  };
}

function DrawerSummaryStrip({ sample }: { sample: ForecastProbabilitySample | ForecastDeterministicSample }) {
  const isProbability = isProbabilitySample(sample);

  return (
    <dl className="drawer-summary-strip" data-testid="drawer-summary-strip">
      <div className="drawer-summary-metric">
        <dt>Forecast signal</dt>
        <dd>{isProbability ? sample.dominant_category_label : sample.theme_label}</dd>
      </div>
      <div className="drawer-summary-metric">
        <dt>{isProbability ? "Confidence" : "Value"}</dt>
        <dd>{isProbability ? formatProbabilityPercentage(sample) : formatDeterministicMetricDisplayValue(sample)}</dd>
      </div>
      <div className="drawer-summary-metric">
        <dt>Nearest cell</dt>
        <dd>{nearestCellLabel(sample)}</dd>
      </div>
    </dl>
  );
}

export function DashboardDrawer({
  dashboardMode,
  viewMode,
  isOpen,
  onClose,
  thematicMode,
  seasonProfile,
  subseason,
  selectedGeography,
  product,
  sample,
  productError,
  sampleError,
  isProductLoading,
  isSampleLoading,
  onRetryProduct,
  onRetrySample,
}: {
  dashboardMode: DashboardMode;
  viewMode: ForecastViewMode;
  isOpen: boolean;
  onClose: () => void;
  thematicMode: ForecastArtifactTheme | null;
  seasonProfile: SeasonProfile | null;
  subseason: CalendarSubseason | null;
  selectedGeography: ForecastGeographySelection | null;
  product: ForecastMapProduct | null;
  sample: ForecastProbabilitySample | ForecastDeterministicSample | null;
  productError: string | null;
  sampleError: string | null;
  isProductLoading: boolean;
  isSampleLoading: boolean;
  onRetryProduct: () => void;
  onRetrySample: () => void;
}) {
  const geographyLabel = dashboardMode === "district" ? "district" : "region";
  const geographyContext = selectedGeographyContext(selectedGeography, dashboardMode, sample);

  return (
    <aside data-testid="dashboard-drawer" className={isOpen ? "drawer open" : "drawer"}>
      <div className="drawer-header">
        <div>
          <span className="section-kicker">Selection</span>
          <h2 data-testid="drawer-selected-geography">{geographyContext.heading}</h2>
          <p>{geographyContext.detail}</p>
        </div>
        <button
          type="button"
          className="ghost-button icon-button"
          data-testid="drawer-close"
          onClick={onClose}
          aria-label="Close details panel"
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M5 5 15 15M15 5 5 15" />
          </svg>
        </button>
      </div>

      {!sample && !sampleError ? (
        <div className="drawer-empty">
          <p>No sampled {geographyLabel} yet</p>
          <span>{`The nearest grid-cell summary, criteria note, and source metadata will appear here after you choose a ${geographyLabel}.`}</span>
        </div>
      ) : null}

      {sampleError ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Sample unavailable</span>
                <h3>Point lookup failed</h3>
              </div>
            </div>
            <article className="empty-card drawer-error" data-testid="selection-unavailable">
              <p>{sampleError}</p>
              <span>The active map can stay in place while you retry the point sample.</span>
            </article>
            <div className="drawer-actions">
              <button type="button" className="ghost-button" onClick={onRetrySample} disabled={isSampleLoading}>
                {isSampleLoading ? "Retrying..." : "Retry sample"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isSampleLoading && !sample ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Loading forecast cell</span>
                <h3>Sampling nearest grid point</h3>
              </div>
            </div>
            <article className="empty-card">
              <p>Fetching sampled forecast data</p>
              <span>
                {viewMode === "probabilistic"
                  ? "The probability breakdown for the chosen area is loading."
                  : "The deterministic value for the chosen area is loading."}
              </span>
            </article>
          </section>
        </div>
      ) : null}

      {sample && isProbabilitySample(sample) && product && isProbabilityProduct(product) ? (
        <div className="drawer-scroll">
          <section className="drawer-section drawer-summary-section">
            <DrawerSummaryStrip sample={sample} />
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Probability overview</span>
                <h3>{sample.theme_label}</h3>
              </div>
            </div>
            <article className="advisory-card" data-testid="selection-summary">
              <div className="card-header">
                <span className="card-eyebrow">{sample.theme_label}</span>
                <span className="status-dot">{formatProbabilityPercentage(sample)}</span>
              </div>
              <h4>{sample.dominant_category_label}</h4>
              <p>{sample.interpretation}</p>
            </article>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Category breakdown</span>
                <h3>Nearest cell percentages</h3>
              </div>
            </div>
            <div className="metadata-panel metadata-panel-secondary">
              <dl className="metadata-grid">
                {sample.category_probabilities.map((item) => (
                  <div key={item.category_code} className="metadata-row">
                    <dt>{item.label}</dt>
                    <dd>{Math.round(item.percentage)}%</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Supporting context</span>
                <h3>Product metadata</h3>
              </div>
            </div>
            <dl className="metadata-grid" data-testid="drawer-metadata-grid">
              <div className="metadata-row">
                <dt>Variable</dt>
                <dd>{sample.theme_label}</dd>
              </div>
              {seasonProfile ? (
                <div className="metadata-row">
                  <dt>Season</dt>
                  <dd>{sample.season_label ?? product?.season_label ?? seasonProfile}</dd>
                </div>
              ) : null}
              {subseason ? (
                <div className="metadata-row">
                  <dt>Sub-season</dt>
                  <dd>{sample.subseason_label ?? product?.subseason_label ?? subseason}</dd>
                </div>
              ) : null}
              <div className="metadata-row">
                <dt>Forecast tab</dt>
                <dd>{viewMode === "probabilistic" ? "Probability" : "Deterministic"}</dd>
              </div>
              {selectedGeography ? (
                <>
                  <div className="metadata-row">
                    <dt>Selection mode</dt>
                    <dd>{selectionModeLabel(selectedGeography.mode)}</dd>
                  </div>
                  <div className="metadata-row">
                    <dt>Selected geography</dt>
                    <dd>{selectedGeography.geographyName}</dd>
                  </div>
                </>
              ) : null}
              <div className="metadata-row">
                <dt>Dominant category</dt>
                <dd>{sample.dominant_category_label}</dd>
              </div>
              <div className="metadata-row metadata-row-wide">
                <dt>Criteria</dt>
                <dd>{sample.criteria_note}</dd>
              </div>
              {selectedGeography ? (
                <div className="metadata-row">
                  <dt>Representative point</dt>
                  <dd>{`${selectedGeography.latitude.toFixed(3)}, ${selectedGeography.longitude.toFixed(3)}`}</dd>
                </div>
              ) : null}
              <div className="metadata-row">
                <dt>Cell latitude</dt>
                <dd>{sample.nearest_latitude.toFixed(3)}</dd>
              </div>
              <div className="metadata-row">
                <dt>Cell longitude</dt>
                <dd>{sample.nearest_longitude.toFixed(3)}</dd>
              </div>
            </dl>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Freshness</span>
                <h3>Published product</h3>
              </div>
            </div>
            <div className="metadata-panel metadata-panel-secondary" data-testid="drawer-publication-grid">
              <dl className="metadata-grid">
                <div className="metadata-row">
                  <dt>Last updated</dt>
                  <dd>{formatDateTime(product.generated_at)}</dd>
                </div>
                <div className="metadata-row">
                  <dt>Source</dt>
                  <dd>{product.forecast_source_label}</dd>
                </div>
                <div className="metadata-row">
                  <dt>Run</dt>
                  <dd>{product.source_run_id}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      ) : null}

      {sample && !isProbabilitySample(sample) && product && isDeterministicProduct(product) ? (
        <div className="drawer-scroll">
          <section className="drawer-section drawer-summary-section">
            <DrawerSummaryStrip sample={sample} />
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Deterministic overview</span>
                <h3>{sample.theme_label}</h3>
              </div>
            </div>
            <article className="advisory-card" data-testid="selection-summary">
              <div className="card-header">
                <span className="card-eyebrow">{sample.theme_label}</span>
              </div>
              <h4>{formatDeterministicMetricDisplayValue(sample)}</h4>
              <p>{sample.interpretation}</p>
            </article>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Supporting context</span>
                <h3>Product metadata</h3>
              </div>
            </div>
            <dl className="metadata-grid" data-testid="drawer-metadata-grid">
              <div className="metadata-row">
                <dt>Variable</dt>
                <dd>{sample.theme_label}</dd>
              </div>
              {seasonProfile ? (
                <div className="metadata-row">
                  <dt>Season</dt>
                  <dd>{sample.season_label ?? product?.season_label ?? seasonProfile}</dd>
                </div>
              ) : null}
              {subseason ? (
                <div className="metadata-row">
                  <dt>Sub-season</dt>
                  <dd>{sample.subseason_label ?? product?.subseason_label ?? subseason}</dd>
                </div>
              ) : null}
              <div className="metadata-row">
                <dt>Forecast tab</dt>
                <dd>{viewMode === "probabilistic" ? "Probability" : "Deterministic"}</dd>
              </div>
              {selectedGeography ? (
                <>
                  <div className="metadata-row">
                    <dt>Selection mode</dt>
                    <dd>{selectionModeLabel(selectedGeography.mode)}</dd>
                  </div>
                  <div className="metadata-row">
                    <dt>Selected geography</dt>
                    <dd>{selectedGeography.geographyName}</dd>
                  </div>
                </>
              ) : null}
              <div className="metadata-row">
                <dt>Value</dt>
                <dd>{formatDeterministicMetricDisplayValue(sample)}</dd>
              </div>
              <div className="metadata-row metadata-row-wide">
                <dt>Criteria</dt>
                <dd>{sample.criteria_note}</dd>
              </div>
              {selectedGeography ? (
                <div className="metadata-row">
                  <dt>Representative point</dt>
                  <dd>{`${selectedGeography.latitude.toFixed(3)}, ${selectedGeography.longitude.toFixed(3)}`}</dd>
                </div>
              ) : null}
              <div className="metadata-row">
                <dt>Cell latitude</dt>
                <dd>{sample.nearest_latitude.toFixed(3)}</dd>
              </div>
              <div className="metadata-row">
                <dt>Cell longitude</dt>
                <dd>{sample.nearest_longitude.toFixed(3)}</dd>
              </div>
            </dl>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Freshness</span>
                <h3>Published product</h3>
              </div>
            </div>
            <div className="metadata-panel metadata-panel-secondary" data-testid="drawer-publication-grid">
              <dl className="metadata-grid">
                <div className="metadata-row">
                  <dt>Last updated</dt>
                  <dd>{formatDateTime(product.generated_at)}</dd>
                </div>
                <div className="metadata-row">
                  <dt>Source</dt>
                  <dd>{product.forecast_source_label}</dd>
                </div>
                <div className="metadata-row">
                  <dt>Run</dt>
                  <dd>{product.source_run_id}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      ) : null}

      {productError && !product ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Product unavailable</span>
                <h3>Forecast map not loaded</h3>
              </div>
            </div>
            <article className="empty-card drawer-error">
              <p>{productError}</p>
              <span>The deterministic and probability tabs stay separate; retry will request the current tab again.</span>
            </article>
            <div className="drawer-actions">
              <button type="button" className="ghost-button" onClick={onRetryProduct} disabled={isProductLoading}>
                {isProductLoading ? "Retrying..." : "Retry product"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
