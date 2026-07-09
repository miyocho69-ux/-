"use client";

import { useState } from "react";
import { SectorDonutChart, type SectorSlice } from "@/components/SectorDonutChart";

export interface AllocationTabProps {
  byTicker: SectorSlice[];
  accounts: { id: string; name: string }[];
  byAccountTicker: Record<string, SectorSlice[]>;
}

export function AllocationTab({ byTicker, accounts, byAccountTicker }: AllocationTabProps) {
  const [view, setView] = useState<"ticker" | "account">("ticker");
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? "");

  const selectedAccountName = accounts.find((a) => a.id === selectedAccountId)?.name ?? "";
  const accountSlices = byAccountTicker[selectedAccountId] ?? [];

  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 rounded-lg border p-0.5 text-xs"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        <button
          onClick={() => setView("ticker")}
          className="flex-1 rounded px-3 py-1.5"
          style={
            view === "ticker"
              ? { background: "#1a2130", color: "var(--accent-teal)" }
              : { color: "var(--text-muted)" }
          }
        >
          종목별
        </button>
        <button
          onClick={() => setView("account")}
          className="flex-1 rounded px-3 py-1.5"
          style={
            view === "account"
              ? { background: "#1a2130", color: "var(--accent-teal)" }
              : { color: "var(--text-muted)" }
          }
        >
          계좌별
        </button>
      </div>

      {view === "account" && accounts.length > 0 && (
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{
            background: "var(--border-row)",
            borderColor: "var(--border-input)",
            color: "var(--text-body)",
          }}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      )}

      {view === "ticker" ? (
        <SectorDonutChart slices={byTicker} title="종목별 비중" />
      ) : accounts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          등록된 계좌가 없습니다.
        </p>
      ) : (
        <SectorDonutChart slices={accountSlices} title={`${selectedAccountName} 종목별 비중`} />
      )}
    </div>
  );
}
