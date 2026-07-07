import { createAdminClient } from "@/lib/supabase/admin";
import { createTrade, deleteTrade } from "@/lib/actions/trades";

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
      <div className="p-8 text-red-600">
        데이터를 불러오지 못했습니다: {(accountsError ?? tradesError)?.message}
      </div>
    );
  }

  const accountNameById = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">매매기록</h1>

      {(accounts ?? []).length === 0 ? (
        <p className="text-gray-500">
          매매기록을 입력하려면 먼저 <a href="/accounts" className="underline">계좌를 등록</a>하세요.
        </p>
      ) : (
        <form action={createTrade} className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">매매기록 입력</h2>
          <select name="account_id" required className="w-full rounded border px-3 py-2">
            <option value="">계좌 선택</option>
            {(accounts ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <input
              name="ticker"
              placeholder="종목 코드"
              required
              className="w-1/2 rounded border px-3 py-2"
            />
            <input
              name="name"
              placeholder="종목명"
              required
              className="w-1/2 rounded border px-3 py-2"
            />
          </div>
          <div className="flex gap-3">
            <select name="side" required className="w-1/3 rounded border px-3 py-2">
              <option value="">매수/매도</option>
              <option value="buy">매수</option>
              <option value="sell">매도</option>
            </select>
            <input
              name="quantity"
              type="number"
              step="any"
              min="0"
              placeholder="수량"
              required
              className="w-1/3 rounded border px-3 py-2"
            />
            <input
              name="price"
              type="number"
              step="any"
              min="0"
              placeholder="단가"
              required
              className="w-1/3 rounded border px-3 py-2"
            />
          </div>
          <input
            name="traded_at"
            type="date"
            required
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="memo"
            placeholder="메모 (선택)"
            className="w-full rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-black px-4 py-2 text-white">
            등록
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {(trades ?? []).map((trade) => (
          <li key={trade.id} className="flex items-center justify-between rounded border px-4 py-3">
            <div>
              <div className="font-medium">
                {trade.traded_at} · {accountNameById.get(trade.account_id) ?? "알 수 없는 계좌"} ·{" "}
                {trade.side === "buy" ? "매수" : "매도"} {trade.name}({trade.ticker})
              </div>
              <div className="text-sm text-gray-500">
                {trade.quantity}주 @ {trade.price.toLocaleString()} {trade.memo ? `· ${trade.memo}` : ""}
              </div>
            </div>
            <form action={deleteTrade.bind(null, trade.id, trade.account_id, trade.ticker)}>
              <button type="submit" className="text-sm text-red-600 hover:underline">
                삭제
              </button>
            </form>
          </li>
        ))}
        {(trades ?? []).length === 0 && <li className="text-gray-500">매매기록이 없습니다.</li>}
      </ul>
    </div>
  );
}
