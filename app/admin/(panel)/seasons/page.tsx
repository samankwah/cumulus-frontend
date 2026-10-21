"use client";

import { useState } from "react";

import { AdvisoryPreview } from "@/components/admin/advisory-preview";
import { DocumentEditor } from "@/components/admin/document-editor";
import { MonthDayInput, TextInput, fieldId } from "@/components/admin/fields";
import { Select } from "@/components/admin/select";
import { Button } from "@/components/admin/ui";
import type { AdvisoryContent, SeasonPeriod, Stage } from "@/lib/content/advisory-content";

type Calendar = AdvisoryContent["calendar"];
type CalendarKey = keyof Calendar;
type Draft = { calendar: Calendar; stageLabels: AdvisoryContent["stageLabels"] };

const CALENDARS: { key: CalendarKey; title: string; about: string }[] = [
  { key: "north", title: "North", about: "Northern sector: one rainy season, May to October. Used for most crops." },
  { key: "northLateHarvest", title: "North · late harvest", about: "Northern sector, for crops marked “Late harvest” (sorghum, millet, yam, cassava)." },
  { key: "south", title: "South & transition", about: "Southern sector and transition zone: major season Mar–Jul, minor season Aug–Nov. Used for most crops." },
  { key: "southLateHarvest", title: "South · late harvest", about: "Southern sector and transition zone, for crops marked “Late harvest”." },
];

const STAGES: { value: Stage; label: string; color: string }[] = [
  { value: "dry_season", label: "Dry season", color: "#eadfc3" },
  { value: "land_prep", label: "Land preparation", color: "#f3c48d" },
  { value: "planting", label: "Planting", color: "#9fd89a" },
  { value: "growing", label: "Growing", color: "#5fbf8a" },
  { value: "critical", label: "Critical stage", color: "#f29b8f" },
  { value: "harvest", label: "Harvest", color: "#f6d76b" },
];

const STAGE = Object.fromEntries(STAGES.map((stage) => [stage.value, stage])) as Record<Stage, (typeof STAGES)[number]>;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function dayOfYear(monthDay: string) {
  const [month, day] = monthDay.split("-").map(Number);
  return (MONTH_START[(month || 1) - 1] ?? 0) + (day || 1) - 1;
}

function sortPeriods(periods: SeasonPeriod[]) {
  return [...periods].sort((a, b) => a.from.localeCompare(b.from));
}

