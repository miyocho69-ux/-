import { SupabaseClient } from "@supabase/supabase-js";

/**
 * account_id + ticker의 모든 trades를 시간순으로 재생해 quantity/avg_cost를 다시 계산하고
 * holdings 테이블에 반영한다. 매수/매도가 발생할 때마다 이 함수 하나만 거치도록 해서
 * 재계산 로직이 여러 곳에 흩어지지 않게 한다.
 * 매도 거래는 처리 시점에 확정 손익(realized_pnl)을 계산해 해당 trades 행에 저장한다.
 */
export async function recalcHolding(
  supabase: SupabaseClient,
  accountId: string,
  ticker: string
) {
  const { data: trades, error: fetchError } = await supabase
    .from("trades")
    .select("id, side, quantity, price, name, traded_at")
    .eq("account_id", accountId)
    .eq("ticker", ticker)
    .order("traded_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) throw fetchError;

  let quantity = 0;
  let avgCost = 0;
  let lastName = ticker;

  for (const trade of trades ?? []) {
    lastName = trade.name;
    const tradeQty = Number(trade.quantity);
    const tradePrice = Number(trade.price);

    if (trade.side === "buy") {
      const totalCost = avgCost * quantity + tradePrice * tradeQty;
      quantity += tradeQty;
      avgCost = quantity > 0 ? totalCost / quantity : 0;
    } else {
      const realizedPnl = (tradePrice - avgCost) * tradeQty;
      const { error: pnlError } = await supabase
        .from("trades")
        .update({ realized_pnl: realizedPnl })
        .eq("id", trade.id);
      if (pnlError) throw pnlError;

      quantity -= tradeQty;
      if (quantity <= 0) {
        quantity = 0;
        avgCost = 0;
      }
      // 매도는 평단가에 영향을 주지 않는다 (남은 수량의 평단가는 유지)
    }
  }

  if (quantity <= 0) {
    // 전량 매도된 경우 holdings 행을 지운다 (0주 보유를 표시할 필요 없음)
    const { error: deleteError } = await supabase
      .from("holdings")
      .delete()
      .eq("account_id", accountId)
      .eq("ticker", ticker);
    if (deleteError) throw deleteError;
    return { quantity: 0, avgCost: 0 };
  }

  const { error: upsertError } = await supabase.from("holdings").upsert(
    {
      account_id: accountId,
      ticker,
      name: lastName,
      quantity,
      avg_cost: avgCost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,ticker" }
  );
  if (upsertError) throw upsertError;

  return { quantity, avgCost };
}
