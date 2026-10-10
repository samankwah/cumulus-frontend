import { formatAmount, formatDay, formatRange, todayIso } from "@/lib/subseasonal";
import type { SubseasonalDay, SubseasonalLayerKey, SubseasonalSeries, SubseasonalSpell } from "@/lib/subseasonal";

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
 * Planting and end-of-rains use the backend definitions (configs/advisory.yaml): onset = 20 mm in
 * 3 days with no 7-day dry run in the next 10; cessation = 14 days totalling 10 mm or less.
 * The onset layer instead follows the backend's mapped onset (series.onset: 20 mm within 3 days,
 * no dry spell over 10 days in the next 30), so the advice matches the date on the map.
 * Lead time sets confidence: the model's own guidance is that day-to-day detail beyond ~10 days
 * is indicative only.
 * ------------------------------------------------------------------------------------------ */

const NORTHERN_LATITUDE = 8.0;
const TRANSITION_LATITUDE = 7.0;
/** Area series carry no coordinates, so regions map to GMet's sectors by name. */
const NORTHERN_REGIONS = ["Northern", "Savannah", "North East", "Upper East", "Upper West"];
const TRANSITION_REGIONS = ["Bono", "Bono East", "Oti"];

const ONSET_WINDOW_DAYS = 3;
const ONSET_THRESHOLD_MM = 20;
const ONSET_GUARD_DAYS = 10;
const ONSET_GUARD_DRY_DAYS = 7;
const CESSATION_WINDOW_DAYS = 14;
const CESSATION_THRESHOLD_MM = 10;

const HEAVY_DAY_MM = 30;
/** A spray or fertilizer application needs this much rain-free time after it. */
const WASH_OFF_MM = 5;
const SPRAY_WINDOW_DAYS = 2;
const DRYING_WINDOW_DAYS = 3;
/** Soil counts as moist enough to top-dress after this much rain over the previous 3 days. */
const MOIST_SOIL_MM = 10;

const LIKELY_LEAD_DAYS = 10;
const POSSIBLE_LEAD_DAYS = 21;

/* ------------------------------------------------------------------------------------ crops */

export type CropKey = "all" | "maize" | "rice" | "sorghum_millet" | "legumes" | "roots_tubers" | "vegetables";

type CropProfile = {
  label: string;
  /** Plural noun used in sentences ("dry your maize"). */
  noun: string;
  /** Tolerates prolonged dry spells (sorghum, millet, cassava). */
  droughtHardy: boolean;
  /** Tolerates standing water (lowland rice). */
  likesWater: boolean;
  /** Harvest happens later than the cereal harvest in the north. */
  lateHarvest: boolean;
  /** Most sensitive stage to water stress. */
  criticalStage: string;
  /** What to protect in a wet harvest. */
  harvestRisk: string;
  /** Pests that build up in dry weather, to watch for in a dry spell. */
  dryPests: string;
  /** Diseases that spread in wet weather, to scout for in a wet spell. */
  wetDiseases: string;
};

export const CROPS: Record<CropKey, CropProfile> = {
  // The default: advice that holds for crops in general, before a farmer picks their own.
  all: {
    label: "All crops",
    noun: "crops",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    criticalStage: "flowering and grain filling",
    harvestRisk: "grain and pods mould if harvested or dried wet",
    dryPests: "fall armyworm and aphids",
    wetDiseases: "fungal leaf and pod diseases",
  },
  maize: {
    label: "Maize",
    noun: "maize",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    criticalStage: "tasselling and silking",
    harvestRisk: "cobs rot and grain moulds (aflatoxin) if harvested or dried wet",
    dryPests: "fall armyworm and stem borers",
    wetDiseases: "leaf blight and ear rot",
  },
  rice: {
    label: "Rice",
    noun: "rice",
    droughtHardy: false,
    likesWater: true,
    lateHarvest: false,
    criticalStage: "booting and flowering",
    harvestRisk: "grain shatters and sprouts if left standing in rain",
    dryPests: "stem borers and rice bugs",
    wetDiseases: "rice blast and sheath blight",
  },
  sorghum_millet: {
    label: "Sorghum & millet",
    noun: "sorghum and millet",
    droughtHardy: true,
    likesWater: false,
    lateHarvest: true,
    criticalStage: "heading and grain filling",
    harvestRisk: "heads mould and birds damage grain left in the field",
    dryPests: "stem borers and aphids",
    wetDiseases: "grain mould and anthracnose",
  },
  legumes: {
    label: "Groundnut & cowpea",
    noun: "groundnut and cowpea",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    criticalStage: "flowering and pod filling",
    harvestRisk: "pods mould (aflatoxin in groundnut) if dried on wet ground",
    dryPests: "aphids and thrips",
    wetDiseases: "leaf spot and pod rot",
  },
  roots_tubers: {
    label: "Yam & cassava",
    noun: "yam and cassava",
    droughtHardy: true,
    likesWater: false,
    lateHarvest: true,
    criticalStage: "tuber bulking",
    harvestRisk: "tubers rot if harvested from waterlogged soil",
    dryPests: "cassava mealybug and green mite",
    wetDiseases: "yam anthracnose and tuber rot",
  },
  vegetables: {
    label: "Vegetables",
    noun: "vegetables",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    criticalStage: "transplanting and fruit set",
    harvestRisk: "leaf and fruit diseases spread fast in wet weather",
    dryPests: "whiteflies, aphids and mites",
    wetDiseases: "blight and leaf spot",
  },
};

export const CROP_KEYS = Object.keys(CROPS) as CropKey[];

