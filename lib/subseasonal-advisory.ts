import { DEFAULT_ADVISORY_CONTENT } from "@/lib/content/advisory-content";
import type {
  AdvisoryContent,
  AdvisoryGroup,
  Confidence,
  CropProfile,
  SeasonPeriod,
  Sector,
  Stage,
} from "@/lib/content/advisory-content";
import { fillTemplate } from "@/lib/content/advisory-messages";
import type { AdvisoryMessageId, MessageVars } from "@/lib/content/advisory-messages";
import { formatAmount, formatDay, formatRange, todayIso } from "@/lib/subseasonal";
import type { SubseasonalDay, SubseasonalLayerKey, SubseasonalSeries, SubseasonalSpell } from "@/lib/subseasonal";

export type { AdvisoryGroup, Confidence, CropProfile } from "@/lib/content/advisory-content";

/* ------------------------------------------------------------------------------------------
 * Farm advisories for the 46-day outlook.
 *
 * Nothing here is canned per layer: the advice is composed from
 *   1. where the place is      → Ghana's rainfall sector (unimodal north vs bimodal south, split at
 *                                8°N as in backend configs/seasonal_map.yaml),
 *   2. when it is              → the season phase on today's date, and so the likely crop stage,
 *   3. which crop              → chosen by the viewer,
 *   4. what the forecast shows → dated windows found in the daily series from today onwards
 *                                (planting, spraying, fertilizer, drying, heavy rain, spells, end of rains).
 * The selected map layer decides which of those signals leads.
 *
 * The thresholds, calendar, crops and every sentence come from AdvisoryContent
 * (lib/content/advisory-content.ts), which forecasters can edit on the admin pages.
 *
 * Planting and end-of-rains use the backend definitions (configs/advisory.yaml): onset = 20 mm in
 * 3 days with no 7-day dry run in the next 10; cessation = 14 days totalling 10 mm or less.
 * The onset layer instead follows the backend's mapped onset (series.onset: 20 mm within 3 days,
 * no dry spell over 10 days in the next 30), so the advice matches the date on the map.
 * Lead time sets confidence: the model's own guidance is that day-to-day detail beyond ~10 days
 * is indicative only.
 * ------------------------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------------------ crops */

/** A crop's key from AdvisoryContent.crops ("all", "maize", ...). */
export type CropKey = string;

export function cropFor(content: AdvisoryContent, key: CropKey): CropProfile {
  return content.crops.find((crop) => crop.key === key) ?? content.crops[0];
}

export function isCropKey(value: unknown, content: AdvisoryContent = DEFAULT_ADVISORY_CONTENT): value is CropKey {
  return typeof value === "string" && content.crops.some((crop) => crop.key === value);
}

/* ---------------------------------------------------------------------------- place & season */

type SeasonContext = {
  sector: Sector;
  sectorLabel: string;
  season: string;
  stage: Stage;
  stageLabel: string;
};

function sectorFor(series: SubseasonalSeries, sectors: AdvisoryContent["sectors"]): Sector {
  const latitude = series.latitude ?? series.nearest_latitude;
  if (latitude !== null && latitude !== undefined) {
    if (latitude >= sectors.northernLatitude) {
      return "north";
    }
    return latitude >= sectors.transitionLatitude ? "transition" : "south";
  }
  const region = series.region ?? series.name;
  if (sectors.northernRegions.includes(region)) return "north";
  return sectors.transitionRegions.includes(region) ? "transition" : "south";
}

/** Month-day as a sortable number, e.g. 15 Aug → 815. */
function monthDay(iso: string) {
  return Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
}

/**
 * The calendar entry in force on a date: the last one starting on or before it, or, before the
 * year's first entry, the last entry (carried over from the previous year).
 */
function periodOn(calendar: SeasonPeriod[], md: number): SeasonPeriod | undefined {
  const sorted = [...calendar].sort((a, b) => a.from.localeCompare(b.from));
  let current = sorted[sorted.length - 1];
  for (const period of sorted) {
    if (monthDay(`0000-${period.from}`) <= md) current = period;
  }
  return current;
}

/** Season calendar: see AdvisoryContent.calendar. The transition zone follows the southern one. */
function seasonFor(
  content: AdvisoryContent,
  sector: Sector,
  iso: string,
  crop: CropProfile,
): Omit<SeasonContext, "sector" | "sectorLabel"> {
  const { calendar } = content;
  const table =
    sector === "north"
      ? crop.lateHarvest
        ? calendar.northLateHarvest
        : calendar.north
      : crop.lateHarvest
        ? calendar.southLateHarvest
        : calendar.south;
  const period: Pick<SeasonPeriod, "season" | "stage"> = periodOn(table, monthDay(iso)) ?? { season: "", stage: "growing" };
  const stageLabel = period.stage === "critical" ? crop.criticalStage : content.stageLabels[period.stage];
  return { season: period.season, stage: period.stage, stageLabel };
}

/* -------------------------------------------------------------------------- forecast windows */

export type AdvisoryAction = {
  /** Short date label ("Thu 9 Oct", "9–11 Oct") or "Now". */
  when: string;
  /** ISO date the action keys on, for ordering; null for "Now" and standing advice. */
  date: string | null;
  text: string;
  confidence: Confidence;
  group: AdvisoryGroup;
  /** Last ISO date the action applies to (a spell's end, or the forecast's end for "From …"); null for one day. */
  end: string | null;
};

export type AdvisoryTone = "high" | "mid" | "low";

/**
 * Laid out like an agrometeorological advisory bulletin (WMO practice): the period it is valid for,
 * the weather outlook, the expected impact on farming, then dated advice by group with confidence.
 */
