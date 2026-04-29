"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import type { LatLngBounds, LatLngBoundsExpression, LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

import { thematicTitle } from "@/lib/dashboard";
import type {
  CalendarSubseason,
  DashboardMode,
  DistrictFeature,
  DistrictFeatureCollection,
  RegionFeature,
  RegionFeatureCollection,
  SeasonalMapAreaItem,
  SeasonalMode,
  SeasonalTheme,
} from "@/lib/types";

const GHANA_BOUNDS: LatLngBoundsExpression = [
  [4.2, -3.3],
  [11.2, 1.4],
];
const MAP_PADDING_TOP_LEFT: [number, number] = [36, 48];
const MAP_PADDING_BOTTOM_RIGHT: [number, number] = [36, 48];
const DRAWER_CLEARANCE = 28;

function metricColor(item: SeasonalMapAreaItem | null | undefined, theme: SeasonalTheme | null) {
  if (item?.metric.theme === theme) {
    return item.metric.color;
  }
  return "#7b877f";
}

function isThemedArea(item: SeasonalMapAreaItem | null | undefined, theme: SeasonalTheme | null) {
  return item?.metric.theme === theme;
}

function metricTooltipValue(item: SeasonalMapAreaItem | null | undefined) {
  if (!item) {
    return "Pending";
  }
  if ("category_probabilities" in item.metric) {
    return item.metric.category_label;
  }
  return item.metric.display_value;
}

function regionStyle(color: string, isSelected: boolean, isThemed: boolean, isHovered = false) {
  return {
    fillColor: color,
    color: isSelected ? "#23d1ad" : isHovered ? "rgba(255, 255, 255, 0.95)" : "rgba(73, 88, 104, 0.72)",
    weight: isSelected ? 5.8 : isHovered ? 4.2 : 2.5,
    opacity: 1,
    fillOpacity: isSelected ? 0.88 : isHovered && isThemed ? 0.8 : 0.66,
  };
}

function districtStyle(color: string, isSelected: boolean, isThemed: boolean, isHovered = false) {
  return {
    fillColor: color,
    color: isSelected ? "#23d1ad" : isHovered ? "rgba(255, 255, 255, 0.94)" : "rgba(73, 88, 104, 0.62)",
    weight: isSelected ? 3.9 : isHovered ? 2.9 : 1.2,
    opacity: 1,
    fillOpacity: isSelected ? 0.95 : isHovered && isThemed ? 0.88 : 0.78,
  };
}

function regionAreaStyle(
  item: SeasonalMapAreaItem | null | undefined,
  theme: SeasonalTheme | null,
  isSelected: boolean,
  isHovered = false,
) {
  return regionStyle(metricColor(item, theme), isSelected, isThemedArea(item, theme), isHovered);
}

function districtAreaStyle(
  item: SeasonalMapAreaItem | null | undefined,
  theme: SeasonalTheme | null,
  isSelected: boolean,
  isHovered = false,
) {
  return districtStyle(metricColor(item, theme), isSelected, isThemedArea(item, theme), isHovered);
}

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

type MapFeature = DistrictFeature | RegionFeature;
type SelectedLayer = L.Layer & {
  feature?: MapFeature;
  getBounds?: () => LatLngBounds;
};
type InteractiveMapLayer = L.Path & {
  feature?: MapFeature;
  closeTooltip?: () => void;
};

