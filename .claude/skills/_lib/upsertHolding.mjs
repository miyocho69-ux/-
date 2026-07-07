import { pathToFileURL } from "node:url";
import { getSupabaseAdminClient } from "./supabase.mjs";

/**
 * 이미지에서 파싱한 보유현황 한 건을 holdings에 직접 upsert한다.
 * (trades 기반 recalc가 아니라 "현재 스냅샷"을 그대로 등록하는 경로 —
 * 최초 보유현황 등록은 매매 이력이 없으므로 trades를 거치지 않는다.)
 */
export async function upsertHolding({ accountId, ticker, name, quantity, avgCost }) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("holdings").upsert(
    {
      account_id: accountId,
      ticker,
      name,
      quantity,
      avg_cost: avgCost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,ticker" }
  );
  if (error) throw error;
}

// CLI 사용: node upsertHolding.mjs '<accountId>' '<ticker>' '<name>' <quantity> <avgCost>
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [accountId, ticker, name, quantity, avgCost] = process.argv.slice(2);
  await upsertHolding({
    accountId,
    ticker,
    name,
    quantity: Number(quantity),
    avgCost: Number(avgCost),
  });
  console.log(`OK: ${name}(${ticker}) ${quantity}주 @ ${avgCost} 등록 완료`);
}
