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
      <div className="flex gap-1 rounded-lg border p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              active === tab.key
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
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
