"use client";

import { useEffect, useState } from "react";

import { DocumentEditor } from "@/components/admin/document-editor";
import { RadioCards } from "@/components/admin/fields";
import { formatDay, getSubseasonalModels } from "@/lib/subseasonal";
import type { SubseasonalModelsResponse } from "@/lib/subseasonal";

/** The models the backend offers, for the choice below; null while loading, "error" if it failed. */
function useModels() {
  const [models, setModels] = useState<SubseasonalModelsResponse | null | "error">(null);
  useEffect(() => {
    const controller = new AbortController();
    getSubseasonalModels(controller.signal)
      .then(setModels)
      .catch(() => {
        if (!controller.signal.aborted) setModels("error");
      });
    return () => controller.abort();
  }, []);
  return models;
}

export default function ForecastPage() {
  const models = useModels();
  return (
    <DocumentEditor
      sectionKey="forecast"
      title="Official forecast"
      noun="Official forecast"
      description="The model GMet issues as its 46-day forecast. District bulletins and the partner API (NADMO, VRA, MoFA, insurers and others) use it; the map still lets visitors compare every model."
      describeChange={() => "Official model"}
    >
      {({ draft, setDraft }) => {
        const loaded = models && models !== "error" ? models : null;
        const fallback = loaded?.models.find((model) => model.id === loaded.default_model);
        const options = [
          {
            value: "",
            label: "Backend default",
            description: fallback ? `Currently ${fallback.label}, set in the backend configuration.` : "The model set in the backend configuration.",
          },
          ...(loaded?.models ?? [])
            .filter((model) => model.available && !model.synthetic)
            .map((model) => ({
              value: model.id,
              label: model.label,
              description: [
                model.members && model.members > 1 ? `${model.members}-member ensemble` : "Single run",
                model.init_time ? `latest run issued ${formatDay(model.init_time.slice(0, 10), "short")}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            })),
        ];
        // Keep a saved model on the list even if it has no run right now, so it is not silently changed.
        if (draft.officialModel && !options.some((option) => option.value === draft.officialModel)) {
          options.push({ value: draft.officialModel, label: draft.officialModel, description: "No run available right now." });
        }
        return (
          <section className="adm-card adm-section">
            <div className="adm-section-head">
              <div>
                <h2>Official model</h2>
                <p>Bulletins switch within a minute of saving; the partner API within five.</p>
              </div>
            </div>
            {models === null ? (
              <p className="adm-muted">Loading the models…</p>
            ) : models === "error" ? (
              <p className="adm-muted">Could not reach the forecast backend to list the models. Try again shortly.</p>
            ) : (
              <RadioCards label="Model" value={draft.officialModel} onChange={(value) => setDraft({ officialModel: value })} options={options} />
            )}
          </section>
        );
      }}
    </DocumentEditor>
  );
}
