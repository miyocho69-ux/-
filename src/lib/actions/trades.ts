"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalcHolding } from "@/lib/holdings/recalc";

export async function createTrade(formData: FormData) {
  const accountId = String(formData.get("account_id") ?? "");
  const ticker = String(formData.get("ticker") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const side = String(formData.get("side") ?? "");
  const quantity = Number(formData.get("quantity"));
  const price = Number(formData.get("price"));
  const tradedAt = String(formData.get("traded_at") ?? "");
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (
    !accountId ||
    !ticker ||
    !name ||
    (side !== "buy" && side !== "sell") ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !tradedAt
  ) {
    throw new Error("매매기록 입력값이 올바르지 않습니다.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("trades").insert({
    account_id: accountId,
    ticker,
    name,
    side,
    quantity,
    price,
    traded_at: tradedAt,
    memo,
    source: "manual",
  });
  if (error) throw error;

  await recalcHolding(supabase, accountId, ticker);

  revalidatePath("/trades");
  revalidatePath("/");
}

export async function deleteTrade(tradeId: string, accountId: string, ticker: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("trades").delete().eq("id", tradeId);
  if (error) throw error;

  await recalcHolding(supabase, accountId, ticker);

  revalidatePath("/trades");
  revalidatePath("/");
}
