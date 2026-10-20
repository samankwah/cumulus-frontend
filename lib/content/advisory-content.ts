import { ADVISORY_MESSAGE_DEFAULTS } from "@/lib/content/advisory-messages";
import type { AdvisoryMessages } from "@/lib/content/advisory-messages";

/* ------------------------------------------------------------------------------------------
 * Everything the farm advisory is built from that a forecaster may want to change: thresholds,
 * Ghana's rainfall sectors, the season calendar, the crops and every sentence. The values here
 * are the built-in defaults; the admin pages store edited copies, and the site falls back to
 * these whenever no edited copy is available.
 * ------------------------------------------------------------------------------------------ */

export type Sector = "north" | "transition" | "south";

/** Where in the farming calendar a place is, which sets the crop stage the advice speaks to. */
export type Stage = "dry_season" | "land_prep" | "planting" | "growing" | "critical" | "harvest";

export const STAGES: Stage[] = ["dry_season", "land_prep", "planting", "growing", "critical", "harvest"];

/** Advice groups, as in an agrometeorological bulletin: crops, pests and diseases, livestock and water. */
export type AdvisoryGroup = "crops" | "pests" | "livestock";

export type Confidence = "likely" | "possible" | "outlook";

export type CropProfile = {
  /** Stable id, kept in the viewer's browser to remember their pick. */
  key: string;
  label: string;
  /** Plural noun used in sentences ("dry your maize"). */
  noun: string;
  /** Tolerates prolonged dry spells (sorghum, millet, cassava). */
  droughtHardy: boolean;
  /** Tolerates standing water (lowland rice). */
  likesWater: boolean;
  /** Harvest happens later than the cereal harvest in the north. */
  lateHarvest: boolean;
  /** Also give livestock & water advice when this crop is picked. */
  livestockAdvice: boolean;
  /** Most sensitive stage to water stress. */
  criticalStage: string;
  /** What to protect in a wet harvest. */
  harvestRisk: string;
  /** Pests that build up in dry weather, to watch for in a dry spell. */
  dryPests: string;
  /** Diseases that spread in wet weather, to scout for in a wet spell. */
  wetDiseases: string;
};

/** From this month-day ("MM-DD") until the next entry, the place is in this season and stage. */
export type SeasonPeriod = { from: string; season: string; stage: Stage };

export type AdvisoryThresholds = {
  /** Planting rain: this much rain ... */
  onsetThresholdMm: number;
  /** ... within this many days ... */
  onsetWindowDays: number;
  /** ... and no dry run this long ... */
  onsetGuardDryDays: number;
  /** ... in this many days from the rain. */
  onsetGuardDays: number;
  /** End of rains: this many days ... */
  cessationWindowDays: number;
  /** ... totalling this much rain or less. */
  cessationThresholdMm: number;
  /** A day with at least this much rain is a heavy-rain day. */
  heavyDayMm: number;
  /** A spray or fertilizer application needs days below this much rain after it. */
  washOffMm: number;
  /** Rain-free days needed for spraying. */
  sprayWindowDays: number;
  /** Dry days in a row needed to dry a harvest. */
  dryingWindowDays: number;
  /** Soil counts as moist enough to top-dress after this much rain over the previous days. */
  moistSoilMm: number;
  /** Days ahead the forecast counts as "likely". */
  likelyLeadDays: number;
  /** Days ahead the forecast counts as "possible"; later days are "outlook". */
  possibleLeadDays: number;
  /** Days ahead the rainfall and rain-day advice looks at. */
  nearTermDays: number;
  /** Share of rain days (0–1) above which it rains "most days". */
  manyRainDaysShare: number;
  /** Share of rain days (0–1) below which there are "few rain days". */
  fewRainDaysShare: number;
  /** A dry spell this many days past the minimum is severe. */
  severeDrySpellExtraDays: number;
  /** Ensemble: % chance of extreme rain that counts as a risk day. */
  extremeChanceEnsemblePct: number;
  /** Single run: % that counts as a risk day (0 or 100 per day). */
  extremeChanceSinglePct: number;
};

