import { pathToFileURL } from "node:url";
import { getSupabaseAdminClient } from "./supabase.mjs";

/**
 * holdings/exchange_rates/portfolio_snapshots를 조회해 노션 갱신에 필요한
 * 포트폴리오 요약(총평가금액, 계좌별/종목별 비중, 최초 기록 대비 성장률)을 계산한다.
 * src/app/page.tsx의 통화 환산 로직(toKrw)과 동일한 규칙(티커 첫 글자가 숫자면 KRW)을 그대로 따른다.
 */
function isKrwTicker(ticker) {
  return /^[0-9]/.test(ticker);
}

function toKrw(value, ticker, usdKrwRate) {
  return isKrwTicker(ticker) ? value : value * usdKrwRate;
}

export async function computePortfolioSummary() {
  const supabase = getSupabaseAdminClient();

  const { data: holdings, error: holdingsError } = await supabase
    .from("holdings")
    .select("ticker, name, quantity, avg_cost, last_price, accounts(name)");
  if (holdingsError) throw holdingsError;

  const { data: rateRow, error: rateError } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("base_currency", "USD")
    .maybeSingle();
  if (rateError) throw rateError;
  const usdKrwRate = rateRow?.rate != null ? Number(rateRow.rate) : 1500;

  let totalValue = 0;
  let totalCost = 0;
  const byAccount = new Map();
  const byTicker = new Map();

  for (const h of holdings ?? []) {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
    const cost = toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate);
    totalValue += value;
    totalCost += cost;

    const accountName = h.accounts?.name ?? "알 수 없는 계좌";
    byAccount.set(accountName, (byAccount.get(accountName) ?? 0) + value);

    const existing = byTicker.get(h.ticker);
    if (existing) {
      existing.value += value;
    } else {
      byTicker.set(h.ticker, { name: h.name, ticker: h.ticker, value });
    }
  }

  const accountBreakdown = Array.from(byAccount.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const tickerBreakdown = Array.from(byTicker.values()).sort((a, b) => b.value - a.value);

  const { data: snapshots, error: snapshotsError } = await supabase
    .from("portfolio_snapshots")
    .select("date, total_value")
    .order("date", { ascending: true });
  if (snapshotsError) throw snapshotsError;

  let growth = null;
  if (snapshots && snapshots.length > 0) {
    const earliest = snapshots[0];
    const daysSinceEarliest =
      (Date.now() - new Date(earliest.date).getTime()) / (1000 * 60 * 60 * 24);
    const earliestValue = Number(earliest.total_value);
    const rate = earliestValue > 0 ? ((totalValue - earliestValue) / earliestValue) * 100 : 0;

    let label;
    if (daysSinceEarliest < 1) {
      label = null; // 오늘 시작한 기록뿐이면 성장률을 의미 있게 표시할 수 없다
    } else if (daysSinceEarliest >= 30) {
      const monthsAgo = Math.round(daysSinceEarliest / 30);
      label = `약 ${monthsAgo}개월 전(${earliest.date}) 대비`;
    } else {
      label = `최초 기록(${earliest.date}) 대비`;
    }

    if (label) {
      growth = { label, rate, earliestValue, earliestDate: earliest.date };
    }
  }

  return {
    totalValue,
    totalCost,
    profitLoss: totalValue - totalCost,
    profitLossRate: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
    usdKrwRate,
    accountBreakdown,
    tickerBreakdown,
    growth,
  };
}

// CLI 사용: node computePortfolioSummary.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await computePortfolioSummary();
  console.log(JSON.stringify(summary, null, 2));
}
