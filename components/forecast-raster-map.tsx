"use client";

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { LatLngBounds, LatLngBoundsExpression, LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Pane, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { formatApiError, sampleForecastDeterministic, sampleForecastProbability } from "@/lib/api";
import { formatDeterministicMetricDisplayValue, formatProbabilityPercentage } from "@/lib/dashboard";
import { isPointInFeatureCollection, loadMapData } from "@/lib/map-data";
import type {
  CalendarSubseason,
  DashboardMode,
  DistrictFeature,
  DistrictFeatureCollection,
  ForecastArtifactTheme,
  ForecastDeterministicSample,
  ForecastGeographySelection,
  ForecastMapProduct,
  ForecastPointSelection,
  ForecastProbabilitySample,
  ForecastViewMode,
  RegionFeature,
  RegionFeatureCollection,
  RegionMetadata,
  SeasonProfile,
} from "@/lib/types";

const GHANA_BOUNDS: LatLngBoundsExpression = [
  [4.2, -3.3],
  [11.2, 1.4],
];
const MAP_PADDING_TOP_LEFT: [number, number] = [36, 48];
const MAP_PADDING_BOTTOM_RIGHT: [number, number] = [36, 48];
const DRAWER_CLEARANCE = 28;
const MAP_STROKE = "rgba(32, 41, 50, 0.92)";
const MAP_STROKE_SOFT = "rgba(73, 88, 104, 0.7)";
const MAP_HALO = "rgba(119, 134, 150, 0.42)";

function FitBoundsOnce() {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (hasFittedRef.current) {
      return;
    }
    map.fitBounds(GHANA_BOUNDS, {
      paddingTopLeft: MAP_PADDING_TOP_LEFT,
      paddingBottomRight: MAP_PADDING_BOTTOM_RIGHT,
    });
    hasFittedRef.current = true;
  }, [map]);

  return null;
}