export type AdvisoryContent = {
  thresholds: AdvisoryThresholds;
  sectors: {
    /** At or north of this latitude: the northern (one-season) sector. */
    northernLatitude: number;
    /** At or north of this latitude (and south of the northern line): the transition zone. */
    transitionLatitude: number;
    /** Area series carry no coordinates, so regions map to sectors by name. */
    northernRegions: string[];
    transitionRegions: string[];
    labels: Record<Sector, string>;
  };
  /** Season calendars. The transition zone uses the southern calendar. */
  calendar: {
    north: SeasonPeriod[];
    northLateHarvest: SeasonPeriod[];
    south: SeasonPeriod[];
    southLateHarvest: SeasonPeriod[];
  };
  /** Stage names in the advice; the critical stage is named by each crop instead. */
  stageLabels: Record<Exclude<Stage, "critical">, string>;
  /** In the order the crop picker lists them; the first is the default pick. */
  crops: CropProfile[];
  groups: {
    labels: Record<AdvisoryGroup, string>;
    /** At most this many actions per group, so each group stays short. */
    limits: Record<AdvisoryGroup, number>;
  };
  confidence: {
    labels: Record<Confidence, string>;
    hints: Record<Confidence, string>;
  };
  messages: AdvisoryMessages;
};

/**
 * North: one season (rains May–Oct, cessation reference ~5 Nov). South and transition: major season
 * Mar–Jul, short break, minor season mid-Aug–Nov (cessation reference ~7 Nov), per
 * configs/seasonal_map.yaml profiles. Late-harvest crops (sorghum, millet, yam, cassava) stay in the
 * field longer.
 */
const CALENDAR: AdvisoryContent["calendar"] = {
  north: [
    { from: "01-01", season: "Dry season", stage: "dry_season" },
    { from: "03-15", season: "Before the rains", stage: "land_prep" },
    { from: "05-01", season: "Start of the main season", stage: "planting" },
    { from: "06-16", season: "Main season", stage: "growing" },
    { from: "08-01", season: "Main season", stage: "critical" },
    { from: "09-01", season: "Main season", stage: "harvest" },
    { from: "10-01", season: "End of the main season", stage: "harvest" },
    { from: "12-01", season: "Dry season", stage: "dry_season" },
  ],
  northLateHarvest: [
    { from: "01-01", season: "Dry season", stage: "dry_season" },
    { from: "03-15", season: "Before the rains", stage: "land_prep" },
    { from: "05-01", season: "Start of the main season", stage: "planting" },
    { from: "06-16", season: "Main season", stage: "growing" },
    { from: "08-01", season: "Main season", stage: "critical" },
    { from: "11-01", season: "End of the main season", stage: "harvest" },
  ],
  south: [
    { from: "01-01", season: "Dry season", stage: "dry_season" },
    { from: "02-01", season: "Before the major season", stage: "land_prep" },
    { from: "03-01", season: "Major season", stage: "planting" },
    { from: "05-01", season: "Major season", stage: "growing" },
    { from: "06-16", season: "End of the major season", stage: "harvest" },
    { from: "08-01", season: "Minor season", stage: "planting" },
    { from: "10-01", season: "Minor season", stage: "critical" },
    { from: "11-01", season: "End of the minor season", stage: "harvest" },
    { from: "11-16", season: "Dry season", stage: "dry_season" },
  ],
  southLateHarvest: [
    { from: "01-01", season: "Dry season", stage: "dry_season" },
    { from: "02-01", season: "Before the major season", stage: "land_prep" },
    { from: "03-01", season: "Major season", stage: "planting" },
    { from: "05-01", season: "Major season", stage: "growing" },
    { from: "06-16", season: "End of the major season", stage: "growing" },
    { from: "08-01", season: "Minor season", stage: "planting" },
    { from: "10-01", season: "Minor season", stage: "critical" },
    { from: "11-01", season: "End of the minor season", stage: "harvest" },
    { from: "11-16", season: "Dry season", stage: "harvest" },
  ],
};

