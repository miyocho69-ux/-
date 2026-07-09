import { SupabaseClient } from "@supabase/supabase-js";

/**
 * 전체 계좌 합산 기준으로 오늘 날짜의 총평가금액/총매수원가를 계산해
 * portfolio_snapshots에 upsert한다. 하루에 여러 번 호출돼도 그날 값은 마지막 값으로 덮어써진다.
 */
export async function upsertTodaySnapshot(supabase: SupabaseClient): Promise<void> {
  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("avg_cost, quantity, last_price");
  if (error) throw error;

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + price * Number(h.quantity);
  }, 0);

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.avg_cost) * Number(h.quantity),
    0
  );

  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstDate.toISOString().slice(0, 10);

  const { error: upsertError } = await supabase
    .from("portfolio_snapshots")
    .upsert({ date: today, total_value: totalValue, total_cost: totalCost }, { onConflict: "date" });
  if (upsertError) throw upsertError;
}