export type SubseasonalAdvisory = {
  tone: AdvisoryTone;
  headline: string;
  context: { sector: string; season: string; stage: string };
  /** First and last forecast day the advice covers (today to the end of the "possible" range). */
  validity: { from: string; to: string } | null;
  /** The weather expected over the validity period, in one plain sentence. */
  outlook: string | null;
  /** What that weather means for farming at this stage of the season. */
  impact: string | null;
  actions: AdvisoryAction[];
  /** The forecast signals the advice rests on, as plain facts. */
  signals: string[];
};

type Run = { start: SubseasonalDay; end: SubseasonalDay; days: number };

/** Writes a message from its template, with the chosen crop's words always available. */
type Writer = (id: AdvisoryMessageId, vars?: MessageVars) => string;

function writerFor(content: AdvisoryContent, crop: CropProfile): { t: Writer; setStage: (stage: string) => void } {
  const base: MessageVars = {
    crop: crop.noun,
    cropLabel: crop.label,
    criticalStage: crop.criticalStage,
    harvestRisk: crop.harvestRisk,
    dryPests: crop.dryPests,
    wetDiseases: crop.wetDiseases,
  };
  return {
    t: (id, vars) => fillTemplate(content.messages[id] ?? "", vars ? { ...base, ...vars } : base),
    setStage: (stage) => {
      base.stage = stage;
    },
  };
}

function rain(day: SubseasonalDay | undefined) {
  return day?.value ?? 0;
}

function shortRange(start: string, end: string) {
  return start === end ? formatDay(start, "weekday") : formatRange(start, end);
}

/** Marks standing advice ("Now"): it has no date even when it keys on a forecast day. */
const NOW = Symbol("now");
type When = string | typeof NOW;

class Forecast {
  readonly days: SubseasonalDay[];
  readonly wetDayMm: number;
  readonly limits: AdvisoryContent["thresholds"];
  readonly t: Writer;

  constructor(series: SubseasonalSeries, today: string, limits: AdvisoryContent["thresholds"], t: Writer) {
    this.days = series.days.filter((day) => day.date >= today);
    this.wetDayMm = series.thresholds.wet_day_mm;
    this.limits = limits;
    this.t = t;
  }

  confidence(day: SubseasonalDay): Confidence {
    const lead = this.days.indexOf(day);
    if (lead < this.limits.likelyLeadDays) return "likely";
    return lead < this.limits.possibleLeadDays ? "possible" : "outlook";
  }

  total(count: number) {
    return this.days.slice(0, count).reduce((sum, day) => sum + rain(day), 0);
  }

  /** Runs of consecutive days with less than `limitMm`, at least `minDays` long. */
  dryRuns(limitMm: number, minDays: number): Run[] {
    const runs: Run[] = [];
    let start = -1;
    this.days.forEach((day, index) => {
      const dry = day.value !== null && rain(day) < limitMm;
      if (dry && start < 0) start = index;
      const last = index === this.days.length - 1;
      if (start >= 0 && (!dry || last)) {
        const endIndex = dry && last ? index : index - 1;
        const length = endIndex - start + 1;
        if (length >= minDays) {
          runs.push({ start: this.days[start], end: this.days[endIndex], days: length });
        }
        start = -1;
      }
    });
    return runs;
  }

  /** Backend onset rule applied from today: a planting rain that is not followed by a long dry run. */
  plantingRain(): { day: SubseasonalDay; total: number; falseStartRisk: boolean } | null {
    const { onsetWindowDays, onsetThresholdMm, onsetGuardDays, onsetGuardDryDays } = this.limits;
    for (let index = 0; index + onsetWindowDays <= this.days.length; index += 1) {
      const window = this.days.slice(index, index + onsetWindowDays);
      const total = window.reduce((sum, day) => sum + rain(day), 0);
      if (total < onsetThresholdMm) continue;
      const guard = this.days.slice(index, index + onsetGuardDays);
      let run = 0;
      let longest = 0;
      guard.forEach((day) => {
        run = rain(day) < this.wetDayMm ? run + 1 : 0;
        longest = Math.max(longest, run);
      });
      return { day: this.days[index], total, falseStartRisk: longest >= onsetGuardDryDays };
    }
    return null;
  }

  /** Backend cessation rule: first 14-day stretch with 10 mm or less. */
  endOfRains(): SubseasonalDay | null {
    const { cessationWindowDays, cessationThresholdMm } = this.limits;
    for (let index = 0; index + cessationWindowDays <= this.days.length; index += 1) {
      const total = this.days.slice(index, index + cessationWindowDays).reduce((sum, day) => sum + rain(day), 0);
      if (total <= cessationThresholdMm) return this.days[index];
    }
    return null;
  }

  /** First day with moist soil behind it and no wash-off rain the next two days. */
  fertilizerDay(): SubseasonalDay | null {
    for (let index = 0; index < this.days.length - 2; index += 1) {
      const before = this.days.slice(Math.max(0, index - 3), index + 1).reduce((sum, day) => sum + rain(day), 0);
      const after = this.days.slice(index + 1, index + 3);
      if (before >= this.limits.moistSoilMm && after.every((day) => rain(day) < this.limits.heavyDayMm / 2)) {
        return this.days[index];
      }
    }
    return null;
  }

  /** The last forecast day, for advice that runs to the end of the forecast. */
  lastDate() {
    return this.days[this.days.length - 1]?.date ?? null;
  }

  heavyDays() {
    return this.days.filter((day) => rain(day) >= this.limits.heavyDayMm);
  }

  spells(series: SubseasonalSeries, kind: "dry" | "wet") {
    const first = this.days[0]?.day ?? 1;
    return series.spells.filter((spell) => spell.kind === kind && spell.end_day >= first);
  }

  dayOf(spell: SubseasonalSpell) {
    return this.days.find((day) => day.day === Math.max(spell.start_day, this.days[0]?.day ?? 1)) ?? this.days[0];
  }

