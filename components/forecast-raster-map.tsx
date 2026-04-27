"use client";

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { LatLngBounds, LatLngBoundsExpression, LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Pane, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { loadMapData } from "@/lib/map-data";
import type {
  DashboardMode,
  DistrictFeature,
  DistrictFeatureCollection,
  ForecastGeographySelection,
  ForecastMapProduct,
  ForecastPointSelection,
  RegionFeature,
  RegionFeatureCollection,
  RegionMetadata,
} from "@/lib/types";

const GHANA_BOUNDS: LatLngBoundsExpression = [
  [4.2, -3.3],
  [11.2, 1.4],
];
const MAP_PADDING_TOP_LEFT: [number, number] = [36, 48];
const MAP_PADDING_BOTTOM_RIGHT: [number, number] = [36, 48];
const DRAWER_CLEARANCE = 28;
const CHARCOAL_STROKE = "rgba(24, 35, 31, 0.94)";
const CHARCOAL_STROKE_SOFT = "rgba(24, 35, 31, 0.78)";
const CHARCOAL_HALO = "rgba(73, 90, 83, 0.46)";

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
  useMapEvents({
    click(event) {
      onSelectPoint(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

type SelectedLayer = L.Layer & {
  feature?: DistrictFeature | RegionFeature;
  getBounds?: () => LatLngBounds;
};

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
    fillColor: isSelected ? "rgba(255, 214, 124, 0.18)" : "rgba(255, 255, 255, 0.08)",
    color: isSelected ? CHARCOAL_STROKE : CHARCOAL_STROKE_SOFT,
    weight: isSelected ? 2 : 1.25,
    opacity: 1,
    fillOpacity: isSelected ? 0.18 : 0.05,
  };
}

function regionHaloStyle(isSelected: boolean) {
  return {
    fillOpacity: 0,
    color: isSelected ? CHARCOAL_STROKE_SOFT : CHARCOAL_HALO,
    weight: isSelected ? 3 : 2.2,
    opacity: 1,
  };
}

function districtStyle(isSelected: boolean) {
  return {
    fillColor: isSelected ? "rgba(255, 240, 185, 0.18)" : "rgba(255, 255, 255, 0.03)",
    color: isSelected ? CHARCOAL_STROKE : CHARCOAL_STROKE_SOFT,
    weight: isSelected ? 1.8 : 0.75,
    opacity: 1,
    fillOpacity: isSelected ? 0.18 : 0.03,
  };
}

function ForecastMapOverlay({
  dashboardMode,
  selectedGeography,
  onSelectDistrict,
  onSelectRegion,
}: {
  dashboardMode: DashboardMode;
  selectedGeography: ForecastGeographySelection | null;
  onSelectDistrict: (geographyKey: string, geographyName: string, regionName: string, latitude: number, longitude: number) => void;
  onSelectRegion: (region: RegionMetadata) => void;
}) {
  const [districtFeatures, setDistrictFeatures] = useState<DistrictFeatureCollection | null>(null);
  const [regionFeatures, setRegionFeatures] = useState<RegionFeatureCollection | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

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
            key={`forecast-regions-${selectedGeography?.geographyKey ?? "none"}`}
            ref={(layer) => {
              geoJsonRef.current = layer;
            }}
            data={regionFeatures}
            style={(feature) => regionStyle(feature?.properties.region === selectedGeography?.geographyKey)}
            onEachFeature={(feature, layer) => {
              layer.bindTooltip(`<strong>${feature.properties.region}</strong><br/>Sample region representative point`, {
                direction: "top",
                className: "district-tooltip",
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
            key={`forecast-districts-${selectedGeography?.geographyKey ?? "none"}`}
            ref={(layer) => {
              geoJsonRef.current = layer;
            }}
            data={districtFeatures}
            style={(feature) => districtStyle(feature?.properties.location_id === selectedGeography?.geographyKey)}
            onEachFeature={(feature, layer) => {
              layer.bindTooltip(`<strong>${feature.properties.display_name}</strong><br/>Sample district representative point`, {
                direction: "top",
                className: "district-tooltip",
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
              color: CHARCOAL_STROKE_SOFT,
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
  product,
  selectedPoint,
  selectedGeography,
  onSelectDistrict,
  onSelectPoint,
  onSelectRegion,
}: {
  dashboardMode: DashboardMode;
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
      <Pane name="forecast-raster-pane" style={{ zIndex: 320 }}>
        {product ? <TileLayer url={product.tile_url} opacity={0.94} pane="forecast-raster-pane" /> : null}
      </Pane>
      <Pane name="forecast-feature-pane" style={{ zIndex: 470 }}>
        <ForecastMapOverlay
          dashboardMode={dashboardMode}
          selectedGeography={selectedGeography}
          onSelectDistrict={onSelectDistrict}
          onSelectRegion={onSelectRegion}
        />
      </Pane>
      <Pane name="forecast-selection-pane" style={{ zIndex: 520 }}>
        {selectedPoint ? (
          <CircleMarker
            center={[selectedPoint.latitude, selectedPoint.longitude]}
            radius={8}
            pathOptions={{
              color: "#fff4cd",
              weight: 2,
              fillColor: "#12231d",
              fillOpacity: 0.88,
            }}
          />
        ) : null}
      </Pane>
    </MapContainer>
  );
}
