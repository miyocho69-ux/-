import { createAdminClient } from "@/lib/supabase/admin";
import { createTrade, deleteTrade } from "@/lib/actions/trades";
import { TradeFilterTabs } from "@/components/TradeFilterTabs";

export const dynamic = "force-dynamic";

const inputStyle = {
  background: "var(--border-row)",
  borderColor: "var(--border-input)",
  color: "var(--text-body)",
};

export default async function TradesPage() {
  const supabase = createAdminClient();

  const [{ data: accounts, error: accountsError }, { data: trades, error: tradesError }] =
    await Promise.all([
      supabase.from("accounts").select("id, name").order("created_at", { ascending: true }),
      supabase
        .from("trades")
        .select("id, account_id, ticker, name, side, quantity, price, traded_at, memo")
        .order("traded_at", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  if (accountsError || tradesError) {
    return (
      <div className="p-8" style={{ color: "var(--color-up)" }}>
        데이터를 불러오지 못했습니다: {(accountsError ?? tradesError)?.message}
      </div>
    );
  }

  const accountNameById = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  const items = (trades ?? []).map((trade) => {
    const isBuy = trade.side === "buy";
    const amount = trade.quantity * trade.price;
    const color = isBuy ? "var(--color-up)" : "var(--color-down)";
    return {
      id: trade.id,
      type: (isBuy ? "매수" : "매도") as "매수" | "매도",
      node: (
        <div
          className="flex items-center justify-between border-t px-4.5 py-3 first:border-t-0"
          style={{ borderColor: "var(--border-row)" }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--text-body)" }}>
              <span style={{ color }}>{isBuy ? "매수" : "매도"}</span>{" "}
              {trade.name}({trade.ticker}) · {accountNameById.get(trade.account_id) ?? "알 수 없는 계좌"}
            </div>
            <div className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
              {trade.traded_at} · {trade.quantity}주 @ {trade.price.toLocaleString()}
              {trade.memo ? ` · ${trade.memo}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-sm font-semibold" style={{ color }}>
              {isBuy ? "-" : "+"}
              {Math.round(amount).toLocaleString()}원
            </div>
            <form action={deleteTrade.bind(null, trade.id, trade.account_id, trade.ticker)}>
              <button type="submit" className="text-xs" style={{ color: "var(--color-up)" }}>
                삭제
              </button>
            </form>
          </div>
        </div>
      ),
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-7">
      <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
        매매기록
      </h1>

      {(accounts ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          매매기록을 입력하려면 먼저{" "}
          <a href="/accounts" className="underline">
            계좌를 등록
          </a>
          하세요.
        </p>
      ) : (
        <form
          action={createTrade}
          className="space-y-3 rounded-2xl border p-4"
          style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--text-body)" }}>
            매매기록 입력
          </h2>
          <select name="account_id" required className="w-full rounded-lg border px-3 py-2" style={inputStyle}>
            <option value="">계좌 선택</option>
            {(accounts ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <input name="ticker" placeholder="종목 코드" required className="w-1/2 rounded-lg border px-3 py-2" style={inputStyle} />
            <input name="name" placeholder="종목명" required className="w-1/2 rounded-lg border px-3 py-2" style={inputStyle} />
          </div>
          <div className="flex gap-3">
            <select name="side" required className="w-1/3 rounded-lg border px-3 py-2" style={inputStyle}>
              <option value="">매수/매도</option>
              <option value="buy">매수</option>
              <option value="sell">매도</option>
            </select>
            <input name="quantity" type="number" step="any" min="0" placeholder="수량" required className="w-1/3 rounded-lg border px-3 py-2" style={inputStyle} />
            <input name="price" type="number" step="any" min="0" placeholder="단가" required className="w-1/3 rounded-lg border px-3 py-2" style={inputStyle} />
          </div>
          <input name="traded_at" type="date" required className="w-full rounded-lg border px-3 py-2" style={inputStyle} />
          <input name="memo" placeholder="메모 (선택)" className="w-full rounded-lg border px-3 py-2" style={inputStyle} />
          <button type="submit" className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: "#12202f", color: "var(--accent-teal)" }}>
            등록
          </button>
        </form>
      )}

      <TradeFilterTabs items={items} />
    </div>
  );
}
