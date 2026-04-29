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
            <CartesianGrid stroke="rgba(105, 119, 135, 0.22)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(32, 41, 50, 0.66)", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(32, 41, 50, 0.66)", fontSize: 12 }}
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
                border: "1px solid rgba(255, 255, 255, 0.58)",
                borderRadius: 18,
                background: "rgba(238, 243, 247, 0.96)",
                color: "rgba(32, 41, 50, 0.96)",
                boxShadow: "8px 10px 20px rgba(139, 153, 170, 0.28), -7px -7px 16px rgba(255, 255, 255, 0.64)",
              }}
            />
            <Legend wrapperStyle={{ color: "rgba(32, 41, 50, 0.72)" }} />
            <Bar dataKey="corrected" fill="#23d1ad" name="Corrected rainfall" radius={[10, 10, 0, 0]} />
            <Line
              type="monotone"
              dataKey="raw"
              stroke="#2f61c5"
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
