import "server-only";
import { getTossAccessToken } from "@/lib/toss/auth";

// 코스피/코스닥 지수 심볼(KS11/KQ11 등)은 토스 공식 API에서 개별 종목 시세로 조회되지 않아
// 대신 지수를 추종하는 실제 매매 가능한 ETF로 대체한다: 미국 3대 지수(VOO/QQQ/DIA), 국내 2개
// (KODEX 200/코스닥150). 전일 대비 등락률은 캔들 API(interval=1d, count=2)의 최근 두 봉으로 계산.
const CANDLES_URL = "https://openapi.tossinvest.com/api/v1/candles";
const FETCH_TIMEOUT_MS = 10_000;

const INDEX_DEFS: { key: IndexQuote["key"]; label: string; symbol: string }[] = [
  { key: "voo", label: "VOO (S&P500)", symbol: "VOO" },
  { key: "qqq", label: "QQQ (나스닥100)", symbol: "QQQ" },
  { key: "dia", label: "DIA (다우)", symbol: "DIA" },
  { key: "kospi200", label: "KODEX 코스피200", symbol: "069500" },
  { key: "kosdaq150", label: "KODEX 코스닥150", symbol: "229200" },
];

export interface IndexQuote {
  key: "voo" | "qqq" | "dia" | "kospi200" | "kosdaq150";
  label: string;
  price: number | null;
  changePct: number | null;
}

interface TossCandle {
  timestamp: string;
  closePrice: string;
}

async function fetchOne(def: (typeof INDEX_DEFS)[number], accessToken: string): Promise<IndexQuote> {
  try {
    const url = `${CANDLES_URL}?symbol=${encodeURIComponent(def.symbol)}&interval=1d&count=2`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { key: def.key, label: def.label, price: null, changePct: null };
    }
    const json = (await res.json()) as { result: { candles: TossCandle[] } };
    const candles = json.result?.candles ?? [];
    if (candles.length === 0) {
      return { key: def.key, label: def.label, price: null, changePct: null };
    }

    const price = Number(candles[0].closePrice);
    if (candles.length < 2) {
      return { key: def.key, label: def.label, price, changePct: null };
    }
    const prevClose = Number(candles[1].closePrice);
    const changePct = prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;
    return { key: def.key, label: def.label, price, changePct };
  } catch {
    return { key: def.key, label: def.label, price: null, changePct: null };
  }
}

export async function getMarketIndices(): Promise<IndexQuote[]> {
  try {
    const accessToken = await getTossAccessToken();
    const results = await Promise.allSettled(INDEX_DEFS.map((def) => fetchOne(def, accessToken)));
    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { key: INDEX_DEFS[i].key, label: INDEX_DEFS[i].label, price: null, changePct: null }
    );
  } catch {
    return INDEX_DEFS.map((def) => ({ key: def.key, label: def.label, price: null, changePct: null }));
  }
}
