/**
 * src/lib/holdings/recalc.ts와 동일한 로직의 JS 버전.
 * 스킬 스크립트(Node ESM)에서 TS 파일을 직접 import하기 번거로워 복제해 둔다.
 * 두 파일 중 하나를 고치면 반드시 다른 쪽도 함께 고칠 것.
 */
export async function recalcHolding(supabase, accountId, ticker) {
  const { data: trades, error: fetchError } = await supabase
    .from("trades")
    .select("side, quantity, price, name, traded_at")
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
      quantity -= tradeQty;
      if (quantity <= 0) {
        quantity = 0;
        avgCost = 0;
      }
    }
  }

  if (quantity <= 0) {
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