/** The year as coloured bands, one per period, with today's position marked. */
function YearStrip({ periods }: { periods: SeasonPeriod[] }) {
  const sorted = sortPeriods(periods);
  if (!sorted.length) return null;
  // Before the first date of the year, the last period carries on from December.
  const bands = [
    ...(dayOfYear(sorted[0].from) > 0 ? [{ start: 0, period: sorted[sorted.length - 1] }] : []),
    ...sorted.map((period) => ({ start: dayOfYear(period.from), period })),
  ];
  const now = new Date();
  const today = MONTH_START[now.getMonth()] + now.getDate() - 1;
  return (
    <div className="adm-strip" role="img" aria-label={sorted.map((p) => `${p.from}: ${p.season}, ${STAGE[p.stage]?.label}`).join("; ")}>
      <div className="adm-strip-bar">
        {bands.map((band, index) => {
          const end = bands[index + 1]?.start ?? 365;
          const days = end - band.start;
          if (days <= 0) return null;
          return (
            <div
              key={index}
              className="adm-strip-seg"
              style={{ width: `${(days / 365) * 100}%`, background: STAGE[band.period.stage]?.color }}
              title={`${band.period.season} · ${STAGE[band.period.stage]?.label}`}
            >
              {days > 24 && bands[index - 1]?.period.stage !== band.period.stage ? STAGE[band.period.stage]?.label : ""}
            </div>
          );
        })}
      </div>
      <div className="adm-strip-today" style={{ left: `${(today / 365) * 100}%` }}>
        <span>Today</span>
      </div>
      <div className="adm-strip-months" aria-hidden="true">
        {MONTHS.map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
    </div>
  );
}

export default function SeasonsPage() {
  const [tab, setTab] = useState<CalendarKey>("north");
  return (
    <DocumentEditor
      sectionKey="seasons"
      title="Season calendar"
      noun="Season calendar"
      description="Which season and crop stage the advice assumes on each date. Each period runs from its start date until the next one begins."
      toStored={(draft: Draft) => ({
        ...draft,
        calendar: Object.fromEntries(Object.entries(draft.calendar).map(([key, periods]) => [key, sortPeriods(periods)])) as Calendar,
      })}
      describeChange={(path) => {
        const [part, key, index, field] = path.split(".");
        if (part === "stageLabels") return `Stage name › ${STAGE[key as Stage]?.label ?? key}`;
        const calendar = CALENDARS.find((item) => item.key === key)?.title ?? key;
        return index !== undefined ? `${calendar} › period ${Number(index) + 1}${field ? ` ${field}` : ""}` : calendar;
      }}
      preview={(draft) => <AdvisoryPreview apply={(content) => ({ ...content, calendar: draft.calendar, stageLabels: draft.stageLabels })} />}
    >
      {({ draft, setDraft, defaults, issue }) => {
        const periods = draft.calendar[tab];
        const current = CALENDARS.find((item) => item.key === tab) ?? CALENDARS[0];
        const setPeriods = (next: SeasonPeriod[]) => setDraft((d) => ({ ...d, calendar: { ...d.calendar, [tab]: next } }));
        const update = (index: number, change: Partial<SeasonPeriod>) => setPeriods(periods.map((p, i) => (i === index ? { ...p, ...change } : p)));
        const duplicates = new Set(periods.map((p) => p.from).filter((from, i, all) => all.indexOf(from) !== i));
        return (
          <>
            <div className="adm-tabs" role="tablist" aria-label="Calendars">
              {CALENDARS.map((calendar) => {
                const flagged = Boolean(issue(`calendar.${calendar.key}`));
                return (
                  <button
                    key={calendar.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === calendar.key}
                    className={`adm-tab${tab === calendar.key ? " on" : ""}`}
                    onClick={() => setTab(calendar.key)}
                  >
                    {calendar.title}
                    {flagged ? <span className="adm-check-no"> •</span> : null}
                  </button>
                );
              })}
            </div>

            <section className="adm-card adm-section" role="tabpanel" aria-label={current.title}>
              <div className="adm-section-head">
                <div>
                  <h2>{current.title}</h2>
                  <p>{current.about}</p>
                </div>
                {JSON.stringify(periods) !== JSON.stringify(defaults.calendar[tab]) ? (
                  <Button size="sm" variant="ghost" icon="undo" onClick={() => setPeriods(defaults.calendar[tab])}>
                    Reset this calendar
                  </Button>
                ) : null}
              </div>

              <YearStrip periods={periods} />
              <div className="adm-legend" aria-hidden="true">
                {STAGES.map((stage) => (
                  <span key={stage.value}>
                    <span className="adm-swatch" style={{ background: stage.color }} />
                    {stage.label}
                  </span>
                ))}
              </div>

              <div className="adm-periods">
                <div className="adm-period adm-period-head" aria-hidden="true">
                  <span />
                  <span>Starts on</span>
                  <span>Season name shown</span>
                  <span>Crop stage</span>
                  <span />
                </div>
                {periods.map((period, index) => {
                  const path = `calendar.${tab}.${index}`;
                  const error = issue(path) ?? (duplicates.has(period.from) ? "Another period starts on the same day" : undefined);
                  return (
                    <div key={index} className="adm-period" id={fieldId(path)}>
                      <span className="adm-swatch" style={{ background: STAGE[period.stage]?.color }} aria-hidden="true" />
                      <MonthDayInput label={`Period ${index + 1} start`} value={period.from} invalid={Boolean(error)} onChange={(from) => update(index, { from })} />
                      <input
                        className="adm-input"
                        aria-label={`Period ${index + 1} season name`}
                        value={period.season}
                        aria-invalid={Boolean(issue(`${path}.season`)) || undefined}
                        placeholder="e.g. Main season"
                        onChange={(event) => update(index, { season: event.target.value })}
                      />
                      <Select<Stage>
                        ariaLabel={`Period ${index + 1} crop stage`}
                        value={period.stage}
                        onChange={(stage) => update(index, { stage })}
                        options={STAGES.map((stage) => ({ value: stage.value, label: stage.label, swatch: stage.color }))}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        aria-label={`Remove period ${index + 1}`}
                        disabled={periods.length === 1}
                        onClick={() => setPeriods(periods.filter((_, i) => i !== index))}
                      />
                      {error ? <p className="adm-error-text adm-period-error">{error}</p> : null}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button
                  icon="plus"
                  onClick={() => {
                    const last = sortPeriods(periods).at(-1);
                    setPeriods([...periods, { from: "12-31", season: last?.season ?? "", stage: last?.stage ?? "dry_season" }]);
                  }}
                >
                  Add period
                </Button>
                <span className="adm-hint">Periods are put in date order when you save. “Critical stage” is named by each crop.</span>
              </div>
            </section>

            <section className="adm-card adm-section">
              <div className="adm-section-head">
                <div>
                  <h2>Stage names in the advice</h2>
                  <p>Used in sentences such as “Few rain days at planting time”. The critical stage is named by each crop instead.</p>
                </div>
              </div>
              <div className="adm-cols">
                {(Object.keys(draft.stageLabels) as (keyof Draft["stageLabels"])[]).map((stage) => (
                  <TextInput
                    key={stage}
                    label={STAGE[stage]?.label ?? stage}
                    path={`stageLabels.${stage}`}
                    value={draft.stageLabels[stage]}
                    defaultValue={defaults.stageLabels[stage]}
                    maxLength={60}
                    onChange={(value) => setDraft((d) => ({ ...d, stageLabels: { ...d.stageLabels, [stage]: value } }))}
                  />
                ))}
              </div>
            </section>
          </>
        );
      }}
    </DocumentEditor>
  );
}