function findSelectedLayer(
  layerGroup: L.GeoJSON | null,
  mode: DashboardMode,
  selectedDistrictId: string | null,
  selectedRegionName: string | null,
): SelectedLayer | null {
  if (!layerGroup) {
    return null;
  }

  let selectedLayer: SelectedLayer | null = null;
  layerGroup.eachLayer((layer) => {
    const candidate = layer as SelectedLayer;
    if (!candidate.feature || typeof candidate.getBounds !== "function") {
      return;
    }

    if (mode === "region" && candidate.feature.properties.region === selectedRegionName) {
      selectedLayer = candidate;
      return;
    }

    if (mode === "district") {
      const districtFeature = candidate.feature as DistrictFeature;
      if (districtFeature.properties.location_id === selectedDistrictId) {
        selectedLayer = candidate;
      }
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
  mode,
  selectedDistrictId,
  selectedRegionName,
  isDrawerOpen,
}: {
  geoJsonRef: MutableRefObject<L.GeoJSON | null>;
  mode: DashboardMode;
  selectedDistrictId: string | null;
  selectedRegionName: string | null;
  isDrawerOpen: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const selectedLayer = findSelectedLayer(geoJsonRef.current, mode, selectedDistrictId, selectedRegionName);
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
  }, [geoJsonRef, isDrawerOpen, map, mode, selectedDistrictId, selectedRegionName]);

  return null;
}

export function GhanaMap({
  mode,
  thematicMode,
  districtFeatures,
  regionFeatures,
  districtItemsById,
  regionItemsByName,
  seasonalMetricMode,
  calendarSubseason,
  selectedDistrictId,
  selectedRegionName,
  isDrawerOpen,
  onSelectDistrict,
  onSelectRegion,
}: {
  mode: DashboardMode;
  thematicMode: SeasonalTheme | null;
  districtFeatures: DistrictFeatureCollection;
  regionFeatures: RegionFeatureCollection;
  districtItemsById: Record<string, SeasonalMapAreaItem>;
  regionItemsByName: Record<string, SeasonalMapAreaItem>;
  seasonalMetricMode: SeasonalMode;
  calendarSubseason: CalendarSubseason | null;
  selectedDistrictId: string | null;
  selectedRegionName: string | null;
  isDrawerOpen: boolean;
  onSelectDistrict: (feature: DistrictFeature) => void;
  onSelectRegion: (regionName: string) => void;
}) {
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const hoveredLayerRef = useRef<InteractiveMapLayer | null>(null);
  const mapStateRef = useRef({
    mode,
    thematicMode,
    districtItemsById,
    regionItemsByName,
    selectedDistrictId,
    selectedRegionName,
  });

  mapStateRef.current = {
    mode,
    thematicMode,
    districtItemsById,
    regionItemsByName,
    selectedDistrictId,
    selectedRegionName,
  };

  function applyLayerStyle(layer: InteractiveMapLayer, isHovered = false) {
    if (!layer.feature) {
      return;
    }

    const {
      mode: currentMode,
      thematicMode: currentTheme,
      districtItemsById: currentDistrictItemsById,
      regionItemsByName: currentRegionItemsByName,
      selectedDistrictId: currentSelectedDistrictId,
      selectedRegionName: currentSelectedRegionName,
    } = mapStateRef.current;

    if (currentMode === "region") {
      const area = currentRegionItemsByName[layer.feature.properties.region] ?? null;
      const isSelected = layer.feature.properties.region === currentSelectedRegionName;
      layer.setStyle(regionAreaStyle(area, currentTheme, isSelected, isHovered && !isSelected));
      return;
    }

    const districtFeature = layer.feature as DistrictFeature;
    const area = currentDistrictItemsById[districtFeature.properties.location_id] ?? null;
    const isSelected = districtFeature.properties.location_id === currentSelectedDistrictId;
    layer.setStyle(districtAreaStyle(area, currentTheme, isSelected, isHovered && !isSelected));
  }

  function bringSelectedLayerToFront() {
    const { mode: currentMode, selectedDistrictId: currentSelectedDistrictId, selectedRegionName: currentSelectedRegionName } =
      mapStateRef.current;
    const selectedLayer = findSelectedLayer(
      geoJsonRef.current,
      currentMode,
      currentSelectedDistrictId,
      currentSelectedRegionName,
    );
    if (selectedLayer && "bringToFront" in selectedLayer) {
      (selectedLayer as L.Path).bringToFront();
    }
  }

  function clearHoveredLayer(targetLayer?: InteractiveMapLayer | null) {
    const layer = targetLayer ?? hoveredLayerRef.current;
    if (!layer || !layer.feature) {
      if (!targetLayer) {
        hoveredLayerRef.current = null;
      }
      return;
    }

    applyLayerStyle(layer);
    layer.closeTooltip?.();
    if (!targetLayer || hoveredLayerRef.current === layer) {
      hoveredLayerRef.current = null;
    }
    bringSelectedLayerToFront();
  }

  useEffect(() => {
    clearHoveredLayer();
    if (!geoJsonRef.current) {
      return;
    }

    geoJsonRef.current.eachLayer((layer) => {
      const mapLayer = layer as InteractiveMapLayer;
      if (!mapLayer.feature) {
        return;
      }

      applyLayerStyle(mapLayer);
    });
    bringSelectedLayerToFront();
  }, [
    districtItemsById,
    isDrawerOpen,
    mode,
    regionItemsByName,
    selectedDistrictId,
    selectedRegionName,
    thematicMode,
  ]);

  const handlers = useMemo(
    () => ({
      click: (event: LeafletMouseEvent) => {
        const target = event.target as InteractiveMapLayer;
        if (!target.feature) {
          return;
        }

        if (mapStateRef.current.mode === "region") {
          onSelectRegion(target.feature.properties.region);
          return;
        }

        onSelectDistrict(target.feature as DistrictFeature);
      },
      mouseover: (event: LeafletMouseEvent) => {
        const target = event.target as InteractiveMapLayer;
        if (!target.feature) {
          return;
        }

        if (hoveredLayerRef.current && hoveredLayerRef.current !== target) {
          clearHoveredLayer(hoveredLayerRef.current);
        }

        hoveredLayerRef.current = target;
        applyLayerStyle(target, true);
        target.bringToFront();
      },
      mouseout: (event: LeafletMouseEvent) => {
        const target = event.target as InteractiveMapLayer;
        if (hoveredLayerRef.current === target) {
          clearHoveredLayer(target);
        }
      },
    }),
    [
      onSelectDistrict,
      onSelectRegion,
    ],
  );

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
      <KeepSelectionVisible
        geoJsonRef={geoJsonRef}
        mode={mode}
        selectedDistrictId={selectedDistrictId}
        selectedRegionName={selectedRegionName}
        isDrawerOpen={isDrawerOpen}
      />
      <TileLayer
        attribution='Tiles &copy; CartoDB'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        opacity={0.28}
      />
      {mode === "region" ? (
        <GeoJSON
          key={`regions-${thematicMode}`}
          ref={(layer) => {
            geoJsonRef.current = layer;
          }}
          data={regionFeatures}
          style={(feature) =>
            regionAreaStyle(
              regionItemsByName[feature?.properties.region ?? ""] ?? null,
              thematicMode,
              feature?.properties.region === selectedRegionName,
            )
          }
          onEachFeature={(feature, layer) => {
            const themeMetric = regionItemsByName[feature.properties.region]?.metric;
            const variableLabel = themeMetric?.theme ? thematicTitle(themeMetric.theme) : thematicMode ? thematicTitle(thematicMode) : "Variable";
            const tooltipLabel =
              seasonalMetricMode === "calendar" && calendarSubseason ? `${variableLabel} (${calendarSubseason})` : variableLabel;
            layer.bindTooltip(
              `<strong>${feature.properties.region}</strong><br/>${tooltipLabel}: ${metricTooltipValue(regionItemsByName[feature.properties.region] ?? null)}`,
              {
                direction: "top",
                className: "district-tooltip",
              },
            );
            layer.on(handlers);
          }}
        />
      ) : (
        <>
          <GeoJSON
            key={`districts-${thematicMode}`}
            ref={(layer) => {
              geoJsonRef.current = layer;
            }}
            data={districtFeatures}
            style={(feature) =>
              districtAreaStyle(
                districtItemsById[feature?.properties.location_id ?? ""] ?? null,
                thematicMode,
                feature?.properties.location_id === selectedDistrictId,
              )
            }
            onEachFeature={(feature, layer) => {
              const themeMetric = districtItemsById[feature.properties.location_id]?.metric;
              const variableLabel = themeMetric?.theme ? thematicTitle(themeMetric.theme) : thematicMode ? thematicTitle(thematicMode) : "Variable";
              const tooltipLabel =
                seasonalMetricMode === "calendar" && calendarSubseason ? `${variableLabel} (${calendarSubseason})` : variableLabel;
              layer.bindTooltip(
                `<strong>${feature.properties.display_name}</strong><br/>${tooltipLabel}: ${metricTooltipValue(districtItemsById[feature.properties.location_id] ?? null)}`,
                {
                  direction: "top",
                  className: "district-tooltip",
                },
              );
              layer.on(handlers);
            }}
          />
          <GeoJSON
            key="district-region-outline"
            data={regionFeatures}
            interactive={false}
            style={() => ({
              fillOpacity: 0,
              color: "rgba(73, 88, 104, 0.46)",
              weight: 1.2,
              opacity: 1,
            })}
          />
        </>
      )}
    </MapContainer>
  );
}
