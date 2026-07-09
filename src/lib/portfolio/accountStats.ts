import { toKrw } from "@/lib/portfolio/currency";

export interface AccountStatsHolding {
  account_id: string;
  ticker: string;
  quantity: number;
  avg_cost: number;
  last_price: number | null;
}

export interface AccountStats {
  totalValue: number;
  todayPnl: number;
  todayPnlPct: number;
  totalCostBasis: number;
}

/**
 * 계좌(또는 전체, accountId 생략 시)의 평가금액/평가손익/평가손익률을 계산한다.
 * "오늘"이라는 이름이 붙었지만 실제로는 전일 종가가 없어 평단가 대비 평가손익을 의미한다
 * (HoldingsMoversCard와 동일한 관례).
 */
export function computeAccountStats(
  holdings: AccountStatsHolding[],
  usdKrwRate: number,
  accountId?: string
): AccountStats {
  const scoped =
    accountId == null ? holdings : holdings.filter((h) => h.account_id === accountId);

  let totalValue = 0;
  let totalCostBasis = 0;
  let todayPnl = 0;

  for (const h of scoped) {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
    const costBasis = toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate);
    totalValue += value;
    totalCostBasis += costBasis;
    if (h.last_price != null) {
      todayPnl += toKrw(
        (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity),
        h.ticker,
        usdKrwRate
      );
    }
  }

  const todayPnlPct = totalCostBasis > 0 ? (todayPnl / totalCostBasis) * 100 : 0;

  return { totalValue, todayPnl, todayPnlPct, totalCostBasis };
}
