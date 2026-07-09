import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTossAccessToken } from "@/lib/toss/auth";

const PRICES_URL = "https://openapi.tossinvest.com/api/v1/prices";
const CHUNK_SIZE = 200;
const FETCH_TIMEOUT_MS = 10_000;

export interface SyncResult {
  status: "success" | "partial" | "failed";
  syncedCount: number;
  failedTickers: string[];
  errorMessage: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

interface PriceResult {
  symbol: string;
  lastPrice: string;
}

async function fetchPricesChunk(
  tickers: string[],
  accessToken: string
): Promise<PriceResult[]> {
  const url = `${PRICES_URL}?symbols=${encodeURIComponent(tickers.join(","))}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
    const retryRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!retryRes.ok) {
      throw new Error(`가격 조회 재시도 실패 (${retryRes.status})`);
    }
    const retryJson = (await retryRes.json()) as { result: PriceResult[] };
    return retryJson.result;
  }

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
      throw new Error(`가격 조회 실패 (토큰 재발급 후에도 ${retryRes.status})`);
    }
    const retryJson = (await retryRes.json()) as { result: PriceResult[] };
    return retryJson.result;
  }

  if (!res.ok) {
    throw new Error(`가격 조회 실패 (${res.status})`);
  }

  const json = (await res.json()) as { result: PriceResult[] };
  return json.result;
}

export async function syncHoldingPrices(): Promise<SyncResult> {
  const supabase = createAdminClient();

  const { data: holdings, error: holdingsError } = await supabase
    .from("holdings")
    .select("ticker");
  if (holdingsError) throw holdingsError;

  const tickers = Array.from(new Set((holdings ?? []).map((h) => h.ticker)));
  if (tickers.length === 0) {
    return { status: "success", syncedCount: 0, failedTickers: [], errorMessage: null };
  }

  const accessToken = await getTossAccessToken();
  const chunks = chunk(tickers, CHUNK_SIZE);

  let syncedCount = 0;
  const failedTickers: string[] = [];
  const errors: string[] = [];

  for (const tickerChunk of chunks) {
    try {
      const prices = await fetchPricesChunk(tickerChunk, accessToken);
      const now = new Date().toISOString();

      for (const price of prices) {
        const { error: updateError } = await supabase
          .from("holdings")
          .update({ last_price: Number(price.lastPrice), price_updated_at: now })
          .eq("ticker", price.symbol);
        if (updateError) throw updateError;
        syncedCount += 1;
      }

      const returnedSymbols = new Set(prices.map((p) => p.symbol));
      for (const ticker of tickerChunk) {
        if (!returnedSymbols.has(ticker)) failedTickers.push(ticker);
      }
    } catch (err) {
      failedTickers.push(...tickerChunk);
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const status: SyncResult["status"] =
    failedTickers.length === 0 ? "success" : syncedCount > 0 ? "partial" : "failed";

  return {
    status,
    syncedCount,
    failedTickers,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
  };
}
