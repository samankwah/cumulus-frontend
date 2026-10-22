"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadMapData } from "@/lib/map-data";
import {
  availableLayers,
  dayIndexForDate,
  DEFAULT_SPELL_DAYS_RANGE,
  spellKindOf,
  defaultAggregation,
  layerAggregations,
  formatSubseasonalError,
  getSubseasonalAreaValues,
  getSubseasonalLayer,
  getSubseasonalModels,
  getSubseasonalRuns,
  CHANCE_THRESHOLDS,
  readUrlState,
  sampleSubseasonalArea,
  sampleSubseasonalPoint,
  subseasonalTileUrl,
  todayIso,
  writeUrlState,
} from "@/lib/subseasonal";
import type {
  LayerQuery,
  RainStat,
  SpellDays,
  SpellKind,
  SpellStat,
  SubseasonalAggregation,
  SubseasonalAreaLevel,
  SubseasonalAreaValues,
  SubseasonalLayer,
  SubseasonalLayerKey,
  SubseasonalModelOption,
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

  const [models, setModels] = useState<SubseasonalModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  // null = the backend's default model; a model is only requested once the URL has been read.
  const [model, setModelState] = useState<string | null>(null);
  const [isUrlRead, setIsUrlRead] = useState(false);
  const [stat, setStatState] = useState<RainStat>("mean");
  const [threshold, setThresholdState] = useState<number | null>(null);
  // Spell lengths the user chose (null = the official definition), and the spell statistic.
  const [spellDays, setSpellDaysState] = useState<SpellDays>({ dry: null, wet: null });
  const [spellStat, setSpellStatState] = useState<SpellStat>("chance");

  const [runs, setRuns] = useState<SubseasonalRun[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [isRunsLoading, setIsRunsLoading] = useState(false);
  const [runsAttempt, setRunsAttempt] = useState(0);

  const [layer, setLayerState] = useState<SubseasonalLayerKey>("rainfall");
  const [aggregation, setAggregationState] = useState<SubseasonalAggregation>("daily");
  const [day, setDayState] = useState<number>(0); // 0 = not chosen yet
  const [week, setWeekState] = useState<number>(0); // 0 = not chosen yet: the week holding today

  useEffect(() => {
    const fromUrl = readUrlState(window.location.search);
    initialUrlState.current = fromUrl;
    setModelState(fromUrl.model);
    if (fromUrl.stat) setStatState(fromUrl.stat);
    if (fromUrl.threshold) setThresholdState(fromUrl.threshold);
    if (fromUrl.spellDays) setSpellDaysState(fromUrl.spellDays);
    if (fromUrl.spellStat) setSpellStatState(fromUrl.spellStat);
    setIsUrlRead(true);
    setLayerState(fromUrl.layer);
    setAggregationState(fromUrl.aggregation);
    if (fromUrl.day) setDayState(fromUrl.day);
    if (fromUrl.week) setWeekState(fromUrl.week);
  }, []);

  const [layerMeta, setLayerMeta] = useState<SubseasonalLayer | null>(null);
  const [layerError, setLayerError] = useState<string | null>(null);
  const [layerAttempt, setLayerAttempt] = useState(0);
  // Tagged with the statistic they were fetched for, so map hover never shows the previous one's values.
  const [areaValues, setAreaValues] = useState<(SubseasonalAreaValues & { stat: string | null; threshold: number | null }) | null>(null);

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
  // The chosen period is shared by every layer; fall back only if this run does not offer it.
  const aggregations = useMemo(() => layerAggregations(run, layer), [layer, run]);
  const effectiveAggregation: SubseasonalAggregation = aggregations.includes(aggregation)
    ? aggregation
    : aggregations.includes(defaultAggregation(layer))
      ? defaultAggregation(layer)
      : aggregations[0];
  const index = effectiveAggregation === "daily" ? Math.max(day, 1) : effectiveAggregation === "weekly" ? week : 1;
  const indexCount = effectiveAggregation === "daily" ? dayCount : effectiveAggregation === "weekly" ? weekCount : 1;
  const hasTimeline = effectiveAggregation !== "total" && indexCount > 1;
  // Ensemble rainfall offers mean / median / chance; everything else maps one way.
  const isEnsembleRun = (run?.members ?? 1) > 1;
  const effectiveStat: RainStat | null = isEnsembleRun && layer === "rainfall" ? stat : null;
  const chanceThresholds = CHANCE_THRESHOLDS[effectiveAggregation];
  const effectiveThreshold =
    effectiveStat === "chance" ? (threshold !== null && chanceThresholds.includes(threshold) ? threshold : chanceThresholds[0]) : null;
  const requestModel = model && model !== defaultModel ? model : null;
  // Spell lengths: the official ones come from the run; a choice equal to them is not sent.
  const spellKind = spellKindOf(layer);
  const spellDefaults = useMemo(
    () => ({ dry: run?.thresholds.dry_spell_min_days ?? 5, wet: run?.thresholds.wet_spell_min_days ?? 3 }),
    [run],
  );
  const spellRange = run?.spell_days_range ?? DEFAULT_SPELL_DAYS_RANGE;
  const requestSpellDays = useMemo<SpellDays>(() => {
    const pick = (kind: SpellKind) => {
      const value = spellDays[kind];
      const [low, high] = spellRange[kind];
      return value !== null && value !== spellDefaults[kind] && value >= low && value <= high ? value : null;
    };
    return { dry: pick("dry"), wet: pick("wet") };
  }, [spellDays, spellDefaults, spellRange]);
  const spellSeriesKey = `${requestSpellDays.dry ?? ""}-${requestSpellDays.wet ?? ""}`;

  // A link to a layer this backend does not serve (e.g. onset on an older deployment) opens rainfall.
  useEffect(() => {
    if (run && !availableLayers(run).includes(layer)) {
      setLayerState("rainfall");
    }
  }, [layer, run]);

  // Hold the first query until the clamp below has picked the day, so the map does not fetch
  // day 1 only to abort it a moment later for today.
  const isTimeSettled =
    run !== null &&
    day >= 1 &&
    day <= Math.max(run.lead_days, 1) &&
    week >= 1 &&
    week <= Math.max(run.weeks.length, 1);
  const query = useMemo<LayerQuery | null>(
    () =>
      run && isTimeSettled
        ? {
            model: requestModel,
            runId: run.run_id,
            obs: run.observed_version ?? null,
            layer,
            aggregation: effectiveAggregation,
            index,
            stat: effectiveStat,
            threshold: effectiveThreshold,
            spellDays: spellKind ? requestSpellDays[spellKind] : null,
            spellStat: spellKind && effectiveAggregation !== "daily" ? spellStat : null,
          }
        : null,
    [effectiveAggregation, effectiveStat, effectiveThreshold, index, isTimeSettled, layer, requestModel, requestSpellDays, run, spellKind, spellStat],
  );
  const tileUrl = useMemo(() => (query ? subseasonalTileUrl(query) : null), [query]);

  /* ------------------------------------------------------------------ models (the picker) */
  useEffect(() => {
    if (!active) {
      return;
    }
    const controller = new AbortController();
    getSubseasonalModels(controller.signal)
      .then((payload) => {
        setModels(payload.models);
        setDefaultModel(payload.default_model);
      })
      .catch(() => {
        // Older backends have no model list: the picker stays hidden and the default model is shown.
      });
    return () => controller.abort();
  }, [active]);

  /* ------------------------------------------------------------------ runs */
  useEffect(() => {
    if (!active || !isUrlRead) {
      return;
    }
    const controller = new AbortController();
    setIsRunsLoading(true);
    setRunsError(null);
    getSubseasonalRuns(model, controller.signal)
      .then((payload) => {
        setRuns(payload.runs);
        const linked = initialUrlState.current?.run ?? null;
        setRunId((current) => {
          const wanted = current ?? linked;
          return wanted && payload.runs.some((item) => item.run_id === wanted) ? wanted : payload.active_run_id;
        });
        setActiveRunId(payload.active_run_id);
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
  }, [active, isUrlRead, model, runsAttempt]);

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
      .then((payload) => setAreaValues({ ...payload, stat: query.stat ?? null, threshold: query.threshold ?? null }))
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
        ? sampleSubseasonalPoint(requestModel, run.run_id, selection.latitude, selection.longitude, controller.signal, run.observed_version, requestSpellDays)
        : sampleSubseasonalArea(requestModel, run.run_id, selection.level, selection.name, controller.signal, run.observed_version, requestSpellDays);
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
    // requestSpellDays is read through spellSeriesKey, so an equal choice does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, requestModel, run, selection, seriesAttempt, spellSeriesKey]);

  // Geography mode switches clear an area selection made at the other level.
  useEffect(() => {
    setSelection((current) => {
      if (current?.kind === "area" && current.level !== areaLevel) {
        // Drop the old place's series too, or the drawer keeps its charts under "Pick a location".
        setSeries(null);
        return null;
      }
      return current;
    });
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
      model: requestModel,
      stat: effectiveStat,
      threshold: effectiveThreshold,
      run: run && run.run_id !== activeRunId ? run.run_id : null,
      spellDays: requestSpellDays,
      spellStat,
      layer,
      aggregation: effectiveAggregation,
      day: day || null,
      week,
      point: selection?.kind === "point" ? { latitude: selection.latitude, longitude: selection.longitude } : null,
      area: selection?.kind === "area" ? { level: selection.level, name: selection.name } : null,
    });
  }, [active, activeRunId, day, effectiveAggregation, effectiveStat, effectiveThreshold, layer, requestModel, requestSpellDays, run, selection, spellStat, week]);

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

  /** Jump the map to one day (drawer chart or calendar), on this layer when it has daily maps. */
  const seekDay = useCallback(
    (nextDay: number) => {
      setIsPlaying(false);
      if (!layerAggregations(run, layer).includes("daily")) {
        setLayerState("rainfall");
      }
      setAggregationState("daily");
      setDayState(Math.min(Math.max(1, nextDay), Math.max(dayCount, 1)));
    },
    [dayCount, layer, run],
  );

  /** Switch the forecast issue date, keeping the shown calendar day when the new run covers it. */
  const selectRun = useCallback(
    (nextRunId: string) => {
      const next = runs.find((item) => item.run_id === nextRunId);
      if (!next || next.run_id === run?.run_id) {
        return;
      }
      const shownDate = run?.days.find((item) => item.day === day)?.date ?? todayIso();
      const sameDay = dayIndexForDate(next, shownDate);
      setIsPlaying(false);
      setDayState(sameDay ?? 1);
      setSeries(null);
      setRunId(next.run_id);
    },
    [day, run, runs],
  );

  /** Switch forecast model: its newest run, keeping the layer, period and selected place. */
  const selectModel = useCallback(
    (nextModel: string) => {
      if (nextModel === (model ?? defaultModel) || !models.some((item) => item.id === nextModel && item.available)) {
        return;
      }
      setIsPlaying(false);
      setSeries(null);
      setLayerMeta(null);
      setRunId(null);
      setRuns([]);
      setModelState(nextModel === defaultModel ? null : nextModel);
    },
    [defaultModel, model, models],
  );

  const setStat = useCallback((next: RainStat) => setStatState(next), []);
  const setSpellDays = useCallback((kind: SpellKind, next: number) => {
    setSpellDaysState((current) => (current[kind] === next ? current : { ...current, [kind]: next }));
  }, []);
  const setSpellStat = useCallback((next: SpellStat) => setSpellStatState(next), []);
  const setThreshold = useCallback((next: number) => setThresholdState(next), []);

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
    /** Every configured model for the picker (those without runs yet are shown disabled); empty on older backends. */
    models,
    model: model ?? defaultModel,
    selectModel,
    /** Ensemble rainfall statistic (null when the layer or run has no choice). */
    stat: effectiveStat,
    setStat,
    threshold: effectiveThreshold,
    chanceThresholds,
    setThreshold,
    /** The shown layer's spell kind (null for other layers), its chosen length and the choices. */
    spellKind,
    spellDays: { dry: requestSpellDays.dry ?? spellDefaults.dry, wet: requestSpellDays.wet ?? spellDefaults.wet },
    spellDefaults,
    spellRange,
    setSpellDays,
    /** Spell layers, for a week or the run: chance of a spell, or days in spells. */
    spellStat,
    setSpellStat,
    runs,
    run,
    activeRunId,
    selectRun,
    runsError,
    isRunsLoading,
    retryRuns: () => setRunsAttempt((value) => value + 1),
    layer,
    setLayer,
    aggregation: effectiveAggregation,
    /** Periods this layer offers in the current run, in display order. */
    aggregations,
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
