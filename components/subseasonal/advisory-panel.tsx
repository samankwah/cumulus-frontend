import { CROP_KEYS, CROPS } from "@/lib/subseasonal-advisory";
import type { Confidence, CropKey, SubseasonalAdvisory } from "@/lib/subseasonal-advisory";

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

export function AdvisoryPanel({
  advisory,
  crop,
  onCropChange,
}: {
  advisory: SubseasonalAdvisory;
  crop: CropKey;
  onCropChange: (crop: CropKey) => void;
}) {
  return (
    <article className={`ss-advisory tone-${advisory.tone}`} data-testid="subseasonal-advisory">
      <div className="ss-advisory-top">
        <span className="section-kicker">What to do</span>
        <label className="ss-crop-select">
          <span className="ss-crop-label">Crop</span>
          <select
            value={crop}
            data-testid="subseasonal-crop"
            onChange={(event) => onCropChange(event.target.value as CropKey)}
          >
            {CROP_KEYS.map((key) => (
              <option key={key} value={key}>
                {CROPS[key].label}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </label>
      </div>

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

      <ol className="ss-advisory-actions">
        {advisory.actions.map((item) => (
          <li key={`${item.when}-${item.text}`}>
            <span className="ss-action-when">{item.when}</span>
            <span className="ss-action-text">{item.text}</span>
            <span className={`ss-action-confidence ${item.confidence}`} title={CONFIDENCE_HINTS[item.confidence]}>
              {CONFIDENCE_LABELS[item.confidence]}
            </span>
          </li>
        ))}
      </ol>

      <details className="ss-advisory-why">
        <summary>Why this advice</summary>
        <ul>
          {advisory.signals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
        <p>Based on the 46-day model forecast for this location. Confirm field decisions with your MoFA extension officer.</p>
      </details>
    </article>
  );
}