  /** A spell already under way today. */
  ongoing(spell: SubseasonalSpell) {
    return spell.start_day <= (this.days[0]?.day ?? 1);
  }

  /** Date label for a spell, counted from today if it has already begun. */
  spellLabel(spell: SubseasonalSpell) {
    if (!this.ongoing(spell)) {
      return shortRange(spell.start_date, spell.end_date);
    }
    return spell.end_date === this.days[0]?.date
      ? this.t("when.today")
      : this.t("when.until", { date: formatDay(spell.end_date, "short") });
  }
}

/* ------------------------------------------------------------------------------ composition */

type Draft = {
  tone: AdvisoryTone;
  headline: string;
  actions: AdvisoryAction[];
  signals: string[];
};

function action(
  forecast: Forecast,
  day: SubseasonalDay | null,
  when: When,
  text: string,
  group: AdvisoryGroup = "crops",
  end: string | null = null,
): AdvisoryAction {
  return {
    when: when === NOW ? forecast.t("when.now") : when,
    date: day && when !== NOW ? day.date : null,
    text,
    confidence: day ? forecast.confidence(day) : "likely",
    group,
    end,
  };
}

/** "From 8 Oct". */
function fromLabel(forecast: Forecast, iso: string) {
  return forecast.t("when.from", { date: formatDay(iso, "short") });
}

/** "Before 8 Oct". */
function beforeLabel(forecast: Forecast, iso: string) {
  return forecast.t("when.before", { date: formatDay(iso, "short") });
}

/** Long dry stretches read as "From 8 Oct" rather than a month-long range. */
function runLabel(forecast: Forecast, run: Run) {
  return run.days > 7 ? fromLabel(forecast, run.start.date) : shortRange(run.start.date, run.end.date);
}

/** Spell dates for the "why" list: "8–12 Oct", or "under way until 12 Oct". */
function spellFact(forecast: Forecast, spell: SubseasonalSpell) {
  return forecast.ongoing(spell)
    ? forecast.t("spell.until", { date: formatDay(spell.end_date, "short") })
    : shortRange(spell.start_date, spell.end_date);
}

/** Windows for spraying/weeding/harvest, shared by several layers. */
function fieldWorkActions(forecast: Forecast, stage: Stage): AdvisoryAction[] {
  const { t, limits } = forecast;
  const sprayRuns = forecast.dryRuns(limits.washOffMm, limits.sprayWindowDays).slice(0, 2);
  const actions: AdvisoryAction[] = [];
  if (stage === "harvest") {
    const drying = forecast.dryRuns(forecast.wetDayMm, limits.dryingWindowDays)[0];
    if (drying) {
      actions.push(
        action(
          forecast,
          drying.start,
          runLabel(forecast, drying),
          drying.days > 7 ? t("advice.harvestDryLong", { days: drying.days }) : t("advice.harvestDryShort", { days: drying.days }),
        ),
      );
      const nextDrying = forecast.dryRuns(forecast.wetDayMm, limits.dryingWindowDays)[1];
      // Once the rains are ending every day dries produce; a second window adds nothing.
      if (nextDrying && !forecast.endOfRains()) {
        actions.push(
          action(forecast, nextDrying.start, runLabel(forecast, nextDrying), t("advice.secondDryWindow"), "crops", nextDrying.end.date),
        );
      }
    }
  }
  // At harvest a drying window already covers field work; fall back to short rain-free gaps.
  if (sprayRuns.length && (stage !== "harvest" || !actions.length)) {
    const first = sprayRuns[0];
    const next = sprayRuns[1] ? ` ${t("advice.nextDryDays", { dates: runLabel(forecast, sprayRuns[1]) })}` : "";
    actions.push(
      action(forecast, first.start, runLabel(forecast, first), stage === "harvest" ? t("advice.clearField") : `${t("advice.sprayOnDryDays")}${next}`),
    );
  }
  return actions;
}