const CROPS: CropProfile[] = [
  // The default: advice that holds for crops in general, before a farmer picks their own.
  {
    key: "all",
    label: "All crops",
    noun: "crops",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    livestockAdvice: true,
    criticalStage: "flowering and grain filling",
    harvestRisk: "grain and pods mould if harvested or dried wet",
    dryPests: "fall armyworm and aphids",
    wetDiseases: "fungal leaf and pod diseases",
  },
  {
    key: "maize",
    label: "Maize",
    noun: "maize",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    livestockAdvice: false,
    criticalStage: "tasselling and silking",
    harvestRisk: "cobs rot and grain moulds (aflatoxin) if harvested or dried wet",
    dryPests: "fall armyworm and stem borers",
    wetDiseases: "leaf blight and ear rot",
  },
  {
    key: "rice",
    label: "Rice",
    noun: "rice",
    droughtHardy: false,
    likesWater: true,
    lateHarvest: false,
    livestockAdvice: false,
    criticalStage: "booting and flowering",
    harvestRisk: "grain shatters and sprouts if left standing in rain",
    dryPests: "stem borers and rice bugs",
    wetDiseases: "rice blast and sheath blight",
  },
  {
    key: "sorghum_millet",
    label: "Sorghum & millet",
    noun: "sorghum and millet",
    droughtHardy: true,
    likesWater: false,
    lateHarvest: true,
    livestockAdvice: false,
    criticalStage: "heading and grain filling",
    harvestRisk: "heads mould and birds damage grain left in the field",
    dryPests: "stem borers and aphids",
    wetDiseases: "grain mould and anthracnose",
  },
  {
    key: "legumes",
    label: "Groundnut & cowpea",
    noun: "groundnut and cowpea",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    livestockAdvice: false,
    criticalStage: "flowering and pod filling",
    harvestRisk: "pods mould (aflatoxin in groundnut) if dried on wet ground",
    dryPests: "aphids and thrips",
    wetDiseases: "leaf spot and pod rot",
  },
  {
    key: "roots_tubers",
    label: "Yam & cassava",
    noun: "yam and cassava",
    droughtHardy: true,
    likesWater: false,
    lateHarvest: true,
    livestockAdvice: false,
    criticalStage: "tuber bulking",
    harvestRisk: "tubers rot if harvested from waterlogged soil",
    dryPests: "cassava mealybug and green mite",
    wetDiseases: "yam anthracnose and tuber rot",
  },
  {
    key: "vegetables",
    label: "Vegetables",
    noun: "vegetables",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    livestockAdvice: false,
    criticalStage: "transplanting and fruit set",
    harvestRisk: "leaf and fruit diseases spread fast in wet weather",
    dryPests: "whiteflies, aphids and mites",
    wetDiseases: "blight and leaf spot",
  },
];

/**
 * Planting and end-of-rains follow the backend definitions (configs/advisory.yaml): onset = 20 mm in
 * 3 days with no 7-day dry run in the next 10; cessation = 14 days totalling 10 mm or less. Lead time
 * sets confidence: the model's own guidance is that day-to-day detail beyond ~10 days is indicative only.
 */
export const DEFAULT_ADVISORY_CONTENT: AdvisoryContent = {
  thresholds: {
    onsetThresholdMm: 20,
    onsetWindowDays: 3,
    onsetGuardDryDays: 7,
    onsetGuardDays: 10,
    cessationWindowDays: 14,
    cessationThresholdMm: 10,
    heavyDayMm: 30,
    washOffMm: 5,
    sprayWindowDays: 2,
    dryingWindowDays: 3,
    moistSoilMm: 10,
    likelyLeadDays: 10,
    possibleLeadDays: 21,
    nearTermDays: 14,
    manyRainDaysShare: 0.6,
    fewRainDaysShare: 0.25,
    severeDrySpellExtraDays: 3,
    extremeChanceEnsemblePct: 10,
    extremeChanceSinglePct: 50,
  },
  sectors: {
    // Split at 8°N as in backend configs/seasonal_map.yaml.
    northernLatitude: 8.0,
    transitionLatitude: 7.0,
    northernRegions: ["Northern", "Savannah", "North East", "Upper East", "Upper West"],
    transitionRegions: ["Bono", "Bono East", "Oti"],
    labels: {
      north: "Northern sector",
      transition: "Transition zone",
      south: "Southern sector",
    },
  },
  calendar: CALENDAR,
  stageLabels: {
    dry_season: "dry season",
    land_prep: "land preparation",
    planting: "planting time",
    growing: "crop growing",
    harvest: "harvest time",
  },
  crops: CROPS,
  groups: {
    labels: {
      crops: "Crops",
      pests: "Pests & disease",
      livestock: "Livestock & water",
    },
    limits: { crops: 3, pests: 1, livestock: 2 },
  },
  confidence: {
    labels: {
      likely: "Likely",
      possible: "Possible",
      outlook: "Outlook",
    },
    hints: {
      likely: "Within the next 10 days: the forecast is most reliable here.",
      possible: "10–21 days ahead: timing may shift by a few days.",
      outlook: "More than 3 weeks ahead: treat as an early signal only.",
    },
  },
  messages: { ...ADVISORY_MESSAGE_DEFAULTS },
};
