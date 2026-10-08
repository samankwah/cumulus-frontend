"use client";

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { FeatureCollection } from "geojson";
import type { LatLngBounds, LatLngBoundsExpression, LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Pane, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { CrossfadeTileLayer } from "@/components/crossfade-tile-layer";
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
/**
 * Pan limit: Ghana plus a wide margin. The fit centres Ghana in whatever space the panels leave, so
 * the view itself sits far off-centre: ~5° south of the coast under a phone card, ~9° west of
 * Ghana beside the desktop control panel, and as far east beside an open drawer. A tighter limit
 * makes Leaflet clamp the view and slide Ghana back under the panels.
 */
const PAN_BOUNDS: LatLngBoundsExpression = [
  [-8.0, -17.0],
  [19.0, 12.0],
];
const MAP_PADDING_TOP_LEFT: [number, number] = [36, 48];
const MAP_PADDING_BOTTOM_RIGHT: [number, number] = [36, 48];
const DRAWER_CLEARANCE = 28;
const MAP_STROKE = "rgba(32, 41, 50, 0.92)";
const MAP_STROKE_SOFT = "rgba(73, 88, 104, 0.7)";
const MAP_HALO = "rgba(119, 134, 150, 0.42)";
/** Every border, Ghana's included: only used to mask the basemap's own dashed boundaries. */
const ALL_BORDERS_URL = "/data/west_africa_country_borders.geojson";
/** Borders between neighbours, with Ghana's stretch removed (its outline comes from its regions). */
const NEIGHBOUR_BORDERS_URL = "/data/west_africa_neighbour_borders.geojson";
const COASTLINE_URL = "/data/west_africa_coastline.geojson";
/** Ghana's outer outline, from the union of its region polygons (slivers and lake holes dropped). */
const GHANA_OUTLINE_URL = "/data/ghana_outline.geojson";
/**
 * The Esri base draws thin dashed country boundaries that can't be switched off, and they drift up
 * to ~10px from our data. A wide stroke in the basemap's land colour hides them; it sits below the
 * forecast raster, so inside Ghana the forecast covers it and nothing visibly changes.
 */
const BORDER_MASK_STYLE = { color: "#efefef", opacity: 1, lineCap: "round" as const, lineJoin: "round" as const };
/** The drift is a ground distance (~0.08°), so the mask must widen as the map zooms in. */
const BORDER_MASK_DRIFT_DEGREES = 0.08;
/**
 * Beyond this zoom the generalised border data drifts too far from the true line to mask (and
 * looks visibly wrong), so neighbour borders and coastline hand back to the basemap's precise ones.
 */
const CUSTOM_BORDERS_MAX_ZOOM = 9;

function useMapZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return zoom;
}

function borderMaskWeight(zoom: number) {
  const driftPixels = (BORDER_MASK_DRIFT_DEGREES * 256 * 2 ** zoom) / 360;
  return Math.min(64, Math.max(14, 2 * driftPixels + 4));
}
const COUNTRY_BORDER_STYLE = { color: "#3d4a55", weight: 1.4, opacity: 0.9, lineCap: "round" as const };
const COASTLINE_STYLE = { color: "#3d4a55", weight: 1.4, opacity: 0.9 };
const GHANA_OUTLINE_STYLE = { color: "#26313a", weight: 1.8, opacity: 0.95, lineJoin: "round" as const };

