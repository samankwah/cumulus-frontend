import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/bulletin/print-button";
import { WeeklyRainChart } from "@/components/bulletin/weekly-rain-chart";
import { BRAND_MARK, BRAND_NAME, DELIVERED_BY, MODELS_CREDIT, PARTNERS } from "@/lib/brand";
import { findDistrict, loadBulletin } from "@/lib/bulletin";
import type { AdvisoryGroup } from "@/lib/content/advisory-content";
import { getSiteContent } from "@/lib/content/get-content";
import { buildSubseasonalAdvisory } from "@/lib/subseasonal-advisory";
import { formatAmount, formatDay, formatIssueDate, formatRange, spreadOf, todayIso } from "@/lib/subseasonal";

type Props = { params: { district: string }; searchParams: { crop?: string; run?: string } };

const GROUP_ORDER: AdvisoryGroup[] = ["crops", "pests", "livestock"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const district = await findDistrict(params.district);
  return district
    ? { title: `${district.name} 46-day rainfall bulletin · ${BRAND_NAME}`, description: `GMet's 46-day rainfall outlook and farm advice for ${district.name}, ${district.region} Region.` }
    : { title: `Bulletin · ${BRAND_NAME}` };
}

const pct = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${Math.round(value)}%`);
const mm = (value: number | null | undefined) => formatAmount(value, "mm", 0);

export default async function DistrictBulletinPage({ params, searchParams }: Props) {
  const district = await findDistrict(params.district);
  if (!district) notFound();
  const content = await getSiteContent();
  const runId = searchParams.run && /^[a-z0-9_]{1,64}$/i.test(searchParams.run) ? searchParams.run : null;

  let bulletin;
  try {
    bulletin = await loadBulletin(district, content.forecast.officialModel, runId);
  } catch (error) {
    console.error("[bulletin] could not load the forecast", error);
    return (
      <main className="bulletin-page">
        <div className="bulletin-sheet">
          <h1>{district.name}</h1>
          <p>The forecast could not be loaded just now. Please try again in a few minutes.</p>
          <Link href="/bulletin">All districts</Link>
        </div>
      </main>
    );
  }

  const { model, run, series } = bulletin;
  const today = todayIso();
  const crops = content.advisory.crops;
  const crop = crops.find((item) => item.key === searchParams.crop) ?? crops[0];
  const advisory = buildSubseasonalAdvisory("rainfall", series, crop?.key ?? "all", today, content.advisory);
  const ensemble = (series.members ?? 1) > 1;
  const totalSpread = spreadOf(series.member_totals);
  const first = series.days[0]?.date ?? run.first_day;
  const last = series.days[series.days.length - 1]?.date ?? run.last_day;
  const onset = series.onset;
  const mapQuery = new URLSearchParams({ model: model.id, run: run.run_id, area: "district", name: district.name });
  const host = headers().get("x-forwarded-host") ?? headers().get("host") ?? "";
  const mapUrl = `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}/?${mapQuery}`;
  // Single runs carry no per-week counts: count the district's rain days from its daily series.
  const rainDays = (from: number, to: number) => series.days.filter((day) => day.day >= from && day.day <= to && day.wet).length;
  const actionsByGroup = GROUP_ORDER.map((group) => ({
    group,
    label: content.advisory.groups.labels[group],
    actions: advisory.actions.filter((action) => action.group === group),
  })).filter((item) => item.actions.length);

  return (
    <main className="bulletin-page">
      <nav className="bulletin-toolbar" aria-label="Bulletin">
        <Link href="/bulletin" className="bulletin-button">
          ← All districts
        </Link>
        <form className="bulletin-crop" method="get">
          {runId ? <input type="hidden" name="run" value={runId} /> : null}
          <label htmlFor="crop">Advice for</label>
          <select id="crop" name="crop" defaultValue={crop?.key}>
            {crops.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <button type="submit" className="bulletin-button">
            Show
          </button>
        </form>
        <PrintButton />
      </nav>

      <article className="bulletin-sheet" data-testid="bulletin">
        <header className="bulletin-header">
          <div className="bulletin-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- small crest, printed as is */}
            <img src={BRAND_MARK} alt="" width={48} height={48} />
            <div>
              <strong>{BRAND_NAME.toUpperCase()}</strong>
              <span>{DELIVERED_BY}</span>
            </div>
          </div>
          <div className="bulletin-issue">
            <span>46-day rainfall bulletin</span>
            <strong>Issued {formatIssueDate(run.init_time)}</strong>
            <span>
              Covers {formatDay(first, "short")} – {formatDay(last, "long")}
            </span>
          </div>
        </header>

        <section className="bulletin-title">
          <h1>{district.name}</h1>
          <p>
            {district.region} Region · {model.label}
            {ensemble ? ` · ${series.members}-member ensemble` : " · single run"}
          </p>
        </section>

        <section className={`bulletin-headline bulletin-tone-${advisory.tone}`}>
          <h2>{advisory.headline}</h2>
          {advisory.outlook ? <p>{advisory.outlook}</p> : null}
          {advisory.impact ? <p>{advisory.impact}</p> : null}
          <p className="bulletin-context">
            {advisory.context.sector} · {advisory.context.season} · {advisory.context.stage}
            {crop ? ` · ${crop.label}` : ""}
          </p>
        </section>

        <section className="bulletin-figures" aria-label="Whole forecast">
          <div>
            <span>Total rain</span>
            <strong>{mm(series.metrics.total_mm)}</strong>
            {totalSpread?.p10 != null && totalSpread?.p90 != null ? (
              <small>
                likely {Math.round(totalSpread.p10)}–{Math.round(totalSpread.p90)} mm
              </small>
            ) : null}
          </div>
          <div>
            <span>Rain days</span>
            <strong>{formatAmount(series.metrics.rainy_days, "days")}</strong>
            <small>{series.thresholds.wet_day_mm} mm or more</small>
          </div>
          <div>
            <span>Dry-spell days</span>
            <strong>{formatAmount(series.metrics.dry_spell_days, "days")}</strong>
            <small>chance of a spell {pct(series.spell_chance_total?.dry)}</small>
          </div>
          <div>
            <span>Onset of rains</span>
            <strong>{onset ? formatDay(onset.date, "weekday") : "Not in this forecast"}</strong>
            <small>{onset ? (onset.probability != null ? `${Math.round(onset.probability)}% of members` : onset.provisional ? "provisional" : "") : "no onset within 46 days"}</small>
          </div>
        </section>

        <section className="bulletin-section">
          <h2>Week by week</h2>
          <WeeklyRainChart weeks={series.weeks} today={today} />
          <p className="bulletin-note">
            Bars: average rain{ensemble ? "; lines: the range 8 in 10 ensemble members fall within" : ""}. Faded weeks have passed.
          </p>
          <table className="bulletin-table">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Rain</th>
                <th scope="col">Rain days</th>
                <th scope="col">Heavy rain ({series.thresholds.extreme_rain_mm ?? 50} mm+ day)</th>
                <th scope="col">Dry spell</th>
                <th scope="col">Wet spell</th>
              </tr>
            </thead>
            <tbody>
              {series.weeks.map((week) => (
                <tr key={week.week} className={week.end_date < today ? "past" : undefined}>
                  <th scope="row">
                    {week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`}
                    <small>{formatRange(week.start_date, week.end_date)}</small>
                  </th>
                  <td>
                    {mm(week.value)}
                    {week.spread?.p10 != null && week.spread?.p90 != null ? (
                      <small>
                        {Math.round(week.spread.p10)}–{Math.round(week.spread.p90)}
                      </small>
                    ) : null}
                  </td>
                  <td>{`${Math.round(week.day_counts?.rainy?.mean ?? rainDays(week.start_day, week.end_day))} of ${week.days}`}</td>
                  <td>{pct(week.extreme_prob)}</td>
                  <td>{pct(week.spell_chance?.dry)}</td>
                  <td>{pct(week.spell_chance?.wet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="bulletin-note">
            {ensemble
              ? "Chances are the share of ensemble members, worked out across the district as on the map."
              : "A single model run: each chance is the share of the district where it happens in that run."}{" "}
            A dry spell is{" "}
            {series.thresholds.dry_spell_min_days}+ days in a row under {series.thresholds.wet_day_mm} mm; a wet spell{" "}
            {series.thresholds.wet_spell_min_days}+ rain days in a row.
          </p>
        </section>

        <section className="bulletin-section">
          <h2>Advice{crop ? ` for ${crop.label.toLowerCase()}` : ""}</h2>
          {advisory.validity ? (
            <p className="bulletin-note">
              Valid {formatDay(advisory.validity.from, "weekday")} to {formatDay(advisory.validity.to, "weekday")}.
            </p>
          ) : null}
          <div className="bulletin-actions">
            {actionsByGroup.map((item) => (
              <div key={item.group}>
                <h3>{item.label}</h3>
                <ul>
                  {item.actions.map((action, position) => (
                    <li key={`${action.when}-${position}`}>
                      <span className="when">{action.when}</span>
                      <span className="text">{action.text}</span>
                      <span className={`confidence ${action.confidence}`}>{content.advisory.confidence.labels[action.confidence]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {advisory.signals.length ? (
            <p className="bulletin-note">Based on: {advisory.signals.join(" ")}</p>
          ) : null}
        </section>

        <footer className="bulletin-footer">
          <p>
            {content.advisory.confidence.labels.likely}: next {content.advisory.thresholds.likelyLeadDays} days ·{" "}
            {content.advisory.confidence.labels.possible}: to day {content.advisory.thresholds.possibleLeadDays} ·{" "}
            {content.advisory.confidence.labels.outlook}: beyond. {series.guidance}
          </p>
          {content.site.about.disclaimer ? <p>{content.site.about.disclaimer}</p> : null}
          <p>
            Live map and daily detail:{" "}
            <a href={mapUrl} className="bulletin-link">
              {`${host}/?area=district&name=${encodeURIComponent(district.name)}`}
            </a>
            {content.site.about.contactPhone || content.site.about.contactEmail
              ? ` · Contact GMet: ${[content.site.about.contactPhone, content.site.about.contactEmail].filter(Boolean).join(", ")}`
              : ""}
          </p>
          <p className="bulletin-run">
            Run {run.run_id} · {DELIVERED_BY} · {MODELS_CREDIT}
          </p>
          <ul className="bulletin-partners">
            {PARTNERS.map((partner) => (
              <li key={partner.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- SVG and PNG logos, sized by CSS */}
                <img src={partner.logo} alt={partner.name} />
              </li>
            ))}
          </ul>
        </footer>
      </article>
    </main>
  );
}
