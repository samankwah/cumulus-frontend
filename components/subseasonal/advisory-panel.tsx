"use client";

import { useEffect, useId, useRef, useState } from "react";

import { fillTemplate } from "@/lib/content/advisory-messages";
import { useSiteContent } from "@/lib/content/content-context";
import { formatRange } from "@/lib/subseasonal";
import { cropFor } from "@/lib/subseasonal-advisory";
import type { AdvisoryAction, AdvisoryGroup, CropKey, SubseasonalAdvisory } from "@/lib/subseasonal-advisory";

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
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { advisory: content } = useSiteContent();
  const label = cropFor(content, crop).label;
  const pickerLabel = content.messages["panel.crop"];

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
        aria-label={`${pickerLabel}: ${label}`}
        onClick={() => {
          if (!isOpen) {
            // Open upwards when the menu would run past the bottom of the drawer (or the window).
            const button = buttonRef.current?.getBoundingClientRect();
            const scroller = buttonRef.current?.closest(".drawer-scroll")?.getBoundingClientRect();
            const bottom = Math.min(scroller?.bottom ?? window.innerHeight, window.innerHeight);
            const top = Math.max(scroller?.top ?? 0, 0);
            const height = content.crops.length * 42 + 20;
            setOpensUp(Boolean(button && bottom - button.bottom < height && button.top - top > bottom - button.bottom));
          }
          setIsOpen((open) => !open);
        }}
      >
        {label}
        <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {isOpen ? (
        <div className={`control-select-menu ss-crop-menu${opensUp ? " up" : ""}`} id={menuId} role="listbox" aria-label={pickerLabel}>
          {content.crops.map(({ key, label: option }) => (
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
              {option}
              {key === crop ? (
                <svg className="ss-pill-check" viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                  <path d="m5 10.5 3.2 3.2L15 7" />
                </svg>
              ) : null}
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
function inPeriod(item: AdvisoryAction, period: AdvisoryPeriod, validity: SubseasonalAdvisory["validity"], allPeriodLabel: string) {
  const today = validity?.from ?? period.from;
  const start = item.date ?? today;
  const end = item.when === allPeriodLabel ? (validity?.to ?? start) : (item.end ?? item.date ?? start);
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
  const { advisory: content } = useSiteContent();
  const { messages } = content;
  // The advice always runs from today; the day or week on the map only presses in the items that fall in it.
  const shown = period ? advisory.actions.filter((item) => inPeriod(item, period, advisory.validity, messages["when.allPeriod"])) : [];
  const groups = GROUP_ORDER.map((group) => ({ group, actions: advisory.actions.filter((item) => item.group === group) })).filter(
    (entry) => entry.actions.length,
  );
  return (
    <article className={`ss-advisory tone-${advisory.tone}`} data-testid="subseasonal-advisory">
      <div className="ss-advisory-top">
        <span className="section-kicker">{messages["panel.kicker"]}</span>
        <CropPicker crop={crop} onChange={onCropChange} />
      </div>
      {advisory.validity ? (
        <p className="ss-advisory-valid" data-testid="subseasonal-advisory-validity">
          {fillTemplate(messages["panel.valid"], { dates: formatRange(advisory.validity.from, advisory.validity.to) })}
          {issued ? ` · ${fillTemplate(messages["panel.issued"], { date: issued })}` : ""}
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
              <dt>{messages["panel.outlook"]}</dt>
              <dd data-testid="subseasonal-advisory-outlook">{advisory.outlook}</dd>
            </div>
          ) : null}
          {advisory.impact ? (
            <div>
              <dt>{messages["panel.impact"]}</dt>
              <dd data-testid="subseasonal-advisory-impact">{advisory.impact}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {groups.map(({ group, actions }) => (
        <section key={group} className={`ss-advisory-group group-${group}`} data-testid={`subseasonal-advisory-${group}`}>
          <h4>{content.groups.labels[group]}</h4>
          <ol className="ss-advisory-actions">
            {actions.map((item) => (
              <li key={`${item.when}-${item.text}`} className={shown.includes(item) ? "in-period" : undefined}>
                <span className="ss-action-when">{item.when}</span>
                <span className="ss-action-text">{item.text}</span>
                <span className={`ss-action-confidence ${item.confidence}`} title={content.confidence.hints[item.confidence]}>
                  {content.confidence.labels[item.confidence]}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
