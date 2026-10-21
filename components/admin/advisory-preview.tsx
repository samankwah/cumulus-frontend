"use client";

import { useEffect, useMemo, useState } from "react";

import { SelectInput } from "@/components/admin/fields";
import { Icon } from "@/components/admin/icons";
import { AdvisoryPanel } from "@/components/subseasonal/advisory-panel";
import { PLACES, SCENARIOS, sampleSeries } from "@/lib/admin/sample-series";
import type { Place, Scenario } from "@/lib/admin/sample-series";
import type { AdvisoryContent } from "@/lib/content/advisory-content";
import { ContentProvider } from "@/lib/content/content-context";
import { DEFAULT_SITE_CONTENT } from "@/lib/content/site-content";
import type { SiteContent } from "@/lib/content/site-content";
import { buildSubseasonalAdvisory } from "@/lib/subseasonal-advisory";
import type { SubseasonalLayerKey } from "@/lib/subseasonal";
import { todayIso } from "@/lib/subseasonal";

const LAYERS: { value: SubseasonalLayerKey; label: string }[] = [
  { value: "rainfall", label: "Rainfall" },
  { value: "rainy_days", label: "Rain days" },
  { value: "dry_spell_days", label: "Dry spells" },
  { value: "wet_spell_days", label: "Wet spells" },
  { value: "extreme_rain", label: "Extreme rain" },
  { value: "onset", label: "Onset" },
];

let savedContent: Promise<SiteContent> | null = null;

/** The content as the public site uses it now, so the preview shows the other sections as saved. */
function loadSavedContent() {
  savedContent ??= fetch("/api/admin/content")
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((body: { content: SiteContent }) => body.content)
    .catch(() => {
      savedContent = null;
      return DEFAULT_SITE_CONTENT;
    });
  return savedContent;
}

/**
 * The real advisory box, worked out from a made-up forecast with the draft applied. `apply`
 * puts the section being edited into the saved content.
 */
export function AdvisoryPreview({ apply }: { apply: (content: AdvisoryContent) => AdvisoryContent }) {
  const [base, setBase] = useState<SiteContent | null>(null);
  const [place, setPlace] = useState<Place>("south");
  const [scenario, setScenario] = useState<Scenario>("planting");
  const [layer, setLayer] = useState<SubseasonalLayerKey>("rainfall");
  const [date, setDate] = useState(todayIso());
  const [crop, setCrop] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadSavedContent().then((content) => live && setBase(content));
    return () => {
      live = false;
    };
  }, []);

  const content = useMemo<SiteContent | null>(() => (base ? { ...base, advisory: apply(base.advisory) } : null), [apply, base]);
  const cropKey = content && crop && content.advisory.crops.some((item) => item.key === crop) ? crop : (content?.advisory.crops[0]?.key ?? "all");

  const advisory = useMemo(() => {
    if (!content) return null;
    try {
      return buildSubseasonalAdvisory(layer, sampleSeries(scenario, place, date), cropKey, date, content.advisory);
    } catch (error) {
      return error instanceof Error ? error : new Error("Preview failed");
    }
  }, [content, cropKey, date, layer, place, scenario]);

  if (!content || !advisory) {
    return <div className="adm-skel" style={{ height: 380 }} aria-busy="true" />;
  }

  return (
    <>
      <div className="adm-preview-controls">
        <SelectInput label="Place" value={place} options={PLACES.map(({ value, label }) => ({ value, label }))} onChange={setPlace} />
        <SelectInput label="Forecast" value={scenario} options={SCENARIOS} onChange={setScenario} />
        <SelectInput label="Map layer" value={layer} options={LAYERS} onChange={setLayer} />
        <div className="adm-field">
          <label className="adm-label" htmlFor="preview-date">
            Today is
          </label>
          <input id="preview-date" type="date" className="adm-input" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
        </div>
      </div>
      {advisory instanceof Error ? (
        <div className="adm-banner tone-danger" role="alert">
          <Icon name="alert" size={18} />
          <span>The advisory could not be built with these settings: {advisory.message}</span>
        </div>
      ) : (
        <div className="adm-preview-frame">
          <ContentProvider content={content}>
            <AdvisoryPanel advisory={advisory} crop={cropKey} onCropChange={setCrop} issued="sample forecast" />
          </ContentProvider>
        </div>
      )}
      <p className="adm-hint" style={{ marginTop: 12 }}>
        A made-up forecast, to see how the wording reads. Other sections are shown as currently saved.
      </p>
    </>
  );
}
