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

  if (res.status === 401) {
    // 토스는 client당 access token을 1개만 유지하며 재발급 시 이전 토큰을 즉시 무효화한다.
    // DB 캐시가 만료 전이라 판단해도 다른 곳에서 재발급되며 이미 무효화됐을 수 있으므로,
    // 강제로 새 토큰을 받아 한 번만 재시도한다.
    const freshToken = await getTossAccessToken(true);
    const retryRes = await fetch(url, {
      headers: { Authorization: `Bearer ${freshToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!retryRes.ok) {
      throw new Error(`환율 조회 실패 (토큰 재발급 후에도 ${retryRes.status})`);
    }
    const retryJson = (await retryRes.json()) as { result: { rate: string } };
    return Number(retryJson.result.rate);
  }

  if (!res.ok) {
    throw new Error(`환율 조회 실패 (${res.status})`);
  }

  const json = (await res.json()) as { result: { rate: string } };
  return Number(json.result.rate);
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

  // 오늘자 daily row는 그날의 첫 관측값으로 고정한다 (이후 재호출돼도 덮어쓰지 않음) --
  // 그래야 "전일 대비"가 하루 중 마지막 조회 시점이 아니라 날짜 단위로 일관되게 계산된다.
  const { data: existing } = await supabase
    .from("exchange_rate_daily")
    .select("date")
    .eq("date", kstToday())
    .maybeSingle();
  if (!existing) {
    await supabase.from("exchange_rate_daily").insert({ date: kstToday(), rate });
  }
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

/** 오늘 대비 전일 USD/KRW 등락률(%). 전일 데이터가 없으면 null. */
export async function getUsdKrwChangePct(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase
    .from("exchange_rate_daily")
    .select("date, rate")
    .order("date", { ascending: false })
    .limit(2);
  if (error) throw error;
  if (!data || data.length < 2) return null;

  const [latest, previous] = data;
  const prevRate = Number(previous.rate);
  if (prevRate === 0) return null;
  return ((Number(latest.rate) - prevRate) / prevRate) * 100;
}