export function isCropKey(value: unknown): value is CropKey {
  return typeof value === "string" && value in CROPS;
}

/* ---------------------------------------------------------------------------- place & season */

type Sector = "north" | "transition" | "south";

/** Where in the farming calendar a place is, which sets the crop stage the advice speaks to. */
type Stage = "dry_season" | "land_prep" | "planting" | "growing" | "critical" | "harvest";

type SeasonContext = {
  sector: Sector;
  sectorLabel: string;
  season: string;
  stage: Stage;
  stageLabel: string;
};

function sectorFor(series: SubseasonalSeries): Sector {
  const latitude = series.latitude ?? series.nearest_latitude;
  if (latitude !== null && latitude !== undefined) {
    if (latitude >= NORTHERN_LATITUDE) {
      return "north";
    }
    return latitude >= TRANSITION_LATITUDE ? "transition" : "south";
  }
  const region = series.region ?? series.name;
  if (NORTHERN_REGIONS.includes(region)) return "north";
  return TRANSITION_REGIONS.includes(region) ? "transition" : "south";
}

const SECTOR_LABELS: Record<Sector, string> = {
  north: "Northern sector",
  transition: "Transition zone",
  south: "Southern sector",
};

/** Month-day as a sortable number, e.g. 15 Aug → 815. */
function monthDay(iso: string) {
  return Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
}

/**
 * Season calendar. North: one season (rains May–Oct, cessation reference ~5 Nov).
 * South and transition: major season Mar–Jul, short break, minor season mid-Aug–Nov
 * (cessation reference ~7 Nov), per configs/seasonal_map.yaml profiles.
 */
function seasonFor(sector: Sector, iso: string, crop: CropProfile): Omit<SeasonContext, "sector" | "sectorLabel"> {
  const md = monthDay(iso);
  const stageLabels: Record<Stage, string> = {
    dry_season: "dry season",
    land_prep: "land preparation",
    planting: "planting time",
    growing: "crop growing",
    critical: crop.criticalStage,
    harvest: "harvest time",
  };
  const make = (season: string, stage: Stage) => ({ season, stage, stageLabel: stageLabels[stage] });

  if (sector === "north") {
    if (crop.lateHarvest) {
      if (md >= 1101) return make("End of the main season", "harvest");
      if (md >= 801) return make("Main season", "critical");
    } else {
      if (md >= 1201) return make("Dry season", "dry_season");
      if (md >= 901) return make(md >= 1001 ? "End of the main season" : "Main season", "harvest");
    }
    if (md >= 801) return make("Main season", "critical");
    if (md >= 616) return make("Main season", "growing");
    if (md >= 501) return make("Start of the main season", "planting");
    if (md >= 315) return make("Before the rains", "land_prep");
    return make("Dry season", "dry_season");
  }
  if (md >= 1116 || md < 201) return make("Dry season", crop.lateHarvest && md >= 1116 ? "harvest" : "dry_season");
  if (md < 301) return make("Before the major season", "land_prep");
  if (md < 501) return make("Major season", "planting");
  if (md < 616) return make("Major season", "growing");
  if (md < 801) return make("End of the major season", crop.lateHarvest ? "growing" : "harvest");
  if (md < 1001) return make("Minor season", "planting");
  if (md < 1101) return make("Minor season", "critical");
  return make("End of the minor season", "harvest");
}

/* -------------------------------------------------------------------------- forecast windows */

export type Confidence = "likely" | "possible" | "outlook";

/** Advice groups, as in an agrometeorological bulletin: crops, pests and diseases, livestock and water. */
export type AdvisoryGroup = "crops" | "pests" | "livestock";

export const ADVISORY_GROUP_LABELS: Record<AdvisoryGroup, string> = {
  crops: "Crops",
  pests: "Pests & disease",
  livestock: "Livestock & water",
};

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

function rain(day: SubseasonalDay | undefined) {
  return day?.value ?? 0;
}

/** Capitalises a phrase that starts a sentence ("cobs rot…" → "Cobs rot…"). */
function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shortRange(start: string, end: string) {
  return start === end ? formatDay(start, "weekday") : formatRange(start, end);
}

class Forecast {
  readonly days: SubseasonalDay[];
  readonly wetDayMm: number;

  constructor(series: SubseasonalSeries, today: string) {
    this.days = series.days.filter((day) => day.date >= today);
    this.wetDayMm = series.thresholds.wet_day_mm;
  }

  confidence(day: SubseasonalDay): Confidence {
    const lead = this.days.indexOf(day);
    if (lead < LIKELY_LEAD_DAYS) return "likely";
    return lead < POSSIBLE_LEAD_DAYS ? "possible" : "outlook";
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
    for (let index = 0; index + ONSET_WINDOW_DAYS <= this.days.length; index += 1) {
      const window = this.days.slice(index, index + ONSET_WINDOW_DAYS);
      const total = window.reduce((sum, day) => sum + rain(day), 0);
      if (total < ONSET_THRESHOLD_MM) continue;
      const guard = this.days.slice(index, index + ONSET_GUARD_DAYS);
      let run = 0;
      let longest = 0;
      guard.forEach((day) => {
        run = rain(day) < this.wetDayMm ? run + 1 : 0;
        longest = Math.max(longest, run);
      });
      return { day: this.days[index], total, falseStartRisk: longest >= ONSET_GUARD_DRY_DAYS };
    }
    return null;
  }

