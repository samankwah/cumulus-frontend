"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { DashboardDrawer } from "@/components/dashboard-drawer";
import { FloatingControls } from "@/components/floating-controls";
import type { DashboardView } from "@/components/floating-controls";
import type { AreaHoverProvider } from "@/components/forecast-raster-map";
import { RunBadge, SubseasonalDock, SubseasonalPanel, SubseasonalTopBar } from "@/components/subseasonal/subseasonal-panel";
import { SubseasonalDrawer } from "@/components/subseasonal/subseasonal-drawer";
import { useCumulusDashboard } from "@/hooks/use-cumulus-dashboard";
import { useSubseasonal } from "@/hooks/use-subseasonal";
import {
  AGGREGATION_LABELS,
  formatAmount,
  layerLabel,
  legendColorFor,
  readUrlState,
  subseasonalTileUrl,
  writeUrlState,
} from "@/lib/subseasonal";
import type { ForecastGeographySelection, ForecastPointSelection } from "@/lib/types";

const ForecastRasterMap = dynamic(
  () => import("@/components/forecast-raster-map").then((module) => module.ForecastRasterMap),
  { ssr: false },
);

/** Close to opaque so the map matches the legend; place labels are drawn above the raster. */
const SUBSEASONAL_TILE_OPACITY = 0.85;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

