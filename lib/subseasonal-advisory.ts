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

export type CropKey = "maize" | "rice" | "sorghum_millet" | "legumes" | "roots_tubers" | "vegetables";

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
};

export const CROPS: Record<CropKey, CropProfile> = {
  maize: {
    label: "Maize",
    noun: "maize",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    criticalStage: "tasselling and silking",
    harvestRisk: "cobs rot and grain moulds (aflatoxin) if harvested or dried wet",
  },
  rice: {
    label: "Rice",
    noun: "rice",
    droughtHardy: false,
    likesWater: true,
    lateHarvest: false,
    criticalStage: "booting and flowering",
    harvestRisk: "grain shatters and sprouts if left standing in rain",
  },
  sorghum_millet: {
    label: "Sorghum & millet",
    noun: "sorghum and millet",
    droughtHardy: true,
    likesWater: false,
    lateHarvest: true,
    criticalStage: "heading and grain filling",
    harvestRisk: "heads mould and birds damage grain left in the field",
  },
  legumes: {
    label: "Groundnut & cowpea",
    noun: "groundnut and cowpea",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    criticalStage: "flowering and pod filling",
    harvestRisk: "pods mould (aflatoxin in groundnut) if dried on wet ground",
  },
  roots_tubers: {
    label: "Yam & cassava",
    noun: "yam and cassava",
    droughtHardy: true,
    likesWater: false,
    lateHarvest: true,
    criticalStage: "tuber bulking",
    harvestRisk: "tubers rot if harvested from waterlogged soil",
  },
  vegetables: {
    label: "Vegetables",
    noun: "vegetables",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    criticalStage: "transplanting and fruit set",
    harvestRisk: "leaf and fruit diseases spread fast in wet weather",
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

export type AdvisoryAction = {
  /** Short date label ("Thu 9 Oct", "9–11 Oct") or "Now". */
  when: string;
  /** ISO date the action keys on, for ordering; null for "Now" and standing advice. */
  date: string | null;
  text: string;
  confidence: Confidence;
};

export type AdvisoryTone = "high" | "mid" | "low";

export type SubseasonalAdvisory = {
  tone: AdvisoryTone;
  headline: string;
  context: { sector: string; season: string; stage: string };
  actions: AdvisoryAction[];
  /** The forecast signals the advice rests on, as plain facts. */
  signals: string[];
};

type Run = { start: SubseasonalDay; end: SubseasonalDay; days: number };

function rain(day: SubseasonalDay | undefined) {
  return day?.value ?? 0;
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

function action(forecast: Forecast, day: SubseasonalDay | null, when: string, text: string): AdvisoryAction {
  return { when, date: day && when !== "Now" ? day.date : null, text, confidence: day ? forecast.confidence(day) : "likely" };
}

/** Long dry stretches read as "From 8 Oct" rather than a month-long range. */
function runLabel(run: Run) {
  return run.days > 7 ? `From ${formatDay(run.start.date, "short")}` : shortRange(run.start.date, run.end.date);
}

/** Spell dates for the "why" list: "8–12 Oct", or "under way until 12 Oct". */
function spellFact(forecast: Forecast, spell: SubseasonalSpell) {
  return forecast.ongoing(spell) ? `under way until ${formatDay(spell.end_date, "short")}` : shortRange(spell.start_date, spell.end_date);
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
            ? `Harvest and dry ${crop.noun}: dry weather settles in for ${drying.days}+ days.`
            : `Harvest and dry ${crop.noun}: ${drying.days} dry days in a row.`,
        ),
      );
      const nextDrying = forecast.dryRuns(forecast.wetDayMm, DRYING_WINDOW_DAYS)[1];
      // Once the rains are ending every day dries produce; a second window adds nothing.
      if (nextDrying && !forecast.endOfRains()) {
        actions.push(action(forecast, nextDrying.start, runLabel(nextDrying), "Next drying window if you miss the first."));
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
          ? "Rain-free spell to clear the field, thresh and bag dry produce."
          : `Spray or weed in this rain-free window so chemicals are not washed off${sprayRuns[1] ? `; next window ${runLabel(sprayRuns[1])}` : ""}.`,
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
      ? `Harvest window opens ${formatDay(drying.start.date, "weekday")}`
      : `Little dry weather to harvest ${crop.noun}`;
    tone = drying ? "low" : "high";
    actions.push(...fieldWorkActions(forecast, crop, "harvest"));
    if (!drying) {
      actions.push(action(forecast, null, "Now", `Harvest ripe ${crop.noun} between showers and dry it under cover: ${crop.harvestRisk}.`));
    }
    if (end) {
      actions.push(
        action(forecast, end, `From ${formatDay(end.date, "short")}`, "Rains look set to end. Plan residue management and dry-season storage."),
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
        action(forecast, planting.day, formatDay(planting.day.date, "weekday"), `Rain arrives, but a dry run of ${ONSET_GUARD_DRY_DAYS}+ days may follow: plant only a small area or wait.`),
      );
    } else {
      tone = "high";
      headline = `No planting rain for ${crop.noun} yet`;
      actions.push(action(forecast, null, "Now", "Hold seed. Finish land preparation and ridging so you can plant fast when rain comes."));
    }
    if (planting) {
      signals.push(`${formatAmount(planting.total, "mm")} over 3 days from ${formatDay(planting.day.date, "weekday")} (planting-rain rule: 20 mm in 3 days).`);
    }
  } else if (ctx.stage === "dry_season") {
    headline = twoWeeks >= ONSET_THRESHOLD_MM ? "Unseasonal rain expected" : "Dry season: rely on irrigation";
    tone = twoWeeks >= ONSET_THRESHOLD_MM ? "mid" : "low";
    actions.push(
      action(
        forecast,
        null,
        "Now",
        twoWeeks >= ONSET_THRESHOLD_MM
          ? "Cover stored grain and keep drying produce off the ground: out-of-season rain is forecast."
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
          crop.droughtHardy ? `Keep weeds down so ${crop.noun} gets what moisture there is.` : `Mulch and irrigate where possible: ${ctx.stageLabel} is when water stress costs most yield.`,
        ),
      );
    }
    if (fertilizer && !crop.likesWater) {
      actions.push(
        action(forecast, fertilizer, formatDay(fertilizer.date, "weekday"), "Top-dress fertilizer: soil is moist and no heavy rain follows for two days."),
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
          ? `Heavy rain (${formatAmount(day.value, "mm")}): check bunds and let excess water drain.`
          : `Heavy rain (${formatAmount(day.value, "mm")}): no fertilizer or spraying the day before, and keep drains open.`,
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
    headline = actions.length ? `Few dry windows: use ${actions[0].when}` : "Almost no dry windows for field work";
    if (!actions.length) {
      actions.push(action(forecast, null, "Now", `Postpone spraying. ${ctx.stage === "harvest" ? `Store harvested ${crop.noun} under cover.` : "Keep drains open."}`));
    }
    actions.push(action(forecast, null, "All period", `Scout ${crop.noun} for fungal disease: frequent wet days favour it.`));
  } else if (share < 0.25 && ctx.stage !== "harvest" && ctx.stage !== "dry_season") {
    tone = crop.droughtHardy ? "mid" : "high";
    headline = `Rain days are scarce for ${ctx.stageLabel}`;
    actions.unshift(action(forecast, null, "Now", `Water ${crop.noun} every few days if you can, and mulch to hold moisture.`));
  } else {
    headline = ctx.stage === "harvest" ? `Good mix of days to harvest ${crop.noun}` : "A workable mix of rain and dry days";
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
        action(forecast, null, "Now", ctx.stage === "planting" ? `Soil moisture should hold: plant ${crop.noun} as rain allows.` : `Water supply looks steady for ${crop.noun} at ${ctx.stageLabel}.`),
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
    headline = forecast.ongoing(first) ? "Dry weather now: good for drying" : `Dry spell from ${formatDay(first.start_date, "weekday")}: good for drying`;
    actions.push(action(forecast, start, forecast.spellLabel(first), `Harvest and sun-dry ${crop.noun} on tarpaulins, off bare ground.`));
    if (ctx.stage === "dry_season") {
      actions.push(action(forecast, null, "Now", "Protect stored grain and seed from heat and pests."));
    }
  } else if (ctx.stage === "planting" || ctx.stage === "land_prep") {
    tone = "high";
    headline = forecast.ongoing(first) ? "Hold planting: soils are drying out" : `Hold planting: dry spell from ${formatDay(first.start_date, "weekday")}`;
    actions.push(action(forecast, start, `Until ${formatDay(first.end_date, "short")}`, `Do not plant ${crop.noun} before this spell ends. Seedlings may die.`));
    actions.push(action(forecast, null, "Now", "Prepare land and ridges now so planting is fast once rain resumes."));
  } else {
    const severe = longest.days >= minDays + 3 || ctx.stage === "critical";
    tone = crop.droughtHardy ? "mid" : severe ? "high" : "mid";
    headline =
      ctx.stage === "critical"
        ? `Dry spell during ${crop.criticalStage}`
        : `${longest.days}-day dry spell ${forecast.ongoing(longest) ? "under way" : `from ${formatDay(longest.start_date, "weekday")}`}`;
    actions.push(
      action(
        forecast,
        start,
        forecast.spellLabel(first),
        crop.droughtHardy
          ? `${crop.label} tolerate dry spells. Keep weeds down so the crop keeps the moisture.`
          : `Irrigate ${crop.noun} in this spell, morning or evening, and mulch the rows.`,
      ),
    );
    if (ctx.stage === "critical" && !crop.droughtHardy) {
      actions.push(
        action(forecast, start, forecast.spellLabel(first), `If water is short, water the fields at ${crop.criticalStage} first: yield is lost fastest there.`),
      );
    }
    const next = spells[1];
    if (next && !crop.droughtHardy) {
      actions.push(action(forecast, forecast.dayOf(next), forecast.spellLabel(next), "Another dry spell follows. Keep water and mulch ready."));
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
        action(forecast, null, "Now", ctx.stage === "harvest" ? `Harvest and dry ${crop.noun} as planned.` : "Spraying and fertilizer can follow your normal schedule."),
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
    headline = "Wet spell ahead suits rice";
    actions.push(action(forecast, start, forecast.spellLabel(first), "Repair bunds to hold the water, and open spillways for heavy days."));
  } else if (ctx.stage === "harvest") {
    tone = "high";
    headline = forecast.ongoing(first) ? `Wet spell under way: protect harvested ${crop.noun}` : `Harvest ${crop.noun} before ${formatDay(first.start_date, "weekday")}`;
    actions.push(
      action(
        forecast,
        start,
        forecast.ongoing(first) ? "Now" : `Before ${formatDay(first.start_date, "short")}`,
        forecast.ongoing(first)
          ? `Keep harvested ${crop.noun} under cover and off the ground: ${crop.harvestRisk}.`
          : `Bring in mature ${crop.noun} and store under cover: ${crop.harvestRisk}.`,
      ),
    );
  } else {
    tone = "mid";
    headline = forecast.ongoing(first) ? "Wet spell under way" : `Wet spell from ${formatDay(first.start_date, "weekday")}`;
    if (!forecast.ongoing(first)) {
      actions.push(action(forecast, start, `Before ${formatDay(first.start_date, "short")}`, "Spray and top-dress before it starts, so rain does not wash them off."));
    }
    actions.push(action(forecast, start, forecast.spellLabel(first), `Clear drains, and scout ${crop.noun} for fungal disease during the spell.`));
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
      headline: "This forecast has run out",
      context: { sector: SECTOR_LABELS[sector], season: "Forecast expired", stage: "no current advice" },
      actions: [{ when: "Now", date: null, text: "Check back when the next 46-day run is published.", confidence: "likely" }],
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
          : rainfallDraft(forecast, crop, ctx);

  // Standing advice ("Now", "All period") leads; dated actions follow in calendar order.
  const actions = draft.actions
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (!a.item.date || !b.item.date) {
        return (a.item.date ? 1 : 0) - (b.item.date ? 1 : 0) || a.index - b.index;
      }
      return a.item.date.localeCompare(b.item.date) || a.index - b.index;
    })
    .map(({ item }) => item)
    .slice(0, 4);

  return {
    tone: draft.tone,
    headline: draft.headline,
    context: { sector: ctx.sectorLabel, season: ctx.season, stage: ctx.stageLabel },
    actions,
    signals: draft.signals,
  };
}
