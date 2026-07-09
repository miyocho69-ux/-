"use client";

import { useState } from "react";

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

function LineChart({ snapshots }: { snapshots: TrendTabProps["snapshots"] }) {
  if (snapshots.length === 0) {
    return <p className="text-sm text-gray-400">표시할 데이터가 없습니다.</p>;
  }

  const width = 320;
  const height = 160;
  const values = snapshots.map((s) => s.total_value);
  const costs = snapshots.map((s) => s.total_cost);
  const allValues = [...values, ...costs];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  function toPoints(series: number[]): string {
    return series
      .map((v, i) => {
        const x = snapshots.length > 1 ? (i / (snapshots.length - 1)) * width : width / 2;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="투자 자산 추이 차트">
      <polyline points={toPoints(costs)} fill="none" stroke="var(--series-3)" strokeWidth={1.5} strokeDasharray="4 2" />
      <polyline points={toPoints(values)} fill="none" stroke="var(--series-6)" strokeWidth={2} />
    </svg>
  );
}

export function TrendTab({ snapshots }: TrendTabProps) {
  const [range, setRange] = useState<RangeKey>("all");
  const filtered = filterByRange(snapshots, range);
  const latest = filtered[filtered.length - 1];

  return (
    <div className="space-y-4">
      {latest && (
        <div>
          <div className="text-xs text-gray-500">투자 자산</div>
          <div className="text-2xl font-bold">{Math.round(latest.total_value).toLocaleString()}원</div>
          <div className="text-sm text-gray-500">원금 {Math.round(latest.total_cost).toLocaleString()}원</div>
        </div>
      )}

      <LineChart snapshots={filtered} />

      <div className="flex flex-wrap gap-1 text-xs">
        {RANGE_LABELS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full border px-3 py-1 ${
              range === r.key ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