function useGeoJson(url: string) {
  const [data, setData] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => (response.ok ? (response.json() as Promise<FeatureCollection>) : null))
      .then((payload) => {
        if (payload && !cancelled) {
          setData(payload);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  return data;
}

/**
 * Solid, thick country borders and coastline over the grey basemap. Both files have Ghana's own
 * stretch removed: Ghana's outline comes from its region polygons, and drawing it twice from two
 * differently generalised datasets produced parallel, drifting lines.
 */
function BasemapBorderMask() {
  const borders = useGeoJson(ALL_BORDERS_URL);
  const zoom = useMapZoom();
  const weight = borderMaskWeight(zoom);
  return borders && zoom <= CUSTOM_BORDERS_MAX_ZOOM ? (
    <GeoJSON
      // Re-mount on width change: GeoJSON styles are applied when the layer is created.
      key={weight}
      data={borders}
      interactive={false}
      pane="basemap-border-mask-pane"
      style={() => ({ ...BORDER_MASK_STYLE, weight })}
    />
  ) : null;
}

/** Ghana drawn as strongly as its neighbours' borders, above the region lines. */
function GhanaOutline() {
  const outline = useGeoJson(GHANA_OUTLINE_URL);
  return outline ? (
    <GeoJSON data={outline} interactive={false} pane="ghana-outline-pane" style={() => GHANA_OUTLINE_STYLE} />
  ) : null;
}

function CountryOutlines() {
  const borders = useGeoJson(NEIGHBOUR_BORDERS_URL);
  const coastline = useGeoJson(COASTLINE_URL);
  const zoom = useMapZoom();
  if (zoom > CUSTOM_BORDERS_MAX_ZOOM) {
    return null;
  }
  return (
    <>
      {borders ? (
        <GeoJSON data={borders} interactive={false} pane="country-outline-pane" style={() => COUNTRY_BORDER_STYLE} />
      ) : null}
      {coastline ? (
        <GeoJSON data={coastline} interactive={false} pane="country-outline-pane" style={() => COASTLINE_STYLE} />
      ) : null}
    </>
  );
}

/**
 * Padding that keeps the map's subject clear of every floating panel: the left control column, the
 * phone top bar, the bottom dock and an open location drawer on the right. A panel slid off-screen
 * (the control column hides on mid-size screens while the drawer is open) measures off the map and
 * so adds nothing.
 */
function getChromeAwarePadding(map: L.Map) {
  const mapRect = map.getContainer().getBoundingClientRect();
  const stage = map.getContainer().closest(".atlas-stage");
  let left = MAP_PADDING_TOP_LEFT[1];
  let top = MAP_PADDING_TOP_LEFT[0];
  let right = MAP_PADDING_BOTTOM_RIGHT[0];
  let bottom = MAP_PADDING_BOTTOM_RIGHT[1];
  const panels = stage
    ? stage.querySelectorAll<HTMLElement>(
        '.floating-controls .control-card, .floating-legend, .ss-topbar, [data-testid="dashboard-drawer"].open',
      )
    : [];
  panels.forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const isLeftColumn = rect.width < mapRect.width * 0.5 && rect.height > mapRect.height * 0.35 && rect.left < mapRect.left + 80;
    const isTopBar = rect.width > mapRect.width * 0.5 && rect.top < mapRect.top + 60 && rect.height < mapRect.height * 0.25;
    // A full-screen drawer (phones) hides the map entirely; there is nothing to pad for.
    const isRightColumn =
      rect.left > mapRect.left + mapRect.width * 0.4 && rect.height > mapRect.height * 0.45 && rect.width < mapRect.width * 0.9;
    if (isRightColumn) {
      right = Math.max(right, mapRect.right - rect.left + DRAWER_CLEARANCE);
    } else if (isLeftColumn) {
      left = Math.max(left, rect.right - mapRect.left + 24);
    } else if (isTopBar) {
      top = Math.max(top, rect.bottom - mapRect.top + 12);
    } else if (rect.bottom > mapRect.bottom - 60) {
      bottom = Math.max(bottom, mapRect.bottom - rect.top + 16);
    }
  });
  // Never squeeze the country below a usable size.
  right = Math.min(right, mapRect.width * 0.5);
  left = Math.min(left, mapRect.width * 0.55, Math.max(MAP_PADDING_TOP_LEFT[1], mapRect.width * 0.75 - right));
  bottom = Math.min(bottom, mapRect.height * 0.5);
  return {
    paddingTopLeft: [left, top] as [number, number],
    paddingBottomRight: [right, bottom] as [number, number],
  };
}

