"use client";

import { formatDeterministicMetricDisplayValue, formatProbabilityPercentage } from "@/lib/dashboard";
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

function selectedGeographyContext(
  selectedGeography: ForecastGeographySelection | null,
  dashboardMode: DashboardMode,
) {
  const geographyLabel = dashboardMode === "district" ? "district" : "region";

  if (!selectedGeography) {
    return {
      heading: "Select a geography",
      detail: `Click a ${geographyLabel} on the map to prepare a forecast advisory.`,
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

function advisoryAreaLabel(selectedGeography: ForecastGeographySelection | null, dashboardMode: DashboardMode) {
  if (selectedGeography) {
    return `${selectedGeography.geographyName} ${selectionModeLabel(selectedGeography.mode)}`;
  }
  return dashboardMode === "district" ? "Selected district" : "Selected region";
}

function disseminationAudience(selectedGeography: ForecastGeographySelection | null, dashboardMode: DashboardMode) {
  if (selectedGeography) {
    const modeLabel = selectedGeography.mode === "district" ? "district" : "regional";
    return `${selectedGeography.geographyName} ${modeLabel} advisory teams`;
  }
  return dashboardMode === "district" ? "District advisory teams" : "Regional advisory teams";
}

function forecastPeriodLabel(
  sample: ForecastProbabilitySample | ForecastDeterministicSample,
  product: ForecastMapProduct,
  seasonProfile: SeasonProfile | null,
  subseason: CalendarSubseason | null,
) {
  if (subseason) {
    return sample.subseason_label ?? product.subseason_label ?? subseason;
  }
  if (seasonProfile) {
    return sample.season_label ?? product.season_label ?? seasonProfile;
  }
  return "Current seasonal outlook";
}

function advisoryMessage(sample: ForecastProbabilitySample | ForecastDeterministicSample) {
  if (isProbabilitySample(sample)) {
    return `${sample.dominant_category_label} is the leading signal for ${sample.theme_label.toLowerCase()} at ${formatProbabilityPercentage(sample)} confidence.`;
  }
  return `${sample.theme_label} is forecast at ${formatDeterministicMetricDisplayValue(sample)} for the selected area.`;
}

function planningGuidance(sample: ForecastProbabilitySample | ForecastDeterministicSample) {
  if (isProbabilitySample(sample)) {
    return "Use this probability signal in advisory bulletins, extension meetings, radio briefings, and farmer group updates.";
  }
  return "Use this forecast value to frame seasonal planning guidance for extension officers, district desks, and farmer-facing advisories.";
}

function DrawerSummaryStrip({
  sample,
  selectedGeography,
  dashboardMode,
}: {
  sample: ForecastProbabilitySample | ForecastDeterministicSample;
  selectedGeography: ForecastGeographySelection | null;
  dashboardMode: DashboardMode;
}) {
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
        <dt>Advisory area</dt>
        <dd>{advisoryAreaLabel(selectedGeography, dashboardMode)}</dd>
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
  const geographyContext = selectedGeographyContext(selectedGeography, dashboardMode);

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
          <p>No {geographyLabel} selected yet</p>
          <span>{`Choose a ${geographyLabel} to prepare the forecast advisory summary.`}</span>
        </div>
      ) : null}

      {sampleError ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Advisory unavailable</span>
                <h3>Forecast advisory unavailable</h3>
              </div>
            </div>
            <article className="empty-card drawer-error" data-testid="selection-unavailable">
              <p>{sampleError}</p>
              <span>The active map can stay in place while you retry the advisory lookup.</span>
            </article>
            <div className="drawer-actions">
              <button type="button" className="ghost-button" onClick={onRetrySample} disabled={isSampleLoading}>
                {isSampleLoading ? "Retrying..." : "Retry advisory"}
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
                <span className="section-kicker">Loading advisory</span>
                <h3>Preparing advisory summary</h3>
              </div>
            </div>
            <article className="empty-card">
              <p>Loading forecast guidance</p>
              <span>
                {viewMode === "probabilistic"
                  ? "The probability outlook for the chosen area is loading."
                  : "The deterministic forecast value for the chosen area is loading."}
              </span>
            </article>
          </section>
        </div>
      ) : null}

      {sample && isProbabilitySample(sample) && product && isProbabilityProduct(product) ? (
        <div className="drawer-scroll">
          <section className="drawer-section drawer-summary-section">
            <DrawerSummaryStrip sample={sample} selectedGeography={selectedGeography} dashboardMode={dashboardMode} />
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
              <p>{advisoryMessage(sample)}</p>
            </article>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Category breakdown</span>
                <h3>Forecast probabilities</h3>
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
                <span className="section-kicker">Dissemination</span>
                <h3>Advisory guidance</h3>
              </div>
            </div>
            <dl className="metadata-grid" data-testid="drawer-metadata-grid">
              <div className="metadata-row">
                <dt>Audience</dt>
                <dd>{disseminationAudience(selectedGeography, dashboardMode)}</dd>
              </div>
              <div className="metadata-row">
                <dt>Forecast period</dt>
                <dd>{forecastPeriodLabel(sample, product, seasonProfile, subseason)}</dd>
              </div>
              <div className="metadata-row">
                <dt>Primary message</dt>
                <dd>{sample.dominant_category_label}</dd>
              </div>
              <div className="metadata-row metadata-row-wide">
                <dt>Dissemination use</dt>
                <dd>{planningGuidance(sample)}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}

      {sample && !isProbabilitySample(sample) && product && isDeterministicProduct(product) ? (
        <div className="drawer-scroll">
          <section className="drawer-section drawer-summary-section">
            <DrawerSummaryStrip sample={sample} selectedGeography={selectedGeography} dashboardMode={dashboardMode} />
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
              <p>{advisoryMessage(sample)}</p>
            </article>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Dissemination</span>
                <h3>Advisory guidance</h3>
              </div>
            </div>
            <dl className="metadata-grid" data-testid="drawer-metadata-grid">
              <div className="metadata-row">
                <dt>Audience</dt>
                <dd>{disseminationAudience(selectedGeography, dashboardMode)}</dd>
              </div>
              <div className="metadata-row">
                <dt>Forecast period</dt>
                <dd>{forecastPeriodLabel(sample, product, seasonProfile, subseason)}</dd>
              </div>
              <div className="metadata-row">
                <dt>Primary value</dt>
                <dd>{formatDeterministicMetricDisplayValue(sample)}</dd>
              </div>
              <div className="metadata-row metadata-row-wide">
                <dt>Dissemination use</dt>
                <dd>{planningGuidance(sample)}</dd>
              </div>
            </dl>
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
