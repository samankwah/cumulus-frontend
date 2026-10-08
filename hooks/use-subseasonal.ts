"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadMapData } from "@/lib/map-data";
import {
  dayIndexForDate,
  formatSubseasonalError,
  getSubseasonalAreaValues,
  getSubseasonalLayer,
  getSubseasonalRuns,
  readUrlState,
  sampleSubseasonalArea,
  sampleSubseasonalPoint,
  subseasonalTileUrl,
  todayIso,
  writeUrlState,
} from "@/lib/subseasonal";
import type {
  LayerQuery,
  SubseasonalAggregation,
  SubseasonalAreaLevel,
  SubseasonalAreaValues,
  SubseasonalLayer,
  SubseasonalLayerKey,
  SubseasonalRun,
  SubseasonalSeries,
  SubseasonalUrlState,
} from "@/lib/subseasonal";

export const PLAYBACK_STEP_MS = 700;

export type SubseasonalSelection =
  | { kind: "point"; latitude: number; longitude: number }
  | { kind: "area"; level: SubseasonalAreaLevel; name: string; regionName: string; geographyKey: string; latitude: number; longitude: number };

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useSubseasonal({
  active,
  areaLevel,
  onRestoreAreaLevel,
}: {
  active: boolean;
  areaLevel: SubseasonalAreaLevel;
  /** A shared link names a region or district; the map's geography mode must follow it to outline the area. */
  onRestoreAreaLevel?: (level: SubseasonalAreaLevel) => void;
}) {
  // The page is prerendered without a query string, so the URL is applied after mount;
  // reading it during render would make the first client render differ from the HTML.
  const initialUrlState = useRef<SubseasonalUrlState | null>(null);

  const [runs, setRuns] = useState<SubseasonalRun[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [isRunsLoading, setIsRunsLoading] = useState(false);
  const [runsAttempt, setRunsAttempt] = useState(0);

  const [layer, setLayerState] = useState<SubseasonalLayerKey>("rainfall");
  const [aggregation, setAggregationState] = useState<SubseasonalAggregation>("daily");
  const [day, setDayState] = useState<number>(0); // 0 = not chosen yet
  const [week, setWeekState] = useState<number>(1);

  useEffect(() => {
    const fromUrl = readUrlState(window.location.search);
    initialUrlState.current = fromUrl;
    setLayerState(fromUrl.layer);
    setAggregationState(fromUrl.aggregation);
    if (fromUrl.day) setDayState(fromUrl.day);
    if (fromUrl.week) setWeekState(fromUrl.week);
  }, []);

  const [layerMeta, setLayerMeta] = useState<SubseasonalLayer | null>(null);
  const [layerError, setLayerError] = useState<string | null>(null);
  const [layerAttempt, setLayerAttempt] = useState(0);
  const [areaValues, setAreaValues] = useState<SubseasonalAreaValues | null>(null);

  const [selection, setSelection] = useState<SubseasonalSelection | null>(null);
  const [series, setSeries] = useState<SubseasonalSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [isSeriesLoading, setIsSeriesLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [seriesAttempt, setSeriesAttempt] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loadedTileUrl, setLoadedTileUrl] = useState<string | null>(null);

  const run = useMemo(() => runs.find((item) => item.run_id === runId) ?? null, [runId, runs]);
  const dayCount = run?.lead_days ?? 0;
  const weekCount = run?.weeks.length ?? 0;
  const effectiveAggregation: SubseasonalAggregation = layer === "rainfall" ? aggregation : "total";
  const index = effectiveAggregation === "daily" ? Math.max(day, 1) : effectiveAggregation === "weekly" ? week : 1;
  const indexCount = effectiveAggregation === "daily" ? dayCount : effectiveAggregation === "weekly" ? weekCount : 1;
  const hasTimeline = effectiveAggregation !== "total" && indexCount > 1;

  const query = useMemo<LayerQuery | null>(
    () => (run ? { runId: run.run_id, layer, aggregation: effectiveAggregation, index } : null),
    [effectiveAggregation, index, layer, run],
  );
  const tileUrl = useMemo(() => (query ? subseasonalTileUrl(query) : null), [query]);

  /* ------------------------------------------------------------------ runs */
  useEffect(() => {
    if (!active) {
      return;
    }
    const controller = new AbortController();
    setIsRunsLoading(true);
    setRunsError(null);
    getSubseasonalRuns(controller.signal)
      .then((payload) => {
        setRuns(payload.runs);
        setRunId((current) => (current && payload.runs.some((item) => item.run_id === current) ? current : payload.active_run_id));
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) {
          setRunsError(formatSubseasonalError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRunsLoading(false);
        }
      });
    return () => controller.abort();
  }, [active, runsAttempt]);

  // Clamp the time selection to the run, defaulting to "today" when the run covers it.
  useEffect(() => {
    if (!run) {
      return;
    }
    setDayState((current) => {
      if (current >= 1 && current <= run.lead_days) {
        return current;
      }
      return dayIndexForDate(run, todayIso()) ?? 1;
    });
    setWeekState((current) => {
      if (current >= 1 && current <= run.weeks.length) {
        return current;
      }
      const today = dayIndexForDate(run, todayIso());
      const match = today ? run.weeks.find((item) => today >= item.start_day && today <= item.end_day) : null;
      return match?.week ?? 1;
    });
  }, [run]);

  /* ------------------------------------------------------------------ layer metadata (legend, title, stats) */
  useEffect(() => {
    if (!active || !query) {
      return;
    }
    const controller = new AbortController();
    setLayerError(null);
    getSubseasonalLayer(query, controller.signal)
      .then((payload) => setLayerMeta(payload))
      .catch((error: unknown) => {
        if (!isAbort(error)) {
          setLayerError(formatSubseasonalError(error, "map layer"));
        }
      });
    return () => controller.abort();
  }, [active, query, layerAttempt]);

  /* ------------------------------------------------------------------ hover values for the current geography level */
  useEffect(() => {
    if (!active || !query) {
      return;
    }
    const controller = new AbortController();
    getSubseasonalAreaValues({ ...query, level: areaLevel }, controller.signal)
      .then((payload) => setAreaValues(payload))
      .catch(() => {
        // Hover values are an enhancement; the map stays usable without them.
      });
    return () => controller.abort();
  }, [active, areaLevel, query]);

  /* ------------------------------------------------------------------ point / area series */
  useEffect(() => {
    if (!active || !run || !selection) {
      return;
    }
    const controller = new AbortController();
    setIsSeriesLoading(true);
    setSeriesError(null);
    const request =
      selection.kind === "point"
        ? sampleSubseasonalPoint(run.run_id, selection.latitude, selection.longitude, controller.signal)
        : sampleSubseasonalArea(run.run_id, selection.level, selection.name, controller.signal);
    request
      .then((payload) => setSeries(payload))
      .catch((error: unknown) => {
        if (!isAbort(error)) {
          setSeries(null);
          setSeriesError(formatSubseasonalError(error, "location forecast"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSeriesLoading(false);
        }
      });
    return () => controller.abort();
  }, [active, run, selection, seriesAttempt]);

  // Geography mode switches clear an area selection made at the other level.
  useEffect(() => {
    setSelection((current) => (current?.kind === "area" && current.level !== areaLevel ? null : current));
  }, [areaLevel]);

  /* ------------------------------------------------------------------ deep-link restore (once the run is known) */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!run || restoredRef.current || !initialUrlState.current) {
      return;
    }
    restoredRef.current = true;
    const { point, area } = initialUrlState.current;
    if (area) {
      setSelection({ kind: "area", level: area.level, name: area.name, regionName: area.name, geographyKey: area.name, latitude: 0, longitude: 0 });
      setIsDrawerOpen(true);
      onRestoreAreaLevel?.(area.level);
      // Resolve the map's feature key so the restored area is highlighted and kept in view.
      void loadMapData().then((mapData) => {
        const wanted = area.name.toLowerCase();
        const district = area.level === "district" ? mapData.districts.find((item) => item.name.toLowerCase() === wanted) : null;
        const region = area.level === "region" ? mapData.regions.find((item) => item.name.toLowerCase() === wanted) : null;
        const match = district ?? region;
        if (!match) {
          return;
        }
        const regionName: string = district ? district.region : match.name;
        const geographyKey: string = district ? district.locationId : match.name;
        setSelection((current) =>
          current?.kind === "area" && current.name === area.name
            ? { ...current, name: match.name, regionName, geographyKey, latitude: match.latitude, longitude: match.longitude }
            : current,
        );
      });
    } else if (point) {
      setSelection({ kind: "point", latitude: point.latitude, longitude: point.longitude });
      setIsDrawerOpen(true);
    }
  }, [run]);

  /* ------------------------------------------------------------------ URL sync */
  useEffect(() => {
    if (!active || !restoredRef.current) {
      return;
    }
    writeUrlState({
      view: "subseasonal",
      layer,
      aggregation: effectiveAggregation,
      day: day || null,
      week,
      point: selection?.kind === "point" ? { latitude: selection.latitude, longitude: selection.longitude } : null,
      area: selection?.kind === "area" ? { level: selection.level, name: selection.name } : null,
    });
  }, [active, day, effectiveAggregation, layer, selection, week]);

  /* ------------------------------------------------------------------ playback: advance only after the current frame's tiles loaded */
  const lastStepRef = useRef(0);
  useEffect(() => {
    if (!isPlaying || !hasTimeline) {
      return;
    }
    if (loadedTileUrl !== tileUrl) {
      return; // wait for tiles
    }
    const elapsed = performance.now() - lastStepRef.current;
    const handle = window.setTimeout(() => {
      lastStepRef.current = performance.now();
      if (effectiveAggregation === "daily") {
        setDayState((current) => (current >= dayCount ? 1 : current + 1));
      } else {
        setWeekState((current) => (current >= weekCount ? 1 : current + 1));
      }
    }, Math.max(0, PLAYBACK_STEP_MS - elapsed));
    return () => window.clearTimeout(handle);
  }, [dayCount, effectiveAggregation, hasTimeline, isPlaying, loadedTileUrl, tileUrl, weekCount]);

  useEffect(() => {
    if (!hasTimeline || !active) {
      setIsPlaying(false);
    }
  }, [active, hasTimeline]);

  /* ------------------------------------------------------------------ actions */
  const setIndex = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(1, Math.round(next)), Math.max(indexCount, 1));
      if (effectiveAggregation === "daily") {
        setDayState(clamped);
      } else if (effectiveAggregation === "weekly") {
        setWeekState(clamped);
      }
    },
    [effectiveAggregation, indexCount],
  );

  const setLayer = useCallback((next: SubseasonalLayerKey) => {
    setLayerState(next);
    setIsPlaying(false);
  }, []);

  const setAggregation = useCallback(
    (next: SubseasonalAggregation) => {
      // Keep the time context when switching daily <-> weekly.
      if (run && next === "weekly" && aggregation === "daily") {
        const match = run.weeks.find((item) => day >= item.start_day && day <= item.end_day);
        if (match) setWeekState(match.week);
      } else if (run && next === "daily" && aggregation === "weekly") {
        const match = run.weeks.find((item) => item.week === week);
        if (match) setDayState(match.start_day);
      }
      setAggregationState(next);
      setIsPlaying(false);
    },
    [aggregation, day, run, week],
  );

  /** Jump the map to one day's rainfall (from the drawer chart or calendar). */
  const seekDay = useCallback(
    (nextDay: number) => {
      setIsPlaying(false);
      setLayerState("rainfall");
      setAggregationState("daily");
      setDayState(Math.min(Math.max(1, nextDay), Math.max(dayCount, 1)));
    },
    [dayCount],
  );

  const selectPoint = useCallback((latitude: number, longitude: number) => {
    setSelection({ kind: "point", latitude, longitude });
    setSeries(null);
    setIsDrawerOpen(true);
  }, []);

  const selectArea = useCallback(
    (level: SubseasonalAreaLevel, name: string, regionName: string, geographyKey: string, latitude: number, longitude: number) => {
      setSelection({ kind: "area", level, name, regionName, geographyKey, latitude, longitude });
      setSeries(null);
      setIsDrawerOpen(true);
    },
    [],
  );

  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const clearSelection = useCallback(() => {
    setSelection(null);
    setSeries(null);
    setSeriesError(null);
    setIsDrawerOpen(false);
  }, []);

  return {
    runs,
    run,
    runsError,
    isRunsLoading,
    retryRuns: () => setRunsAttempt((value) => value + 1),
    layer,
    setLayer,
    aggregation: effectiveAggregation,
    setAggregation,
    index,
    indexCount,
    setIndex,
    seekDay,
    hasTimeline,
    query,
    tileUrl,
    layerMeta,
    layerError,
    retryLayer: () => setLayerAttempt((value) => value + 1),
    areaValues,
    isPlaying,
    setIsPlaying,
    togglePlaying: () => setIsPlaying((value) => !value),
    onTilesLoaded: setLoadedTileUrl,
    selection,
    series,
    seriesError,
    isSeriesLoading,
    retrySeries: () => setSeriesAttempt((value) => value + 1),
    isDrawerOpen,
    closeDrawer,
    clearSelection,
    selectPoint,
    selectArea,
  };
}

export type SubseasonalState = ReturnType<typeof useSubseasonal>;
