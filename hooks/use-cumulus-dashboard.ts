"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatApiError,
  getActiveForecastDeterministicProduct,
  getActiveForecastProbabilityProduct,
  getForecastProductOptions,
  sampleForecastDeterministic,
  sampleForecastProbability,
} from "@/lib/api";
import { DEFAULT_THEMATIC_OPTIONS } from "@/lib/dashboard";
import type {
  CalendarSubseason,
  DashboardMode,
  ForecastArtifactTheme,
  ForecastDeterministicSample,
  ForecastGeographySelection,
  ForecastMapProduct,
  ForecastPointSelection,
  ForecastProbabilitySample,
  ForecastThemeOption,
  ForecastViewMode,
  RegionMetadata,
  SeasonProfile,
} from "@/lib/types";

const DEFAULT_REFRESH_INTERVAL_SECONDS = 1800;

export function useCumulusDashboard() {
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("region");
  const [viewMode, setViewMode] = useState<ForecastViewMode>("probabilistic");
  const [thematicMode, setThematicMode] = useState<ForecastArtifactTheme | null>(null);
  const [themeOptions, setThemeOptions] = useState<ForecastThemeOption[]>(DEFAULT_THEMATIC_OPTIONS);
  const [seasonProfile, setSeasonProfile] = useState<SeasonProfile | null>(null);
  const [subseason, setSubseason] = useState<CalendarSubseason | null>(null);
  const [product, setProduct] = useState<ForecastMapProduct | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedPoint, setSelectedPoint] = useState<ForecastPointSelection | null>(null);
  const [selectedGeography, setSelectedGeography] = useState<ForecastGeographySelection | null>(null);
  const [sample, setSample] = useState<ForecastProbabilitySample | ForecastDeterministicSample | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [isSampleLoading, setIsSampleLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchIdRef = useRef(0);
  const sampleIdRef = useRef(0);
  const activeThemeOption = useMemo(
    () =>
      thematicMode
        ? themeOptions.find((item) => item.theme === thematicMode) ?? DEFAULT_THEMATIC_OPTIONS.find((item) => item.theme === thematicMode) ?? null
        : null,
    [themeOptions, thematicMode],
  );

  const loadProduct = useCallback(
    async (
      theme: ForecastArtifactTheme,
      nextViewMode: ForecastViewMode,
      selectedSeasonProfile: SeasonProfile | null,
      selectedSubseason: CalendarSubseason | null,
      options?: { background?: boolean },
    ) => {
      const requestId = fetchIdRef.current + 1;
      fetchIdRef.current = requestId;
      setProductError(null);
      if (options?.background) {
        setIsRefreshing(true);
      } else {
        setIsProductLoading(true);
        setProduct(null);
      }

      try {
        const payload =
          nextViewMode === "probabilistic"
            ? await getActiveForecastProbabilityProduct(theme, selectedSeasonProfile, selectedSubseason)
            : await getActiveForecastDeterministicProduct(theme, selectedSeasonProfile, selectedSubseason);
        if (fetchIdRef.current !== requestId) {
          return;
        }
        setProduct(payload);
      } catch (error) {
        if (fetchIdRef.current !== requestId) {
          return;
        }
        if (!options?.background) {
          setProduct(null);
        }
        setProductError(formatApiError(error, nextViewMode === "probabilistic" ? "probability" : "deterministic"));
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
    let ignore = false;
    async function loadOptions() {
      try {
        const options = await getForecastProductOptions();
        if (ignore || !options.length) {
          return;
        }
        setThemeOptions(options);
        setThematicMode((current) => {
          const matching = current ? options.find((item) => item.theme === current && item.enabled) : null;
          if (matching) {
            return matching.theme;
          }
          return null;
        });
      } catch {
        if (!ignore) {
          setThemeOptions(DEFAULT_THEMATIC_OPTIONS);
        }
      }
    }
    void loadOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!activeThemeOption) {
      setSeasonProfile(null);
      setSubseason(null);
      return;
    }
    if (activeThemeOption.requires_season) {
      setSeasonProfile((current) => {
        return current && activeThemeOption.seasons.includes(current) ? current : null;
      });
    } else {
      setSeasonProfile(null);
    }

    if (activeThemeOption.requires_subseason) {
      setSubseason((current) => {
        return current && activeThemeOption.subseasons.includes(current) ? current : null;
      });
    } else {
      setSubseason(null);
    }
  }, [activeThemeOption]);

  const loadSample = useCallback(
    async (
      theme: ForecastArtifactTheme,
      nextViewMode: ForecastViewMode,
      selectedSeasonProfile: SeasonProfile | null,
      selectedSubseason: CalendarSubseason | null,
      point: ForecastPointSelection,
      options?: { keepDrawerOpen?: boolean },
    ) => {
      const requestId = sampleIdRef.current + 1;
      sampleIdRef.current = requestId;
      setSelectedPoint(point);
      setSampleError(null);
      setIsSampleLoading(true);
      if (options?.keepDrawerOpen !== false) {
        setIsDrawerOpen(true);
      }

      try {
        const payload =
          nextViewMode === "probabilistic"
            ? await sampleForecastProbability(theme, point.latitude, point.longitude, selectedSeasonProfile, selectedSubseason)
            : await sampleForecastDeterministic(theme, point.latitude, point.longitude, selectedSeasonProfile, selectedSubseason);
        if (sampleIdRef.current !== requestId) {
          return;
        }
        setSample(payload);
      } catch (error) {
        if (sampleIdRef.current !== requestId) {
          return;
        }
        setSample(null);
        setSampleError(formatApiError(error, nextViewMode === "probabilistic" ? "probability" : "deterministic"));
      } finally {
        if (sampleIdRef.current === requestId) {
          setIsSampleLoading(false);
        }
      }
    },
    [],
  );

  const selectionReady = Boolean(
    thematicMode &&
      activeThemeOption &&
      activeThemeOption.enabled &&
      (!activeThemeOption.requires_season || seasonProfile) &&
      (!activeThemeOption.requires_subseason || subseason),
  );

  useEffect(() => {
    if (!thematicMode || !activeThemeOption) {
      setProduct(null);
      setProductError(null);
      setIsProductLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (!selectionReady) {
      setProduct(null);
      setProductError(null);
      return;
    }
    void loadProduct(thematicMode, viewMode, seasonProfile, subseason);
  }, [activeThemeOption, loadProduct, seasonProfile, selectionReady, subseason, thematicMode, viewMode]);

  useEffect(() => {
    const refreshIntervalSeconds = product?.refresh_interval_seconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
    const handle = window.setInterval(() => {
      if (!selectionReady || !thematicMode) {
        return;
      }
      void loadProduct(thematicMode, viewMode, seasonProfile, subseason, { background: true });
    }, refreshIntervalSeconds * 1000);
    return () => window.clearInterval(handle);
  }, [loadProduct, product?.refresh_interval_seconds, seasonProfile, selectionReady, subseason, thematicMode, viewMode]);

  useEffect(() => {
    if (!selectedPoint || !selectionReady || !thematicMode) {
      return;
    }
    void loadSample(thematicMode, viewMode, seasonProfile, subseason, selectedPoint, { keepDrawerOpen: isDrawerOpen });
  }, [isDrawerOpen, loadSample, seasonProfile, selectionReady, selectedPoint, subseason, thematicMode, viewMode]); // intentionally refresh current point on theme/tab switch

  useEffect(() => {
    setSelectedGeography(null);
    setSelectedPoint(null);
    setSample(null);
    setSampleError(null);
    setIsSampleLoading(false);
    setIsDrawerOpen(false);
    sampleIdRef.current += 1;
  }, [dashboardMode]);

  const retryProduct = useCallback(() => {
    if (!selectionReady || !thematicMode) {
      return;
    }
    void loadProduct(thematicMode, viewMode, seasonProfile, subseason);
  }, [loadProduct, seasonProfile, selectionReady, subseason, thematicMode, viewMode]);

  const retrySample = useCallback(() => {
    if (!selectedPoint || !selectionReady || !thematicMode) {
      return;
    }
    void loadSample(thematicMode, viewMode, seasonProfile, subseason, selectedPoint);
  }, [loadSample, seasonProfile, selectionReady, selectedPoint, subseason, thematicMode, viewMode]);

  const legend = useMemo(() => {
    if (!product) {
      return [];
    }
    if ("legend" in product) {
      return product.legend;
    }
    return product.color_ramp;
  }, [product]);

  const currentSamplePoint = useMemo<ForecastPointSelection | null>(() => {
    if (sample) {
      return { latitude: sample.nearest_latitude, longitude: sample.nearest_longitude };
    }
    return selectedPoint;
  }, [sample, selectedPoint]);

  return {
    viewMode,
    setViewMode,
    dashboardMode,
    setDashboardMode,
    thematicMode,
    setThematicMode,
    themeOptions,
    activeThemeOption,
    seasonProfile,
    setSeasonProfile,
    subseason,
    setSubseason,
    product,
    productError,
    isProductLoading,
    isRefreshing,
    selectedPoint,
    selectedGeography,
    currentSamplePoint,
    sample,
    sampleError,
    isSampleLoading,
    isDrawerOpen,
    legend,
    setIsDrawerOpen,
    closeDrawer: () => setIsDrawerOpen(false),
    retryProduct,
    retrySample,
    selectDistrict: (
      geographyKey: string,
      geographyName: string,
      regionName: string,
      latitude: number,
      longitude: number,
    ) => {
      if (!selectionReady || !thematicMode) {
        return;
      }
      setSelectedGeography({
        mode: "district",
        geographyKey,
        geographyName,
        regionName,
        latitude,
        longitude,
      });
      void loadSample(thematicMode, viewMode, seasonProfile, subseason, { latitude, longitude });
    },
    selectRegion: (region: RegionMetadata) => {
      if (!selectionReady || !thematicMode) {
        return;
      }
      setSelectedGeography({
        mode: "region",
        geographyKey: region.name,
        geographyName: region.name,
        regionName: region.name,
        latitude: region.latitude,
        longitude: region.longitude,
      });
      void loadSample(thematicMode, viewMode, seasonProfile, subseason, {
        latitude: region.latitude,
        longitude: region.longitude,
      });
    },
    selectPoint: (latitude: number, longitude: number) => {
      if (!selectionReady || !thematicMode) {
        return;
      }
      setSelectedGeography(null);
      void loadSample(thematicMode, viewMode, seasonProfile, subseason, { latitude, longitude });
    },
  };
}
