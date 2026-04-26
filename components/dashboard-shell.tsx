"use client";

import dynamic from "next/dynamic";

import { DashboardDrawer } from "@/components/dashboard-drawer";
import { FloatingControls } from "@/components/floating-controls";
import { ProductRequestContext } from "@/components/product-request-context";
import { useCumulusDashboard } from "@/hooks/use-cumulus-dashboard";

const GhanaMap = dynamic(
  () => import("@/components/ghana-map").then((module) => module.GhanaMap),
  {
    ssr: false,
  },
);

export function DashboardShell() {
  const {
    mode,
    setMode,
    thematicMode,
    setThematicMode,
    seasonProfile,
    setSeasonProfile,
    seasonalMetricMode,
    calendarSubseason,
    setCalendarSubseason,
    districtFeatures,
    regionFeatures,
    isBootstrapping,
    mapError,
    product,
    productError,
    productConfigurationMessage,
    requestedProduct,
    isProductLoading,
    isRefreshing,
    selectedGeography,
    isDrawerOpen,
    selectedDistrictId,
    selectedRegionName,
    selectedArea,
    districtItemsById,
    regionItemsByName,
    thematicLegend,
    retryProduct,
    selectDistrict,
    selectRegion,
    closeDrawer,
  } = useCumulusDashboard();

  return (
    <main className="spa-shell">
      <section className="atlas-stage">
        <div className="map-frame" data-testid="map-frame">
          {districtFeatures && regionFeatures ? (
            <GhanaMap
              mode={mode}
              thematicMode={thematicMode}
              districtFeatures={districtFeatures}
              regionFeatures={regionFeatures}
              districtItemsById={districtItemsById}
              regionItemsByName={regionItemsByName}
              seasonalMetricMode={seasonalMetricMode}
              calendarSubseason={calendarSubseason}
              selectedDistrictId={selectedDistrictId}
              selectedRegionName={selectedRegionName}
              isDrawerOpen={isDrawerOpen}
              onSelectDistrict={selectDistrict}
              onSelectRegion={selectRegion}
            />
          ) : (
            <div className="map-loading" data-testid="map-loading">
              {isBootstrapping ? "Loading Ghana map assets..." : mapError ?? "Map unavailable."}
            </div>
          )}

          <div className="chrome-layer">
            <FloatingControls
              mode={mode}
              setMode={setMode}
              thematicMode={thematicMode}
              setThematicMode={setThematicMode}
              seasonProfile={seasonProfile}
              setSeasonProfile={setSeasonProfile}
              seasonalMetricMode={seasonalMetricMode}
              calendarSubseason={calendarSubseason}
              setCalendarSubseason={setCalendarSubseason}
              thematicLegend={thematicLegend}
            />

            {mapError ? <div className="floating-banner floating-banner-error" data-testid="map-error">{mapError}</div> : null}
            {productConfigurationMessage && thematicMode && seasonProfile ? (
              <div className="floating-banner floating-banner-warning" data-testid="product-configuration-needed">
                <div className="floating-banner-body">
                  <div className="floating-banner-copy">
                    <span className="floating-banner-kicker">Configuration needed</span>
                    <div className="floating-banner-request" data-testid="product-request-metadata">
                      <span className="floating-banner-request-label">Requested selection</span>
                      <ProductRequestContext
                        thematicMode={thematicMode}
                        seasonProfile={seasonProfile}
                        seasonalMetricMode={seasonalMetricMode}
                        calendarSubseason={calendarSubseason}
                      />
                    </div>
                    <p className="floating-banner-message">{productConfigurationMessage}</p>
                  </div>
                </div>
              </div>
            ) : null}
            {productError && requestedProduct ? (
              <div className="floating-banner floating-banner-warning" data-testid="product-error">
                <div className="floating-banner-body">
                  <div className="floating-banner-copy" data-testid="product-error-copy">
                    <span className="floating-banner-kicker">Published product unavailable</span>
                    <div className="floating-banner-request" data-testid="product-request-metadata">
                      <span className="floating-banner-request-label">Requested selection</span>
                      <ProductRequestContext
                        thematicMode={requestedProduct.theme}
                        seasonProfile={requestedProduct.seasonProfile}
                        seasonalMetricMode={requestedProduct.seasonalMetricMode}
                        calendarSubseason={requestedProduct.calendarSubseason}
                      />
                    </div>
                    <p className="floating-banner-message">{productError}</p>
                  </div>
                  <div className="floating-banner-actions" data-testid="product-error-actions">
                    <button type="button" className="banner-button" onClick={retryProduct} disabled={isProductLoading || isRefreshing}>
                      {isProductLoading || isRefreshing ? "Retrying..." : "Retry product"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DashboardDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          product={product}
          selection={selectedGeography}
          selectedArea={selectedArea}
          thematicMode={thematicMode}
          seasonProfile={seasonProfile}
          seasonalMetricMode={seasonalMetricMode}
          calendarSubseason={calendarSubseason}
          mode={mode}
          productError={productError}
          productConfigurationMessage={productConfigurationMessage}
          requestedProduct={requestedProduct}
          isProductLoading={isProductLoading}
          isRetrying={isProductLoading || isRefreshing}
          onRetryProduct={retryProduct}
        />
      </section>
    </main>
  );
}
