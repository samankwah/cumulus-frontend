"use client";

import { AdvisoryPreview } from "@/components/admin/advisory-preview";
import { DocumentEditor } from "@/components/admin/document-editor";
import { NumberInput } from "@/components/admin/fields";
import type { AdvisoryThresholds } from "@/lib/content/advisory-content";

type Field = { key: keyof AdvisoryThresholds; label: string; unit?: string; help: string; step?: number; min?: number; max?: number };

type Group = {
  title: string;
  about: string;
  fields: Field[];
  /** The rule in one plain sentence, from the values being edited. */
  rule: (t: AdvisoryThresholds) => React.ReactNode;
};

const n = (value: number, unit = "") => <strong>{Number.isFinite(value) ? `${value}${unit ? ` ${unit}` : ""}` : "?"}</strong>;
const pct = (share: number) => <strong>{Number.isFinite(share) ? `${Math.round(share * 100)}%` : "?"}</strong>;

const GROUPS: Group[] = [
  {
    title: "Planting rain",
    about: "When the rainfall advice says it is safe to plant. (The Onset map layer uses the backend's own rule.)",
    fields: [
      { key: "onsetThresholdMm", label: "Rain needed", unit: "mm", help: "Also the “enough rain” mark for growing crops." },
      { key: "onsetWindowDays", label: "Falling within", unit: "days", step: 1, min: 1, help: "Consecutive days the rain is added over." },
      { key: "onsetGuardDryDays", label: "False start after", unit: "dry days", step: 1, min: 1, help: "A dry run this long means seedlings may die." },
      { key: "onsetGuardDays", label: "Checked over", unit: "days", step: 1, min: 1, help: "How far ahead the dry run is looked for." },
    ],
    rule: (t) => (
      <>
        Plant when at least {n(t.onsetThresholdMm, "mm")} falls within {n(t.onsetWindowDays, "days")}, with no dry run of{" "}
        {n(t.onsetGuardDryDays, "days")} in the {n(t.onsetGuardDays, "days")} from the rain.
      </>
    ),
  },
  {
    title: "End of rains",
    about: "When the advice says the season is ending (harvest and storage advice).",
    fields: [
      { key: "cessationWindowDays", label: "Over", unit: "days", step: 1, min: 1, help: "Length of the stretch looked at." },
      { key: "cessationThresholdMm", label: "Total at most", unit: "mm", help: "Rain over the whole stretch." },
    ],
    rule: (t) => (
      <>
        The rains have ended when {n(t.cessationWindowDays, "days")} in a row bring {n(t.cessationThresholdMm, "mm")} or less.
      </>
    ),
  },
  {
    title: "Field work",
    about: "Heavy rain warnings and the windows for spraying, drying and fertilizer.",
    fields: [
      { key: "heavyDayMm", label: "Heavy-rain day", unit: "mm", help: "A day with at least this much rain." },
      { key: "washOffMm", label: "Wash-off rain", unit: "mm", help: "Less than this does not wash sprays off." },
      { key: "sprayWindowDays", label: "Spray window", unit: "days", step: 1, min: 1, help: "Rain-free days needed to spray or weed." },
      { key: "dryingWindowDays", label: "Drying window", unit: "days", step: 1, min: 1, help: "Dry days in a row to dry a harvest." },
      { key: "moistSoilMm", label: "Moist soil for top-dressing", unit: "mm", help: "Rain over the 3 days before." },
    ],
    rule: (t) => (
      <>
        Heavy rain is {n(t.heavyDayMm, "mm")} or more in a day. Spray when {n(t.sprayWindowDays, "days")} in a row stay under{" "}
        {n(t.washOffMm, "mm")}; dry a harvest over {n(t.dryingWindowDays, "dry days")}; top-dress after {n(t.moistSoilMm, "mm")}.
      </>
    ),
  },
  {
    title: "Rain days and dry spells",
    fields: [
      { key: "nearTermDays", label: "Look-ahead", unit: "days", step: 1, min: 1, max: 46, help: "Days the rainfall and rain-day advice looks at." },
      { key: "manyRainDaysShare", label: "“Rain most days” above", step: 0.05, min: 0, max: 1, help: "Share of days with rain, from 0 to 1 (0.6 = 60%)." },
      { key: "fewRainDaysShare", label: "“Few rain days” below", step: 0.05, min: 0, max: 1, help: "Share of days with rain, from 0 to 1 (0.25 = 25%)." },
      { key: "severeDrySpellExtraDays", label: "Severe dry spell", unit: "extra days", step: 1, min: 0, help: "Days past the minimum spell length." },
    ],
    about: "How the advice describes the coming days.",
    rule: (t) => (
      <>
        Over the next {n(t.nearTermDays, "days")}: rain on more than {pct(t.manyRainDaysShare)} of days is “rain most days”, under{" "}
        {pct(t.fewRainDaysShare)} is “few rain days”.
      </>
    ),
  },
  {
    title: "Extreme rain",
    about: "When a day counts as a flood risk on the Extreme rain layer.",
    fields: [
      { key: "extremeChanceEnsemblePct", label: "Ensemble forecasts", unit: "% chance", min: 0, max: 100, help: "Chance of 50 mm+ that counts as a risk day." },
      { key: "extremeChanceSinglePct", label: "Single-run forecasts", unit: "%", min: 0, max: 100, help: "Single runs give 0% or 100% per day." },
    ],
    rule: (t) => (
      <>
        A day is a flood risk from a {n(t.extremeChanceEnsemblePct, "%")} chance (ensemble) or {n(t.extremeChanceSinglePct, "%")} (single run).
      </>
    ),
  },
  {
    title: "Confidence by lead time",
    about: "The Likely / Possible / Outlook tag on each piece of advice.",
    fields: [
      { key: "likelyLeadDays", label: "“Likely” up to", unit: "days ahead", step: 1, min: 1, max: 46, help: "The forecast is most reliable here." },
      {
        key: "possibleLeadDays",
        label: "“Possible” up to",
        unit: "days ahead",
        step: 1,
        min: 1,
        max: 46,
        help: "After this, “Outlook”. Also how far the advice is valid.",
      },
    ],
    rule: (t) => (
      <>
        Likely for the next {n(t.likelyLeadDays, "days")}, possible up to {n(t.possibleLeadDays, "days")} ahead, outlook after that.
      </>
    ),
  },
];

