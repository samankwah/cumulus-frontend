import { formatRange } from "@/lib/subseasonal";
import type { SubseasonalWeek } from "@/lib/subseasonal";

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 16, right: 12, bottom: 40, left: 40 };

function niceMax(value: number) {
  if (value <= 0) return 10;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

/**
 * Week-by-week rain as a static SVG for the printed bulletin: a bar for the ensemble mean and a
 * whisker for the 10–90% range of the members. Weeks already past are drawn faded.
 */
export function WeeklyRainChart({ weeks, today }: { weeks: SubseasonalWeek[]; today: string }) {
  if (!weeks.length) return null;
  const top = niceMax(Math.max(...weeks.map((week) => Math.max(week.value ?? 0, week.spread?.p90 ?? 0))));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.min(56, slot * 0.56);
  const y = (value: number) => PAD.top + plotH - (Math.max(0, value) / top) * plotH;
  const ticks = [0, top / 2, top];
  return (
    <svg
      className="bulletin-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Weekly rain: ${weeks.map((week) => `week ${week.week} ${Math.round(week.value ?? 0)} mm`).join(", ")}`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="grid" />
          <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="axis">
            {Math.round(tick)}
          </text>
        </g>
      ))}
      <text x={10} y={PAD.top + plotH / 2} className="axis" transform={`rotate(-90 10 ${PAD.top + plotH / 2})`} textAnchor="middle">
        mm
      </text>
      {weeks.map((week, position) => {
        const cx = PAD.left + slot * position + slot / 2;
        const value = week.value ?? 0;
        const past = week.end_date < today;
        return (
          <g key={week.week} className={past ? "past" : undefined}>
            <rect x={cx - barW / 2} y={y(value)} width={barW} height={Math.max(0, y(0) - y(value))} rx={3} className="bar" />
            {week.spread?.p10 != null && week.spread?.p90 != null ? (
              <g className="whisker">
                <line x1={cx} x2={cx} y1={y(week.spread.p10)} y2={y(week.spread.p90)} />
                <line x1={cx - 6} x2={cx + 6} y1={y(week.spread.p90)} y2={y(week.spread.p90)} />
                <line x1={cx - 6} x2={cx + 6} y1={y(week.spread.p10)} y2={y(week.spread.p10)} />
              </g>
            ) : null}
            <text x={cx} y={y(Math.max(value, week.spread?.p90 ?? 0)) - 5} textAnchor="middle" className="value">
              {Math.round(value)}
            </text>
            <text x={cx} y={HEIGHT - PAD.bottom + 16} textAnchor="middle" className="axis">
              {week.partial ? `Days ${week.start_day}–${week.end_day}` : `Week ${week.week}`}
            </text>
            <text x={cx} y={HEIGHT - PAD.bottom + 30} textAnchor="middle" className="axis small">
              {formatRange(week.start_date, week.end_date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