/**
 * fitBounds that survives a running zoom animation. Leaflet discards a fit issued mid-animation (the
 * transition end restores its own target), so wait for the zoom to finish first.
 */
function fitWhenIdle(map: L.Map, bounds: LatLngBoundsExpression, options: L.FitBoundsOptions) {
  const run = () => map.fitBounds(bounds, options);
  if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) {
    map.once("zoomend", run);
  } else {
    run();
  }
}

function fitGhana(map: L.Map, padding: ReturnType<typeof getChromeAwarePadding>, animate: boolean) {
  fitWhenIdle(map, GHANA_BOUNDS, { ...padding, animate });
}

function FitBoundsOnce({ fitKey }: { fitKey: string }) {
  const map = useMap();
  const fittedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (fittedKeysRef.current.has(fitKey)) {
      return;
    }
    const isFirstFit = fittedKeysRef.current.size === 0;
    if (isFirstFit) {
      // Instant, so the panel-aware refit below never lands inside a running animation.
      map.fitBounds(GHANA_BOUNDS, {
        paddingTopLeft: MAP_PADDING_TOP_LEFT,
        paddingBottomRight: MAP_PADDING_BOTTOM_RIGHT,
        animate: false,
      });
    }
    // Refit once the floating panels have laid out, so they do not cover the country. The key is
    // recorded only when the refit runs: React may run this effect twice and cancel the first timer.
    const handle = window.setTimeout(() => {
      fittedKeysRef.current.add(fitKey);
      fitGhana(map, getChromeAwarePadding(map), !isFirstFit);
    }, 120);
    return () => window.clearTimeout(handle);
  }, [fitKey, map]);

  // The dock grows once timeline data arrives, after the refit above. Refit again when
  // the floating legend resizes, until the user takes over by dragging or zooming.
  useEffect(() => {
    const stage = map.getContainer().closest(".atlas-stage");
    if (!stage || typeof ResizeObserver === "undefined") {
      return;
    }
    let userMoved = false;
    let handle: number | undefined;
    const markUserMoved = () => {
      userMoved = true;
    };
    const container = map.getContainer();
    map.on("dragstart", markUserMoved);
    container.addEventListener("wheel", markUserMoved, { passive: true });
    container.addEventListener("touchstart", markUserMoved, { passive: true });
    container.addEventListener("dblclick", markUserMoved);

    const observer = new ResizeObserver(() => {
      window.clearTimeout(handle);
      handle = window.setTimeout(() => {
        if (!userMoved) {
          fitGhana(map, getChromeAwarePadding(map), true);
        }
      }, 150);
    });
    stage.querySelectorAll<HTMLElement>(".floating-legend").forEach((el) => observer.observe(el));

    return () => {
      window.clearTimeout(handle);
      observer.disconnect();
      map.off("dragstart", markUserMoved);
      container.removeEventListener("wheel", markUserMoved);
      container.removeEventListener("touchstart", markUserMoved);
      container.removeEventListener("dblclick", markUserMoved);
    };
  }, [fitKey, map]);

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

