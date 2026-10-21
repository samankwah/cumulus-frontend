"use client";

import { AdvisoryPreview } from "@/components/admin/advisory-preview";
import { DocumentEditor } from "@/components/admin/document-editor";
import { NumberInput, TextInput } from "@/components/admin/fields";

const GROUPS = [
  { key: "crops", label: "Crops", about: "Planting, spraying, fertilizer and harvest." },
  { key: "pests", label: "Pests & disease", about: "What to scout for in dry or wet weather." },
  { key: "livestock", label: "Livestock & water", about: "Only for crops with livestock advice switched on." },
] as const;

const CONFIDENCE = [
  { key: "likely", label: "Likely" },
  { key: "possible", label: "Possible" },
  { key: "outlook", label: "Outlook" },
] as const;

export default function LabelsPage() {
  return (
    <DocumentEditor
      sectionKey="labels"
      title="Advisory labels"
      noun="Labels"
      description="The group headings in the advisory box, how many items each group shows, and the confidence tag on each piece of advice."
      preview={(draft) => <AdvisoryPreview apply={(content) => ({ ...content, groups: draft.groups, confidence: draft.confidence })} />}
    >
      {({ draft, setDraft, defaults }) => (
        <>
          <section className="adm-card adm-section">
            <div className="adm-section-head">
              <div>
                <h2>Advice groups</h2>
                <p>Advice is listed in these groups, in this order.</p>
              </div>
            </div>
            <div className="adm-stack">
              {GROUPS.map((group) => (
                <div key={group.key} className="adm-cols two">
                  <TextInput
                    label={`${group.label}: heading`}
                    path={`groups.labels.${group.key}`}
                    value={draft.groups.labels[group.key]}
                    defaultValue={defaults.groups.labels[group.key]}
                    maxLength={40}
                    help={group.about}
                    onChange={(value) => setDraft((d) => ({ ...d, groups: { ...d.groups, labels: { ...d.groups.labels, [group.key]: value } } }))}
                  />
                  <NumberInput
                    label="Most items shown"
                    path={`groups.limits.${group.key}`}
                    unit="items"
                    step={1}
                    min={0}
                    max={10}
                    value={draft.groups.limits[group.key]}
                    defaultValue={defaults.groups.limits[group.key]}
                    help="Keeps each group short. The most urgent come first."
                    onChange={(value) => setDraft((d) => ({ ...d, groups: { ...d.groups, limits: { ...d.groups.limits, [group.key]: value } } }))}
                  />
                </div>
              ))}
            </div>
          </section>
          <section className="adm-card adm-section">
            <div className="adm-section-head">
              <div>
                <h2>Confidence tags</h2>
                <p>The tag on each piece of advice and the hint shown on hover. How many days each covers is set on Thresholds.</p>
              </div>
            </div>
            <div className="adm-stack">
              {CONFIDENCE.map((level) => (
                <div key={level.key} className="adm-cols two">
                  <TextInput
                    label={`${level.label}: tag`}
                    path={`confidence.labels.${level.key}`}
                    value={draft.confidence.labels[level.key]}
                    defaultValue={defaults.confidence.labels[level.key]}
                    maxLength={30}
                    onChange={(value) =>
                      setDraft((d) => ({ ...d, confidence: { ...d.confidence, labels: { ...d.confidence.labels, [level.key]: value } } }))
                    }
                  />
                  <TextInput
                    label="Hint"
                    path={`confidence.hints.${level.key}`}
                    value={draft.confidence.hints[level.key]}
                    defaultValue={defaults.confidence.hints[level.key]}
                    maxLength={200}
                    onChange={(value) =>
                      setDraft((d) => ({ ...d, confidence: { ...d.confidence, hints: { ...d.confidence.hints, [level.key]: value } } }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </DocumentEditor>
  );
}
