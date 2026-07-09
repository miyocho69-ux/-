import { createAdminClient } from "@/lib/supabase/admin";
import { syncHoldingPrices } from "@/lib/toss/prices";
import { upsertTodaySnapshot } from "@/lib/portfolio/snapshot";
import { PortfolioTabs } from "@/components/PortfolioTabs";
import { ProfitTab } from "@/components/ProfitTab";

export const dynamic = "force-dynamic";

function groupRealizedByDay(
  trades: { traded_at: string; realized_pnl: number | null }[],
  days: number
): { label: string; value: number }[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const t of trades) {
    if (t.realized_pnl == null) continue;
    if (buckets.has(t.traded_at)) {
      buckets.set(t.traded_at, (buckets.get(t.traded_at) ?? 0) + Number(t.realized_pnl));
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

function groupRealizedByMonth(
  trades: { traded_at: string; realized_pnl: number | null }[],
  months: number
): { label: string; value: number }[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(label, 0);
  }
  for (const t of trades) {
    if (t.realized_pnl == null) continue;
    const label = t.traded_at.slice(0, 7);
    if (buckets.has(label)) {
      buckets.set(label, (buckets.get(label) ?? 0) + Number(t.realized_pnl));
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

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

  const { data: trades } = await supabase
    .from("trades")
    .select("traded_at, realized_pnl")
    .not("realized_pnl", "is", null);

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.quantity) * Number(h.avg_cost),
    0
  );

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + Number(h.quantity) * price;
  }, 0);

  const unrealizedPnl = (holdings ?? []).reduce((sum, h) => {
    if (h.last_price == null) return sum;
    return sum + (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity);
  }, 0);

  const realizedPnl = (trades ?? []).reduce((sum, t) => sum + Number(t.realized_pnl ?? 0), 0);

  const totalCostBasis = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.avg_cost) * Number(h.quantity),
    0
  );

  const dailyRealized = groupRealizedByDay(trades ?? [], 30);
  const monthlyRealized = groupRealizedByMonth(trades ?? [], 12);

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6">
      <div>
        <div className="text-sm text-gray-500">총 평가금액</div>
        <div className="text-3xl font-bold">{totalValue.toLocaleString()}원</div>
      </div>

      <PortfolioTabs
        profitTab={
          <ProfitTab
            unrealizedPnl={unrealizedPnl}
            realizedPnl={realizedPnl}
            dividendPnl={0}
            totalCostBasis={totalCostBasis}
            dailyRealized={dailyRealized}
            monthlyRealized={monthlyRealized}
          />
        }
        trendTab={<div className="text-gray-400">추이 탭 (Task 6에서 구현)</div>}
        allocationTab={<div className="text-gray-400">비중 탭 (Task 7에서 구현)</div>}
      />
    </div>
  );
}
