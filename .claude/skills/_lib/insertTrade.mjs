import { pathToFileURL } from "node:url";
import { getSupabaseAdminClient } from "./supabase.mjs";
import { recalcHolding } from "./recalcHolding.mjs";
import { upsertTodaySnapshot } from "./snapshot.mjs";

/**
 * 이미지(MTS 캡처)에서 파싱한 매매기록 한 건을 trades에 insert하고
 * holdings를 재계산한다. source는 항상 'image_upload'로 남겨 수동입력과 구분한다.
 * 등록 후 portfolio_snapshots도 함께 갱신해 대시보드 "투자 자산" 값이 낡지 않도록 한다.
 */
export async function insertTradeFromImage({
  accountId,
  ticker,
  name,
  side,
  quantity,
  price,
  tradedAt,
  memo,
}) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("trades").insert({
    account_id: accountId,
    ticker,
    name,
    side,
    quantity,
    price,
    traded_at: tradedAt,
    memo: memo ?? null,
    source: "image_upload",
  });
  if (error) throw error;

  const result = await recalcHolding(supabase, accountId, ticker);
  await upsertTodaySnapshot(supabase);
  return result;
}

// CLI 사용: node insertTrade.mjs '<accountId>' '<ticker>' '<name>' <buy|sell> <quantity> <price> <YYYY-MM-DD> ['memo']
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [accountId, ticker, name, side, quantity, price, tradedAt, memo] = process.argv.slice(2);
  const result = await insertTradeFromImage({
    accountId,
    ticker,
    name,
    side,
    quantity: Number(quantity),
    price: Number(price),
    tradedAt,
    memo,
  });
  console.log(
    `OK: ${name}(${ticker}) ${side} ${quantity}주 @ ${price} 등록 완료. 현재 보유: ${result.quantity}주, 평단가 ${result.avgCost}`
  );
}
