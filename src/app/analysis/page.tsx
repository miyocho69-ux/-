import { createAdminClient } from "@/lib/supabase/admin";
import { setUserSector, clearUserSector } from "@/lib/actions/sectors";
import { SectorDonutChart, type SectorSlice } from "@/components/SectorDonutChart";

const UNCLASSIFIED = "미분류";

function groupBySector(
  holdings: { ticker: string; quantity: number; avg_cost: number }[],
  sectorByTicker: Map<string, string>
): SectorSlice[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    const sector = sectorByTicker.get(h.ticker) ?? UNCLASSIFIED;
    const value = Number(h.quantity) * Number(h.avg_cost);
    totals.set(sector, (totals.get(sector) ?? 0) + value);
  }
  return Array.from(totals.entries())
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);
}

export default async function AnalysisPage() {
  const supabase = createAdminClient();

  const [
    { data: holdings, error: holdingsError },
    { data: accounts, error: accountsError },
    { data: sectors, error: sectorsError },
  ] = await Promise.all([
    supabase
      .from("holdings")
      .select("ticker, name, quantity, avg_cost, account_id, accounts(name)"),
    supabase.from("accounts").select("id, name").order("created_at", { ascending: true }),
    supabase.from("sector_classifications").select("ticker, ai_sector, user_sector"),
  ]);

  if (holdingsError || accountsError || sectorsError) {
    return (
      <div className="p-8 text-red-600">
        데이터를 불러오지 못했습니다:{" "}
        {(holdingsError ?? accountsError ?? sectorsError)?.message}
      </div>
    );
  }

  const sectorByTicker = new Map(
    (sectors ?? []).map((s) => [s.ticker, s.user_sector ?? s.ai_sector ?? UNCLASSIFIED])
  );

  const allHoldings = holdings ?? [];
  const totalSlices = groupBySector(allHoldings, sectorByTicker);

  const accountGroups = (accounts ?? []).map((account) => {
    const accountHoldings = allHoldings.filter((h) => h.account_id === account.id);
    return {
      account,
      slices: groupBySector(accountHoldings, sectorByTicker),
    };
  });

  // 종목별 섹터 지정 폼을 위해 보유중인 티커 목록(중복 제거)을 뽑는다
  const uniqueTickers = Array.from(
    new Map(allHoldings.map((h) => [h.ticker, h.name])).entries()
  );

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">계좌 분석</h1>

      <SectorDonutChart slices={totalSlices} title="전체 섹터 비중" />

      {accountGroups.map(({ account, slices }) => (
        <SectorDonutChart key={account.id} slices={slices} title={`${account.name} 섹터 비중`} />
      ))}

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">종목별 섹터 지정</h2>
        <ul className="space-y-3">
          {uniqueTickers.map(([ticker, name]) => {
            const current = sectorByTicker.get(ticker) ?? UNCLASSIFIED;
            const record = (sectors ?? []).find((s) => s.ticker === ticker);
            return (
              <li key={ticker} className="flex flex-wrap items-center gap-2 border-b pb-3">
                <span className="w-40 shrink-0 font-medium">
                  {name} ({ticker})
                </span>
                <span className="text-sm text-gray-500">현재: {current}</span>
                <form action={setUserSector} className="flex gap-2">
                  <input type="hidden" name="ticker" value={ticker} />
                  <input
                    name="user_sector"
                    placeholder="섹터 입력 (예: 반도체)"
                    className="rounded border px-2 py-1 text-sm"
                  />
                  <button type="submit" className="rounded bg-black px-3 py-1 text-sm text-white">
                    지정
                  </button>
                </form>
                {record?.user_sector && (
                  <form action={clearUserSector.bind(null, ticker)}>
                    <button type="submit" className="text-sm text-red-600 hover:underline">
                      수동 지정 해제
                    </button>
                  </form>
                )}
              </li>
            );
          })}
          {uniqueTickers.length === 0 && (
            <li className="text-gray-500">보유종목이 없습니다.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
