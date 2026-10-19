import { formatDay } from "@/lib/subseasonal";
import type { SubseasonalLayerKey, SubseasonalProvenance, SubseasonalRun } from "@/lib/subseasonal";

/** "heun · 20 steps · guidance 3" from whichever sampler settings the run recorded. */
function samplerText(provenance: SubseasonalProvenance) {
  const parts = [
    provenance.sampler,
    provenance.sampler_steps != null ? `${provenance.sampler_steps} steps` : null,
    provenance.guidance_scale != null ? `guidance ${provenance.guidance_scale}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function membersText(run: SubseasonalRun) {
  const size = run.provenance?.ensemble_size;
  if (run.ensemble === "deterministic" || !size) {
    return size && size > 1 ? `Deterministic run shown (model produces ${size} members)` : "Deterministic (single run)";
  }
  return `${size} members`;
}

/**
 * What the drawer is showing and where it came from: the forecast and downscaling model (with the
 * checkpoint and sampler, so a figure can be traced back to the exact model version) and a plain
 * statement that no observed rainfall is shown.
 */
export function DataInfo({ run, layer }: { run: SubseasonalRun; layer: SubseasonalLayerKey }) {
  const provenance = run.provenance ?? {};
  const hasModel = Boolean(provenance.model_dir || provenance.checkpoint);
  const sampler = samplerText(provenance);
  const layerDescription = run.layers.find((option) => option.layer === layer)?.description;

  return (
    <details className="ss-fold ss-data-info" data-testid="subseasonal-data-info">
      <summary>About this data</summary>
      {run.synthetic ? (
        <p className="ss-data-demo" data-testid="ss-data-demo">
          Demo data: a made-up ensemble for testing the views. Not a forecast.
        </p>
      ) : null}
      <dl className="ss-data-list">
        <dt>Forecast</dt>
        <dd>
          {run.source_label}, issued {formatDay(run.init_time.slice(0, 10), "long")}, {run.lead_days} days ahead
        </dd>

        <dt>Downscaling model</dt>
        <dd>
          {hasModel ? (
            <>
              {provenance.model_type ?? run.model_label}
              {provenance.checkpoint ? (
                <>
                  {" · checkpoint "}
                  <code>{provenance.checkpoint}</code>
                </>
              ) : null}
            </>
          ) : (
            <>{run.model_label} · version not recorded for this run</>
          )}
        </dd>

        {sampler ? (
          <>
            <dt>Sampler</dt>
            <dd>{sampler}</dd>
          </>
        ) : null}

        <dt>Ensemble</dt>
        <dd>{membersText(run)}</dd>

        <dt>Grid</dt>
        <dd>{run.grid_resolution_degrees ?? 0.1}° (about 11 km)</dd>

        <dt>Observed rainfall</dt>
        <dd>
          None. Every value is forecast. Days shaded “Elapsed” are earlier days of this forecast, not observations.
        </dd>

        {provenance.model_dir || provenance.checkpoint_dir ? (
          <>
            <dt>Model path</dt>
            <dd>
              <code className="ss-data-path">{[provenance.model_dir, provenance.checkpoint_dir].filter(Boolean).join("/")}</code>
            </dd>
          </>
        ) : null}

        <dt>Run</dt>
        <dd>
          <code>{run.run_id}</code>
          {run.ingested_at ? ` · loaded ${formatDay(run.ingested_at.slice(0, 10), "short")}` : null}
        </dd>
      </dl>
      {layerDescription ? <p className="ss-data-note">{layerDescription}</p> : null}
      {run.guidance ? <p className="ss-data-note">{run.guidance}</p> : null}
    </details>
  );
}
