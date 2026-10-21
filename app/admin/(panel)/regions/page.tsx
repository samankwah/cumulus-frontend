"use client";

import { AdvisoryPreview } from "@/components/admin/advisory-preview";
import { DocumentEditor } from "@/components/admin/document-editor";
import { NumberInput, TagInput, TextInput } from "@/components/admin/fields";
import { Icon } from "@/components/admin/icons";
import type { AdvisoryContent } from "@/lib/content/advisory-content";

/** Ghana's 16 regions, spelled as on the map. */
const GHANA_REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
];

type Sectors = AdvisoryContent["sectors"];

const SECTOR_COLORS = { north: "#f3c48d", transition: "#9fd89a", south: "#7fb6e6" };

export default function RegionsPage() {
  return (
    <DocumentEditor
      sectionKey="regions"
      title="Regions & sectors"
      noun="Regions"
      description="Which rainfall sector a place is in. That decides its season calendar: one rainy season in the north, two in the south."
      describeChange={(path) =>
        ({
          northernLatitude: "Northern line",
          transitionLatitude: "Transition line",
          northernRegions: "Northern regions",
          transitionRegions: "Transition regions",
          "labels.north": "Name › north",
          "labels.transition": "Name › transition",
          "labels.south": "Name › south",
        })[path.replace(/\.\d+$/, "")] ?? path
      }
      preview={(draft) => <AdvisoryPreview apply={(content) => ({ ...content, sectors: draft })} />}
    >
      {({ draft, setDraft, defaults }) => {
        const set = (change: Partial<Sectors>) => setDraft((d) => ({ ...d, ...change }));
        const southern = GHANA_REGIONS.filter((region) => !draft.northernRegions.includes(region) && !draft.transitionRegions.includes(region));
        const both = draft.northernRegions.filter((region) => draft.transitionRegions.includes(region));
        const unknown = [...draft.northernRegions, ...draft.transitionRegions].filter((region) => !GHANA_REGIONS.includes(region));
        return (
          <>
            <section className="adm-card adm-section">
              <div className="adm-section-head">
                <div>
                  <h2>By latitude</h2>
                  <p>Used for a point clicked on the map.</p>
                </div>
              </div>
              <div className="adm-cols">
                <NumberInput
                  label="Northern sector from"
                  path="northernLatitude"
                  unit="°N"
                  step={0.1}
                  value={draft.northernLatitude}
                  defaultValue={defaults.northernLatitude}
                  onChange={(northernLatitude) => set({ northernLatitude })}
                  help={`Default ${defaults.northernLatitude}°N, as on the seasonal map.`}
                />
                <NumberInput
                  label="Transition zone from"
                  path="transitionLatitude"
                  unit="°N"
                  step={0.1}
                  value={draft.transitionLatitude}
                  defaultValue={defaults.transitionLatitude}
                  onChange={(transitionLatitude) => set({ transitionLatitude })}
                  help={`Default ${defaults.transitionLatitude}°N.`}
                />
              </div>
              <div className="adm-sector-map" style={{ marginTop: 18 }}>
                {(
                  [
                    ["north", `North of ${draft.northernLatitude}°N`],
                    ["transition", `${draft.transitionLatitude}°N to ${draft.northernLatitude}°N`],
                    ["south", `South of ${draft.transitionLatitude}°N`],
                  ] as const
                ).map(([sector, range]) => (
                  <div className="adm-sector" key={sector}>
                    <span className="adm-sector-band" style={{ background: SECTOR_COLORS[sector] }} aria-hidden="true" />
                    <span>
                      <strong>{draft.labels[sector] || sector}</strong>
                      <span className="adm-muted"> · {range}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="adm-card adm-section">
              <div className="adm-section-head">
                <div>
                  <h2>By region</h2>
                  <p>Used for a region or district picked on the map. Regions not listed are in the southern sector.</p>
                </div>
              </div>
              {both.length || unknown.length ? (
                <div className="adm-banner tone-warning">
                  <Icon name="alert" size={18} />
                  <div>
                    {both.length ? <p>{both.join(", ")} {both.length === 1 ? "is" : "are"} in both lists; the northern sector wins.</p> : null}
                    {unknown.length ? (
                      <p>
                        {unknown.join(", ")} {unknown.length === 1 ? "is not" : "are not"} a region name the map uses, so{" "}
                        {unknown.length === 1 ? "it has" : "they have"} no effect. Check the spelling.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="adm-stack">
                <TagInput
                  label="Northern sector"
                  path="northernRegions"
                  values={draft.northernRegions}
                  onChange={(northernRegions) => set({ northernRegions })}
                  suggestions={GHANA_REGIONS.filter((region) => !draft.transitionRegions.includes(region))}
                  help="Pick from the list or type a region name, then press Enter."
                />
                <TagInput
                  label="Transition zone"
                  path="transitionRegions"
                  values={draft.transitionRegions}
                  onChange={(transitionRegions) => set({ transitionRegions })}
                  suggestions={GHANA_REGIONS.filter((region) => !draft.northernRegions.includes(region))}
                />
                <div className="adm-field">
                  <span className="adm-label">Southern sector</span>
                  <p className="adm-muted">{southern.length ? southern.join(", ") : "No regions"}</p>
                  <p className="adm-hint">Everything else. Worked out from the lists above.</p>
                </div>
              </div>
            </section>

            <section className="adm-card adm-section">
              <div className="adm-section-head">
                <div>
                  <h2>Sector names</h2>
                  <p>Shown in the advisory under the headline, e.g. “Northern sector · Main season”.</p>
                </div>
              </div>
              <div className="adm-cols">
                {(["north", "transition", "south"] as const).map((sector) => (
                  <TextInput
                    key={sector}
                    label={sector === "north" ? "North" : sector === "transition" ? "Transition" : "South"}
                    path={`labels.${sector}`}
                    value={draft.labels[sector]}
                    defaultValue={defaults.labels[sector]}
                    maxLength={60}
                    onChange={(value) => setDraft((d) => ({ ...d, labels: { ...d.labels, [sector]: value } }))}
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