function rainfallDraft(forecast: Forecast, crop: CropProfile, ctx: SeasonContext): Draft {
  const { t, limits } = forecast;
  const twoWeeks = forecast.total(limits.nearTermDays);
  const span = Math.min(limits.nearTermDays, forecast.days.length);
  const planting = forecast.plantingRain();
  const heavy = forecast.heavyDays();
  const end = forecast.endOfRains();
  const fertilizer = forecast.fertilizerDay();
  const signals = [t("signal.rainTotal", { amount: formatAmount(twoWeeks, "mm"), days: span })];
  const actions: AdvisoryAction[] = [];
  let tone: AdvisoryTone = "low";
  let headline: string;

  if (ctx.stage === "harvest") {
    const drying = forecast.dryRuns(forecast.wetDayMm, limits.dryingWindowDays)[0];
    headline = drying ? t("headline.harvestFrom", { date: formatDay(drying.start.date, "weekday") }) : t("headline.fewDryDaysToHarvest");
    tone = drying ? "low" : "high";
    actions.push(...fieldWorkActions(forecast, "harvest"));
    if (!drying) {
      actions.push(action(forecast, null, NOW, t("advice.harvestBetweenShowers")));
    }
    if (end) {
      actions.push(action(forecast, end, fromLabel(forecast, end.date), t("advice.rainsEnding"), "crops", forecast.lastDate()));
      signals.push(t("signal.endOfRains", { mm: limits.cessationThresholdMm, date: formatDay(end.date, "weekday") }));
    }
  } else if (ctx.stage === "planting" || ctx.stage === "land_prep") {
    if (planting && !planting.falseStartRisk) {
      headline = t("headline.plantingRain", { date: formatDay(planting.day.date, "weekday") });
      actions.push(action(forecast, planting.day, formatDay(planting.day.date, "weekday"), t("advice.plantAfterRain")));
    } else if (planting) {
      tone = "mid";
      headline = t("headline.falseStart");
      actions.push(
        action(forecast, planting.day, formatDay(planting.day.date, "weekday"), t("advice.falseStart", { days: limits.onsetGuardDryDays })),
      );
    } else {
      tone = "high";
      headline = t("headline.noPlantingRain");
      actions.push(action(forecast, null, NOW, t("advice.holdSeed")));
    }
    if (planting) {
      signals.push(t("signal.plantingRain", { amount: formatAmount(planting.total, "mm"), date: formatDay(planting.day.date, "weekday") }));
    }
  } else if (ctx.stage === "dry_season") {
    const wet = twoWeeks >= limits.onsetThresholdMm;
    headline = wet ? t("headline.outOfSeasonRain") : t("headline.littleRain");
    tone = wet ? "mid" : "low";
    actions.push(action(forecast, null, NOW, wet ? t("advice.outOfSeasonRain") : t("advice.irrigateDrySeason")));
  } else {
    const short = twoWeeks < limits.onsetThresholdMm;
    headline = short ? t("headline.tooLittleRain", { days: span }) : t("headline.enoughRain", { days: span });
    tone = short ? (crop.droughtHardy ? "mid" : "high") : "low";
    if (short) {
      actions.push(action(forecast, null, NOW, crop.droughtHardy ? t("advice.keepWeedsDown") : t("advice.mulchAndIrrigate")));
    }
    if (fertilizer && !crop.likesWater) {
      actions.push(action(forecast, fertilizer, formatDay(fertilizer.date, "weekday"), t("advice.topDress")));
    }
  }

  heavy.slice(0, 2).forEach((day) => {
    const amount = formatAmount(day.value, "mm");
    actions.push(
      action(
        forecast,
        day,
        formatDay(day.date, "weekday"),
        crop.likesWater ? t("advice.heavyRainWaterCrop", { amount }) : t("advice.heavyRain", { amount }),
      ),
    );
  });
  if (heavy.length) {
    signals.push(t(heavy.length === 1 ? "signal.heavyDaysOne" : "signal.heavyDaysMany", { count: heavy.length, mm: limits.heavyDayMm }));
  }
  return { tone, headline, actions, signals };
}

function rainyDaysDraft(forecast: Forecast, crop: CropProfile, ctx: SeasonContext): Draft {
  const { t, limits } = forecast;
  const span = Math.min(limits.nearTermDays, forecast.days.length);
  const window = forecast.days.slice(0, span);
  const rainy = window.filter((day) => rain(day) >= forecast.wetDayMm).length;
  const share = span ? rainy / span : 0;
  const signals = [t("signal.rainyDays", { rainDays: rainy, days: span, mm: forecast.wetDayMm })];
  const actions = fieldWorkActions(forecast, ctx.stage);
  let tone: AdvisoryTone = "low";
  let headline: string;

  if (share > limits.manyRainDaysShare) {
    tone = ctx.stage === "harvest" ? "high" : "mid";
    headline = actions.length ? t("headline.fewDryDaysUse", { when: actions[0].when }) : t("headline.almostNoDryDays");
    if (!actions.length) {
      actions.push(action(forecast, null, NOW, ctx.stage === "harvest" ? t("advice.postponeSprayingHarvest") : t("advice.postponeSpraying")));
    }
    actions.push(action(forecast, null, t("when.allPeriod"), t("advice.checkWetDiseasesFrequentRain"), "pests"));
  } else if (share < limits.fewRainDaysShare && ctx.stage !== "harvest" && ctx.stage !== "dry_season") {
    tone = crop.droughtHardy ? "mid" : "high";
    headline = t("headline.fewRainDays");
    actions.unshift(action(forecast, null, NOW, t("advice.waterEveryFewDays")));
  } else {
    headline = ctx.stage === "harvest" ? t("headline.enoughDryDaysToHarvest") : t("headline.enoughDryDays");
  }
  return { tone, headline, actions, signals };
}

function drySpellDraft(forecast: Forecast, series: SubseasonalSeries, crop: CropProfile, ctx: SeasonContext): Draft {
  const { t, limits } = forecast;
  const spells = forecast.spells(series, "dry");
  const minDays = series.thresholds.dry_spell_min_days;
  const first = spells[0];
  const longest = spells.reduce<SubseasonalSpell | null>((best, spell) => (!best || spell.days > best.days ? spell : best), null);

  if (!first || !longest) {
    return {
      tone: "low",
      headline: t("headline.noDrySpell"),
      actions: [action(forecast, null, NOW, ctx.stage === "planting" ? t("advice.noDrySpellPlanting") : t("advice.noDrySpellWaterEnough"))],
      signals: [t("signal.noDrySpell", { days: minDays })],
    };
  }

  const signals = spells
    .slice(0, 3)
    .map((spell) => t(spell.open_end ? "signal.drySpellOpen" : "signal.drySpell", { days: spell.days, dates: spellFact(forecast, spell) }));
  const start = forecast.dayOf(first);
  const actions: AdvisoryAction[] = [];
  let tone: AdvisoryTone;
  let headline: string;

  if (ctx.stage === "harvest" || ctx.stage === "dry_season") {
    tone = "low";
    headline = forecast.ongoing(first)
      ? t("headline.dryNowGoodForDrying")
      : t("headline.dryFromGoodForDrying", { date: formatDay(first.start_date, "weekday") });
    actions.push(action(forecast, start, forecast.spellLabel(first), t("advice.sunDry"), "crops", first.end_date));
    if (ctx.stage === "dry_season") {
      actions.push(action(forecast, null, NOW, t("advice.protectStoredGrain")));
    }
  } else if (ctx.stage === "planting" || ctx.stage === "land_prep") {
    tone = "high";
    headline = forecast.ongoing(first)
      ? t("headline.doNotPlantSoilsDrying")
      : t("headline.doNotPlantDrySpellFrom", { date: formatDay(first.start_date, "weekday") });
    actions.push(
      action(
        forecast,
        start,
        t("when.until", { date: formatDay(first.end_date, "short") }),
        t("advice.doNotPlantBeforeSpellEnds"),
        "crops",
        first.end_date,
      ),
    );
    actions.push(action(forecast, null, NOW, t("advice.prepareLandForRain")));
  } else {
    const severe = longest.days >= minDays + limits.severeDrySpellExtraDays || ctx.stage === "critical";
    tone = crop.droughtHardy ? "mid" : severe ? "high" : "mid";
    headline =
      ctx.stage === "critical"
        ? t("headline.drySpellCritical")
        : forecast.ongoing(longest)
          ? t("headline.drySpellNow", { days: longest.days })
          : t("headline.drySpellFrom", { days: longest.days, date: formatDay(longest.start_date, "weekday") });
    actions.push(
      action(forecast, start, forecast.spellLabel(first), crop.droughtHardy ? t("advice.droughtHardyCope") : t("advice.irrigateInSpell")),
    );
    if (ctx.stage === "critical" && !crop.droughtHardy) {
      actions.push(action(forecast, start, forecast.spellLabel(first), t("advice.waterCriticalFirst"), "crops", first.end_date));
    }
    const next = spells[1];
    if (next && !crop.droughtHardy) {
      actions.push(action(forecast, forecast.dayOf(next), forecast.spellLabel(next), t("advice.anotherDrySpell"), "crops", next.end_date));
    }
    if (ctx.stage === "growing") {
      // Top-dressing happens in the vegetative stage; by flowering it is too late to matter.
      actions.push(
        action(forecast, start, forecast.ongoing(first) ? NOW : beforeLabel(forecast, first.start_date), t("advice.noTopDressDrySoil")),
      );
    }
  }
  return { tone, headline, actions, signals };
}

