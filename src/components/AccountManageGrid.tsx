"use client";

import { useState, useTransition } from "react";
import { createAccount, deleteAccount, renameAccount } from "@/lib/actions/accounts";

interface AccountCardData {
  id: string;
  name: string;
  totalValue: number;
  todayPnlPct: number;
  holdingCount: number;
}

interface AccountManageGridProps {
  accounts: AccountCardData[];
}

function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString()}원`;
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function AccountCard({ account }: { account: AccountCardData }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(account.name);
  const [isPending, startTransition] = useTransition();

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await renameAccount(account.id, trimmed);
      setIsEditing(false);
    });
  };

  const onDelete = () => {
    if (!window.confirm(`${account.name} 계좌를 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      await deleteAccount(account.id);
    });
  };

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {isEditing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            placeholder="계좌 이름"
            className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
            style={{
              background: "var(--border-row)",
              borderColor: "var(--border-input)",
              color: "var(--text-body)",
            }}
          />
        ) : (
          <div
            className="truncate text-sm font-semibold"
            style={{ color: "var(--text-body-secondary)" }}
          >
            {account.name}
          </div>
        )}
        <div className="flex shrink-0 gap-1">
          {isEditing ? (
            <button
              onClick={commit}
              disabled={isPending}
              className="whitespace-nowrap rounded-md px-2 py-1 text-[11px]"
              style={{ color: "var(--accent-teal)" }}
            >
              저장
            </button>
          ) : (
            <button
              onClick={() => {
                setDraft(account.name);
                setIsEditing(true);
              }}
              className="whitespace-nowrap rounded-md px-2 py-1 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              수정
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={isPending}
            className="whitespace-nowrap rounded-md px-2 py-1 text-[11px]"
            style={{ color: "var(--color-up)" }}
          >
            삭제
          </button>
        </div>
      </div>
      <div className="mb-2.5 font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
        {formatWon(account.totalValue)}
      </div>
      <div className="flex justify-between text-xs">
        <span style={{ color: "var(--text-muted)" }}>오늘</span>
        <span style={{ color: account.todayPnlPct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
          {formatSignedPct(account.todayPnlPct)}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span style={{ color: "var(--text-muted)" }}>보유종목</span>
        <span style={{ color: "var(--text-tertiary)" }}>{account.holdingCount}종목</span>
      </div>
    </div>
  );
}

function AddAccountCard() {
  const [name, setName] = useState("");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const formData = new FormData();
    formData.set("name", trimmed);
    formData.set("market", market);
    startTransition(async () => {
      await createAccount(formData);
      setName("");
    });
  };

  return (
    <div
      className="flex min-h-[150px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed p-5"
      style={{ borderColor: "var(--border-input)" }}
    >
      <div className="text-xs" style={{ color: "var(--text-faint)" }}>
        새 계좌 추가
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="계좌 이름"
        className="w-40 rounded-lg border px-3 py-2 text-center text-sm"
        style={{
          background: "var(--border-row)",
          borderColor: "var(--border-input)",
          color: "var(--text-body)",
        }}
      />
      <div
        className="flex gap-[3px] rounded-lg border p-[3px]"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        <button
          onClick={() => setMarket("KR")}
          className="rounded-md px-3 py-1 text-xs font-semibold"
          style={
            market === "KR"
              ? { background: "#1a2130", color: "var(--accent-teal)" }
              : { color: "var(--text-muted)" }
          }
        >
          국내
        </button>
        <button
          onClick={() => setMarket("US")}
          className="rounded-md px-3 py-1 text-xs font-semibold"
          style={
            market === "US"
              ? { background: "#1a2130", color: "var(--accent-teal)" }
              : { color: "var(--text-muted)" }
          }
        >
          미국
        </button>
      </div>
      <button
        onClick={submit}
        disabled={isPending}
        className="rounded-lg px-5 py-2 text-sm font-bold"
        style={{ background: "#12202f", color: "var(--accent-teal)" }}
      >
        + 계좌 추가
      </button>
    </div>
  );
}

export function AccountManageGrid({ accounts }: AccountManageGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
      <AddAccountCard />
    </div>
  );
}
