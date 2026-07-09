import { createAdminClient } from "@/lib/supabase/admin";
import { syncHoldingPrices } from "@/lib/toss/prices";
import { upsertTodaySnapshot } from "@/lib/portfolio/snapshot";
import { PortfolioTabs } from "@/components/PortfolioTabs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createAdminClient();

  if (process.env.ENABLE_LOCAL_PRICE_SYNC === "true") {
    const startedAt = new Date().toISOString();
    try {
      const result = await syncHoldingPrices();
      const finishedAt = new Date().toISOString();
      await supabase.from("price_sync_runs").upsert({
        id: true,
        started_at: startedAt,
        finished_at: finishedAt,
        status: result.status,
        synced_count: result.syncedCount,
        failed_tickers: result.failedTickers,
        error_message: result.errorMessage,
      });
      if (result.syncedCount > 0) {
        await upsertTodaySnapshot(supabase);
      }
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const errorMessage = err instanceof Error ? err.message : String(err);
      await supabase.from("price_sync_runs").upsert({
        id: true,
        started_at: startedAt,
        finished_at: finishedAt,
        status: "failed",
        synced_count: 0,
        failed_tickers: [],
        error_message: errorMessage,
      });
    }
  }

  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("id, account_id, ticker, name, quantity, avg_cost, last_price, price_updated_at, accounts(name, market)")
    .order("updated_at", { ascending: false });

  if (error) {
    return <div className="p-8 text-red-600">보유종목을 불러오지 못했습니다: {error.message}</div>;
  }

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.quantity) * Number(h.avg_cost),
    0
  );

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + Number(h.quantity) * price;
  }, 0);

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6">
      <div>
        <div className="text-sm text-gray-500">총 평가금액</div>
        <div className="text-3xl font-bold">{totalValue.toLocaleString()}원</div>
      </div>

      <PortfolioTabs
        profitTab={<div className="text-gray-400">수익 탭 (Task 5에서 구현)</div>}
        trendTab={<div className="text-gray-400">추이 탭 (Task 6에서 구현)</div>}
        allocationTab={<div className="text-gray-400">비중 탭 (Task 7에서 구현)</div>}
      />
    </div>
  );
}
