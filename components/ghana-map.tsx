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

function regionStyle(color: string, isSelected: boolean, isThemed: boolean, isHovered = false) {
  return {
    fillColor: color,
    color: isSelected ? "#ffe3a6" : isHovered ? "rgba(255, 246, 217, 0.98)" : "rgba(240, 245, 241, 0.88)",
    weight: isSelected ? 5.6 : isHovered ? 4.1 : 2.7,
    opacity: 1,
    fillOpacity: isSelected ? 0.78 : isHovered && isThemed ? 0.64 : 0.48,
  };
}

function districtStyle(color: string, isSelected: boolean, isThemed: boolean, isHovered = false) {
  return {
    fillColor: color,
    color: isSelected ? "#ffd36f" : isHovered ? "rgba(255, 244, 201, 0.94)" : "rgba(233, 240, 236, 0.82)",
    weight: isSelected ? 3.8 : isHovered ? 2.8 : 1.4,
    opacity: 1,
    fillOpacity: isSelected ? 0.9 : isHovered && isThemed ? 0.78 : 0.64,
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

  useEffect(() => {
    if (!geoJsonRef.current) {
      return;
    }

    geoJsonRef.current.eachLayer((layer) => {
      const mapLayer = layer as L.Path & { feature?: MapFeature };
      if (!mapLayer.feature) {
        return;
      }

      if (mode === "region") {
        const area = regionItemsByName[mapLayer.feature.properties.region] ?? null;
        const isSelected = mapLayer.feature.properties.region === selectedRegionName;
        mapLayer.setStyle(regionAreaStyle(area, thematicMode, isSelected));
        if (isSelected) {
          mapLayer.bringToFront();
        }
        return;
      }

      const districtFeature = mapLayer.feature as DistrictFeature;
      const area = districtItemsById[districtFeature.properties.location_id] ?? null;
      mapLayer.setStyle(districtAreaStyle(area, thematicMode, districtFeature.properties.location_id === selectedDistrictId));
      if (districtFeature.properties.location_id === selectedDistrictId) {
        mapLayer.bringToFront();
      }
    });
  }, [
    districtItemsById,
    mode,
    regionItemsByName,
    selectedDistrictId,
    selectedRegionName,
    thematicMode,
  ]);

  const handlers = useMemo(
    () => ({
      click: (event: LeafletMouseEvent) => {
        const target = event.target as L.Path & { feature?: MapFeature };
        if (!target.feature) {
          return;
        }

        if (mode === "region") {
          onSelectRegion(target.feature.properties.region);
          return;
        }

        onSelectDistrict(target.feature as DistrictFeature);
      },
      mouseover: (event: LeafletMouseEvent) => {
        const target = event.target as L.Path & { feature?: MapFeature };
        if (!target.feature) {
          return;
        }

        if (mode === "region") {
          const isSelected = target.feature.properties.region === selectedRegionName;
          const area = regionItemsByName[target.feature.properties.region] ?? null;
          target.setStyle(regionAreaStyle(area, thematicMode, isSelected, !isSelected));
          return;
        }

        const districtFeature = target.feature as DistrictFeature;
        const isSelected = districtFeature.properties.location_id === selectedDistrictId;
        const area = districtItemsById[districtFeature.properties.location_id] ?? null;
        target.setStyle(districtAreaStyle(area, thematicMode, isSelected, !isSelected));
        target.bringToFront();
      },
      mouseout: (event: LeafletMouseEvent) => {
        const target = event.target as L.Path & { feature?: MapFeature };
        if (!target.feature) {
          return;
        }

        if (mode === "region") {
          const area = regionItemsByName[target.feature.properties.region] ?? null;
          target.setStyle(regionAreaStyle(area, thematicMode, target.feature.properties.region === selectedRegionName));
          return;
        }

        const districtFeature = target.feature as DistrictFeature;
        const area = districtItemsById[districtFeature.properties.location_id] ?? null;
        target.setStyle(districtAreaStyle(area, thematicMode, districtFeature.properties.location_id === selectedDistrictId));
      },
    }),
    [
      districtItemsById,
      mode,
      onSelectDistrict,
      onSelectRegion,
      regionItemsByName,
      selectedDistrictId,
      selectedRegionName,
      thematicMode,
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
        opacity={0.46}
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
              `<strong>${feature.properties.region}</strong><br/>${tooltipLabel}: ${themeMetric?.category_label ?? "Pending"}`,
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
                `<strong>${feature.properties.display_name}</strong><br/>${tooltipLabel}: ${themeMetric?.category_label ?? "Pending"}`,
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
              color: "rgba(21, 34, 29, 0.58)",
              weight: 1.4,
              opacity: 1,
            })}
          />
        </>
      )}
    </MapContainer>
  );
}
