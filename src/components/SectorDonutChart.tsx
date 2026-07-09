"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const SERIES_COLORS = [
  "#3f8cff", "#f5495c", "#f0b90b", "#24d3b5",
  "#a78bfa", "#34d399", "#fb7185", "#60a5fa",
];

export type SectorSlice = {
  sector: string;
  value: number;
};

export function SectorDonutChart({ slices, title }: { slices: SectorSlice[]; title: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (slices.length === 0 || total <= 0) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        <h3 className="mb-2 font-semibold" style={{ color: "var(--text-body)" }}>
          {title}
        </h3>
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          데이터가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      <h3 className="mb-3 font-semibold" style={{ color: "var(--text-body)" }}>
        {title}
      </h3>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="sector"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              stroke="var(--bg-panel)"
              strokeWidth={2}
            >
              {slices.map((slice, i) => (
                <Cell key={slice.sector} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--border-row)",
                border: "1px solid var(--border-input)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => `${Math.round(Number(value)).toLocaleString()}원`}
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="w-full space-y-1 text-sm">
          {slices.map((slice, i) => (
            <li key={slice.sector} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="flex-1 truncate" style={{ color: "var(--text-body-secondary)" }}>
                {slice.sector}
              </span>
              <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                {Math.round(slice.value).toLocaleString()}원 · {((slice.value / total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
