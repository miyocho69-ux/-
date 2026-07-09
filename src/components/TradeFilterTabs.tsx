"use client";

import { useState, type ReactNode } from "react";

export interface TradeFilterTabsProps {
  items: { id: string; type: "매수" | "매도"; node: ReactNode }[];
}

type FilterKey = "all" | "buy" | "sell";

export function TradeFilterTabs({ items }: TradeFilterTabsProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const visible = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "buy") return item.type === "매수";
    return item.type === "매도";
  });

  const tabs: { key: FilterKey; label: string; activeStyle: React.CSSProperties }[] = [
    { key: "all", label: "전체", activeStyle: { background: "#1a2130", color: "var(--text-headline)" } },
    { key: "buy", label: "매수", activeStyle: { background: "#2a1418", color: "var(--color-up)" } },
    { key: "sell", label: "매도", activeStyle: { background: "#12202f", color: "var(--color-down)" } },
  ];

  return (
    <div>
      <div
        className="mb-4 flex w-fit gap-1.5 rounded-xl border p-1"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="whitespace-nowrap rounded-lg px-4.5 py-2 text-[13px] font-bold"
            style={filter === tab.key ? tab.activeStyle : { color: "var(--text-muted)" }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="rounded-2xl border"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        {visible.map((item) => (
          <div key={item.id}>{item.node}</div>
        ))}
        {visible.length === 0 && (
          <div className="p-4 text-sm" style={{ color: "var(--text-faint)" }}>
            해당 조건의 매매기록이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
