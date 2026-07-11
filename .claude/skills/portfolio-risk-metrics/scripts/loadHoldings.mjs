import { getSupabaseAdminClient } from "../../_lib/supabase.mjs";
import { getTossAccessToken } from "./tossAuth.mjs";

const EXCHANGE_RATE_URL = "https://openapi.tossinvest.com/api/v1/exchange-rate";
const PRICES_URL = "https://openapi.tossinvest.com/api/v1/prices";

async function getUsdKrwRate() {
  const token = await getTossAccessToken();
  const res = await fetch(`${EXCHANGE_RATE_URL}?baseCurrency=USD&quoteCurrency=KRW`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`환율 조회 실패 (${res.status})`);
  const json = await res.json();
  return Number(json.result.rate);
}

async function getLastPrices(tickers) {
  const token = await getTossAccessToken();
  const res = await fetch(`${PRICES_URL}?symbols=${encodeURIComponent(tickers.join(","))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`현재가 조회 실패 (${res.status})`);
  const json = await res.json();
  const map = new Map();
  for (const r of json.result) map.set(r.symbol, Number(r.lastPrice));
  return map;
}

/**
 * Returns [{ ticker, market, valueKrw, weight }], grouped/summed across accounts.
 */
export async function loadHoldingsWithWeights() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("holdings")
    .select("ticker, quantity, accounts(market)");
  if (error) throw error;

  const tickers = Array.from(new Set(data.map((h) => h.ticker)));
  const usdKrw = await getUsdKrwRate();
  const priceMap = await getLastPrices(tickers);

  const byTicker = new Map();
  for (const h of data) {
    const price = priceMap.get(h.ticker);
    if (price == null) continue;
    const market = h.accounts.market;
    const valueNative = price * Number(h.quantity);
    const valueKrw = market === "US" ? valueNative * usdKrw : valueNative;

    const prev = byTicker.get(h.ticker) ?? { ticker: h.ticker, market, valueKrw: 0 };
    prev.valueKrw += valueKrw;
    byTicker.set(h.ticker, prev);
  }

  const rows = Array.from(byTicker.values());
  const total = rows.reduce((s, r) => s + r.valueKrw, 0);
  for (const r of rows) r.weight = r.valueKrw / total;

  const missingPrice = tickers.filter((t) => !priceMap.has(t));
  return { holdings: rows, usdKrw, missingPrice };
}
