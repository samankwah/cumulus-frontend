"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatShortDate } from "@/lib/dashboard";
import type { PredictResponse, RegionalForecastComposite } from "@/lib/types";

export function RainfallChart({
  forecast,
  aggregateLabel,
}: {
  forecast: PredictResponse | RegionalForecastComposite;
  aggregateLabel?: string | null;
}) {
  const data = [...forecast.daily_forecast]
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    .map((day) => ({
      label: formatShortDate(day.date),
      fullDate: day.date,
      corrected: day.rainfall_corrected_mm,
      raw: day.rainfall_raw_mm,
    }));

  return (
    <div className="chart-card" data-testid="rainfall-chart">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Rainfall outlook</span>
          <h3>Daily forecast</h3>
        </div>
        <p>{aggregateLabel ?? "Corrected rainfall is the main field-use series."}</p>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(221, 235, 226, 0.14)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(230, 238, 232, 0.82)", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(230, 238, 232, 0.82)", fontSize: 12 }}
              width={42}
            />
            <Tooltip
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullDate
                  ? new Date(payload[0].payload.fullDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : ""
              }
              formatter={(value: number, name: string) => [`${value.toFixed(1)} mm`, name]}
              contentStyle={{
                border: "1px solid rgba(216, 229, 220, 0.18)",
                borderRadius: 16,
                background: "rgba(18, 34, 29, 0.95)",
                color: "rgba(242, 247, 243, 0.96)",
              }}
            />
            <Legend wrapperStyle={{ color: "rgba(242, 247, 243, 0.92)" }} />
            <Bar dataKey="corrected" fill="#5aa172" name="Corrected rainfall" radius={[10, 10, 0, 0]} />
            <Line
              type="monotone"
              dataKey="raw"
              stroke="#be7c37"
              strokeWidth={2.5}
              dot={{ r: 2.5 }}
              name="Raw rainfall"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
