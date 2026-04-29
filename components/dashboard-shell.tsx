"use client";

import dynamic from "next/dynamic";

import { DashboardDrawer } from "@/components/dashboard-drawer";
import { FloatingControls } from "@/components/floating-controls";
import { useCumulusDashboard } from "@/hooks/use-cumulus-dashboard";

const ForecastRasterMap = dynamic(
  () => import("@/components/forecast-raster-map").then((module) => module.ForecastRasterMap),
  { ssr: false },
);

export function DashboardShell() {
  const {
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
    product,
    productError,
    isProductLoading,
    isRefreshing,
    selectedGeography,
    currentSamplePoint,
    sample,
    sampleError,
    isSampleLoading,
    isDrawerOpen,
    closeDrawer,
    legend,
    retryProduct,
    retrySample,
    selectDistrict,
    selectRegion,
    selectPoint,
  } = useCumulusDashboard();
  const isProductReady = Boolean(
    product &&
      thematicMode &&
      activeThemeOption?.enabled &&
      (!activeThemeOption.requires_season || seasonProfile) &&
      (!activeThemeOption.requires_subseason || subseason),
  );

  return (
    <main className="spa-shell">
      <section className="atlas-stage">
        <div className="map-frame" data-testid="map-frame">
          <ForecastRasterMap
            dashboardMode={dashboardMode}
            viewMode={viewMode}
            thematicMode={thematicMode}
            seasonProfile={seasonProfile}
            subseason={subseason}
            isProductReady={isProductReady}
            product={product}
            selectedPoint={currentSamplePoint}
            selectedGeography={selectedGeography}
            onSelectDistrict={selectDistrict}
            onSelectPoint={selectPoint}
            onSelectRegion={selectRegion}
          />

          <div className="chrome-layer">
            <FloatingControls
              dashboardMode={dashboardMode}
              setDashboardMode={setDashboardMode}
              viewMode={viewMode}
              setViewMode={setViewMode}
              thematicMode={thematicMode}
              setThematicMode={setThematicMode}
              themeOptions={themeOptions}
              isThemeOptionsLoading={isThemeOptionsLoading}
              themeOptionsError={themeOptionsError}
              activeThemeOption={activeThemeOption}
              seasonProfile={seasonProfile}
              setSeasonProfile={setSeasonProfile}
              subseason={subseason}
              setSubseason={setSubseason}
              legend={legend}
              product={product}
              sample={sample}
              productError={productError}
              isProductLoading={isProductLoading}
              isRefreshing={isRefreshing}
              onRetryProduct={retryProduct}
            />
          </div>
        </div>

        <DashboardDrawer
          dashboardMode={dashboardMode}
          viewMode={viewMode}
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          thematicMode={thematicMode}
          seasonProfile={seasonProfile}
          subseason={subseason}
          selectedGeography={selectedGeography}
          product={product}
          sample={sample}
          productError={productError}
          sampleError={sampleError}
          isProductLoading={isProductLoading}
          isSampleLoading={isSampleLoading}
          onRetryProduct={retryProduct}
          onRetrySample={retrySample}
        />
      </section>
    </main>
  );
}
