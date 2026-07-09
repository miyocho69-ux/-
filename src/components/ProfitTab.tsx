"use client";

import { useState } from "react";

export interface ProfitTabProps {
  unrealizedPnl: number;
  realizedPnl: number;
  dividendPnl: number;
  totalCostBasis: number;
  dailyRealized: { label: string; value: number }[];
  monthlyRealized: { label: string; value: number }[];
}

function formatSigned(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString()}원`;
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const [hovered, setHovered] = useState<{ label: string; value: number } | null>(null);
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <div className="relative">
      {hovered && (
        <div
          className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs shadow"
          style={{ background: "var(--border-row)", color: "var(--text-body)" }}
        >
          {hovered.label}: {formatSigned(hovered.value)}
        </div>
      )}
      <div className="flex h-32 items-end gap-0.5 overflow-x-auto">
        {data.map((d) => {
          const heightPct = (Math.abs(d.value) / maxAbs) * 100;
          return (
            <div
              key={d.label}
              className="flex min-w-[6px] flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHovered(d)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${heightPct}%`,
                  minHeight: d.value !== 0 ? "2px" : "0",
                  background: d.value >= 0 ? "var(--color-up)" : "var(--color-down)",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProfitTab({
  unrealizedPnl,
  realizedPnl,
  dividendPnl,
  totalCostBasis,
  dailyRealized,
  monthlyRealized,
}: ProfitTabProps) {
  const [range, setRange] = useState<"daily" | "monthly">("daily");
  const totalRealizedRate = totalCostBasis > 0 ? (realizedPnl / totalCostBasis) * 100 : 0;

  const cardStyle = { background: "var(--bg-panel)", borderColor: "var(--border-card)" };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3.5">
        <div className="rounded-xl border p-4.5" style={cardStyle}>
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            평가손익 (오늘)
          </div>
          <div
            className="font-mono text-[22px] font-bold"
            style={{ color: unrealizedPnl >= 0 ? "var(--color-up)" : "var(--color-down)" }}
          >
            {formatSigned(unrealizedPnl)}
          </div>
        </div>
        <div className="rounded-xl border p-4.5" style={cardStyle}>
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            실현손익
          </div>
          <div
            className="font-mono text-[22px] font-bold"
            style={{ color: realizedPnl >= 0 ? "var(--color-up)" : "var(--color-down)" }}
          >
            {formatSigned(realizedPnl)}
          </div>
        </div>
        <div
          className="rounded-xl border p-4.5"
          style={{ background: "var(--bg-panel)", borderColor: "#24d3b533" }}
        >
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            총 손익 (실현+평가)
          </div>
          <div
            className="font-mono text-[22px] font-bold"
            style={{
              color: unrealizedPnl + realizedPnl >= 0 ? "var(--color-up)" : "var(--color-down)",
            }}
          >
            {formatSigned(unrealizedPnl + realizedPnl)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4.5" style={cardStyle}>
        <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
          총 실현수익률
        </div>
        <div
          className="font-mono text-xl font-bold"
          style={{ color: totalRealizedRate >= 0 ? "var(--color-up)" : "var(--color-down)" }}
        >
          {totalRealizedRate >= 0 ? "+" : ""}
          {totalRealizedRate.toFixed(2)}%
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: "var(--text-body)" }}>
            실현손익 차트
          </h3>
          <div
            className="flex gap-1 rounded-md border p-0.5 text-xs"
            style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
          >
            <button
              onClick={() => setRange("daily")}
              className="rounded px-2 py-1"
              style={
                range === "daily"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
            >
              일별
            </button>
            <button
              onClick={() => setRange("monthly")}
              className="rounded px-2 py-1"
              style={
                range === "monthly"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
            >
              월별
            </button>
          </div>
        </div>
        <BarChart data={range === "daily" ? dailyRealized : monthlyRealized} />
      </div>
    </div>
  );
}