const LABELS = Object.fromEntries(GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.label])));

export default function ThresholdsPage() {
  return (
    <DocumentEditor
      sectionKey="thresholds"
      title="Thresholds"
      noun="Thresholds"
      description="The numbers the advisory is worked out from. They decide when the site says “plant”, “heavy rain” or “the rains are ending”, so change them with care."
      describeChange={(path) => LABELS[path] ?? path}
      preview={(draft) => <AdvisoryPreview apply={(content) => ({ ...content, thresholds: draft })} />}
    >
      {({ draft, setDraft, defaults }) => (
        <>
          {GROUPS.map((group) => (
            <section className="adm-card adm-section" key={group.title}>
              <div className="adm-section-head">
                <div>
                  <h2>{group.title}</h2>
                  <p>{group.about}</p>
                </div>
              </div>
              <div className={group.fields.length === 4 || group.fields.length === 2 ? "adm-cols pairs" : "adm-cols"}>
                {group.fields.map((field) => (
                  <NumberInput
                    key={field.key}
                    label={field.label}
                    path={field.key}
                    unit={field.unit}
                    step={field.step}
                    min={field.min}
                    max={field.max}
                    value={draft[field.key]}
                    defaultValue={defaults[field.key]}
                    onChange={(value) => setDraft((d) => ({ ...d, [field.key]: value }))}
                    help={
                      <>
                        {field.help} Default {defaults[field.key]}.
                      </>
                    }
                  />
                ))}
              </div>
              <p className="adm-rule">{group.rule(draft)}</p>
            </section>
          ))}
        </>
      )}
    </DocumentEditor>
  );
}
