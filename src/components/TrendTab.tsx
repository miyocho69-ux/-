"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface TrendTabProps {
  snapshots: { date: string; total_value: number; total_cost: number }[];
}

type RangeKey = "month" | "1m" | "6m" | "1y" | "ytd" | "all";

const RANGE_LABELS: { key: RangeKey; label: string }[] = [
  { key: "month", label: "이달" },
  { key: "1m", label: "1달" },
  { key: "6m", label: "6달" },
  { key: "1y", label: "1년" },
  { key: "ytd", label: "올해" },
  { key: "all", label: "전체" },
];

// Date를 로컬(KST) 기준 연/월/일로 "YYYY-MM-DD" 문자열로 변환한다.
// .toISOString()은 UTC로 변환하므로 KST(UTC+9) 자정은 전날 15:00 UTC가 되어
// slice(0, 10) 시 하루 앞선 날짜가 나오는 문제가 있어 이 함수로 대체한다.
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function filterByRange(
  snapshots: TrendTabProps["snapshots"],
  range: RangeKey
): TrendTabProps["snapshots"] {
  if (range === "all") return snapshots;
  const now = new Date();
  let cutoff: Date;
  if (range === "month" || range === "ytd") {
    cutoff = range === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1);
  } else {
    const monthsBack = range === "1m" ? 1 : range === "6m" ? 6 : 12;
    // 주의: 현재 일(day)이 대상 월에 존재하지 않으면(예: 3/31 - 1달 -> 2/31)
    // Date가 다음 달로 자동 보정한다(2/31 -> 3/2~3). 근사치 필터 용도라 영향은
    // 미미하지만 정확한 달력 경계가 필요해지면 day-count 기반 계산으로 교체할 것.
    cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate());
  }
  const cutoffStr = toLocalDateString(cutoff);
  return snapshots.filter((s) => s.date >= cutoffStr);
}

function TrendChart({ snapshots }: { snapshots: TrendTabProps["snapshots"] }) {
  if (snapshots.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-faint)" }}>
        표시할 데이터가 없습니다.
      </p>
    );
  }

  const data = snapshots.map((s) => ({
    date: s.date,
    원금: Math.round(s.total_cost),
    총자산: Math.round(s.total_value),
  }));

  const values = data.flatMap((d) => [d.원금, d.총자산]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue) * 0.1 || maxValue * 0.05;
  const yDomain: [number, number] = [Math.max(0, Math.floor(minValue - padding)), Math.ceil(maxValue + padding)];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border-row)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(5)}
          axisLine={{ stroke: "var(--border-row)" }}
          tickLine={false}
        />
        <YAxis
          domain={yDomain}
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          tickFormatter={(v: number) => `${Math.round(v / 10000).toLocaleString()}만`}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: "var(--border-row)",
            border: "1px solid var(--border-input)",
            borderRadius: 8,
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 12,
          }}
          formatter={(value) => `${Number(value).toLocaleString()}원`}
        />
        <Area
          type="monotone"
          dataKey="총자산"
          stroke="var(--accent-teal)"
          strokeWidth={2.5}
          fill="rgba(36,211,181,0.08)"
        />
        <Line
          type="monotone"
          dataKey="원금"
          stroke="var(--text-faint)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TrendTab({ snapshots }: TrendTabProps) {
  const [range, setRange] = useState<RangeKey>("all");
  const filtered = filterByRange(snapshots, range);
  const latest = filtered[filtered.length - 1];

  return (
    <div
      className="space-y-4 rounded-xl border p-5"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      {latest && (
        <div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            투자 자산
          </div>
          <div className="font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
            {Math.round(latest.total_value).toLocaleString()}원
          </div>
          <div className="text-sm" style={{ color: "var(--text-faint)" }}>
            원금 {Math.round(latest.total_cost).toLocaleString()}원
          </div>
        </div>
      )}

      <TrendChart snapshots={filtered} />

      <div className="flex flex-wrap gap-1 text-xs">
        {RANGE_LABELS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className="rounded-full border px-3 py-1"
            style={
              range === r.key
                ? { background: "#1a2130", color: "var(--accent-teal)", borderColor: "var(--border-pill)" }
                : { color: "var(--text-muted)", borderColor: "var(--border-pill)" }
            }
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