  /** Backend cessation rule: first 14-day stretch with 10 mm or less. */
  endOfRains(): SubseasonalDay | null {
    for (let index = 0; index + CESSATION_WINDOW_DAYS <= this.days.length; index += 1) {
      const total = this.days.slice(index, index + CESSATION_WINDOW_DAYS).reduce((sum, day) => sum + rain(day), 0);
      if (total <= CESSATION_THRESHOLD_MM) return this.days[index];
    }
    return null;
  }

  /** First day with moist soil behind it and no wash-off rain the next two days. */
  fertilizerDay(): SubseasonalDay | null {
    for (let index = 0; index < this.days.length - 2; index += 1) {
      const before = this.days.slice(Math.max(0, index - 3), index + 1).reduce((sum, day) => sum + rain(day), 0);
      const after = this.days.slice(index + 1, index + 3);
      if (before >= MOIST_SOIL_MM && after.every((day) => rain(day) < HEAVY_DAY_MM / 2)) {
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
    return this.days.filter((day) => rain(day) >= HEAVY_DAY_MM);
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
    return spell.end_date === this.days[0]?.date ? "Today" : `Until ${formatDay(spell.end_date, "short")}`;
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
  when: string,
  text: string,
  group: AdvisoryGroup = "crops",
  end: string | null = null,
): AdvisoryAction {
  return { when, date: day && when !== "Now" ? day.date : null, text, confidence: day ? forecast.confidence(day) : "likely", group, end };
}

/** Long dry stretches read as "From 8 Oct" rather than a month-long range. */
function runLabel(run: Run) {
  return run.days > 7 ? `From ${formatDay(run.start.date, "short")}` : shortRange(run.start.date, run.end.date);
}

/** Spell dates for the "why" list: "8–12 Oct", or "under way until 12 Oct". */
function spellFact(forecast: Forecast, spell: SubseasonalSpell) {
  return forecast.ongoing(spell) ? `until ${formatDay(spell.end_date, "short")}` : shortRange(spell.start_date, spell.end_date);
}

/** Windows for spraying/weeding/harvest, shared by several layers. */
function fieldWorkActions(forecast: Forecast, crop: CropProfile, stage: Stage): AdvisoryAction[] {
  const sprayRuns = forecast.dryRuns(WASH_OFF_MM, SPRAY_WINDOW_DAYS).slice(0, 2);
  const actions: AdvisoryAction[] = [];
  if (stage === "harvest") {
    const drying = forecast.dryRuns(forecast.wetDayMm, DRYING_WINDOW_DAYS)[0];
    if (drying) {
      actions.push(
        action(
          forecast,
          drying.start,
          runLabel(drying),
          drying.days > 7
            ? `Harvest and dry ${crop.noun}. Dry weather lasts ${drying.days}+ days.`
            : `Harvest and dry ${crop.noun}. ${drying.days} dry days in a row.`,
        ),
      );
      const nextDrying = forecast.dryRuns(forecast.wetDayMm, DRYING_WINDOW_DAYS)[1];
      // Once the rains are ending every day dries produce; a second window adds nothing.
      if (nextDrying && !forecast.endOfRains()) {
        actions.push(action(forecast, nextDrying.start, runLabel(nextDrying), "Second dry window, if you miss the first.", "crops", nextDrying.end.date));
      }
    }
  }
  // At harvest a drying window already covers field work; fall back to short rain-free gaps.
  if (sprayRuns.length && (stage !== "harvest" || !actions.length)) {
    const first = sprayRuns[0];
    actions.push(
      action(
        forecast,
        first.start,
        runLabel(first),
        stage === "harvest"
          ? "Clear the field, thresh and bag dry produce."
          : `Spray or weed on these dry days so rain does not wash chemicals off.${sprayRuns[1] ? ` Next dry days: ${runLabel(sprayRuns[1])}.` : ""}`,
      ),
    );
  }
  return actions;
}

function rainfallDraft(forecast: Forecast, crop: CropProfile, ctx: SeasonContext): Draft {
  const twoWeeks = forecast.total(14);
  const span = Math.min(14, forecast.days.length);
  const planting = forecast.plantingRain();
  const heavy = forecast.heavyDays();
  const end = forecast.endOfRains();
  const fertilizer = forecast.fertilizerDay();
  const signals = [`${formatAmount(twoWeeks, "mm")} forecast over the next ${span} days.`];
  const actions: AdvisoryAction[] = [];
  let tone: AdvisoryTone = "low";
  let headline: string;

  if (ctx.stage === "harvest") {
    const drying = forecast.dryRuns(forecast.wetDayMm, DRYING_WINDOW_DAYS)[0];
    headline = drying
      ? `Harvest from ${formatDay(drying.start.date, "weekday")}`
      : `Few dry days to harvest ${crop.noun}`;
    tone = drying ? "low" : "high";
    actions.push(...fieldWorkActions(forecast, crop, "harvest"));
    if (!drying) {
      actions.push(action(forecast, null, "Now", `Harvest ripe ${crop.noun} between showers and dry it under cover. ${sentence(crop.harvestRisk)}.`));
    }
    if (end) {
      actions.push(
        action(
          forecast,
          end,
          `From ${formatDay(end.date, "short")}`,
          "The rains are ending. Plan crop residue use and dry-season storage.",
          "crops",
          forecast.lastDate(),
        ),
      );
      signals.push(`Under ${CESSATION_THRESHOLD_MM} mm in the 14 days from ${formatDay(end.date, "weekday")} (end-of-rains signal).`);
    }
  } else if (ctx.stage === "planting" || ctx.stage === "land_prep") {
    if (planting && !planting.falseStartRisk) {
      headline = `Planting rain ${formatDay(planting.day.date, "weekday")}`;
      actions.push(
        action(forecast, planting.day, formatDay(planting.day.date, "weekday"), `Plant ${crop.noun} once the soil is wet to a hand's depth after this rain.`),
      );
    } else if (planting) {
      tone = "mid";
      headline = "Rain comes, but a dry spell may follow";
      actions.push(
        action(forecast, planting.day, formatDay(planting.day.date, "weekday"), `Rain comes, but ${ONSET_GUARD_DRY_DAYS}+ dry days may follow. Plant a small area only, or wait.`),
      );
    } else {
      tone = "high";
      headline = `No planting rain for ${crop.noun} yet`;
      actions.push(action(forecast, null, "Now", "Hold seed. Finish land preparation and ridging now."));
    }
    if (planting) {
      signals.push(`${formatAmount(planting.total, "mm")} over 3 days from ${formatDay(planting.day.date, "weekday")} (planting-rain rule: 20 mm in 3 days).`);
    }
  } else if (ctx.stage === "dry_season") {
    headline = twoWeeks >= ONSET_THRESHOLD_MM ? "Rain expected out of season" : "Little rain expected";
    tone = twoWeeks >= ONSET_THRESHOLD_MM ? "mid" : "low";
    actions.push(
      action(
        forecast,
        null,
        "Now",
        twoWeeks >= ONSET_THRESHOLD_MM
          ? "Rain is forecast out of season. Cover stored grain and keep produce off the ground."
          : `Irrigate ${crop.noun} on a fixed schedule. Little rain is expected.`,
      ),
    );
  } else {
    headline = twoWeeks < ONSET_THRESHOLD_MM ? `Too little rain for ${crop.noun} in the next ${span} days` : `Enough rain for ${crop.noun} in the next ${span} days`;
    tone = twoWeeks < ONSET_THRESHOLD_MM ? (crop.droughtHardy ? "mid" : "high") : "low";
    if (twoWeeks < ONSET_THRESHOLD_MM) {
      actions.push(
        action(
          forecast,
          null,
          "Now",
          crop.droughtHardy ? `Keep weeds down so ${crop.noun} gets what moisture there is.` : `Mulch and irrigate where you can. Water stress at ${ctx.stageLabel} cuts yield the most.`,
        ),
      );
    }
    if (fertilizer && !crop.likesWater) {
      actions.push(
        action(forecast, fertilizer, formatDay(fertilizer.date, "weekday"), "Top-dress fertilizer. The soil is moist and no heavy rain follows for two days."),
      );
    }
  }

  heavy.slice(0, 2).forEach((day) => {
    actions.push(
      action(
        forecast,
        day,
        formatDay(day.date, "weekday"),
        crop.likesWater
          ? `Heavy rain (${formatAmount(day.value, "mm")}). Check bunds and drain excess water.`
          : `Heavy rain (${formatAmount(day.value, "mm")}). Do not apply fertilizer or spray the day before. Keep drains open.`,
      ),
    );
  });
  if (heavy.length) {
    signals.push(`${heavy.length} day${heavy.length === 1 ? "" : "s"} with ${HEAVY_DAY_MM} mm or more.`);
  }
  return { tone, headline, actions, signals };
}

function rainyDaysDraft(forecast: Forecast, crop: CropProfile, ctx: SeasonContext): Draft {
  const span = Math.min(14, forecast.days.length);
  const window = forecast.days.slice(0, span);
  const rainy = window.filter((day) => rain(day) >= forecast.wetDayMm).length;
  const share = span ? rainy / span : 0;
  const signals = [`${rainy} of the next ${span} days reach ${forecast.wetDayMm} mm.`];
  const actions = fieldWorkActions(forecast, crop, ctx.stage);
  let tone: AdvisoryTone = "low";
  let headline: string;

  if (share > 0.6) {
    tone = ctx.stage === "harvest" ? "high" : "mid";
    headline = actions.length ? `Few dry days. Use ${actions[0].when}` : "Almost no dry days for field work";
    if (!actions.length) {
      actions.push(action(forecast, null, "Now", `Postpone spraying. ${ctx.stage === "harvest" ? `Store harvested ${crop.noun} under cover.` : "Keep drains open."}`));
    }
    actions.push(action(forecast, null, "All period", `Check ${crop.noun} for ${crop.wetDiseases}. Frequent rain spreads them.`, "pests"));
  } else if (share < 0.25 && ctx.stage !== "harvest" && ctx.stage !== "dry_season") {
    tone = crop.droughtHardy ? "mid" : "high";
    headline = `Few rain days at ${ctx.stageLabel}`;
    actions.unshift(action(forecast, null, "Now", `Water ${crop.noun} every few days if you can, and mulch to hold moisture.`));
  } else {
    headline = ctx.stage === "harvest" ? `Enough dry days to harvest ${crop.noun}` : "Enough dry days between rains";
  }
  return { tone, headline, actions, signals };
}

function drySpellDraft(forecast: Forecast, series: SubseasonalSeries, crop: CropProfile, ctx: SeasonContext): Draft {
  const spells = forecast.spells(series, "dry");
  const minDays = series.thresholds.dry_spell_min_days;
  const first = spells[0];
  const longest = spells.reduce<SubseasonalSpell | null>((best, spell) => (!best || spell.days > best.days ? spell : best), null);

  if (!first || !longest) {
    return {
      tone: "low",
      headline: "No long dry spell ahead",
      actions: [
        action(forecast, null, "Now", ctx.stage === "planting" ? `Soil should stay moist. Plant ${crop.noun} when it rains.` : `Water should be enough for ${crop.noun} at ${ctx.stageLabel}.`),
      ],
      signals: [`No run of ${minDays}+ dry days in the remaining forecast.`],
    };
  }

  const signals = spells
    .slice(0, 3)
    .map((spell) => `${spell.days}-day dry spell ${spellFact(forecast, spell)}${spell.open_end ? " (may continue past the forecast)" : ""}.`);
  const start = forecast.dayOf(first);
  const actions: AdvisoryAction[] = [];
  let tone: AdvisoryTone;
  let headline: string;

  if (ctx.stage === "harvest" || ctx.stage === "dry_season") {
    tone = "low";
    headline = forecast.ongoing(first) ? "Dry now, good for drying" : `Dry from ${formatDay(first.start_date, "weekday")}, good for drying`;
    actions.push(action(forecast, start, forecast.spellLabel(first), `Harvest and sun-dry ${crop.noun} on tarpaulins, off bare ground.`, "crops", first.end_date));
    if (ctx.stage === "dry_season") {
      actions.push(action(forecast, null, "Now", "Protect stored grain and seed from heat and pests."));
    }
  } else if (ctx.stage === "planting" || ctx.stage === "land_prep") {
    tone = "high";
    headline = forecast.ongoing(first) ? "Do not plant yet. Soils are drying" : `Do not plant yet. Dry spell from ${formatDay(first.start_date, "weekday")}`;
    actions.push(
      action(forecast, start, `Until ${formatDay(first.end_date, "short")}`, `Do not plant ${crop.noun} before this spell ends. Seedlings may die.`, "crops", first.end_date),
    );
    actions.push(action(forecast, null, "Now", "Prepare land and ridges now, so you can plant fast when rain returns."));
  } else {
    const severe = longest.days >= minDays + 3 || ctx.stage === "critical";
    tone = crop.droughtHardy ? "mid" : severe ? "high" : "mid";
    headline =
      ctx.stage === "critical"
        ? `Dry spell during ${crop.criticalStage}`
        : `${longest.days}-day dry spell ${forecast.ongoing(longest) ? "now" : `from ${formatDay(longest.start_date, "weekday")}`}`;
    actions.push(
      action(
        forecast,
        start,
        forecast.spellLabel(first),
        crop.droughtHardy
          ? `${crop.label} cope with dry spells. Keep weeds down to save soil moisture.`
          : `Irrigate ${crop.noun} in this spell, morning or evening, and mulch the rows.`,
      ),
    );
    if (ctx.stage === "critical" && !crop.droughtHardy) {
      actions.push(
        action(forecast, start, forecast.spellLabel(first), `If water is short, water fields at ${crop.criticalStage} first. Yield drops fastest there.`, "crops", first.end_date),
      );
    }
    const next = spells[1];
    if (next && !crop.droughtHardy) {
      actions.push(action(forecast, forecast.dayOf(next), forecast.spellLabel(next), "Another dry spell follows. Keep water and mulch ready.", "crops", next.end_date));
    }
    if (ctx.stage === "growing") {
      // Top-dressing happens in the vegetative stage; by flowering it is too late to matter.
      actions.push(
        action(
          forecast,
          start,
          forecast.ongoing(first) ? "Now" : `Before ${formatDay(first.start_date, "short")}`,
          "Do not top-dress fertilizer into drying soil. Apply after the next good rain.",
        ),
      );
    }
  }
  return { tone, headline, actions, signals };
}

function wetSpellDraft(forecast: Forecast, series: SubseasonalSeries, crop: CropProfile, ctx: SeasonContext): Draft {
  const spells = forecast.spells(series, "wet");
  const minDays = series.thresholds.wet_spell_min_days;
  const first = spells[0];

  if (!first) {
    return {
      tone: "low",
      headline: "No prolonged wet spell ahead",
      actions: [
        action(forecast, null, "Now", ctx.stage === "harvest" ? `Harvest and dry ${crop.noun} as planned.` : "Spray and apply fertilizer as usual."),
      ],
      signals: [`No run of ${minDays}+ wet days in the remaining forecast.`],
    };
  }

  const start = forecast.dayOf(first);
  const signals = spells
    .slice(0, 3)
    .map((spell) => `${spell.days}-day wet spell ${spellFact(forecast, spell)}, about ${formatAmount(spell.total_mm, "mm")}.`);
  const actions: AdvisoryAction[] = [];
  let tone: AdvisoryTone;
  let headline: string;

  if (crop.likesWater && ctx.stage !== "harvest") {
    tone = "low";
    headline = "Wet spell ahead. Good for rice";
    actions.push(action(forecast, start, forecast.spellLabel(first), "Repair bunds to hold the water, and open spillways for heavy days.", "crops", first.end_date));
  } else if (ctx.stage === "harvest") {
    tone = "high";
    headline = forecast.ongoing(first) ? `Wet spell now. Protect harvested ${crop.noun}` : `Harvest ${crop.noun} before ${formatDay(first.start_date, "weekday")}`;
    actions.push(
      action(
        forecast,
        start,
        forecast.ongoing(first) ? "Now" : `Before ${formatDay(first.start_date, "short")}`,
        forecast.ongoing(first)
          ? `Keep harvested ${crop.noun} covered and off the ground. ${sentence(crop.harvestRisk)}.`
          : `Bring in mature ${crop.noun} and store it under cover. ${sentence(crop.harvestRisk)}.`,
      ),
    );
  } else {
    tone = "mid";
    headline = forecast.ongoing(first) ? "Wet spell now" : `Wet spell from ${formatDay(first.start_date, "weekday")}`;
    if (!forecast.ongoing(first)) {
      actions.push(action(forecast, start, `Before ${formatDay(first.start_date, "short")}`, "Spray and top-dress before it starts, so rain does not wash them off."));
    }
    actions.push(action(forecast, start, forecast.spellLabel(first), "Clear drains so fields do not waterlog during the spell.", "crops", first.end_date));
    actions.push(action(forecast, start, forecast.spellLabel(first), `Check ${crop.noun} for ${crop.wetDiseases} during the spell.`, "pests", first.end_date));
  }
  if (spells[1]) {
    const next = spells[1];
    actions.push(
      action(
        forecast,
        forecast.dayOf(next),
        forecast.spellLabel(next),
        ctx.stage === "harvest" ? "Another wet spell follows. Keep produce covered." : "Another wet spell follows. Plan spraying for the dry days in between.",
      ),
    );
  }
  return { tone, headline, actions, signals };
}

function onsetDraft(forecast: Forecast, series: SubseasonalSeries, crop: CropProfile, ctx: SeasonContext): Draft {
  const onset = series.onset ?? null;
  const { thresholds } = series;
  const minMm = thresholds.onset_mm ?? 20;
  const windowDays = thresholds.onset_window_days ?? 3;
  const guardDays = thresholds.onset_guard_days ?? 30;
  const maxDry = thresholds.onset_max_dry_days ?? 10;
  const firstDate = series.days[0]?.date;
  const signals: string[] = [];
  if (onset) {
    signals.push(`${formatAmount(onset.rain_mm, "mm")} within ${windowDays} days from ${formatDay(onset.date, "weekday")}.`);
    signals.push(
      onset.provisional
        ? `Longest dry run after it: ${onset.longest_dry_after} days, but the forecast ends ${onset.guard_days} days in, short of the ${guardDays}-day check.`
        : `Longest dry run in the ${guardDays} days after: ${onset.longest_dry_after} days (limit ${maxDry}).`,
    );
  } else {
    signals.push(`No ${minMm} mm burst within ${windowDays} days that stays clear of a ${maxDry + 1}+ day dry spell.`);
  }
  if (firstDate) {
    signals.push(`Only this forecast is searched; rain before ${formatDay(firstDate, "short")} is not counted.`);
  }

  const day = onset ? (forecast.days.find((item) => item.day === onset.day) ?? null) : null;
  const plantingTime = ctx.stage === "planting" || ctx.stage === "land_prep";

  if (!plantingTime) {
    // Onset matters for sowing; at other stages say what it means without pushing planting.
    return {
      tone: "low",
      headline: onset
        ? `Rains ${onset.date < (forecast.days[0]?.date ?? "") ? "started" : "start"} ${formatDay(onset.date, "weekday")}`
        : "No steady rains in this forecast",
      actions: [
        action(
          forecast,
          null,
          "Now",
          "See the rainfall and spell layers for field work.",
        ),
      ],
      signals,
    };
  }

  if (!onset) {
    return {
      tone: "high",
      headline: "No reliable planting rains yet",
      actions: [
        action(forecast, null, "Now", `Do not plant ${crop.noun} yet. Seedlings could die in a dry spell after a false start.`),
        action(forecast, null, "Now", "Prepare land, ridges and seed so you can plant when the rains start."),
      ],
      signals,
    };
  }

  if (!day) {
    // The onset fell before today on a stale run.
    return {
      tone: "low",
      headline: `Planting rains started ${formatDay(onset.date, "weekday")}`,
      actions: [action(forecast, null, "Now", `Soils should be moist. Plant ${crop.noun} now if you have not.`)],
      signals,
    };
  }

  const when = formatDay(onset.date, "weekday");
  if (onset.provisional) {
    return {
      tone: "mid",
      headline: `Rains may start ${when}`,
      actions: [
        action(forecast, null, "Now", "Prepare land and seed now."),
        action(forecast, day, `From ${formatDay(onset.date, "short")}`, `Plant ${crop.noun} only if the next forecast shows no long dry spell after this rain.`, "crops", forecast.lastDate()),
      ],
      signals,
    };
  }
  return {
    tone: "low",
    headline: `Rains start ${when}`,
    actions: [
      action(forecast, null, "Now", "Finish land preparation and get seed and fertilizer ready."),
      action(forecast, day, `From ${formatDay(onset.date, "short")}`, `Plant ${crop.noun} when this rain has wet the soil.`, "crops", forecast.lastDate()),
    ],
    signals,
  };
}

/* ------------------------------------------------------------------- bulletin: outlook, impact */

/** Forecast days the advisory covers: today to the end of the "possible" range. */
function validityWindow(forecast: Forecast) {
  return forecast.days.slice(0, POSSIBLE_LEAD_DAYS);
}

/** All spells of a kind that start inside the validity window (or are already under way). */
function spellsInWindow(forecast: Forecast, series: SubseasonalSeries, kind: "dry" | "wet", window: SubseasonalDay[]) {
  const last = window[window.length - 1]?.day ?? 0;
  return forecast.spells(series, kind).filter((spell) => spell.start_day <= last);
}

function describeSpell(forecast: Forecast, spell: SubseasonalSpell) {
  return forecast.ongoing(spell)
    ? `until ${formatDay(spell.end_date, "weekday")}`
    : `${shortRange(spell.start_date, spell.end_date)} (${spell.days}${spell.open_end ? "+" : ""} days)`;
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

/**
 * One plain sentence on what the selected indicator shows over the validity window: rain amounts
 * for rainfall, rain days for rain days, only dry (or wet) spells for the spell layers, the onset date.
 */
function outlookFor(layer: SubseasonalLayerKey, forecast: Forecast, series: SubseasonalSeries, window: SubseasonalDay[]) {
  const span = `${window.length} days`;
  if (layer === "dry_spell_days" || layer === "wet_spell_days") {
    const kind = layer === "dry_spell_days" ? "dry" : "wet";
    const minDays = kind === "dry" ? series.thresholds.dry_spell_min_days : series.thresholds.wet_spell_min_days;
    const spells = spellsInWindow(forecast, series, kind, window);
    if (!spells.length) {
      return `No ${kind} spell of ${minDays}+ days ahead.`;
    }
    const [first, ...rest] = spells;
    const more = rest.length ? `, then ${rest.map((spell) => describeSpell(forecast, spell)).join(" and ")}` : "";
    return `${kind === "dry" ? "Dry" : "Wet"} spell ${describeSpell(forecast, first)}${more}.`;
  }
  if (layer === "rainy_days") {
    const rainDays = window.filter((day) => rain(day) >= forecast.wetDayMm).length;
    return `Rain on ${rainDays} of ${span}. Longest dry run: ${longestDryRun(forecast, window)} days.`;
  }
  if (layer === "onset") {
    const onset = series.onset ?? null;
    if (!onset) return "No steady start of the rains in this forecast.";
    return onset.date < (window[0]?.date ?? "")
      ? `Rains started ${formatDay(onset.date, "weekday")}.`
      : `Rains expected to start ${formatDay(onset.date, "weekday")}${onset.provisional ? ", not yet certain" : ""}.`;
  }
  const total = window.reduce((sum, day) => sum + rain(day), 0);
  const wettest = window.reduce<SubseasonalDay | null>((best, day) => (rain(day) > rain(best ?? undefined) ? day : best), null);
  const last = window[window.length - 1]?.day ?? 0;
  const heavy = forecast.heavyDays().filter((day) => day.day <= last).length;
  const parts = [`About ${Math.round(total)} mm of rain in ${span}`];
  if (wettest && rain(wettest) >= forecast.wetDayMm) {
    parts.push(`Wettest day ${formatDay(wettest.date, "weekday")} (${formatAmount(wettest.value, "mm")})`);
  }
  if (heavy) parts.push(`${heavy} heavy-rain day${heavy === 1 ? "" : "s"}`);
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
  // Named for the chosen crop ("maize at tasselling and silking"), or crops in general.
  const crops = ctx.stage === "critical" ? `${crop.noun} at ${ctx.stageLabel}` : `growing ${crop.noun}`;
  const cropping = ctx.stage === "growing" || ctx.stage === "critical";
  const sowing = ctx.stage === "planting" || ctx.stage === "land_prep";

  if (layer === "dry_spell_days") {
    const dry = spellsInWindow(forecast, series, "dry", window)[0];
    if (!dry) return cropping ? "No long dry spell. Soil should stay moist." : "No long dry spell ahead.";
    if (ctx.stage === "harvest") return "Dry weather. Good for harvesting and drying.";
    if (ctx.stage === "dry_season") return "Dry weather. Water stays scarce for crops and animals.";
    if (sowing) return `${sentence(crop.noun)} planted now may die before rain returns.`;
    if (crop.droughtHardy) return `The soil dries out, but ${crop.noun} cope better than most crops.`;
    return `The soil dries out. Yield losses are highest for ${crops}.`;
  }
  if (layer === "wet_spell_days") {
    const wet = spellsInWindow(forecast, series, "wet", window)[0];
    if (!wet) return "No long wet spell. Field work and drying can go ahead.";
    if (ctx.stage === "harvest") return "Drying is slow while it rains.";
    if (sowing) return `The soil is moist enough to plant ${crop.noun}, but fields may waterlog.`;
    if (crop.likesWater) return `Good for ${crop.noun} fields. Watch for ${crop.wetDiseases}.`;
    return `Fields may waterlog. ${sentence(crop.wetDiseases)} spread more, and spraying is harder.`;
  }
  if (layer === "rainy_days") {
    const share = window.filter((day) => rain(day) >= forecast.wetDayMm).length / Math.max(1, window.length);
    if (share >= 0.6) {
      return ctx.stage === "harvest" ? `Rain most days. ${sentence(crop.noun)} will be hard to dry.` : `Rain most days. ${sentence(crop.wetDiseases)} spread more, and field work is hard.`;
    }
    if (share < 0.25) {
      if (!cropping) return "Few rain days.";
      return crop.droughtHardy ? `Few rain days, but ${crop.noun} cope with dry weather.` : `Few rain days. ${sentence(crops)} may run short of water.`;
    }
    return "Good for spraying, weeding and other field work.";
  }
  if (layer === "onset") {
    const onset = series.onset ?? null;
    if (!sowing) return "It is not planting time.";
    if (!onset) return "The rains have not started reliably. Planting now risks a false start.";
    return onset.provisional
      ? "Rains may start, but a dry spell could still follow."
      : "Soils should be wet enough to plant once the rains start.";
  }
  const total = window.reduce((sum, day) => sum + rain(day), 0);
  const last = window[window.length - 1]?.day ?? 0;
  const heavy = forecast.heavyDays().some((day) => day.day <= last);
  if (ctx.stage === "harvest") {
    return heavy || total >= ONSET_THRESHOLD_MM ? `Rain at harvest time. ${sentence(crop.harvestRisk)}.` : `Little rain. Good for harvesting and drying ${crop.noun}.`;
  }
  if (ctx.stage === "dry_season") return total < CESSATION_THRESHOLD_MM ? "Little rain. Water stays scarce." : "Some rain, but not enough to start the season.";
  if (sowing) return total >= ONSET_THRESHOLD_MM ? `Enough rain may fall to plant ${crop.noun}.` : `Not enough rain yet to plant ${crop.noun} safely.`;
  if (heavy) return "Heavy rain can waterlog fields and wash off fertilizer.";
  if (crop.likesWater && total < ONSET_THRESHOLD_MM * 2) return `Light rain for ${crop.noun}. Keep water in the fields.`;
  return total < ONSET_THRESHOLD_MM ? `Light rain. ${sentence(crops)} may need water.` : `Rain should keep the soil moist enough for ${crop.noun}.`;
}

/**
 * Pest and livestock advice from the selected indicator only: what a bulletin adds under "pests and
 * diseases" and "livestock and water". Pests are added only if the layer's advice has none.
 */
function generalActions(
  layer: SubseasonalLayerKey,
  forecast: Forecast,
  series: SubseasonalSeries,
  crop: CropProfile,
  ctx: SeasonContext,
  window: SubseasonalDay[],
  existing: AdvisoryAction[],
  includeLivestock: boolean,
): AdvisoryAction[] {
  const actions: AdvisoryAction[] = [];
  const cropping = ctx.stage === "growing" || ctx.stage === "critical";
  const hasPests = existing.some((item) => item.group === "pests");
  const last = window[window.length - 1]?.day ?? 0;

  if (layer === "dry_spell_days") {
    const dry = spellsInWindow(forecast, series, "dry", window)[0];
    if (dry) {
      if (!hasPests && cropping) {
        actions.push(
          action(forecast, forecast.dayOf(dry), forecast.spellLabel(dry), `Check ${crop.noun} for ${crop.dryPests}. They spread in dry weather.`, "pests", dry.end_date),
        );
      }
      if (includeLivestock) {
        actions.push(
          action(
            forecast,
            forecast.dayOf(dry),
            forecast.spellLabel(dry),
            "Store drinking water for animals, and graze early morning or late afternoon.",
            "livestock",
            dry.end_date,
          ),
        );
      }
    }
  } else if (layer === "wet_spell_days") {
    const wet = spellsInWindow(forecast, series, "wet", window)[0];
    if (wet) {
      if (!hasPests && ctx.stage !== "dry_season") {
        actions.push(
          action(forecast, forecast.dayOf(wet), forecast.spellLabel(wet), `Check ${crop.noun} for ${crop.wetDiseases} during the wet spell.`, "pests", wet.end_date),
        );
      }
      if (includeLivestock) {
        actions.push(
          action(forecast, forecast.dayOf(wet), forecast.spellLabel(wet), "Keep animal pens dry and clean to prevent foot rot and disease.", "livestock", wet.end_date),
        );
      }
    }
  } else if (layer === "rainy_days") {
    const share = window.filter((day) => rain(day) >= forecast.wetDayMm).length / Math.max(1, window.length);
    if (includeLivestock && share < 0.25) {
      actions.push(action(forecast, null, "All period", "Few rain days. Store water for animals.", "livestock"));
    } else if (includeLivestock && share >= 0.6) {
      actions.push(action(forecast, null, "All period", "Rain most days. Keep animal pens dry and feed under cover.", "livestock"));
    }
  } else if (layer === "rainfall") {
    const heavy = forecast.heavyDays().find((day) => day.day <= last) ?? null;
    if (heavy && includeLivestock) {
      actions.push(action(forecast, heavy, formatDay(heavy.date, "weekday"), "Heavy rain. Move animals and feed to higher ground.", "livestock"));
    }
  }
  return actions;
}

/** At most this many actions per group, so each group stays short. */
const GROUP_LIMITS: Record<AdvisoryGroup, number> = { crops: 3, pests: 1, livestock: 2 };

export function buildSubseasonalAdvisory(
  layer: SubseasonalLayerKey,
  series: SubseasonalSeries,
  cropKey: CropKey,
  today: string = todayIso(),
): SubseasonalAdvisory {
  const crop = CROPS[cropKey];
  const forecast = new Forecast(series, today);
  const sector = sectorFor(series);
  if (!forecast.days.length) {
    const last = series.days[series.days.length - 1];
    return {
      tone: "mid",
      headline: "This forecast has ended",
      context: { sector: SECTOR_LABELS[sector], season: "Forecast expired", stage: "no current advice" },
      validity: null,
      outlook: null,
      impact: null,
      actions: [{ when: "Now", date: null, text: "Check back when the next 46-day run is published.", confidence: "likely", group: "crops", end: null }],
      signals: [last ? `The forecast covered days up to ${formatDay(last.date, "weekday")}.` : "The forecast has no days."],
    };
  }
  const ctx: SeasonContext = {
    sector,
    sectorLabel: SECTOR_LABELS[sector],
    ...seasonFor(sector, forecast.days[0]?.date ?? today, crop),
  };

  const draft =
    layer === "rainy_days"
      ? rainyDaysDraft(forecast, crop, ctx)
      : layer === "dry_spell_days"
        ? drySpellDraft(forecast, series, crop, ctx)
        : layer === "wet_spell_days"
          ? wetSpellDraft(forecast, series, crop, ctx)
          : layer === "onset"
            ? onsetDraft(forecast, series, crop, ctx)
            : rainfallDraft(forecast, crop, ctx);

  const window = validityWindow(forecast);
  const general = generalActions(layer, forecast, series, crop, ctx, window, draft.actions, cropKey === "all");

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
      return used[item.group] <= GROUP_LIMITS[item.group];
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