/** Synchronous hover content for the 46-day view (values come from one area-values request). */
export type AreaHoverProvider = {
  key: string;
  render: (geography: { type: DashboardMode; key: string; name: string }) => string;
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

/** Selection focus must clear the same panels as the country fit, the drawer included. */
function getDrawerAwarePadding(map: L.Map) {
  return getChromeAwarePadding(map);
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
      // Move only when the selection is actually hidden: needless motion disorients.
      const size = map.getSize();
      const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
      const southEast = map.latLngToContainerPoint(bounds.getSouthEast());
      const alreadyVisible =
        northWest.x >= paddingTopLeft[0] &&
        northWest.y >= paddingTopLeft[1] &&
        southEast.x <= size.x - paddingBottomRight[0] &&
        southEast.y <= size.y - paddingBottomRight[1];
      if (alreadyVisible) {
        return;
      }
      fitWhenIdle(map, bounds, {
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
  areaHover,
  onSelectDistrict,
  onSelectRegion,
}: {
  dashboardMode: DashboardMode;
  selectedGeography: ForecastGeographySelection | null;
  hoverContext: HoverForecastContext;
  areaHover: AreaHoverProvider | null;
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
  const areaHoverRef = useRef(areaHover);
  areaHoverRef.current = areaHover;
  const hoveredRef = useRef<{ layer: TooltipLayer; geography: HoverGeography } | null>(null);

  // Keep an open tooltip in sync while the 46-day map animates underneath it.
  useEffect(() => {
    const hovered = hoveredRef.current;
    if (!areaHover || !hovered) {
      return;
    }
    setLayerTooltipContent(
      hovered.layer,
      areaHover.render({
        type: hovered.geography.geographyType,
        key: hovered.geography.geographyKey,
        name: hovered.geography.geographyName,
      }),
    );
  }, [areaHover]);

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

    featureLayer.on("mouseout", () => {
      if (hoveredRef.current?.layer === tooltipLayer) {
        hoveredRef.current = null;
      }
    });

    featureLayer.on("mouseover", () => {
      const provider = areaHoverRef.current;
      if (provider) {
        hoveredRef.current = { layer: tooltipLayer, geography };
        setLayerTooltipContent(
          tooltipLayer,
          provider.render({ type: geography.geographyType, key: geography.geographyKey, name: geography.geographyName }),
        );
        return;
      }
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
  raster = null,
  areaHover = null,
  fitKey = "initial",
}: {
  /** Changing this refits Ghana to the space left by the floating panels (once per key). */
  fitKey?: string;
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
  /** 46-day view: a crossfading raster driven by the timeline instead of a seasonal product. */
  raster?: { url: string | null; opacity: number; prefetchUrls: string[]; onLoad: (url: string) => void } | null;
  areaHover?: AreaHoverProvider | null;
}) {
  return (
    <MapContainer
      center={[7.9, -1.1]}
      zoom={6.3}
      minZoom={5.5}
      zoomSnap={0.25}
      zoomControl={false}
      maxBounds={PAN_BOUNDS}
      maxBoundsViscosity={0.5}
      className="district-map"
    >
      <FitBoundsOnce fitKey={fitKey} />
      <RasterClickHandler onSelectPoint={onSelectPoint} />
      <TileLayer
        attribution="Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />
      <Pane name="basemap-labels-pane" style={{ zIndex: 450, pointerEvents: "none" }}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
          pane="basemap-labels-pane"
        />
      </Pane>
      <Pane name="basemap-border-mask-pane" style={{ zIndex: 310, pointerEvents: "none" }}>
        <BasemapBorderMask />
      </Pane>
      <Pane name="forecast-raster-pane" className="forecast-raster-pane" style={{ zIndex: 320 }}>
        {raster ? (
          <CrossfadeTileLayer
            url={raster.url}
            opacity={raster.opacity}
            pane="forecast-raster-pane"
            onLoad={raster.onLoad}
            prefetchUrls={raster.prefetchUrls}
          />
        ) : product ? (
          <TileLayer url={product.tile_url} opacity={forecastTileOpacity(product)} pane="forecast-raster-pane" />
        ) : null}
      </Pane>
      <Pane name="forecast-feature-pane" style={{ zIndex: 470 }}>
        <ForecastMapOverlay
          dashboardMode={dashboardMode}
          selectedGeography={selectedGeography}
          areaHover={areaHover}
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
      <Pane name="country-outline-pane" style={{ zIndex: 440, pointerEvents: "none" }}>
        <CountryOutlines />
      </Pane>
      <Pane name="ghana-outline-pane" style={{ zIndex: 480, pointerEvents: "none" }}>
        <GhanaOutline />
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