function wetSpellDraft(forecast: Forecast, series: SubseasonalSeries, crop: CropProfile, ctx: SeasonContext): Draft {
  const { t } = forecast;
  const spells = forecast.spells(series, "wet");
  const minDays = series.thresholds.wet_spell_min_days;
  const first = spells[0];

  if (!first) {
    return {
      tone: "low",
      headline: t("headline.noWetSpell"),
      actions: [action(forecast, null, NOW, ctx.stage === "harvest" ? t("advice.noWetSpellHarvest") : t("advice.noWetSpell"))],
      signals: [t("signal.noWetSpell", { days: minDays })],
    };
  }

  const start = forecast.dayOf(first);
  const signals = spells
    .slice(0, 3)
    .map((spell) => t("signal.wetSpell", { days: spell.days, dates: spellFact(forecast, spell), amount: formatAmount(spell.total_mm, "mm") }));
  const actions: AdvisoryAction[] = [];
  let tone: AdvisoryTone;
  let headline: string;

  if (crop.likesWater && ctx.stage !== "harvest") {
    tone = "low";
    headline = t("headline.wetSpellGoodForCrop");
    actions.push(action(forecast, start, forecast.spellLabel(first), t("advice.repairBunds"), "crops", first.end_date));
  } else if (ctx.stage === "harvest") {
    tone = "high";
    headline = forecast.ongoing(first)
      ? t("headline.wetSpellNowProtect")
      : t("headline.harvestBefore", { date: formatDay(first.start_date, "weekday") });
    actions.push(
      action(
        forecast,
        start,
        forecast.ongoing(first) ? NOW : beforeLabel(forecast, first.start_date),
        forecast.ongoing(first) ? t("advice.keepHarvestCovered") : t("advice.bringInMature"),
      ),
    );
  } else {
    tone = "mid";
    headline = forecast.ongoing(first) ? t("headline.wetSpellNow") : t("headline.wetSpellFrom", { date: formatDay(first.start_date, "weekday") });
    if (!forecast.ongoing(first)) {
      actions.push(action(forecast, start, beforeLabel(forecast, first.start_date), t("advice.sprayBeforeWetSpell")));
    }
    actions.push(action(forecast, start, forecast.spellLabel(first), t("advice.clearDrains"), "crops", first.end_date));
    actions.push(action(forecast, start, forecast.spellLabel(first), t("advice.checkWetDiseasesSpell"), "pests", first.end_date));
  }
  if (spells[1]) {
    const next = spells[1];
    actions.push(
      action(
        forecast,
        forecast.dayOf(next),
        forecast.spellLabel(next),
        ctx.stage === "harvest" ? t("advice.anotherWetSpellHarvest") : t("advice.anotherWetSpell"),
      ),
    );
  }
  return { tone, headline, actions, signals };
}

