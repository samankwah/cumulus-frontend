"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatApiError, getActiveSeasonalMap } from "@/lib/api";
import { calendarSubseasonOptions, requiresCalendarSubseason, supportsCalendarMode } from "@/lib/dashboard";
import { loadMapData } from "@/lib/map-data";
import type {
  CalendarSubseason,
  DashboardMode,
  DistrictFeature,
  DistrictFeatureCollection,
  DistrictMetadata,
  RegionFeatureCollection,
  SeasonProfile,
  SeasonalMapAreaItem,
  SeasonalProductRequest,
  SeasonalMode,
  SeasonalMapProduct,
  SeasonalMapSelection,
  SeasonalTheme,
} from "@/lib/types";

const DEFAULT_REFRESH_INTERVAL_SECONDS = 1800;

function buildProductRequest(
  theme: SeasonalTheme,
  seasonProfile: SeasonProfile,
  seasonalMetricMode: SeasonalMode,
  calendarSubseason: CalendarSubseason | null,
): SeasonalProductRequest {
  return {
    theme,
    seasonProfile,
    seasonalMetricMode,
    calendarSubseason: seasonalMetricMode === "calendar" ? calendarSubseason : null,
  };
}

export function useCumulusDashboard() {
  const [mode, setMode] = useState<DashboardMode>("region");
  const [thematicMode, setThematicMode] = useState<SeasonalTheme | null>(null);
  const [seasonProfile, setSeasonProfile] = useState<SeasonProfile | null>(null);
  const [calendarSubseason, setCalendarSubseason] = useState<CalendarSubseason | null>(null);
  const [districtFeatures, setDistrictFeatures] = useState<DistrictFeatureCollection | null>(null);
  const [regionFeatures, setRegionFeatures] = useState<RegionFeatureCollection | null>(null);
  const [districts, setDistricts] = useState<DistrictMetadata[]>([]);
  const [districtsByRegion, setDistrictsByRegion] = useState<Record<string, DistrictMetadata[]>>({});
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [product, setProduct] = useState<SeasonalMapProduct | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [requestedProduct, setRequestedProduct] = useState<SeasonalProductRequest | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedGeography, setSelectedGeography] = useState<SeasonalMapSelection | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const fetchIdRef = useRef(0);
  const seasonalMetricMode: SeasonalMode = supportsCalendarMode(thematicMode) ? "calendar" : "seasonal";
  const isCalendarSubseasonRequired = requiresCalendarSubseason(thematicMode);
  const isCalendarSubseasonValid =
    !seasonProfile || !calendarSubseason || calendarSubseasonOptions(seasonProfile).includes(calendarSubseason);
  const isSubseasonSelectionMissing = Boolean(
    thematicMode && seasonProfile && isCalendarSubseasonRequired && (!calendarSubseason || !isCalendarSubseasonValid),
  );
  const productConfigurationMessage = isSubseasonSelectionMissing
    ? "Select a sub-season to load the published calendar-based product for this seasonal regime."
    : null;

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      try {
        const response = await loadMapData();
        if (ignore) {
          return;
        }
        setDistrictFeatures(response.districtFeatures);
        setRegionFeatures(response.regionFeatures);
        setDistricts(response.districts);
        setDistrictsByRegion(response.districtsByRegion);
        setMapError(null);
      } catch (error) {
        if (!ignore) {
          setMapError(error instanceof Error ? error.message : "Failed to load Ghana map assets.");
        }
      } finally {
        if (!ignore) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, []);

  const fetchProduct = useCallback(
    async (
      nextTheme: SeasonalTheme,
      nextSeasonProfile: SeasonProfile,
      nextMetricMode: "seasonal" | "calendar",
      nextSubseason: CalendarSubseason | null,
      options?: { background?: boolean },
    ) => {
      const requestId = fetchIdRef.current + 1;
      const request = buildProductRequest(nextTheme, nextSeasonProfile, nextMetricMode, nextSubseason);
      fetchIdRef.current = requestId;
      setRequestedProduct(request);
      setProductError(null);

      if (options?.background) {
        setIsRefreshing(true);
      } else {
        setIsProductLoading(true);
        setProduct(null);
      }

      try {
        const payload = await getActiveSeasonalMap(
          request.theme,
          request.seasonProfile,
          request.seasonalMetricMode,
          request.calendarSubseason,
        );
        if (fetchIdRef.current !== requestId) {
          return;
        }
        setProduct(payload);
        setProductError(null);
      } catch (error) {
        if (fetchIdRef.current !== requestId) {
          return;
        }
        if (!options?.background) {
          setProduct(null);
        }
        setProductError(formatApiError(error));
      } finally {
        if (fetchIdRef.current === requestId) {
          setIsProductLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!thematicMode || !seasonProfile) {
      setProduct(null);
      setProductError(null);
      setRequestedProduct(null);
      setIsProductLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (isSubseasonSelectionMissing) {
      setProduct(null);
      setProductError(null);
      setRequestedProduct(null);
      setIsProductLoading(false);
      setIsRefreshing(false);
      return;
    }

    void fetchProduct(thematicMode, seasonProfile, seasonalMetricMode, calendarSubseason);
  }, [calendarSubseason, fetchProduct, isSubseasonSelectionMissing, seasonProfile, seasonalMetricMode, thematicMode]);

  useEffect(() => {
    if (!thematicMode || !seasonProfile || !product || isSubseasonSelectionMissing) {
      return;
    }

    const intervalSeconds = product?.refresh_interval_seconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
    const handle = window.setInterval(() => {
      void fetchProduct(thematicMode, seasonProfile, seasonalMetricMode, calendarSubseason, { background: true });
    }, intervalSeconds * 1000);
    return () => {
      window.clearInterval(handle);
    };
  }, [
    calendarSubseason,
    fetchProduct,
    isSubseasonSelectionMissing,
    product?.refresh_interval_seconds,
    seasonProfile,
    seasonalMetricMode,
    thematicMode,
  ]);

  useEffect(() => {
    if (!thematicMode || !supportsCalendarMode(thematicMode)) {
      setCalendarSubseason(null);
    }
  }, [thematicMode]);

  useEffect(() => {
    if (!seasonProfile || !calendarSubseason) {
      return;
    }
    const available = calendarSubseasonOptions(seasonProfile);
    if (!available.includes(calendarSubseason)) {
      setCalendarSubseason(null);
    }
  }, [calendarSubseason, seasonProfile]);

  const districtItemsById = useMemo(
    () => Object.fromEntries((product?.district_items ?? []).map((item) => [item.location_id, item])),
    [product?.district_items],
  );
  const regionItemsByName = useMemo(
    () => Object.fromEntries((product?.region_items ?? []).map((item) => [item.geography_name, item])),
    [product?.region_items],
  );
  const selectedDistrictId = selectedGeography?.geographyType === "district" ? selectedGeography.geographyKey : null;
  const selectedRegionName = selectedGeography?.geographyType === "region" ? selectedGeography.geographyKey : null;

  const selectedDistrict = useMemo(() => {
    if (!selectedDistrictId) {
      return null;
    }
    return districts.find((district) => district.locationId === selectedDistrictId) ?? null;
  }, [districts, selectedDistrictId]);

  const selectedArea = useMemo<SeasonalMapAreaItem | null>(() => {
    if (!product || !selectedGeography) {
      return null;
    }
    return selectedGeography.geographyType === "district"
      ? districtItemsById[selectedGeography.geographyKey] ?? null
      : regionItemsByName[selectedGeography.geographyKey] ?? null;
  }, [districtItemsById, product, regionItemsByName, selectedGeography]);

  function clearSelection() {
    setSelectedGeography(null);
    setIsDrawerOpen(false);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  function changeMode(nextMode: DashboardMode) {
    if (nextMode === mode) {
      return;
    }
    setMode(nextMode);
    clearSelection();
  }

  function selectDistrict(feature: DistrictFeature) {
    setSelectedGeography({
      geographyType: "district",
      geographyKey: feature.properties.location_id,
      geographyName: feature.properties.display_name,
      regionName: feature.properties.region,
    });
    setIsDrawerOpen(true);
  }

  function selectRegion(regionName: string) {
    setSelectedGeography({
      geographyType: "region",
      geographyKey: regionName,
      geographyName: regionName,
      regionName,
    });
    setIsDrawerOpen(true);
  }

  function changeSeasonProfile(nextProfile: SeasonProfile | null) {
    if (nextProfile === seasonProfile) {
      return;
    }
    setSeasonProfile(nextProfile);
  }

  function changeThematicMode(nextTheme: SeasonalTheme | null) {
    if (nextTheme === thematicMode) {
      return;
    }
    setThematicMode(nextTheme);
    if (!nextTheme || !supportsCalendarMode(nextTheme)) {
      setCalendarSubseason(null);
    }
  }

  function changeCalendarSubseason(nextSubseason: CalendarSubseason | null) {
    if (nextSubseason === calendarSubseason) {
      return;
    }
    setCalendarSubseason(nextSubseason);
  }

  const retryProduct = useCallback(() => {
    if (!thematicMode || !seasonProfile || isSubseasonSelectionMissing) {
      return;
    }
    void fetchProduct(thematicMode, seasonProfile, seasonalMetricMode, calendarSubseason);
  }, [calendarSubseason, fetchProduct, isSubseasonSelectionMissing, seasonProfile, seasonalMetricMode, thematicMode]);

  return {
    mode,
    setMode: changeMode,
    thematicMode,
    setThematicMode: changeThematicMode,
    seasonProfile,
    setSeasonProfile: changeSeasonProfile,
    seasonalMetricMode,
    calendarSubseason,
    setCalendarSubseason: changeCalendarSubseason,
    districtFeatures,
    regionFeatures,
    districtsByRegion,
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
    selectedDistrict,
    selectedDistrictId,
    selectedRegionName,
    selectedArea,
    districtItemsById,
    regionItemsByName,
    thematicLegend: product?.legend ?? [],
    retryProduct,
    selectDistrict,
    selectRegion,
    closeDrawer,
    clearSelection,
  };
}
