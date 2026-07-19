import { createAdminClient } from "@/lib/supabase/admin";
import { setUserSector, clearUserSector } from "@/lib/actions/sectors";
import { SectorDonutChart, type SectorSlice } from "@/components/SectorDonutChart";
import { AccountAnalysisTabs } from "@/components/AccountAnalysisTabs";
import { computeAccountStats } from "@/lib/portfolio/accountStats";
import { toKrw } from "@/lib/portfolio/currency";
import { getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";

export const dynamic = "force-dynamic";

const UNCLASSIFIED = "미분류";

interface HoldingRow {
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  last_price: number | null;
  account_id: string;
}

function groupBySector(
  holdings: HoldingRow[],
  sectorByTicker: Map<string, string>,
  usdKrwRate: number
): SectorSlice[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    const sector = sectorByTicker.get(h.ticker) ?? UNCLASSIFIED;
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = toKrw(Number(h.quantity) * price, h.ticker, usdKrwRate);
    totals.set(sector, (totals.get(sector) ?? 0) + value);
  }
  return Array.from(totals.entries())
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
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
      .select("ticker, name, quantity, avg_cost, last_price, account_id"),
    supabase.from("accounts").select("id, name").order("created_at", { ascending: true }),
    supabase.from("sector_classifications").select("ticker, ai_sector, user_sector"),
  ]);

  if (holdingsError || accountsError || sectorsError) {
    return (
      <div className="p-8" style={{ color: "var(--color-up)" }}>
        데이터를 불러오지 못했습니다:{" "}
        {(holdingsError ?? accountsError ?? sectorsError)?.message}
      </div>
    );
  }

  const sectorByTicker = new Map(
    (sectors ?? []).map((s) => [s.ticker, s.user_sector ?? s.ai_sector ?? UNCLASSIFIED])
  );
  const usdKrwRate = await getStoredUsdKrwRate(supabase);
  const allHoldings: HoldingRow[] = holdings ?? [];

  const accountOptions = [{ id: "all", name: "전체 계좌" }, ...(accounts ?? [])];

  const tabs = accountOptions.map((opt) => {
    const scopedHoldings =
      opt.id === "all" ? allHoldings : allHoldings.filter((h) => h.account_id === opt.id);
    // 총 수익률 카드는 실현손익 데이터를 계좌별로 분리 집계하는 별도 작업이 필요해
    // 이번 리디자인에서는 평가손익률(todayPnlPct)과 동일한 값을 임시로 표시한다.
    const stats = computeAccountStats(allHoldings, usdKrwRate, opt.id === "all" ? undefined : opt.id);
    const sectorSlices = groupBySector(scopedHoldings, sectorByTicker, usdKrwRate);
    const sectorTotal = sectorSlices.reduce((sum, s) => sum + s.value, 0) || 1;

    let cumulativePct = 0;
    const holdingsTable = [...scopedHoldings]
      .map((h) => {
        const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
        const evalAmount = toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
        const costBasis = toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate);
        const rate = costBasis > 0 ? ((evalAmount - costBasis) / costBasis) * 100 : 0;
        return {
          ticker: h.ticker,
          name: h.name,
          sector: sectorByTicker.get(h.ticker) ?? UNCLASSIFIED,
          rate,
          evalAmount,
          weightPct: (evalAmount / sectorTotal) * 100,
        };
      })
      .sort((a, b) => b.evalAmount - a.evalAmount)
      .map((h) => {
        cumulativePct += h.weightPct;
        return { ...h, cumulativePct };
      });

    const content = (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3.5">
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              총 평가금액
            </div>
            <div className="font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
              {Math.round(stats.totalValue).toLocaleString()}원
            </div>
          </div>
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              오늘 수익률
            </div>
            <div
              className="font-mono text-2xl font-bold"
              style={{ color: stats.todayPnlPct >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedPct(stats.todayPnlPct)}
            </div>
          </div>
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              총 수익률
            </div>
            <div
              className="font-mono text-2xl font-bold"
              style={{ color: stats.todayPnlPct >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedPct(stats.todayPnlPct)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-3.5 text-sm font-bold" style={{ color: "var(--text-body)" }}>
              섹터별 보유 비중
            </div>
            {sectorSlices.map((sec, i) => (
              <div key={sec.sector} className="mb-2.5">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span style={{ color: "var(--text-body-secondary)" }}>{sec.sector}</span>
                  <span className="font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {((sec.value / sectorTotal) * 100).toFixed(1)}% ·{" "}
                    {Math.round(sec.value).toLocaleString()}원
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full"
                  style={{ background: "var(--border-row)" }}
                >
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${((sec.value / sectorTotal) * 100).toFixed(1)}%`,
                      background: ["#3f8cff", "#f5495c", "#f0b90b", "#24d3b5", "#a78bfa", "#34d399", "#fb7185", "#60a5fa"][
                        i % 8
                      ],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <SectorDonutChart slices={sectorSlices} title="섹터 분포" />
        </div>

        <div
          className="overflow-hidden rounded-xl border"
          style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
        >
          <div className="px-4.5 pb-2.5 pt-4 text-sm font-bold" style={{ color: "var(--text-body)" }}>
            보유 종목
          </div>
          <div
            className="flex items-center px-4.5 pb-2 text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            <div className="min-w-0 flex-1">종목</div>
            <div className="w-[100px] shrink-0">섹터</div>
            <div className="w-20 shrink-0 text-right">수익률</div>
            <div className="w-[130px] shrink-0 text-right">평가금액</div>
            <div className="w-[70px] shrink-0 text-right">비중</div>
            <div className="w-[70px] shrink-0 text-right">누적비중</div>
          </div>
          <div className="max-h-[360px] overflow-auto">
            {holdingsTable.map((h) => (
              <div
                key={h.ticker}
                className="flex items-center border-t px-4.5 py-2.5 text-sm"
                style={{ borderColor: "var(--border-row)" }}
              >
                <div className="min-w-0 flex-1 truncate" style={{ color: "var(--text-body)" }}>
                  {h.name}
                </div>
                <div className="w-[100px] shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                  {h.sector}
                </div>
                <div
                  className="w-20 shrink-0 text-right font-mono text-sm font-semibold"
                  style={{ color: h.rate >= 0 ? "var(--color-up)" : "var(--color-down)" }}
                >
                  {formatSignedPct(h.rate)}
                </div>
                <div
                  className="w-[130px] shrink-0 text-right font-mono"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {Math.round(h.evalAmount).toLocaleString()}원
                </div>
                <div className="w-[70px] shrink-0 text-right font-mono" style={{ color: "var(--text-faint)" }}>
                  {h.weightPct.toFixed(1)}%
                </div>
                <div className="w-[70px] shrink-0 text-right font-mono" style={{ color: "var(--text-faint)" }}>
                  {h.cumulativePct.toFixed(1)}%
                </div>
              </div>
            ))}
            {holdingsTable.length === 0 && (
              <div className="p-4 text-sm" style={{ color: "var(--text-faint)" }}>
                보유종목이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    );

    return { id: opt.id, name: opt.name, content };
  });

  const uniqueTickers = Array.from(
    new Map(allHoldings.map((h) => [h.ticker, h.name])).entries()
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-7">
      <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
        계좌 분석
      </h1>

      <AccountAnalysisTabs tabs={tabs} />

      <div
        className="rounded-2xl border p-4"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        <h2 className="mb-3 font-semibold" style={{ color: "var(--text-body)" }}>
          종목별 섹터 지정
        </h2>
        <ul className="space-y-3">
          {uniqueTickers.map(([ticker, name]) => {
            const current = sectorByTicker.get(ticker) ?? UNCLASSIFIED;
            const record = (sectors ?? []).find((s) => s.ticker === ticker);
            return (
              <li
                key={ticker}
                className="flex flex-wrap items-center gap-2 border-b pb-3"
                style={{ borderColor: "var(--border-row)" }}
              >
                <span className="w-40 shrink-0 font-medium" style={{ color: "var(--text-body)" }}>
                  {name} ({ticker})
                </span>
                <span className="text-sm" style={{ color: "var(--text-faint)" }}>
                  현재: {current}
                </span>
                <form action={setUserSector} className="flex gap-2">
                  <input type="hidden" name="ticker" value={ticker} />
                  <input
                    name="user_sector"
                    placeholder="섹터 입력 (예: 반도체)"
                    className="rounded-md border px-2 py-1 text-sm"
                    style={{
                      background: "var(--border-row)",
                      borderColor: "var(--border-input)",
                      color: "var(--text-body)",
                    }}
                  />
                  <button
                    type="submit"
                    className="rounded-md px-3 py-1 text-sm font-bold"
                    style={{ background: "#12202f", color: "var(--accent-teal)" }}
                  >
                    지정
                  </button>
                </form>
                {record?.user_sector && (
                  <form action={clearUserSector.bind(null, ticker)}>
                    <button type="submit" className="text-sm" style={{ color: "var(--color-up)" }}>
                      수동 지정 해제
                    </button>
                  </form>
                )}
              </li>
            );
          })}
          {uniqueTickers.length === 0 && (
            <li className="text-sm" style={{ color: "var(--text-faint)" }}>
              보유종목이 없습니다.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
