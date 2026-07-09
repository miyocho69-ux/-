"use client";

import { useState, type ReactNode } from "react";

interface AccountTabDef {
  id: string;
  name: string;
  content: ReactNode;
}

export function AccountAnalysisTabs({ tabs }: { tabs: AccountTabDef[] }) {
  const [selected, setSelected] = useState(tabs[0]?.id ?? "all");
  const active = tabs.find((t) => t.id === selected) ?? tabs[0];

  return (
    <div>
      <div
        className="mb-5 flex w-fit gap-1.5 rounded-xl border p-1"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelected(tab.id)}
            className="whitespace-nowrap rounded-lg px-4.5 py-2.5 text-[13px] font-bold"
            style={
              selected === tab.id
                ? { background: "#1a2130", color: "var(--accent-teal)" }
                : { color: "var(--text-muted)" }
            }
          >
            {tab.name}
          </button>
        ))}
      </div>
      {active?.content}
    </div>
  );
}