export function DashboardShell() {
  const [view, setView] = useState<DashboardView>("subseasonal");
  const [hasReadUrl, setHasReadUrl] = useState(false);

  // The view comes from the URL on the client only (static export renders the default).
  useEffect(() => {
    setView(readUrlState(window.location.search).view);
    setHasReadUrl(true);
  }, []);

  const isSubseasonal = view === "subseasonal";
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
  } = useCumulusDashboard({ active: hasReadUrl && !isSubseasonal });
  const subseasonal = useSubseasonal({
    active: hasReadUrl && isSubseasonal,
    areaLevel: dashboardMode,
    onRestoreAreaLevel: setDashboardMode,
  });

  const isProductReady = Boolean(
    product &&
      thematicMode &&
      activeThemeOption?.enabled &&
      (!activeThemeOption.requires_season || seasonProfile) &&
      (!activeThemeOption.requires_subseason || subseason),
  );

  const changeView = useCallback((next: DashboardView) => {
    setView(next);
    if (next === "seasonal") {
      writeUrlState({ view: "seasonal", layer: "rainfall", aggregation: "daily", day: null, week: null, point: null, area: null });
    }
  }, []);

  /* ------------------------------------------------------------ 46-day map wiring */
  const { query, layerMeta, areaValues, run } = subseasonal;
  const subseasonalGeography = useMemo<ForecastGeographySelection | null>(() => {
    const selection = subseasonal.selection;
    if (selection?.kind !== "area") {
      return null;
    }
    return {
      mode: selection.level,
      geographyKey: selection.geographyKey,
      geographyName: selection.name,
      regionName: selection.regionName,
      latitude: selection.latitude,
      longitude: selection.longitude,
    };
  }, [subseasonal.selection]);

  const subseasonalPoint = useMemo<ForecastPointSelection | null>(() => {
    const selection = subseasonal.selection;
    return selection?.kind === "point" ? { latitude: selection.latitude, longitude: selection.longitude } : null;
  }, [subseasonal.selection]);

  const prefetchUrls = useMemo(() => {
    if (!query || !subseasonal.hasTimeline) {
      return [];
    }
    const ahead = subseasonal.isPlaying ? [1, 2, 3] : [1, -1];
    return ahead
      .map((offset) => query.index + offset)
      .filter((index) => index >= 1 && index <= subseasonal.indexCount)
      .map((index) => subseasonalTileUrl({ ...query, index }));
  }, [query, subseasonal.hasTimeline, subseasonal.indexCount, subseasonal.isPlaying]);

  const { onTilesLoaded, tileUrl } = subseasonal;
  const raster = useMemo(
    () =>
      isSubseasonal
        ? { url: tileUrl, opacity: SUBSEASONAL_TILE_OPACITY, prefetchUrls, onLoad: onTilesLoaded }
        : null,
    [isSubseasonal, onTilesLoaded, prefetchUrls, tileUrl],
  );

  const areaHover = useMemo<AreaHoverProvider | null>(() => {
    if (!isSubseasonal) {
      return null;
    }
    const legendMeta = layerMeta && areaValues && layerMeta.layer === areaValues.layer ? layerMeta : null;
    const fresh =
      areaValues && query && areaValues.layer === query.layer && areaValues.aggregation === query.aggregation && areaValues.index === query.index;
    return {
      key: `${areaValues?.run_id}:${areaValues?.layer}:${areaValues?.aggregation}:${areaValues?.index}:${areaValues?.level}`,
      render: ({ name }) => {
        const heading = `<strong>${escapeHtml(name)}</strong>`;
        if (!areaValues || !fresh) {
          return `${heading}<br/><span class="tooltip-muted">Loading area value…</span>`;
        }
        const value = areaValues.values[name] ?? null;
        if (legendMeta?.legend.categorical) {
          // Day maps flag cells 100/0, so the area mean is the share of the area flagged.
          const label = legendMeta.legend.bins[0]?.label ?? layerMeta?.layer_label ?? "";
          const share = value === null ? "–" : `${Math.round(value)}%`;
          return `${heading}<br/><span class="ss-tip-value">${escapeHtml(label)}</span><br/><span class="tooltip-muted">across ${share} of the area</span>`;
        }
        const color = legendMeta ? legendColorFor(legendMeta.legend, value) : null;
        const swatch = color ? `<i class="ss-tip-swatch" style="background:${color}"></i>` : "";
        const period = layerMeta?.title.split(" · ").slice(1).join(" · ") ?? "";
        return [
          heading,
          `<span class="ss-tip-value">${swatch}${escapeHtml(formatAmount(value, areaValues.unit))}</span>`,
          `<span class="tooltip-muted">Area mean${period ? ` · ${escapeHtml(period)}` : ""}</span>`,
        ].join("<br/>");
      },
    };
  }, [areaValues, isSubseasonal, layerMeta, query]);

  const collapsedSummary = [
    layerLabel(run, subseasonal.layer),
    subseasonal.aggregation === "total" ? null : AGGREGATION_LABELS[subseasonal.aggregation],
    dashboardMode === "district" ? "Districts" : "Regions",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="spa-shell">
      <section
        className={`atlas-stage${isSubseasonal ? " view-subseasonal" : ""}${isSubseasonal && subseasonal.isDrawerOpen ? " ss-drawer-open" : ""}`}
      >
        <div className="map-frame" data-testid="map-frame">
          <ForecastRasterMap
            dashboardMode={dashboardMode}
            viewMode={viewMode}
            thematicMode={thematicMode}
            seasonProfile={seasonProfile}
            subseason={subseason}
            isProductReady={isProductReady}
            product={isSubseasonal ? null : product}
            selectedPoint={isSubseasonal ? subseasonalPoint : currentSamplePoint}
            selectedGeography={isSubseasonal ? subseasonalGeography : selectedGeography}
            onSelectDistrict={(key, name, region, latitude, longitude) =>
              isSubseasonal
                ? subseasonal.selectArea("district", name, region, key, latitude, longitude)
                : selectDistrict(key, name, region, latitude, longitude)
            }
            onSelectPoint={(latitude, longitude) =>
              isSubseasonal ? subseasonal.selectPoint(latitude, longitude) : selectPoint(latitude, longitude)
            }
            onSelectRegion={(region) =>
              isSubseasonal
                ? subseasonal.selectArea("region", region.name, region.name, region.name, region.latitude, region.longitude)
                : selectRegion(region)
            }
            raster={raster}
            areaHover={areaHover}
            fitKey={isSubseasonal ? (layerMeta ? "subseasonal-ready" : "subseasonal") : "seasonal"}
          />

          <div className="chrome-layer">
            {isSubseasonal ? <SubseasonalTopBar state={subseasonal} onSeasonal={() => changeView("seasonal")} /> : null}
            <FloatingControls
              view={view}
              onViewChange={changeView}
              subseasonalHeader={<RunBadge state={subseasonal} />}
              subseasonalContent={<SubseasonalPanel state={subseasonal} />}
              subseasonalLegend={
                <SubseasonalDock state={subseasonal} geography={{ mode: dashboardMode, setMode: setDashboardMode }} />
              }
              collapsedSummary={isSubseasonal ? collapsedSummary : null}
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

        {isSubseasonal ? (
          <SubseasonalDrawer state={subseasonal} onSeekDay={subseasonal.seekDay} />
        ) : (
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
        )}
      </section>
    </main>
  );
}