function onsetDraft(forecast: Forecast, series: SubseasonalSeries, ctx: SeasonContext): Draft {
  const { t } = forecast;
  const onset = series.onset ?? null;
  const { thresholds } = series;
  const minMm = thresholds.onset_mm ?? 20;
  const windowDays = thresholds.onset_window_days ?? 3;
  const guardDays = thresholds.onset_guard_days ?? 30;
  const maxDry = thresholds.onset_max_dry_days ?? 10;
  const firstDate = series.days[0]?.date;
  const signals: string[] = [];
  if (onset) {
    signals.push(t("signal.onsetRain", { amount: formatAmount(onset.rain_mm, "mm"), days: windowDays, date: formatDay(onset.date, "weekday") }));
    signals.push(
      onset.provisional
        ? t("signal.onsetUncertain", { dryRun: String(onset.longest_dry_after), guardDays: onset.guard_days, checkDays: guardDays })
        : t("signal.onsetChecked", { checkDays: guardDays, dryRun: String(onset.longest_dry_after), maxDry }),
    );
  } else {
    signals.push(t("signal.noOnset", { mm: minMm, days: windowDays, dryDays: maxDry + 1 }));
  }
  if (firstDate) {
    signals.push(t("signal.onsetSearchOnly", { date: formatDay(firstDate, "short") }));
  }

  const day = onset ? (forecast.days.find((item) => item.day === onset.day) ?? null) : null;
  const plantingTime = ctx.stage === "planting" || ctx.stage === "land_prep";

  if (!plantingTime) {
    // Onset matters for sowing; at other stages say what it means without pushing planting.
    const started = onset && onset.date < (forecast.days[0]?.date ?? "");
    return {
      tone: "low",
      headline: onset
        ? t(started ? "headline.rainsStarted" : "headline.rainsStart", { date: formatDay(onset.date, "weekday") })
        : t("headline.noSteadyRains"),
      actions: [action(forecast, null, NOW, t("advice.seeOtherLayers"))],
      signals,
    };
  }

  if (!onset) {
    return {
      tone: "high",
      headline: t("headline.noReliableRains"),
      actions: [action(forecast, null, NOW, t("advice.doNotPlantFalseStart")), action(forecast, null, NOW, t("advice.prepareForRains"))],
      signals,
    };
  }

  if (!day) {
    // The onset fell before today on a stale run.
    return {
      tone: "low",
      headline: t("headline.plantingRainsStarted", { date: formatDay(onset.date, "weekday") }),
      actions: [action(forecast, null, NOW, t("advice.plantNowIfNot"))],
      signals,
    };
  }

  const when = formatDay(onset.date, "weekday");
  if (onset.provisional) {
    return {
      tone: "mid",
      headline: t("headline.rainsMayStart", { date: when }),
      actions: [
        action(forecast, null, NOW, t("advice.prepareLandAndSeed")),
        action(forecast, day, fromLabel(forecast, onset.date), t("advice.plantIfNextForecastDry"), "crops", forecast.lastDate()),
      ],
      signals,
    };
  }
  return {
    tone: "low",
    headline: t("headline.rainsStart", { date: when }),
    actions: [
      action(forecast, null, NOW, t("advice.getSeedReady")),
      action(forecast, day, fromLabel(forecast, onset.date), t("advice.plantWhenSoilWet"), "crops", forecast.lastDate()),
    ],
    signals,
  };
}

/* ------------------------------------------------------------------- bulletin: outlook, impact */

/** Forecast days the advisory covers: today to the end of the "possible" range. */
function validityWindow(forecast: Forecast) {
  return forecast.days.slice(0, forecast.limits.possibleLeadDays);
}

/** All spells of a kind that start inside the validity window (or are already under way). */
function spellsInWindow(forecast: Forecast, series: SubseasonalSeries, kind: "dry" | "wet", window: SubseasonalDay[]) {
  const last = window[window.length - 1]?.day ?? 0;
  return forecast.spells(series, kind).filter((spell) => spell.start_day <= last);
}

function describeSpell(forecast: Forecast, spell: SubseasonalSpell) {
  if (forecast.ongoing(spell)) {
    return forecast.t("spell.until", { date: formatDay(spell.end_date, "weekday") });
  }
  return forecast.t(spell.open_end ? "spell.rangeOpen" : "spell.range", { dates: shortRange(spell.start_date, spell.end_date), days: spell.days });
}

/** Longest run of days below the rain-day threshold inside the window. */
function longestDryRun(forecast: Forecast, window: SubseasonalDay[]) {
  let run = 0;
  let longest = 0;
  window.forEach((day) => {
    run = rain(day) < forecast.wetDayMm ? run + 1 : 0;
    longest = Math.max(longest, run);
  });
  return longest;
}

/** Days in the window with flood-level rain: a 10%+ chance for an ensemble, forecast for a single run. */
function extremeDays(forecast: Forecast, series: SubseasonalSeries, window: SubseasonalDay[]) {
  const ensemble = (series.members ?? 1) > 1;
  const { extremeChanceEnsemblePct, extremeChanceSinglePct } = forecast.limits;
  return window.filter((day) => (day.extreme_prob ?? 0) >= (ensemble ? extremeChanceEnsemblePct : extremeChanceSinglePct));
}

/**
 * One plain sentence on what the selected indicator shows over the validity window: rain amounts
 * for rainfall, rain days for rain days, only dry (or wet) spells for the spell layers, the onset date.
 */