function RasterClickHandler({
  onSelectPoint,
}: {
  onSelectPoint: (latitude: number, longitude: number) => void;
}) {
  const [regionFeatures, setRegionFeatures] = useState<RegionFeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateBoundary() {
      const payload = await loadMapData();
      if (cancelled) {
        return;
      }
      setRegionFeatures(payload.regionFeatures);
    }

    void hydrateBoundary();
    return () => {
      cancelled = true;
    };
  }, []);

  useMapEvents({
    click(event) {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest(".leaflet-interactive")) {
        return;
      }
      if (!regionFeatures || !isPointInFeatureCollection(event.latlng.lat, event.latlng.lng, regionFeatures)) {
        return;
      }
      onSelectPoint(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

type SelectedLayer = L.Layer & {
  feature?: DistrictFeature | RegionFeature;
  getBounds?: () => LatLngBounds;
};

type TooltipLayer = L.Layer & {
  setTooltipContent?: (content: string) => L.Layer;
  getTooltip?: () => L.Tooltip | undefined;
};

type HoverSample = ForecastProbabilitySample | ForecastDeterministicSample;

type HoverCacheEntry =
  | { status: "loading"; promise: Promise<HoverSample> }
  | { status: "ready"; sample: HoverSample }
  | { status: "error"; message: string };

type HoverForecastContext = {
  viewMode: ForecastViewMode;
  thematicMode: ForecastArtifactTheme | null;
  seasonProfile: SeasonProfile | null;
  subseason: CalendarSubseason | null;
  isProductReady: boolean;
  productIdentity: string;
};

type HoverGeography = {
  geographyKey: string;
  geographyName: string;
  geographyType: DashboardMode;
  latitude: number;
  longitude: number;
};

function forecastTileOpacity(product: ForecastMapProduct | null) {
  if (!product) {
    return 0.94;
  }
  if (product.is_low_resolution_fallback) {
    return "color_ramp" in product ? 0.68 : 0.62;
  }
  return "color_ramp" in product ? 1 : 0.94;
}

function isProbabilitySample(sample: HoverSample): sample is ForecastProbabilitySample {
  return "category_probabilities" in sample;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTooltipPoint(latitude: number, longitude: number) {
  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

function hoverContextKey(context: HoverForecastContext) {
  return [
    context.viewMode,
    context.thematicMode ?? "theme-none",
    context.seasonProfile ?? "season-none",
    context.subseason ?? "subseason-none",
    context.isProductReady ? "ready" : "not-ready",
    context.productIdentity,
  ].join(":");
}

function hoverCacheKey(context: HoverForecastContext, geography: HoverGeography) {
  return `${hoverContextKey(context)}:${geography.geographyType}:${geography.geographyKey}`;
}

function renderHoverTooltip(
  geographyName: string,
  state:
    | { status: "loading" }
    | { status: "unavailable"; message: string }
    | { status: "ready"; sample: HoverSample; representativePoint: { latitude: number; longitude: number } },
) {
  const heading = `<strong>${escapeHtml(geographyName)}</strong>`;

  if (state.status === "loading") {
    return `${heading}<br/><span class="tooltip-muted">Loading sampled forecast value...</span>`;
  }

  if (state.status === "unavailable") {
    return `${heading}<br/><span class="tooltip-muted">${escapeHtml(state.message)}</span>`;
  }

  const value = isProbabilitySample(state.sample)
    ? `${state.sample.dominant_category_label} ${formatProbabilityPercentage(state.sample)}`
    : formatDeterministicMetricDisplayValue(state.sample);
  const representativePoint = formatTooltipPoint(state.representativePoint.latitude, state.representativePoint.longitude);
  const nearestCell = formatTooltipPoint(state.sample.nearest_latitude, state.sample.nearest_longitude);

  return [
    heading,
    `<span>${escapeHtml(value)}</span>`,
    `<span class="tooltip-muted">Representative point ${escapeHtml(representativePoint)} to cell ${escapeHtml(nearestCell)}</span>`,
  ].join("<br/>");
}

function setLayerTooltipContent(layer: TooltipLayer, content: string) {
  if (typeof layer.setTooltipContent === "function") {
    layer.setTooltipContent(content);
  }
}

async function fetchHoverSample(context: HoverForecastContext, geography: HoverGeography) {
  if (!context.thematicMode) {
    throw new Error("Forecast variable is not selected.");
  }

  if (context.viewMode === "probabilistic") {
    return sampleForecastProbability(
      context.thematicMode,
      geography.latitude,
      geography.longitude,
      context.seasonProfile,
      context.subseason,
    );
  }

  return sampleForecastDeterministic(
    context.thematicMode,
    geography.latitude,
    geography.longitude,
    context.seasonProfile,
    context.subseason,
  );
}

function findSelectedLayer(
  layerGroup: L.GeoJSON | null,
  mode: DashboardMode,
  selectedGeography: ForecastGeographySelection | null,
): SelectedLayer | null {
  if (!layerGroup || !selectedGeography || selectedGeography.mode !== mode) {
    return null;
  }

  let selectedLayer: SelectedLayer | null = null;
  layerGroup.eachLayer((layer) => {
    const candidate = layer as SelectedLayer;
    if (!candidate.feature || typeof candidate.getBounds !== "function") {
      return;
    }

    if (mode === "region" && candidate.feature.properties.region === selectedGeography.geographyKey) {
      selectedLayer = candidate;
      return;
    }

    if (
      mode === "district" &&
      "location_id" in candidate.feature.properties &&
      candidate.feature.properties.location_id === selectedGeography.geographyKey
    ) {
      selectedLayer = candidate;
    }
  });

  return selectedLayer;
}

function getDrawerAwarePadding(map: L.Map) {
  const mapElement = map.getContainer();
  const stage = mapElement.closest(".atlas-stage");
  const drawer = stage?.querySelector<HTMLElement>('[data-testid="dashboard-drawer"].open');
  if (!drawer) {
    return {
      paddingTopLeft: MAP_PADDING_TOP_LEFT,
      paddingBottomRight: MAP_PADDING_BOTTOM_RIGHT,
    };
  }

  const mapRect = mapElement.getBoundingClientRect();
  const drawerRect = drawer.getBoundingClientRect();
  const intersectionWidth = Math.max(0, Math.min(mapRect.right, drawerRect.right) - Math.max(mapRect.left, drawerRect.left));
  const intersectionHeight = Math.max(0, Math.min(mapRect.bottom, drawerRect.bottom) - Math.max(mapRect.top, drawerRect.top));

  const isBottomOverlay = intersectionWidth >= mapRect.width * 0.75 && intersectionHeight > 0;
  const isSideOverlay = !isBottomOverlay && intersectionHeight >= mapRect.height * 0.45 && intersectionWidth > 0;

  return {
    paddingTopLeft: MAP_PADDING_TOP_LEFT,
    paddingBottomRight: [
      MAP_PADDING_BOTTOM_RIGHT[0] + (isSideOverlay ? intersectionWidth + DRAWER_CLEARANCE : 0),
      MAP_PADDING_BOTTOM_RIGHT[1] + (isBottomOverlay ? intersectionHeight + DRAWER_CLEARANCE : 0),
    ] as [number, number],
  };
}

function KeepSelectionVisible({
  geoJsonRef,
  dashboardMode,
  selectedGeography,
}: {
  geoJsonRef: MutableRefObject<L.GeoJSON | null>;
  dashboardMode: DashboardMode;
  selectedGeography: ForecastGeographySelection | null;
}) {
  const map = useMap();

  useEffect(() => {
    const selectedLayer = findSelectedLayer(geoJsonRef.current, dashboardMode, selectedGeography);
    if (!selectedLayer) {
      return;
    }

    const keepVisible = () => {
      const bounds = selectedLayer.getBounds ? selectedLayer.getBounds() : null;
      if (!bounds || !bounds.isValid()) {
        return;
      }

      const { paddingTopLeft, paddingBottomRight } = getDrawerAwarePadding(map);
      map.fitBounds(bounds, {
        paddingTopLeft,
        paddingBottomRight,
        maxZoom: map.getZoom(),
        animate: true,
      });
    };

    const animationFrameId = window.requestAnimationFrame(keepVisible);
    const timeoutId = window.setTimeout(keepVisible, 260);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [dashboardMode, geoJsonRef, map, selectedGeography]);

  return null;
}

function regionStyle(isSelected: boolean) {
  return {
    fillColor: isSelected ? "rgba(35, 209, 173, 0.2)" : "rgba(255, 255, 255, 0.1)",
    color: isSelected ? MAP_STROKE : MAP_STROKE_SOFT,
    weight: isSelected ? 2 : 1.25,
    opacity: 1,
    fillOpacity: isSelected ? 0.2 : 0.05,
  };
}

function regionHaloStyle(isSelected: boolean) {
  return {
    fillOpacity: 0,
    color: isSelected ? MAP_STROKE_SOFT : MAP_HALO,
    weight: isSelected ? 3 : 2.2,
    opacity: 1,
  };
}

function districtStyle(isSelected: boolean) {
  return {
    fillColor: isSelected ? "rgba(35, 209, 173, 0.18)" : "rgba(255, 255, 255, 0.04)",
    color: isSelected ? MAP_STROKE : MAP_STROKE_SOFT,
    weight: isSelected ? 1.8 : 0.75,
    opacity: 1,
    fillOpacity: isSelected ? 0.18 : 0.03,
  };
}

function ForecastMapOverlay({
  dashboardMode,
  selectedGeography,
  hoverContext,
  onSelectDistrict,
  onSelectRegion,
}: {
  dashboardMode: DashboardMode;
  selectedGeography: ForecastGeographySelection | null;
  hoverContext: HoverForecastContext;
  onSelectDistrict: (geographyKey: string, geographyName: string, regionName: string, latitude: number, longitude: number) => void;
  onSelectRegion: (region: RegionMetadata) => void;
}) {
  const [districtFeatures, setDistrictFeatures] = useState<DistrictFeatureCollection | null>(null);
  const [regionFeatures, setRegionFeatures] = useState<RegionFeatureCollection | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const hoverCacheRef = useRef<Map<string, HoverCacheEntry>>(new Map());
  const currentHoverContextKey = hoverContextKey(hoverContext);
  const activeHoverContextKeyRef = useRef(currentHoverContextKey);
  activeHoverContextKeyRef.current = currentHoverContextKey;

  useEffect(() => {
    let cancelled = false;

    async function hydrateMap() {
      const payload = await loadMapData();
      if (cancelled) {
        return;
      }
      setDistrictFeatures(payload.districtFeatures);
      setRegionFeatures(payload.regionFeatures);
    }

    void hydrateMap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!districtFeatures || !regionFeatures) {
    return null;
  }

  const bindValueTooltip = (featureLayer: L.Layer, geography: HoverGeography) => {
    const tooltipLayer = featureLayer as TooltipLayer;
    const unavailableTooltip = renderHoverTooltip(geography.geographyName, {
      status: "unavailable",
      message: "Select a ready forecast product to sample this area.",
    });

    featureLayer.bindTooltip(unavailableTooltip, {
      direction: "top",
      className: "district-tooltip",
    });

    featureLayer.on("mouseover", () => {
      const cacheKey = hoverCacheKey(hoverContext, geography);
      const contextKeyAtRequest = currentHoverContextKey;
      const isCurrentHoverContext = () => activeHoverContextKeyRef.current === contextKeyAtRequest;

      if (!hoverContext.isProductReady || !hoverContext.thematicMode) {
        setLayerTooltipContent(tooltipLayer, unavailableTooltip);
        return;
      }

      const cached = hoverCacheRef.current.get(cacheKey);
      if (cached?.status === "ready") {
        setLayerTooltipContent(
          tooltipLayer,
          renderHoverTooltip(geography.geographyName, {
            status: "ready",
            sample: cached.sample,
            representativePoint: { latitude: geography.latitude, longitude: geography.longitude },
          }),
        );
        return;
      }

      if (cached?.status === "error") {
        setLayerTooltipContent(
          tooltipLayer,
          renderHoverTooltip(geography.geographyName, { status: "unavailable", message: cached.message }),
        );
        return;
      }

      setLayerTooltipContent(tooltipLayer, renderHoverTooltip(geography.geographyName, { status: "loading" }));

      if (cached?.status === "loading") {
        cached.promise
          .then((sample) => {
            if (!isCurrentHoverContext()) {
              return;
            }
            setLayerTooltipContent(
              tooltipLayer,
              renderHoverTooltip(geography.geographyName, {
                status: "ready",
                sample,
                representativePoint: { latitude: geography.latitude, longitude: geography.longitude },
              }),
            );
          })
          .catch((error: unknown) => {
            if (!isCurrentHoverContext()) {
              return;
            }
            const message = formatApiError(error, hoverContext.viewMode === "deterministic" ? "deterministic" : "probability");
            setLayerTooltipContent(
              tooltipLayer,
              renderHoverTooltip(geography.geographyName, { status: "unavailable", message }),
            );
          });
        return;
      }

      const promise = fetchHoverSample(hoverContext, geography);
      hoverCacheRef.current.set(cacheKey, { status: "loading", promise });

      promise
        .then((sample) => {
          if (!isCurrentHoverContext()) {
            return;
          }
          hoverCacheRef.current.set(cacheKey, { status: "ready", sample });
          setLayerTooltipContent(
            tooltipLayer,
            renderHoverTooltip(geography.geographyName, {
              status: "ready",
              sample,
              representativePoint: { latitude: geography.latitude, longitude: geography.longitude },
            }),
          );
        })
        .catch((error: unknown) => {
          if (!isCurrentHoverContext()) {
            return;
          }
          const message = formatApiError(error, hoverContext.viewMode === "deterministic" ? "deterministic" : "probability");
          hoverCacheRef.current.set(cacheKey, { status: "error", message });
          setLayerTooltipContent(
            tooltipLayer,
            renderHoverTooltip(geography.geographyName, { status: "unavailable", message }),
          );
        });
    });

  };

  return (
    <>
      <KeepSelectionVisible
        geoJsonRef={geoJsonRef}
        dashboardMode={dashboardMode}
        selectedGeography={selectedGeography}
      />
      {dashboardMode === "region" ? (
        <>
          <GeoJSON
            key="forecast-regions-halo"
            data={regionFeatures}
            interactive={false}
            style={(feature) => regionHaloStyle(feature?.properties.region === selectedGeography?.geographyKey)}
          />
          <GeoJSON
            key={`forecast-regions-${currentHoverContextKey}-${selectedGeography?.geographyKey ?? "none"}`}
            ref={(layer) => {
              geoJsonRef.current = layer;
            }}
            data={regionFeatures}
            style={(feature) => regionStyle(feature?.properties.region === selectedGeography?.geographyKey)}
            onEachFeature={(feature, layer) => {
              bindValueTooltip(layer, {
                geographyKey: feature.properties.region,
                geographyName: feature.properties.region,
                geographyType: "region",
                latitude: feature.properties.latitude,
                longitude: feature.properties.longitude,
              });
              layer.on("click", (event: LeafletMouseEvent) => {
                L.DomEvent.stop(event.originalEvent);
                onSelectRegion({
                  name: feature.properties.region,
                  latitude: feature.properties.latitude,
                  longitude: feature.properties.longitude,
                });
              });
            }}
          />
        </>
      ) : (
        <>
          <GeoJSON
            key="forecast-region-outline-halo"
            data={regionFeatures}
            interactive={false}
            style={(feature) => regionHaloStyle(feature?.properties.region === selectedGeography?.geographyKey)}
          />
          <GeoJSON
            key={`forecast-districts-${currentHoverContextKey}-${selectedGeography?.geographyKey ?? "none"}`}
            ref={(layer) => {
              geoJsonRef.current = layer;
            }}
            data={districtFeatures}
            style={(feature) => districtStyle(feature?.properties.location_id === selectedGeography?.geographyKey)}
            onEachFeature={(feature, layer) => {
              bindValueTooltip(layer, {
                geographyKey: feature.properties.location_id,
                geographyName: feature.properties.display_name,
                geographyType: "district",
                latitude: feature.properties.latitude,
                longitude: feature.properties.longitude,
              });
              layer.on("click", (event: LeafletMouseEvent) => {
                L.DomEvent.stop(event.originalEvent);
                onSelectDistrict(
                  feature.properties.location_id,
                  feature.properties.display_name,
                  feature.properties.region,
                  feature.properties.latitude,
                  feature.properties.longitude,
                );
              });
            }}
          />
          <GeoJSON
            key="forecast-region-outline"
            data={regionFeatures}
            interactive={false}
            style={() => ({
              fillOpacity: 0,
              color: MAP_STROKE_SOFT,
              weight: 1,
              opacity: 1,
            })}
          />
        </>
      )}
    </>
  );
}

export function ForecastRasterMap({
  dashboardMode,
  viewMode,
  thematicMode,
  seasonProfile,
  subseason,
  isProductReady,
  product,
  selectedPoint,
  selectedGeography,
  onSelectDistrict,
  onSelectPoint,
  onSelectRegion,
}: {
  dashboardMode: DashboardMode;
  viewMode: ForecastViewMode;
  thematicMode: ForecastArtifactTheme | null;
  seasonProfile: SeasonProfile | null;
  subseason: CalendarSubseason | null;
  isProductReady: boolean;
  product: ForecastMapProduct | null;
  selectedPoint: ForecastPointSelection | null;
  selectedGeography: ForecastGeographySelection | null;
  onSelectDistrict: (geographyKey: string, geographyName: string, regionName: string, latitude: number, longitude: number) => void;
  onSelectPoint: (latitude: number, longitude: number) => void;
  onSelectRegion: (region: RegionMetadata) => void;
}) {
  return (
    <MapContainer
      center={[7.9, -1.1]}
      zoom={6.3}
      minZoom={6}
      zoomSnap={0.25}
      zoomControl={false}
      maxBounds={GHANA_BOUNDS}
      maxBoundsViscosity={0.85}
      className="district-map"
    >
      <FitBoundsOnce />
      <RasterClickHandler onSelectPoint={onSelectPoint} />
      <TileLayer
        attribution='Tiles &copy; CartoDB'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        opacity={0.42}
      />
      <Pane name="forecast-raster-pane" className="forecast-raster-pane" style={{ zIndex: 320 }}>
        {product ? <TileLayer url={product.tile_url} opacity={forecastTileOpacity(product)} pane="forecast-raster-pane" /> : null}
      </Pane>
      <Pane name="forecast-feature-pane" style={{ zIndex: 470 }}>
        <ForecastMapOverlay
          dashboardMode={dashboardMode}
          selectedGeography={selectedGeography}
          hoverContext={{
            viewMode,
            thematicMode,
            seasonProfile,
            subseason,
            isProductReady,
            productIdentity: product
              ? `${product.product_id}:${product.source_run_id}:${product.generated_at}`
              : "product-none",
          }}
          onSelectDistrict={onSelectDistrict}
          onSelectRegion={onSelectRegion}
        />
      </Pane>
      <Pane name="forecast-selection-pane" style={{ zIndex: 520 }}>
        {selectedPoint ? (
          <>
            <CircleMarker
              center={[selectedPoint.latitude, selectedPoint.longitude]}
              radius={17}
              pathOptions={{
                color: "rgba(255, 255, 255, 0.56)",
                weight: 1,
                fillColor: "#23d1ad",
                fillOpacity: 0.16,
                opacity: 0.9,
              }}
            />
            <CircleMarker
              center={[selectedPoint.latitude, selectedPoint.longitude]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: "#23d1ad",
                fillOpacity: 0.88,
              }}
            />
          </>
        ) : null}
      </Pane>
    </MapContainer>
  );
}
