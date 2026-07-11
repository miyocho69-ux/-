import { getTossAccessToken } from "./tossAuth.mjs";

const CANDLES_URL = "https://openapi.tossinvest.com/api/v1/candles";
const INDICATOR_URL = "https://openapi.tossinvest.com/api/v1/market-indicators";
const MAX_COUNT = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithAuth(url, retries = 5) {
  const token = await getTossAccessToken();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get("Retry-After") ?? "2");
      await sleep(Math.max(retryAfterSec, 2) * 1000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`캔들 조회 실패 (${res.status}) ${url}: ${text}`);
    }
    return res.json();
  }
  throw new Error(`캔들 조회 실패: rate limit 재시도 초과 ${url}`);
}

/**
 * Pages backward via `before` until candles older than `sinceDate` are reached.
 * Returns ascending-by-date array of { date: 'YYYY-MM-DD', close: number, currency }.
 */
async function fetchDailyCandles(url, sinceDate) {
  const candles = [];
  let before = undefined;
  for (let page = 0; page < 30; page++) {
    const qs = new URLSearchParams({ interval: "1d", count: String(MAX_COUNT) });
    if (before) qs.set("before", before);
    if (page > 0) await sleep(400);
    const json = await fetchWithAuth(`${url}${url.includes("?") ? "&" : "?"}${qs.toString()}`);
    const batch = json.result?.candles ?? [];
    if (batch.length === 0) break;

    for (const c of batch) {
      candles.push({
        date: c.timestamp.slice(0, 10),
        close: Number(c.closePrice),
        currency: c.currency ?? null,
      });
    }

    const oldest = batch[batch.length - 1];
    if (new Date(oldest.timestamp) <= sinceDate) break;

    before = json.result?.nextBefore;
    if (!before) break;
  }

  candles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // de-dupe by date (pagination boundaries can overlap by one candle)
  const seen = new Set();
  const deduped = [];
  for (const c of candles) {
    if (seen.has(c.date)) continue;
    seen.add(c.date);
    deduped.push(c);
  }
  return deduped.filter((c) => new Date(c.date) >= sinceDate);
}

export async function fetchTickerCandles(ticker, sinceDate) {
  return fetchDailyCandles(`${CANDLES_URL}?symbol=${encodeURIComponent(ticker)}`, sinceDate);
}

export async function fetchIndicatorCandles(symbol, sinceDate) {
  return fetchDailyCandles(`${INDICATOR_URL}/${encodeURIComponent(symbol)}/candles`, sinceDate);
}
