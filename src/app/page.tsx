import { createAdminClient } from "@/lib/supabase/admin";
import { syncHoldingPrices } from "@/lib/toss/prices";
import { upsertTodaySnapshot } from "@/lib/portfolio/snapshot";
import { upsertExchangeRate, getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";
import { toKrw } from "@/lib/portfolio/currency";
import { PortfolioTabs } from "@/components/PortfolioTabs";
import { ProfitTab } from "@/components/ProfitTab";
import { TrendTab } from "@/components/TrendTab";
import { AllocationTab } from "@/components/AllocationTab";
import { HoldingsMoversCard, type HoldingMover } from "@/components/HoldingsMoversCard";

export const dynamic = "force-dynamic";

function groupRealizedByDay(
  trades: { traded_at: string; realized_pnl: number | null; ticker: string }[],
  days: number,
  usdKrwRate: number
): { label: string; value: number }[] {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST-shifted "now"
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    buckets.set(label, 0);
  }
  for (const t of trades) {
    if (t.realized_pnl == null) continue;
    if (buckets.has(t.traded_at)) {
      const value = toKrw(Number(t.realized_pnl), t.ticker, usdKrwRate);
      buckets.set(t.traded_at, (buckets.get(t.traded_at) ?? 0) + value);
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

function groupRealizedByMonth(
  trades: { traded_at: string; realized_pnl: number | null; ticker: string }[],
  months: number,
  usdKrwRate: number
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
      const value = toKrw(Number(t.realized_pnl), t.ticker, usdKrwRate);
      buckets.set(label, (buckets.get(label) ?? 0) + value);
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

function groupByTicker(
  holdings: { ticker: string; name: string; quantity: number; avg_cost: number; last_price: number | null }[],
  usdKrwRate: number
): { sector: string; value: number }[] {
  const totals = new Map<string, { label: string; value: number }>();
  for (const h of holdings) {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
    const existing = totals.get(h.ticker);
    if (existing) {
      existing.value += value;
    } else {
      totals.set(h.ticker, { label: `${h.name} (${h.ticker})`, value });
    }
  }
  return Array.from(totals.values())
    .map(({ label, value }) => ({ sector: label, value }))
    .sort((a, b) => b.value - a.value);
}

function groupByAccountTicker(
  holdings: {
    account_id: string;
    ticker: string;
    name: string;
    quantity: number;
    avg_cost: number;
    last_price: number | null;
  }[],
  usdKrwRate: number
): Record<string, { sector: string; value: number }[]> {
  const byAccount = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const list = byAccount.get(h.account_id) ?? [];
    list.push(h);
    byAccount.set(h.account_id, list);
  }

  const result: Record<string, { sector: string; value: number }[]> = {};
  for (const [accountId, accountHoldings] of byAccount.entries()) {
    result[accountId] = groupByTicker(accountHoldings, usdKrwRate);
  }
  return result;
}

function computeHoldingsMovers(
  holdings: {
    account_id: string;
    ticker: string;
    name: string;
    quantity: number;
    avg_cost: number;
    last_price: number | null;
  }[],
  usdKrwRate: number
): { name: string; ticker: string; accountId: string; changeRate: number; changeAmount: number }[] {
  const totals = new Map<
    string,
    { name: string; accountId: string; costBasis: number; changeAmount: number }
  >();

  for (const h of holdings) {
    if (h.last_price == null) continue;
    const costBasis = toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate);
    const changeAmount = toKrw(
      (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity),
      h.ticker,
      usdKrwRate
    );

    const existing = totals.get(h.ticker);
    if (existing) {
      existing.costBasis += costBasis;
      existing.changeAmount += changeAmount;
    } else {
      totals.set(h.ticker, { name: h.name, accountId: h.account_id, costBasis, changeAmount });
    }
  }

  return Array.from(totals.entries()).map(([ticker, { name, accountId, costBasis, changeAmount }]) => ({
    name,
    ticker,
    accountId,
    changeAmount,
    changeRate: costBasis > 0 ? (changeAmount / costBasis) * 100 : 0,
  }));
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
        await upsertExchangeRate(supabase);
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .order("created_at", { ascending: true });

  const { data: trades } = await supabase
    .from("trades")
    .select("traded_at, realized_pnl, ticker")
    .not("realized_pnl", "is", null);

  const usdKrwRate = await getStoredUsdKrwRate(supabase);

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + toKrw(Number(h.quantity) * price, h.ticker, usdKrwRate);
  }, 0);

  const unrealizedPnl = (holdings ?? []).reduce((sum, h) => {
    if (h.last_price == null) return sum;
    const diff = (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity);
    return sum + toKrw(diff, h.ticker, usdKrwRate);
  }, 0);

  const realizedPnl = (trades ?? []).reduce(
    (sum, t) => sum + toKrw(Number(t.realized_pnl ?? 0), t.ticker, usdKrwRate),
    0
  );

  const totalCostBasis = (holdings ?? []).reduce(
    (sum, h) => sum + toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate),
    0
  );

  const dailyRealized = groupRealizedByDay(trades ?? [], 30, usdKrwRate);
  const monthlyRealized = groupRealizedByMonth(trades ?? [], 12, usdKrwRate);

  const { data: snapshots } = await supabase
    .from("portfolio_snapshots")
    .select("date, total_value, total_cost")
    .order("date", { ascending: true });

  const byTicker = groupByTicker(holdings ?? [], usdKrwRate);
  const byAccountTicker = groupByAccountTicker(holdings ?? [], usdKrwRate);
  const movers: HoldingMover[] = computeHoldingsMovers(holdings ?? [], usdKrwRate);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-7 pb-[60px]">
      <div className="mb-1 flex flex-wrap items-end gap-5">
        <div>
          <div className="mb-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            총 평가금액
          </div>
          <div
            className="font-mono text-[40px] font-bold tracking-tight"
            style={{ color: "var(--text-headline)" }}
          >
            {Math.round(totalValue).toLocaleString()}원
          </div>
        </div>
      </div>

      <HoldingsMoversCard movers={movers} accounts={accounts ?? []} />

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
        trendTab={<TrendTab snapshots={snapshots ?? []} />}
        allocationTab={
          <AllocationTab
            byTicker={byTicker}
            accounts={accounts ?? []}
            byAccountTicker={byAccountTicker}
          />
        }
      />
    </div>
  );
}
