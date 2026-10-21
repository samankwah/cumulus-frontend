"use client";

import { DocumentEditor } from "@/components/admin/document-editor";
import { TextArea, TextInput } from "@/components/admin/fields";
import type { SiteText } from "@/lib/content/site-content";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="adm-card adm-section">
      <div className="adm-section-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="adm-stack">{children}</div>
    </section>
  );
}

export default function SiteTextPage() {
  return (
    <DocumentEditor
      sectionKey="site"
      title="Site text"
      noun="Site text"
      description="The page title, the 46-day heading, and the notes in the drawer's “About this data” panel."
    >
      {({ draft, setDraft, defaults }) => {
        const set = (change: Partial<SiteText>) => setDraft((d) => ({ ...d, ...change }));
        const setAbout = (change: Partial<SiteText["about"]>) => setDraft((d) => ({ ...d, about: { ...d.about, ...change } }));
        const setInfo = (change: Partial<SiteText["dataInfo"]>) => setDraft((d) => ({ ...d, dataInfo: { ...d.dataInfo, ...change } }));
        return (
          <>
            <Section title="Page" description="What visitors see in the browser tab and in search results.">
              <TextInput
                label="Browser tab title"
                path="title"
                value={draft.title}
                defaultValue={defaults.title}
                onChange={(title) => set({ title })}
                maxLength={120}
                help="Search engines show about the first 60 characters. While a district is open, its name is shown instead."
              />
              <TextArea
                label="Search result description"
                path="description"
                value={draft.description}
                defaultValue={defaults.description}
                onChange={(description) => set({ description })}
                maxLength={300}
                rows={2}
                help="About 150 characters reads best."
              />
              <div className="adm-cols">
                <TextInput label="Brand name" path="brandName" value={draft.brandName} defaultValue={defaults.brandName} onChange={(brandName) => set({ brandName })} maxLength={40} />
                <TextInput
                  label="46-day heading"
                  path="subseasonalHeading"
                  value={draft.subseasonalHeading}
                  defaultValue={defaults.subseasonalHeading}
                  onChange={(subseasonalHeading) => set({ subseasonalHeading })}
                  maxLength={60}
                />
              </div>
            </Section>

            <Section title="About, disclaimer and contact" description="Shown at the end of “About this data”. Leave a box empty to hide it.">
              <TextArea label="About" optional path="about.body" value={draft.about.body} onChange={(body) => setAbout({ body })} maxLength={2000} rows={3} />
              <TextArea
                label="Disclaimer"
                optional
                path="about.disclaimer"
                value={draft.about.disclaimer}
                onChange={(disclaimer) => setAbout({ disclaimer })}
                maxLength={2000}
                rows={3}
                placeholder="e.g. Forecasts are guidance only. Always check local conditions."
              />
              <div className="adm-cols">
                <TextInput
                  label="Contact email"
                  optional
                  type="email"
                  path="about.contactEmail"
                  value={draft.about.contactEmail}
                  onChange={(contactEmail) => setAbout({ contactEmail })}
                  placeholder="info@meteo.gov.gh"
                />
                <TextInput
                  label="Contact phone"
                  optional
                  type="tel"
                  path="about.contactPhone"
                  value={draft.about.contactPhone}
                  onChange={(contactPhone) => setAbout({ contactPhone })}
                  placeholder="+233 …"
                  maxLength={40}
                />
              </div>
            </Section>

            <Section title="“About this data” notes">
              <TextArea
                label="Observed rainfall note"
                path="dataInfo.observedRainfall"
                value={draft.dataInfo.observedRainfall}
                defaultValue={defaults.dataInfo.observedRainfall}
                onChange={(observedRainfall) => setInfo({ observedRainfall })}
                maxLength={400}
                rows={2}
              />
              <div className="adm-cols two">
                <TextInput
                  label="Grid size note"
                  path="dataInfo.gridNote"
                  value={draft.dataInfo.gridNote}
                  defaultValue={defaults.dataInfo.gridNote}
                  onChange={(gridNote) => setInfo({ gridNote })}
                  maxLength={60}
                  help="In brackets after the grid size: “0.1° (about 11 km)”."
                />
                <TextArea
                  label="Demo data note"
                  path="dataInfo.demoNote"
                  value={draft.dataInfo.demoNote}
                  defaultValue={defaults.dataInfo.demoNote}
                  onChange={(demoNote) => setInfo({ demoNote })}
                  maxLength={300}
                  rows={1}
                  help="Only shown when a made-up test forecast is loaded."
                />
              </div>
            </Section>
          </>
        );
      }}
    </DocumentEditor>
  );
}
