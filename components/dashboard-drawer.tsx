"use client";

import { ProductRequestContext } from "@/components/product-request-context";
import {
  formatDateTime,
  seasonProfileLabel,
  thematicTitle,
} from "@/lib/dashboard";
import type {
  CalendarSubseason,
  DashboardMode,
  SeasonProfile,
  SeasonalMapAreaItem,
  SeasonalMapProduct,
  SeasonalMapSelection,
  SeasonalProductRequest,
  SeasonalTheme,
} from "@/lib/types";

function titleForSelection(mode: DashboardMode, selection: SeasonalMapSelection | null) {
  if (!selection) {
    return mode === "region" ? "Select a region" : "Select a district";
  }
  return selection.geographyName;
}

function selectionDescription(selection: SeasonalMapSelection | null, selectedArea: SeasonalMapAreaItem | null) {
  if (selectedArea) {
    return `${selectedArea.region_name}${selectedArea.geography_type === "district" ? " Region" : ""}`;
  }

  if (!selection) {
    return "";
  }

  return `${selection.regionName}${selection.geographyType === "district" ? " Region" : ""}`;
}

export function DashboardDrawer({
  isOpen,
  onClose,
  product,
  selection,
  selectedArea,
  thematicMode,
  seasonProfile,
  seasonalMetricMode,
  calendarSubseason,
  mode,
  productError,
  productConfigurationMessage,
  requestedProduct,
  isProductLoading,
  isRetrying,
  onRetryProduct,
}: {
  isOpen: boolean;
  onClose: () => void;
  product: SeasonalMapProduct | null;
  selection: SeasonalMapSelection | null;
  selectedArea: SeasonalMapAreaItem | null;
  thematicMode: SeasonalTheme | null;
  seasonProfile: SeasonProfile | null;
  seasonalMetricMode: "seasonal" | "calendar";
  calendarSubseason: CalendarSubseason | null;
  mode: DashboardMode;
  productError: string | null;
  productConfigurationMessage: string | null;
  requestedProduct: SeasonalProductRequest | null;
  isProductLoading: boolean;
  isRetrying: boolean;
  onRetryProduct: () => void;
}) {
  const selectedMetric = selectedArea?.metric ?? null;
  const requestContext =
    requestedProduct ??
    (thematicMode && seasonProfile
      ? {
          theme: thematicMode,
          seasonProfile,
          seasonalMetricMode,
          calendarSubseason: seasonalMetricMode === "calendar" ? calendarSubseason : null,
        }
      : null);
  const isConfigurationMissing = Boolean(selection) && (!thematicMode || !seasonProfile || productConfigurationMessage);
  const isSelectionLoading = Boolean(selection) && !isConfigurationMissing && isProductLoading && !selectedArea;
  const hasResolvedData = Boolean(selection && thematicMode && seasonProfile && selectedArea && selectedMetric && product);
  const isUnavailable = Boolean(selection) && !isConfigurationMissing && !isSelectionLoading && !hasResolvedData;
  const unavailableMessage =
    productError ?? "No published seasonal product exists for the current request. That combination has not been generated or published yet.";

  return (
    <aside data-testid="dashboard-drawer" className={isOpen ? "drawer open" : "drawer"}>
      <div className="drawer-header">
        <div>
          <span className="section-kicker">{mode === "region" ? "Regional summary" : "District summary"}</span>
          <h2>{titleForSelection(mode, selection)}</h2>
          {selectionDescription(selection, selectedArea) ? <p>{selectionDescription(selection, selectedArea)}</p> : null}
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

      {!selection ? (
        <div className="drawer-empty">
          <p>No selection yet</p>
          <span>The selected variable, seasonal regime, and published product details will appear here after a map click.</span>
        </div>
      ) : null}

      {selection && isConfigurationMissing ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Selection pending configuration</span>
                <h3>Variables and Season</h3>
              </div>
            </div>
            <article className="empty-card">
              <p>{selection.geographyName} is highlighted.</p>
              <span>
                {!thematicMode || !seasonProfile
                  ? "Choose both a variable and a season to load the published seasonal classification for this geography."
                  : productConfigurationMessage ?? "Choose a sub-season to load the calendar-based seasonal classification for this geography."}
              </span>
            </article>
          </section>
        </div>
      ) : null}

      {selection && isSelectionLoading ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Loading selected geography</span>
                <h3>Fetching seasonal map data</h3>
              </div>
            </div>
            {requestContext ? (
              <ProductRequestContext
                thematicMode={requestContext.theme}
                seasonProfile={requestContext.seasonProfile}
                seasonalMetricMode={requestContext.seasonalMetricMode}
                calendarSubseason={requestContext.calendarSubseason}
                geographyTypeLabel={selection.geographyType === "region" ? "Region" : "District"}
              />
            ) : null}
            <article className="empty-card">
              <p>Loading thematic data</p>
              <span>We are fetching the active Ghana seasonal advisory map for this geography and seasonal regime.</span>
            </article>
          </section>
        </div>
      ) : null}

      {selection && isUnavailable ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Thematic data unavailable</span>
                <h3>Published product not available</h3>
              </div>
            </div>
            {requestContext ? (
              <ProductRequestContext
                thematicMode={requestContext.theme}
                seasonProfile={requestContext.seasonProfile}
                seasonalMetricMode={requestContext.seasonalMetricMode}
                calendarSubseason={requestContext.calendarSubseason}
                geographyTypeLabel={selection.geographyType === "region" ? "Region" : "District"}
              />
            ) : null}
            <article className="empty-card drawer-error" data-testid="selection-unavailable">
              <span className="card-eyebrow">Published product unavailable</span>
              <p>{unavailableMessage}</p>
              <span>{selection.geographyName} remains highlighted so you can retry without losing map context.</span>
            </article>
            <div className="drawer-actions">
              <button type="button" className="ghost-button" onClick={onRetryProduct} disabled={isRetrying}>
                {isRetrying ? "Retrying..." : "Retry seasonal product"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selection && thematicMode && seasonProfile && hasResolvedData && selectedArea && selectedMetric && product ? (
        <div className="drawer-scroll">
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Selected variable</span>
                <h3>{thematicTitle(thematicMode)}</h3>
              </div>
              <p>
                {seasonProfileLabel(seasonProfile)}
                {calendarSubseason ? `, ${calendarSubseason}` : ""}
              </p>
            </div>
            {requestContext ? (
              <ProductRequestContext
                thematicMode={requestContext.theme}
                seasonProfile={requestContext.seasonProfile}
                seasonalMetricMode={requestContext.seasonalMetricMode}
                calendarSubseason={requestContext.calendarSubseason}
                geographyTypeLabel={selection.geographyType === "region" ? "Region" : "District"}
              />
            ) : null}
            <article className="advisory-card" data-testid="selection-summary">
              <div className="card-header">
                <span className="card-eyebrow">{thematicTitle(selectedMetric.theme)}</span>
                <span className="status-dot" style={{ backgroundColor: selectedMetric.color, color: "#fffdf7" }}>
                  {selectedMetric.category_label}
                </span>
              </div>
              <h4>{selectedMetric.display_value}</h4>
            </article>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Freshness</span>
                <h3>Published product metadata</h3>
              </div>
            </div>
            <div className="detail-grid">
              <span className="meta-pill">Last updated: {formatDateTime(product.generated_at)}</span>
              <span className="meta-pill">Forecast cycle: {product.forecast_cycle}</span>
              <span className="meta-pill">Source: {product.forecast_source_label}</span>
              <span className="meta-pill">Run: {product.source_run_id}</span>
              <span className="meta-pill">Status: {product.is_stale ? "Stale" : "Current"}</span>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