function outlookFor(layer: SubseasonalLayerKey, forecast: Forecast, series: SubseasonalSeries, window: SubseasonalDay[]) {
  const { t } = forecast;
  if (layer === "dry_spell_days" || layer === "wet_spell_days") {
    const kind = layer === "dry_spell_days" ? "dry" : "wet";
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    const spells = spellsInWindow(forecast, series, kind, window);
    if (!spells.length) {
      return t(kind === "dry" ? "outlook.noDrySpell" : "outlook.noWetSpell", { days: minDays });
    }
    const [first, ...rest] = spells;
    const more = rest.length
      ? t("outlook.thenMore", { spells: rest.map((spell) => describeSpell(forecast, spell)).join(` ${t("word.and")} `) })
      : "";
    return t(kind === "dry" ? "outlook.drySpell" : "outlook.wetSpell", { spell: describeSpell(forecast, first), more });
  }
  if (layer === "rainy_days") {
    const rainDays = window.filter((day) => rain(day) >= forecast.wetDayMm).length;
    return t("outlook.rainDays", { rainDays, days: window.length, dryRun: longestDryRun(forecast, window) });
  }
  if (layer === "extreme_rain") {
    const risky = extremeDays(forecast, series, window);
    const threshold = series.thresholds.extreme_rain_mm ?? 50;
    if (!risky.length) return t("outlook.noExtreme", { mm: threshold });
    const ensemble = (series.members ?? 1) > 1;
    const listed = risky
      .slice(0, 3)
      .map((day) =>
        ensemble
          ? t("outlook.extremeDayChance", { date: formatDay(day.date, "weekday"), chance: Math.round(day.extreme_prob ?? 0) })
          : formatDay(day.date, "weekday"),
      )
      .join(", ");
    return t(ensemble ? "outlook.extremePossible" : "outlook.extremeForecast", {
      mm: threshold,
      dates: listed,
      later: risky.length > 3 ? t("outlook.andLater") : "",
    });
  }
  if (layer === "onset") {
    const onset = series.onset ?? null;
    if (!onset) return t("outlook.noOnset");
    const date = formatDay(onset.date, "weekday");
    if (onset.date < (window[0]?.date ?? "")) return t("outlook.onsetStarted", { date });
    return t(onset.provisional ? "outlook.onsetExpectedUncertain" : "outlook.onsetExpected", { date });
  }
  const total = window.reduce((sum, day) => sum + rain(day), 0);
  const wettest = window.reduce<SubseasonalDay | null>((best, day) => (rain(day) > rain(best ?? undefined) ? day : best), null);
  const last = window[window.length - 1]?.day ?? 0;
  const heavy = forecast.heavyDays().filter((day) => day.day <= last).length;
  const parts = [t("outlook.rainTotal", { mm: Math.round(total), days: window.length })];
  if (wettest && rain(wettest) >= forecast.wetDayMm) {
    parts.push(t("outlook.wettestDay", { date: formatDay(wettest.date, "weekday"), amount: formatAmount(wettest.value, "mm") }));
  }
  if (heavy) parts.push(t(heavy === 1 ? "outlook.heavyDaysOne" : "outlook.heavyDaysMany", { count: heavy }));
  return `${parts.join(". ")}.`;
}

/** What the selected indicator means for farming at this stage of the season. */
function impactFor(
  layer: SubseasonalLayerKey,
  forecast: Forecast,
  series: SubseasonalSeries,
  crop: CropProfile,
  ctx: SeasonContext,
  window: SubseasonalDay[],
) {
  const { limits } = forecast;
  // Named for the chosen crop ("maize at tasselling and silking"), or crops in general.
  const crops = forecast.t(ctx.stage === "critical" ? "impact.cropsAtStage" : "impact.cropsGrowing");
  const t: Writer = (id, vars) => forecast.t(id, { crops, ...vars });
  const cropping = ctx.stage === "growing" || ctx.stage === "critical";
  const sowing = ctx.stage === "planting" || ctx.stage === "land_prep";

  if (layer === "dry_spell_days") {
    const dry = spellsInWindow(forecast, series, "dry", window)[0];
    if (!dry) return cropping ? t("impact.dryNoneCropping") : t("impact.dryNone");
    if (ctx.stage === "harvest") return t("impact.dryHarvest");
    if (ctx.stage === "dry_season") return t("impact.dryDrySeason");
    if (sowing) return t("impact.drySowing");
    if (crop.droughtHardy) return t("impact.dryDroughtHardy");
    return t("impact.dry");
  }
  if (layer === "wet_spell_days") {
    const wet = spellsInWindow(forecast, series, "wet", window)[0];
    if (!wet) return t("impact.wetNone");
    if (ctx.stage === "harvest") return t("impact.wetHarvest");
    if (sowing) return t("impact.wetSowing");
    if (crop.likesWater) return t("impact.wetLikesWater");
    return t("impact.wet");
  }
  if (layer === "rainy_days") {
    const share = window.filter((day) => rain(day) >= forecast.wetDayMm).length / Math.max(1, window.length);
    if (share >= limits.manyRainDaysShare) {
      return ctx.stage === "harvest" ? t("impact.rainyManyHarvest") : t("impact.rainyMany");
    }
    if (share < limits.fewRainDaysShare) {
      if (!cropping) return t("impact.rainyFew");
      return crop.droughtHardy ? t("impact.rainyFewDroughtHardy") : t("impact.rainyFewCropping");
    }
    return t("impact.rainyNormal");
  }
  if (layer === "extreme_rain") {
    if (!extremeDays(forecast, series, window).length) return t("impact.extremeNone");
    if (ctx.stage === "harvest") return t("impact.extremeHarvest");
    return t("impact.extreme");
  }
  if (layer === "onset") {
    const onset = series.onset ?? null;
    if (!sowing) return t("impact.onsetNotPlantingTime");
    if (!onset) return t("impact.onsetNone");
    return onset.provisional ? t("impact.onsetUncertain") : t("impact.onsetConfirmed");
  }
  const total = window.reduce((sum, day) => sum + rain(day), 0);
  const last = window[window.length - 1]?.day ?? 0;
  const heavy = forecast.heavyDays().some((day) => day.day <= last);
  if (ctx.stage === "harvest") {
    return heavy || total >= limits.onsetThresholdMm ? t("impact.rainHarvestWet") : t("impact.rainHarvestDry");
  }
  if (ctx.stage === "dry_season") return total < limits.cessationThresholdMm ? t("impact.rainDrySeasonDry") : t("impact.rainDrySeasonSome");
  if (sowing) return total >= limits.onsetThresholdMm ? t("impact.rainSowingEnough") : t("impact.rainSowingShort");
  if (heavy) return t("impact.rainHeavy");
  if (crop.likesWater && total < limits.onsetThresholdMm * 2) return t("impact.rainLightWaterCrop");
  return total < limits.onsetThresholdMm ? t("impact.rainLight") : t("impact.rainEnough");
}

/**
 * Pest and livestock advice from the selected indicator only: what a bulletin adds under "pests and
 * diseases" and "livestock and water". Pests are added only if the layer's advice has none.
 */
