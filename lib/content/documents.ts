import { z } from "zod";

import { DEFAULT_ADVISORY_CONTENT } from "@/lib/content/advisory-content";
import type { AdvisoryContent } from "@/lib/content/advisory-content";
import { ADVISORY_MESSAGE_DEFAULTS, placeholdersIn } from "@/lib/content/advisory-messages";
import type { AdvisoryMessageId } from "@/lib/content/advisory-messages";
import { DEFAULT_SITE_CONTENT } from "@/lib/content/site-content";
import type { SiteContent } from "@/lib/content/site-content";

/* ------------------------------------------------------------------------------------------
 * The editable sections ("documents") of the site's content, how each is validated, and how
 * the stored documents combine with the built-in defaults into the SiteContent the site uses.
 * A section that is missing, empty or fails validation falls back to its defaults on its own,
 * so one bad save can never take the rest of the site down with it.
 * ------------------------------------------------------------------------------------------ */

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => text(max).min(1, "Required");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const monthDay = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use MM-DD, e.g. 03-15");
const number = (min: number, max: number) => z.number({ invalid_type_error: "Enter a number" }).min(min).max(max);
const stage = z.enum(["dry_season", "land_prep", "planting", "growing", "critical", "harvest"]);

const siteSchema = z.object({
  title: requiredText(120),
  description: text(300),
  brandName: requiredText(40),
  subseasonalHeading: requiredText(60),
  dataInfo: z.object({
    demoNote: text(300),
    gridNote: text(60),
    observedRainfall: text(400),
  }),
  about: z.object({
    body: text(2000),
    disclaimer: text(2000),
    contactEmail: z.union([z.literal(""), z.string().trim().email("Not a valid email")]),
    contactPhone: text(40),
  }),
});

const announcementSchema = z
  .object({
    id: requiredText(40),
    message: requiredText(500),
    level: z.enum(["info", "warning", "urgent"]),
    active: z.boolean(),
    startsOn: isoDate.nullable(),
    endsOn: isoDate.nullable(),
    linkUrl: z.union([z.literal(""), z.string().trim().url("Not a valid link").max(500)]),
    linkLabel: text(60),
  })
  .refine((item) => !item.startsOn || !item.endsOn || item.startsOn <= item.endsOn, {
    message: "The end date is before the start date",
    path: ["endsOn"],
  });

const cropSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_]{1,40}$/, "Lower-case letters, digits and _ only"),
  label: requiredText(60),
  noun: requiredText(60),
  droughtHardy: z.boolean(),
  likesWater: z.boolean(),
  lateHarvest: z.boolean(),
  livestockAdvice: z.boolean(),
  criticalStage: requiredText(120),
  harvestRisk: requiredText(200),
  dryPests: requiredText(120),
  wetDiseases: requiredText(120),
});

const cropsSchema = z
  .array(cropSchema)
  .min(1, "Keep at least one crop")
  .max(40)
  .refine((crops) => new Set(crops.map((crop) => crop.key)).size === crops.length, { message: "Two crops share an id" });

const thresholdsSchema = z
  .object({
    onsetThresholdMm: number(1, 500),
    onsetWindowDays: number(1, 30).int(),
    onsetGuardDryDays: number(1, 60).int(),
    onsetGuardDays: number(1, 60).int(),
    cessationWindowDays: number(1, 60).int(),
    cessationThresholdMm: number(0, 500),
    heavyDayMm: number(1, 500),
    washOffMm: number(0, 100),
    sprayWindowDays: number(1, 14).int(),
    dryingWindowDays: number(1, 14).int(),
    moistSoilMm: number(0, 200),
    likelyLeadDays: number(1, 46).int(),
    possibleLeadDays: number(1, 46).int(),
    nearTermDays: number(1, 46).int(),
    manyRainDaysShare: number(0, 1),
    fewRainDaysShare: number(0, 1),
    severeDrySpellExtraDays: number(0, 30).int(),
    extremeChanceEnsemblePct: number(0, 100),
    extremeChanceSinglePct: number(0, 100),
  })
  .refine((t) => t.likelyLeadDays <= t.possibleLeadDays, {
    message: "'Likely' must not reach further ahead than 'possible'",
    path: ["likelyLeadDays"],
  })
  .refine((t) => t.fewRainDaysShare <= t.manyRainDaysShare, {
    message: "'Few rain days' must be below 'rain most days'",
    path: ["fewRainDaysShare"],
  });

const periodsSchema = z
  .array(z.object({ from: monthDay, season: requiredText(60), stage }))
  .min(1, "Add at least one period")
  .max(24)
  .refine((periods) => new Set(periods.map((period) => period.from)).size === periods.length, {
    message: "Two periods start on the same day",
  });

const seasonsSchema = z.object({
  calendar: z.object({
    north: periodsSchema,
    northLateHarvest: periodsSchema,
    south: periodsSchema,
    southLateHarvest: periodsSchema,
  }),
  stageLabels: z.object({
    dry_season: requiredText(60),
    land_prep: requiredText(60),
    planting: requiredText(60),
    growing: requiredText(60),
    harvest: requiredText(60),
  }),
});

const regionsSchema = z
  .object({
    northernLatitude: number(4, 12),
    transitionLatitude: number(4, 12),
    northernRegions: z.array(requiredText(60)).max(20),
    transitionRegions: z.array(requiredText(60)).max(20),
    labels: z.object({ north: requiredText(60), transition: requiredText(60), south: requiredText(60) }),
  })
  .refine((s) => s.transitionLatitude <= s.northernLatitude, {
    message: "The transition line must be south of the northern line",
    path: ["transitionLatitude"],
  });

