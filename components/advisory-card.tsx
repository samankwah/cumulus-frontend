import type {
  FarmerAdvisoryItem,
  RegionalAdvisoryCardComposite,
} from "@/lib/types";

type AdvisoryCardItem = FarmerAdvisoryItem | RegionalAdvisoryCardComposite;

function toneClass(level: string) {
  if (level.includes("warning") || level.includes("delay") || level.includes("irrigate")) {
    return "tone-high";
  }

  if (level.includes("watch") || level.includes("monitor")) {
    return "tone-mid";
  }

  return "tone-low";
}

export function AdvisoryCard({
  title,
  item,
  error,
  testId,
}: {
  title: string;
  item: AdvisoryCardItem | null;
  error?: string | null;
  testId?: string;
}) {
  if (error && !item) {
    return (
      <article className="advisory-card advisory-card-empty" data-testid={testId}>
        <span className="card-eyebrow">{title}</span>
        <h4>Unavailable</h4>
        <p>{error}</p>
      </article>
    );
  }

  if (!item) {
    return (
      <article className="advisory-card advisory-card-empty" data-testid={testId}>
        <span className="card-eyebrow">{title}</span>
        <h4>Waiting for advisory</h4>
        <p>The card will populate after the advisory request completes.</p>
      </article>
    );
  }

  return (
    <article className="advisory-card" data-testid={testId}>
      <div className="card-header">
        <span className="card-eyebrow">{title}</span>
      </div>
      <h4 data-testid={testId ? `${testId}-headline` : undefined}>{item.headline}</h4>
      <p className="card-recommendation" data-testid={testId ? `${testId}-recommendation` : undefined}>
        {item.recommendation}
      </p>
      <p className="card-reason">{item.reason}</p>
    </article>
  );
}
