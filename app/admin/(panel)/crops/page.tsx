"use client";

import { useEffect, useState } from "react";

import { AdvisoryPreview } from "@/components/admin/advisory-preview";
import { DocumentEditor } from "@/components/admin/document-editor";
import { TextArea, TextInput } from "@/components/admin/fields";
import { HighlightedTemplate } from "@/components/admin/highlight";
import { Icon } from "@/components/admin/icons";
import { Badge, Button, Menu, Switch, useConfirm } from "@/components/admin/ui";
import type { AdvisoryContent, CropProfile } from "@/lib/content/advisory-content";
import { ADVISORY_MESSAGE_DEFAULTS } from "@/lib/content/advisory-messages";

/** An id from the name ("Sweet potato" → "sweet_potato"), unique among the other crops. */
function cropKeyFor(label: string, taken: string[]) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "crop";
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}_${n}`;
  return key;
}

function newCrop(): CropProfile {
  return {
    key: "",
    label: "",
    noun: "",
    droughtHardy: false,
    likesWater: false,
    lateHarvest: false,
    livestockAdvice: false,
    criticalStage: "",
    harvestRisk: "",
    dryPests: "",
    wetDiseases: "",
  };
}

/** Sentences that show the crop's words in use. */
const SAMPLES = [
  "advice.plantAfterRain",
  "headline.drySpellCritical",
  "advice.bringInMature",
  "advice.checkDryPests",
  "advice.checkWetDiseasesSpell",
] as const;

function traits(crop: CropProfile) {
  return [crop.droughtHardy && "drought hardy", crop.likesWater && "likes water", crop.lateHarvest && "late harvest"].filter(Boolean).join(" · ");
}

export default function CropsPage() {
  const [selected, setSelected] = useState(0);
  const confirm = useConfirm();
  const [messages, setMessages] = useState<Record<string, string> | null>(null);

  // The sample sentences use the saved wording.
  useEffect(() => {
    fetch("/api/admin/content")
      .then((response) => response.json() as Promise<{ content?: { advisory: AdvisoryContent } }>)
      .then((body) => setMessages(body.content?.advisory.messages ?? { ...ADVISORY_MESSAGE_DEFAULTS }))
      .catch(() => setMessages({ ...ADVISORY_MESSAGE_DEFAULTS }));
  }, []);

  return (
    <DocumentEditor
      sectionKey="crops"
      title="Crops"
      noun="Crops"
      description="The crops in the advisory's crop picker. The words entered here are put into the advisory sentences."
      // New crops get an id from their name when saved; existing ids never change, so viewers' saved picks keep working.
      toStored={(crops) =>
        crops.map((crop, index) =>
          crop.key ? crop : { ...crop, key: cropKeyFor(crop.label, crops.filter((_, i) => i !== index).map((c) => c.key)) },
        )
      }
      describeChange={(path, data) => {
        const [index, field] = path.split(".");
        const crop = data[Number(index)];
        const name = crop?.label || `Crop ${Number(index) + 1}`;
        return field ? `${name} › ${field.replace(/([A-Z])/g, " $1").toLowerCase()}` : name;
      }}
      preview={(draft) => <AdvisoryPreview apply={(content) => ({ ...content, crops: draft })} />}
    >
      {({ draft, setDraft, issues, issue }) => {
        const index = Math.min(selected, draft.length - 1);
        const crop = draft[index];
        const update = (change: Partial<CropProfile>) => setDraft((crops) => crops.map((c, i) => (i === index ? { ...c, ...change } : c)));
        const move = (by: number) => {
          setDraft((crops) => {
            const next = [...crops];
            const [item] = next.splice(index, 1);
            next.splice(index + by, 0, item);
            return next;
          });
          setSelected(index + by);
        };
        const vars = {
          crop: crop.noun || "…",
          cropLabel: crop.label || "…",
          criticalStage: crop.criticalStage || "…",
          harvestRisk: crop.harvestRisk || "…",
          dryPests: crop.dryPests || "…",
          wetDiseases: crop.wetDiseases || "…",
        };
        return (
          <>
            {issues[""] ? (
              <div className="adm-banner tone-danger" role="alert">
                <Icon name="alert" size={18} />
                <span>{issues[""]}</span>
              </div>
            ) : null}
            <div className="adm-split">
              <nav className="adm-card adm-pick-list" aria-label="Crops">
                <ol>
                  {draft.map((item, i) => (
                    <li key={item.key || `new-${i}`}>
                      <button
                        type="button"
                        className={`adm-pick${i === index ? " on" : ""}`}
                        aria-current={i === index ? "true" : undefined}
                        onClick={() => setSelected(i)}
                        data-testid="admin-crop"
                      >
                        <span className="adm-pick-name">
                          {item.label || <em className="adm-muted">New crop</em>}
                          {traits(item) ? (
                            <span className="adm-muted adm-small" style={{ display: "block", fontWeight: 400 }}>
                              {traits(item)}
                            </span>
                          ) : null}
                        </span>
                        {issue(String(i)) ? (
                          <span className="adm-check-no" aria-label="Needs fixing">
                            <Icon name="alert" size={16} />
                          </span>
                        ) : i === 0 ? (
                          <Badge>Default</Badge>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ol>
                <Button
                  icon="plus"
                  onClick={() => {
                    setDraft((crops) => [...crops, newCrop()]);
                    setSelected(draft.length);
                  }}
                >
                  Add crop
                </Button>
              </nav>

              <div className="adm-stack" style={{ gap: 16 }}>
                <section className="adm-card">
                  <header className="adm-item-head">
                    <h2>
                      <span className="adm-tile-icon">
                        <Icon name="sprout" size={17} />
                      </span>
                      <span className="adm-item-title">{crop.label || "New crop"}</span>
                      {index === 0 ? <Badge tone="accent">Default pick</Badge> : null}
                    </h2>
                    <Menu
                      label={`Actions for ${crop.label || "this crop"}`}
                      items={[
                        { label: "Make default pick", icon: "arrowUp", disabled: index === 0, onSelect: () => move(-index) },
                        { label: "Move up", icon: "arrowUp", disabled: index === 0, onSelect: () => move(-1) },
                        { label: "Move down", icon: "arrowDown", disabled: index === draft.length - 1, onSelect: () => move(1) },
                        {
                          label: "Delete crop",
                          icon: "trash",
                          tone: "danger",
                          disabled: draft.length === 1,
                          onSelect: async () => {
                            if (
                              await confirm({
                                title: `Delete ${crop.label || "this crop"}?`,
                                description: "It leaves the crop picker when you save. Visitors who picked it see the default crop instead.",
                                confirmLabel: "Delete crop",
                                tone: "danger",
                              })
                            ) {
                              setDraft((crops) => crops.filter((_, i) => i !== index));
                              setSelected(Math.max(0, index - 1));
                            }
                          },
                        },
                      ]}
                    />
                  </header>
                  <div className="adm-item-body adm-stack">
                    <div className="adm-cols">
                      <TextInput
                        label="Name in the picker"
                        path={`${index}.label`}
                        value={crop.label}
                        onChange={(label) => update({ label })}
                        maxLength={60}
                        placeholder="e.g. Groundnut & cowpea"
                      />
                      <TextInput
                        label="Word used in sentences"
                        path={`${index}.noun`}
                        value={crop.noun}
                        onChange={(noun) => update({ noun })}
                        maxLength={60}
                        placeholder="e.g. groundnut and cowpea"
                        help="Lower case, as it reads mid-sentence."
                      />
                    </div>
                    <div className="adm-divider" />
                    <div className="adm-cols two">
                      <TextInput
                        label="Most sensitive stage"
                        path={`${index}.criticalStage`}
                        value={crop.criticalStage}
                        onChange={(criticalStage) => update({ criticalStage })}
                        placeholder="e.g. tasselling and silking"
                        maxLength={120}
                      />
                      <TextInput
                        label="Pests in dry weather"
                        path={`${index}.dryPests`}
                        value={crop.dryPests}
                        onChange={(dryPests) => update({ dryPests })}
                        placeholder="e.g. fall armyworm and stem borers"
                        maxLength={120}
                      />
                      <TextInput
                        label="Diseases in wet weather"
                        path={`${index}.wetDiseases`}
                        value={crop.wetDiseases}
                        onChange={(wetDiseases) => update({ wetDiseases })}
                        placeholder="e.g. leaf blight and ear rot"
                        maxLength={120}
                      />
                      <TextArea
                        label="Risk in a wet harvest"
                        path={`${index}.harvestRisk`}
                        value={crop.harvestRisk}
                        onChange={(harvestRisk) => update({ harvestRisk })}
                        placeholder="e.g. cobs rot if harvested or dried wet"
                        maxLength={200}
                        rows={1}
                      />
                    </div>
                    <div className="adm-divider" />
                    <div className="adm-cols two">
                      <Switch
                        label="Drought hardy"
                        description="Copes with long dry spells (sorghum, millet, cassava). Dry-spell warnings are milder."
                        checked={crop.droughtHardy}
                        onChange={(droughtHardy) => update({ droughtHardy })}
                      />
                      <Switch
                        label="Likes standing water"
                        description="Lowland rice: wet spells are good news and fertilizer advice is skipped."
                        checked={crop.likesWater}
                        onChange={(likesWater) => update({ likesWater })}
                      />
                      <Switch
                        label="Late harvest"
                        description="Stays in the field longer, so it follows the late-harvest season calendar."
                        checked={crop.lateHarvest}
                        onChange={(lateHarvest) => update({ lateHarvest })}
                      />
                      <Switch
                        label="Livestock & water advice"
                        description="Also give advice for animals and water. On for “All crops”."
                        checked={crop.livestockAdvice}
                        onChange={(livestockAdvice) => update({ livestockAdvice })}
                      />
                    </div>
                  </div>
                </section>

                <section className="adm-card adm-section">
                  <div className="adm-section-head">
                    <div>
                      <h2>How it reads</h2>
                      <p>Some of the advisory sentences, with this crop&apos;s words highlighted.</p>
                    </div>
                  </div>
                  {messages ? (
                    <ul className="adm-sample">
                      {SAMPLES.map((id) => (
                        <li key={id}>
                          <HighlightedTemplate
                            template={messages[id] ?? ADVISORY_MESSAGE_DEFAULTS[id]}
                            vars={{ ...vars, date: "Thu 9 Oct", dates: "9–14 Oct" }}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="adm-skel" style={{ height: 160 }} />
                  )}
                </section>
              </div>
            </div>
          </>
        );
      }}
    </DocumentEditor>
  );
}
