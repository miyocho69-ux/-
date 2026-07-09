import "server-only";
import { SupabaseClient } from "@supabase/supabase-js";
import { getTossAccessToken } from "@/lib/toss/auth";
import { FALLBACK_USD_KRW_RATE } from "@/lib/portfolio/currency";

const EXCHANGE_RATE_URL = "https://openapi.tossinvest.com/api/v1/exchange-rate";
const FETCH_TIMEOUT_MS = 10_000;

export async function getUsdKrwRate(): Promise<number> {
  const accessToken = await getTossAccessToken();
  const url = `${EXCHANGE_RATE_URL}?baseCurrency=USD&quoteCurrency=KRW`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`환율 조회 실패 (${res.status})`);
  }

  const json = (await res.json()) as { result: { rate: string } };
  return Number(json.result.rate);
}

export async function upsertExchangeRate(supabase: SupabaseClient): Promise<void> {
  const rate = await getUsdKrwRate();
  const { error } = await supabase.from("exchange_rates").upsert(
    {
      base_currency: "USD",
      quote_currency: "KRW",
      rate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "base_currency" }
  );
  if (error) throw error;
}

export async function getStoredUsdKrwRate(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("base_currency", "USD")
    .maybeSingle();
  if (error) throw error;
  return data?.rate != null ? Number(data.rate) : FALLBACK_USD_KRW_RATE;
}
