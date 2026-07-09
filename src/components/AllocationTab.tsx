"use client";

import { useState } from "react";
import { SectorDonutChart, type SectorSlice } from "@/components/SectorDonutChart";

export interface AllocationTabProps {
  byTicker: SectorSlice[];
  byAccount: SectorSlice[];
}

export function AllocationTab({ byTicker, byAccount }: AllocationTabProps) {
  const [view, setView] = useState<"ticker" | "account">("ticker");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md border p-0.5 text-xs">
        <button
          onClick={() => setView("ticker")}
          className={`flex-1 rounded px-3 py-1.5 ${view === "ticker" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
        >
          종목별
        </button>
        <button
          onClick={() => setView("account")}
          className={`flex-1 rounded px-3 py-1.5 ${view === "account" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
        >
          계좌별
        </button>
      </div>

      <SectorDonutChart
        slices={view === "ticker" ? byTicker : byAccount}
        title={view === "ticker" ? "종목별 비중" : "계좌별 비중"}
      />
    </div>
  );
}