function generalActions(
  layer: SubseasonalLayerKey,
  forecast: Forecast,
  series: SubseasonalSeries,
  ctx: SeasonContext,
  window: SubseasonalDay[],
  existing: AdvisoryAction[],
  includeLivestock: boolean,
): AdvisoryAction[] {
  const { t, limits } = forecast;
  const actions: AdvisoryAction[] = [];
  const cropping = ctx.stage === "growing" || ctx.stage === "critical";
  const hasPests = existing.some((item) => item.group === "pests");
  const last = window[window.length - 1]?.day ?? 0;

  if (layer === "dry_spell_days") {
    const dry = spellsInWindow(forecast, series, "dry", window)[0];
    if (dry) {
      if (!hasPests && cropping) {
        actions.push(action(forecast, forecast.dayOf(dry), forecast.spellLabel(dry), t("advice.checkDryPests"), "pests", dry.end_date));
      }
      if (includeLivestock) {
        actions.push(action(forecast, forecast.dayOf(dry), forecast.spellLabel(dry), t("advice.livestockDrySpell"), "livestock", dry.end_date));
      }
    }
  } else if (layer === "wet_spell_days") {
    const wet = spellsInWindow(forecast, series, "wet", window)[0];
    if (wet) {
      if (!hasPests && ctx.stage !== "dry_season") {
        actions.push(
          action(forecast, forecast.dayOf(wet), forecast.spellLabel(wet), t("advice.checkWetDiseasesWetSpell"), "pests", wet.end_date),
        );
      }
      if (includeLivestock) {
        actions.push(action(forecast, forecast.dayOf(wet), forecast.spellLabel(wet), t("advice.livestockWetSpell"), "livestock", wet.end_date));
      }
    }
  } else if (layer === "rainy_days") {
    const share = window.filter((day) => rain(day) >= forecast.wetDayMm).length / Math.max(1, window.length);
    if (includeLivestock && share < limits.fewRainDaysShare) {
      actions.push(action(forecast, null, t("when.allPeriod"), t("advice.livestockFewRainDays"), "livestock"));
    } else if (includeLivestock && share >= limits.manyRainDaysShare) {
      actions.push(action(forecast, null, t("when.allPeriod"), t("advice.livestockManyRainDays"), "livestock"));
    }
  } else if (layer === "extreme_rain") {
    const risky = extremeDays(forecast, series, window)[0];
    if (risky && includeLivestock) {
      const day = forecast.days.find((item) => item.day === risky.day) ?? null;
      actions.push(action(forecast, day, formatDay(risky.date, "weekday"), t("advice.livestockFlood"), "livestock"));
    }
  } else if (layer === "rainfall") {
    const heavy = forecast.heavyDays().find((day) => day.day <= last) ?? null;
    if (heavy && includeLivestock) {
      actions.push(action(forecast, heavy, formatDay(heavy.date, "weekday"), t("advice.livestockHeavyRain"), "livestock"));
    }
  }
  return actions;
}

export function buildSubseasonalAdvisory(
  layer: SubseasonalLayerKey,
  series: SubseasonalSeries,
  cropKey: CropKey,
  today: string = todayIso(),
  content: AdvisoryContent = DEFAULT_ADVISORY_CONTENT,
): SubseasonalAdvisory {
  const crop = cropFor(content, cropKey);
  const { t, setStage } = writerFor(content, crop);
  const forecast = new Forecast(series, today, content.thresholds, t);
  const sector = sectorFor(series, content.sectors);
  const sectorLabel = content.sectors.labels[sector];
  if (!forecast.days.length) {
    const last = series.days[series.days.length - 1];
    return {
      tone: "mid",
      headline: t("headline.expired"),
      context: { sector: sectorLabel, season: t("context.expiredSeason"), stage: t("context.expiredStage") },
      validity: null,
      outlook: null,
      impact: null,
      actions: [{ when: t("when.now"), date: null, text: t("advice.expiredCheckBack"), confidence: "likely", group: "crops", end: null }],
      signals: [last ? t("signal.expiredCovered", { date: formatDay(last.date, "weekday") }) : t("signal.expiredEmpty")],
    };
  }
  const ctx: SeasonContext = {
    sector,
    sectorLabel,
    ...seasonFor(content, sector, forecast.days[0]?.date ?? today, crop),
  };
  setStage(ctx.stageLabel);

  const draft =
    layer === "rainy_days"
      ? rainyDaysDraft(forecast, crop, ctx)
      : layer === "dry_spell_days"
        ? drySpellDraft(forecast, series, crop, ctx)
        : layer === "wet_spell_days"
          ? wetSpellDraft(forecast, series, crop, ctx)
          : layer === "onset"
            ? onsetDraft(forecast, series, ctx)
            : rainfallDraft(forecast, crop, ctx);

  const window = validityWindow(forecast);
  const general = generalActions(layer, forecast, series, ctx, window, draft.actions, crop.livestockAdvice);

  // Standing advice ("Now", "All period") leads; dated actions follow in calendar order.
  const used: Record<AdvisoryGroup, number> = { crops: 0, pests: 0, livestock: 0 };
  const actions = [...draft.actions, ...general]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (!a.item.date || !b.item.date) {
        return (a.item.date ? 1 : 0) - (b.item.date ? 1 : 0) || a.index - b.index;
      }
      return a.item.date.localeCompare(b.item.date) || a.index - b.index;
    })
    .map(({ item }) => item)
    .filter((item) => {
      used[item.group] += 1;
      return used[item.group] <= content.groups.limits[item.group];
    });

  return {
    tone: draft.tone,
    headline: draft.headline,
    context: { sector: ctx.sectorLabel, season: ctx.season, stage: ctx.stageLabel },
    validity: window.length ? { from: window[0].date, to: window[window.length - 1].date } : null,
    outlook: window.length ? outlookFor(layer, forecast, series, window) : null,
    impact: window.length ? impactFor(layer, forecast, series, crop, ctx, window) : null,
    actions,
    signals: draft.signals,
  };
}
