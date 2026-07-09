import { createAdminClient } from "@/lib/supabase/admin";
import { computeAccountStats } from "@/lib/portfolio/accountStats";
import { getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";
import { AccountManageGrid } from "@/components/AccountManageGrid";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = createAdminClient();
  const [{ data: accounts, error: accountsError }, { data: holdings, error: holdingsError }] =
    await Promise.all([
      supabase.from("accounts").select("id, name").order("created_at", { ascending: true }),
      supabase
        .from("holdings")
        .select("account_id, ticker, quantity, avg_cost, last_price"),
    ]);

  if (accountsError || holdingsError) {
    return (
      <div className="p-8" style={{ color: "var(--color-up)" }}>
        데이터를 불러오지 못했습니다: {(accountsError ?? holdingsError)?.message}
      </div>
    );
  }

  const usdKrwRate = await getStoredUsdKrwRate(supabase);
  const allHoldings = holdings ?? [];

  const cards = (accounts ?? []).map((account) => {
    const stats = computeAccountStats(allHoldings, usdKrwRate, account.id);
    const holdingCount = allHoldings.filter((h) => h.account_id === account.id).length;
    return {
      id: account.id,
      name: account.name,
      totalValue: stats.totalValue,
      todayPnlPct: stats.todayPnlPct,
      holdingCount,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-7">
      <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
        계좌 관리
      </h1>
      <AccountManageGrid accounts={cards} />
    </div>
  );
}
