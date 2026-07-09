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
        <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow dark:bg-gray-100 dark:text-black">
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
                className={`w-full rounded-sm ${d.value >= 0 ? "bg-red-500" : "bg-blue-500"}`}
                style={{ height: `${heightPct}%`, minHeight: d.value !== 0 ? "2px" : "0" }}
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">평가수익</div>
          <div className={`text-lg font-semibold ${unrealizedPnl >= 0 ? "text-red-600" : "text-blue-600"}`}>
            {formatSigned(unrealizedPnl)}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">실현수익</div>
          <div className={`text-lg font-semibold ${realizedPnl >= 0 ? "text-red-600" : "text-blue-600"}`}>
            {formatSigned(realizedPnl)}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">배당수익</div>
          <div className="text-lg font-semibold text-gray-400">{formatSigned(dividendPnl)}</div>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <div className="text-xs text-gray-500">총 실현수익률</div>
        <div className={`text-xl font-bold ${totalRealizedRate >= 0 ? "text-red-600" : "text-blue-600"}`}>
          {totalRealizedRate >= 0 ? "+" : ""}
          {totalRealizedRate.toFixed(2)}%
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">실현손익 차트</h3>
          <div className="flex gap-1 rounded-md border p-0.5 text-xs">
            <button
              onClick={() => setRange("daily")}
              className={`rounded px-2 py-1 ${range === "daily" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
            >
              일별
            </button>
            <button
              onClick={() => setRange("monthly")}
              className={`rounded px-2 py-1 ${range === "monthly" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
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
