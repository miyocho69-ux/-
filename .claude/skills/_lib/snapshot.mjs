import { pathToFileURL } from "node:url";
import { getSupabaseAdminClient } from "./supabase.mjs";

/**
 * src/lib/portfolio/snapshot.ts의 upsertTodaySnapshot과 동일한 로직의 JS 버전.
 * Next.js 컨텍스트 밖(스킬 스크립트)에서 portfolio_snapshots를 갱신할 때 사용한다.
 * 두 파일 중 하나를 고치면 반드시 다른 쪽도 함께 고칠 것.
 */
function isKrwTicker(ticker) {
  return /^[0-9]/.test(ticker);
}

function toKrw(value, ticker, usdKrwRate) {
  return isKrwTicker(ticker) ? value : value * usdKrwRate;
}

export async function upsertTodaySnapshot(supabase) {
  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("ticker, avg_cost, quantity, last_price");
  if (error) throw error;

  const { data: rateRow, error: rateError } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("base_currency", "USD")
    .maybeSingle();
  if (rateError) throw rateError;
  const usdKrwRate = rateRow?.rate != null ? Number(rateRow.rate) : 1500;

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
  }, 0);

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate),
    0
  );

  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstDate.toISOString().slice(0, 10);

  const { error: upsertError } = await supabase
    .from("portfolio_snapshots")
    .upsert({ date: today, total_value: totalValue, total_cost: totalCost }, { onConflict: "date" });
  if (upsertError) throw upsertError;

  return { date: today, totalValue, totalCost };
}

// CLI 사용(수동 갱신): node .claude/skills/_lib/snapshot.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const supabase = getSupabaseAdminClient();
  const result = await upsertTodaySnapshot(supabase);
  console.log(
    `OK: ${result.date} 스냅샷 갱신 완료. 총평가금액 ${Math.round(result.totalValue).toLocaleString()}원, 원금 ${Math.round(result.totalCost).toLocaleString()}원`
  );
}
