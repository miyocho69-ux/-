"use client";

import { useMemo, useState } from "react";

export interface HoldingMover {
  name: string;
  ticker: string;
  accountId: string;
  changeRate: number; // (last_price - avg_cost) / avg_cost * 100
  changeAmount: number; // 원화 환산된 평가손익
}

export interface HoldingsMoversCardProps {
  movers: HoldingMover[];
  accounts: { id: string; name: string }[];
}

const BADGE_PALETTE = [
  "#3f8cff", "#f5495c", "#f0b90b", "#24d3b5", "#a78bfa",
  "#fb7185", "#34d399", "#60a5fa", "#f59e0b", "#c084fc",
];

function formatSignedRate(rate: number): string {
  const sign = rate >= 0 ? "+" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

function formatSignedAmount(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${Math.round(amount).toLocaleString()}원`;
}

function monogram(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

export function HoldingsMoversCard({ movers, accounts }: HoldingsMoversCardProps) {
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const filtered = useMemo(
    () => movers.filter((m) => accountFilter === "all" || m.accountId === accountFilter),
    [movers, accountFilter]
  );
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        sortDir === "desc" ? b.changeRate - a.changeRate : a.changeRate - b.changeRate
      ),
    [filtered, sortDir]
  );

  if (movers.length === 0) {
    return (
      <div
        className="rounded-2xl border p-4"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        <h3 className="mb-2 font-semibold" style={{ color: "var(--text-headline)" }}>
          보유종목 등락 현황
        </h3>
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          시세가 아직 확인되지 않았습니다.
        </p>
      </div>
    );
  }

  const filterTabs = [{ id: "all", name: "전체" }, ...accounts];

  return (
    <div
      className="rounded-2xl border"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3.5 px-4.5 pb-2.5 pt-4">
        <div className="flex items-baseline gap-2">
          <div className="text-[15px] font-bold" style={{ color: "var(--text-body)" }}>
            보유종목 등락 현황
          </div>
          <div className="text-xs" style={{ color: "var(--text-faint)" }}>
            {sorted.length}/{movers.length}종목
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-[3px] rounded-lg border p-[3px]"
            style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
          >
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAccountFilter(tab.id)}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold"
                style={
                  accountFilter === tab.id
                    ? { background: "#1a2130", color: "var(--accent-teal)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {tab.name}
              </button>
            ))}
          </div>
          <div
            className="flex gap-[3px] rounded-lg border p-[3px]"
            style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
          >
            <button
              onClick={() => setSortDir("desc")}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold"
              style={
                sortDir === "desc"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
            >
              등락률 ↓
            </button>
            <button
              onClick={() => setSortDir("asc")}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold"
              style={
                sortDir === "asc"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
            >
              등락률 ↑
            </button>
          </div>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {sorted.map((m, i) => (
          <div
            key={`${m.accountId}:${m.ticker}`}
            className="flex items-center gap-3 border-t px-4.5 py-2.5"
            style={{ borderColor: "var(--border-row)" }}
          >
            <div
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-[10px] font-bold"
              style={{ background: BADGE_PALETTE[i % BADGE_PALETTE.length], color: "#0a0d13" }}
            >
              {monogram(m.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-medium"
                style={{ color: "var(--text-body)" }}
              >
                {m.name}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                {m.ticker}
              </div>
            </div>
            <div
              className="text-right font-mono text-[13px] font-semibold"
              style={{ color: m.changeRate >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedRate(m.changeRate)}
            </div>
            <div
              className="w-[130px] text-right font-mono text-[13px]"
              style={{ color: m.changeAmount >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedAmount(m.changeAmount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
