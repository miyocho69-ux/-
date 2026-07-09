"use client";

import { useState } from "react";

type TabKey = "profit" | "trend" | "allocation";

export function PortfolioTabs({
  profitTab,
  trendTab,
  allocationTab,
}: {
  profitTab: React.ReactNode;
  trendTab: React.ReactNode;
  allocationTab: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("profit");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "profit", label: "수익" },
    { key: "trend", label: "추이" },
    { key: "allocation", label: "비중" },
  ];

  return (
    <div className="space-y-4">
      <div
        className="flex w-fit gap-1.5 rounded-xl border p-1"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className="rounded-lg px-5.5 py-2.5 text-[13px] font-bold"
            style={
              active === tab.key
                ? { background: "#1a2130", color: "var(--accent-teal)" }
                : { color: "var(--text-muted)" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {active === "profit" && profitTab}
        {active === "trend" && trendTab}
        {active === "allocation" && allocationTab}
      </div>
    </div>
  );
}