const labelsSchema = z.object({
  groups: z.object({
    labels: z.object({ crops: requiredText(40), pests: requiredText(40), livestock: requiredText(40) }),
    limits: z.object({ crops: number(1, 10).int(), pests: number(0, 10).int(), livestock: number(0, 10).int() }),
  }),
  confidence: z.object({
    labels: z.object({ likely: requiredText(30), possible: requiredText(30), outlook: requiredText(30) }),
    hints: z.object({ likely: text(200), possible: text(200), outlook: text(200) }),
  }),
});

/** Placeholders any advisory message may use, besides the ones in its own default text. */
export const SHARED_PLACEHOLDERS = ["crop", "cropLabel", "criticalStage", "harvestRisk", "dryPests", "wetDiseases", "stage"];

/** Placeholders a message may use: the shared ones plus those in its default text ({Crop} counts as {crop}). */
export function allowedPlaceholders(id: AdvisoryMessageId) {
  return Array.from(new Set([...SHARED_PLACEHOLDERS, ...placeholdersIn(ADVISORY_MESSAGE_DEFAULTS[id])]));
}

function unknownPlaceholders(id: AdvisoryMessageId, template: string) {
  const allowed = allowedPlaceholders(id);
  return placeholdersIn(template).filter((name) => {
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    return !allowed.includes(name) && !allowed.includes(lower);
  });
}

/** Only the messages that differ from the defaults are stored; unknown ids are rejected. */
const messagesSchema = z.record(z.string(), text(600)).superRefine((messages, ctx) => {
  for (const [id, template] of Object.entries(messages)) {
    if (!(id in ADVISORY_MESSAGE_DEFAULTS)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [id], message: "Unknown message" });
      continue;
    }
    const unknown = unknownPlaceholders(id as AdvisoryMessageId, template);
    if (unknown.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [id],
        message: `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((name) => `{${name}}`).join(", ")}`,
      });
    }
  }
});

export const CONTENT_DOCUMENTS = {
  site: { title: "Site text", schema: siteSchema },
  announcements: { title: "Announcements", schema: z.array(announcementSchema).max(20) },
  crops: { title: "Crops", schema: cropsSchema },
  thresholds: { title: "Thresholds", schema: thresholdsSchema },
  seasons: { title: "Season calendar", schema: seasonsSchema },
  regions: { title: "Regions & sectors", schema: regionsSchema },
  messages: { title: "Advisory messages", schema: messagesSchema },
  labels: { title: "Advisory labels", schema: labelsSchema },
} as const;

export type ContentKey = keyof typeof CONTENT_DOCUMENTS;
export type ContentData<K extends ContentKey> = z.infer<(typeof CONTENT_DOCUMENTS)[K]["schema"]>;

export const CONTENT_KEYS = Object.keys(CONTENT_DOCUMENTS) as ContentKey[];

export function isContentKey(value: string): value is ContentKey {
  return value in CONTENT_DOCUMENTS;
}

/** A section's built-in defaults, in the shape it is stored and edited in. */
export function defaultDocument<K extends ContentKey>(key: K): ContentData<K> {
  const content = DEFAULT_SITE_CONTENT;
  const advisory = DEFAULT_ADVISORY_CONTENT;
  const defaults: { [P in ContentKey]: ContentData<P> } = {
    site: content.site,
    announcements: content.announcements,
    crops: advisory.crops,
    thresholds: advisory.thresholds,
    seasons: { calendar: advisory.calendar, stageLabels: advisory.stageLabels },
    regions: advisory.sectors,
    messages: {},
    labels: { groups: advisory.groups, confidence: advisory.confidence },
  };
  return structuredClone(defaults[key]);
}

export function validateDocument<K extends ContentKey>(key: K, data: unknown) {
  return CONTENT_DOCUMENTS[key].schema.safeParse(data) as z.SafeParseReturnType<unknown, ContentData<K>>;
}

/**
 * The site's content from the stored documents: each valid document replaces its section of the
 * defaults; a missing (null) or invalid one leaves the defaults in place.
 */
export function buildSiteContent(documents: Partial<Record<string, unknown>>): SiteContent {
  const read = <K extends ContentKey>(key: K): ContentData<K> | null => {
    const data = documents[key];
    if (data === null || data === undefined) return null;
    const parsed = validateDocument(key, data);
    if (!parsed.success) {
      console.warn(`[content] Stored "${key}" failed validation; using the defaults.`, parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  };

  const site = read("site");
  const announcements = read("announcements");
  const crops = read("crops");
  const thresholds = read("thresholds");
  const seasons = read("seasons");
  const regions = read("regions");
  const messages = read("messages");
  const labels = read("labels");

  const base = DEFAULT_ADVISORY_CONTENT;
  const advisory: AdvisoryContent = {
    thresholds: thresholds ?? base.thresholds,
    sectors: regions ?? base.sectors,
    calendar: seasons?.calendar ?? base.calendar,
    stageLabels: seasons?.stageLabels ?? base.stageLabels,
    crops: crops ?? base.crops,
    groups: labels?.groups ?? base.groups,
    confidence: labels?.confidence ?? base.confidence,
    messages: { ...base.messages, ...(messages as Partial<AdvisoryContent["messages"]> | null) },
  };
  return {
    site: site ?? DEFAULT_SITE_CONTENT.site,
    announcements: announcements ?? DEFAULT_SITE_CONTENT.announcements,
    advisory,
  };
}
