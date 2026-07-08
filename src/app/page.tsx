import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function Home() {
  const supabase = createAdminClient();

  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("id, account_id, ticker, name, quantity, avg_cost, last_price, price_updated_at, accounts(name, market)")
    .order("updated_at", { ascending: false });

  if (error) {
    return <div className="p-8 text-red-600">보유종목을 불러오지 못했습니다: {error.message}</div>;
  }

  const { data: lastRun } = await supabase
    .from("price_sync_runs")
    .select("status, finished_at, failed_tickers, error_message")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.quantity) * Number(h.avg_cost),
    0
  );

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + Number(h.quantity) * price;
  }, 0);

  function formatRelativeTime(iso: string | null | undefined) {
    if (!iso) return "갱신 기록 없음";
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}시간 전`;
  }

  const syncBadge = !lastRun ? (
    <span className="text-xs text-gray-400">시세 동기화 이력 없음</span>
  ) : lastRun.status === "success" ? (
    <span className="text-xs text-green-600">
      시세 갱신: {formatRelativeTime(lastRun.finished_at)}
    </span>
  ) : (
    <span className="text-xs text-red-600" title={lastRun.error_message ?? lastRun.failed_tickers?.join(", ")}>
      시세 갱신 {lastRun.status === "partial" ? "일부 실패" : "실패"}: {formatRelativeTime(lastRun.finished_at)}
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">보유종목</h1>
        {syncBadge}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">총 매수원가 합계</div>
          <div className="text-xl font-semibold">{totalCost.toLocaleString()}원</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">총 평가금액</div>
          <div className="text-xl font-semibold">{totalValue.toLocaleString()}원</div>
        </div>
      </div>

      <ul className="space-y-2">
        {(holdings ?? []).map((h) => {
          const account = h.accounts as unknown as { name: string; market: string } | null;
          const hasPrice = h.last_price != null;
          const profitLoss = hasPrice
            ? (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity)
            : null;

          return (
            <li key={h.id} className="rounded border px-4 py-3">
              <div className="font-medium">
                {h.name} ({h.ticker})
              </div>
              <div className="text-sm text-gray-500">
                {account?.name ?? "알 수 없는 계좌"} · {h.quantity}주 · 평단가{" "}
                {Number(h.avg_cost).toLocaleString()}원
              </div>
              <div className="text-sm">
                {hasPrice ? (
                  <span className={profitLoss! >= 0 ? "text-red-600" : "text-blue-600"}>
                    현재가 {Number(h.last_price).toLocaleString()}원 · 평가손익{" "}
                    {profitLoss! >= 0 ? "+" : ""}
                    {profitLoss!.toLocaleString()}원
                  </span>
                ) : (
                  <span className="text-gray-400">시세 미확인</span>
                )}
              </div>
            </li>
          );
        })}
        {(holdings ?? []).length === 0 && (
          <li className="text-gray-500">
            보유종목이 없습니다. <Link href="/trades" className="underline">매매기록</Link>을 입력해보세요.
          </li>
        )}
      </ul>
    </div>
  );
}
