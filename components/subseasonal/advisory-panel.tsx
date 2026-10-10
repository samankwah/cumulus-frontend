"use client";

import { useEffect, useId, useRef, useState } from "react";

import { formatRange } from "@/lib/subseasonal";
import { ADVISORY_GROUP_LABELS, CROP_KEYS, CROPS } from "@/lib/subseasonal-advisory";
import type { AdvisoryAction, AdvisoryGroup, Confidence, CropKey, SubseasonalAdvisory } from "@/lib/subseasonal-advisory";

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  likely: "Likely",
  possible: "Possible",
  outlook: "Outlook",
};

const CONFIDENCE_HINTS: Record<Confidence, string> = {
  likely: "Within the next 10 days: the forecast is most reliable here.",
  possible: "10–21 days ahead: timing may shift by a few days.",
  outlook: "More than 3 weeks ahead: treat as an early signal only.",
};

function ToneIcon({ tone }: { tone: SubseasonalAdvisory["tone"] }) {
  if (tone === "low") {
    return <path d="M5 10.5 8.5 14 15 6.5" />;
  }
  return (
    <>
      <path d="M10 3.5 17.5 16.5H2.5Z" />
      <path d="M10 8.5v3.5M10 14.4v.1" />
    </>
  );
}

/**
 * The crop picker, drawn like the app's other dropdowns (a pill that opens a raised menu with the
 * choice in teal) instead of the browser's own list. Closes on a choice, Escape or a click outside.
 */
function CropPicker({ crop, onChange }: { crop: CropKey; onChange: (crop: CropKey) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className={`ss-crop-select${isOpen ? " open" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ss-crop-button"
        data-testid="subseasonal-crop"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`Crop: ${CROPS[crop].label}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        {CROPS[crop].label}
        <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {isOpen ? (
        <div className="control-select-menu ss-crop-menu" id={menuId} role="listbox" aria-label="Crop">
          {CROP_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === crop}
              className={key === crop ? "selected" : ""}
              onClick={() => {
                onChange(key);
                setIsOpen(false);
                buttonRef.current?.focus();
              }}
            >
              {CROPS[key].label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const GROUP_ORDER: AdvisoryGroup[] = ["crops", "pests", "livestock"];

/** The day or week the map shows, e.g. { from: "2026-10-16", to: "2026-10-22", label: "Week 4 (16–22 Oct)" }. */
export type AdvisoryPeriod = { from: string; to: string; label: string };

/** Whether an action's dates overlap the period on the map. Standing "All period" advice spans the validity. */
function inPeriod(item: AdvisoryAction, period: AdvisoryPeriod, validity: SubseasonalAdvisory["validity"]) {
  const today = validity?.from ?? period.from;
  const start = item.date ?? today;
  const end = item.when === "All period" ? (validity?.to ?? start) : (item.end ?? item.date ?? start);
  return start <= period.to && end >= period.from;
}

/**
 * The advice, laid out like an agrometeorological advisory bulletin: validity period, weather
 * outlook, expected impact, then dated advice for crops, pests & disease and livestock & water.
 */
export function AdvisoryPanel({
  advisory,
  crop,
  onCropChange,
  issued,
  period = null,
}: {
  advisory: SubseasonalAdvisory;
  crop: CropKey;
  onCropChange: (crop: CropKey) => void;
  /** Issue date of the forecast run, e.g. "25 Sep". */
  issued?: string;
  /** The day or week on the map; its advice is highlighted. Null for the whole run. */
  period?: AdvisoryPeriod | null;
}) {
  // The advice always runs from today; the day or week on the map only presses in the items that fall in it.
  const shown = period ? advisory.actions.filter((item) => inPeriod(item, period, advisory.validity)) : [];
  const groups = GROUP_ORDER.map((group) => ({ group, actions: advisory.actions.filter((item) => item.group === group) })).filter(
    (entry) => entry.actions.length,
  );
  return (
    <article className={`ss-advisory tone-${advisory.tone}`} data-testid="subseasonal-advisory">
      <div className="ss-advisory-top">
        <span className="section-kicker">What to do · Agromet advisory</span>
        <CropPicker crop={crop} onChange={onCropChange} />
      </div>
      {advisory.validity ? (
        <p className="ss-advisory-valid" data-testid="subseasonal-advisory-validity">
          Valid {formatRange(advisory.validity.from, advisory.validity.to)}
          {issued ? ` · issued ${issued}` : ""}
        </p>
      ) : null}

      <div className="ss-advisory-head">
        <span className="ss-advisory-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <ToneIcon tone={advisory.tone} />
          </svg>
        </span>
        <div>
          <h3 data-testid="subseasonal-advisory-headline">{advisory.headline}</h3>
          <p className="ss-advisory-context" data-testid="subseasonal-advisory-context">
            {advisory.context.sector} · {advisory.context.season} · <strong>{advisory.context.stage}</strong>
          </p>
        </div>
      </div>

      {advisory.outlook || advisory.impact ? (
        <dl className="ss-advisory-brief">
          {advisory.outlook ? (
            <div>
              <dt>Outlook</dt>
              <dd data-testid="subseasonal-advisory-outlook">{advisory.outlook}</dd>
            </div>
          ) : null}
          {advisory.impact ? (
            <div>
              <dt>Impact</dt>
              <dd data-testid="subseasonal-advisory-impact">{advisory.impact}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {groups.map(({ group, actions }) => (
        <section key={group} className={`ss-advisory-group group-${group}`} data-testid={`subseasonal-advisory-${group}`}>
          <h4>{ADVISORY_GROUP_LABELS[group]}</h4>
          <ol className="ss-advisory-actions">
            {actions.map((item) => (
              <li key={`${item.when}-${item.text}`} className={shown.includes(item) ? "in-period" : undefined}>
                <span className="ss-action-when">{item.when}</span>
                <span className="ss-action-text">{item.text}</span>
                <span className={`ss-action-confidence ${item.confidence}`} title={CONFIDENCE_HINTS[item.confidence]}>
                  {CONFIDENCE_LABELS[item.confidence]}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
