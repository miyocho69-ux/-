import "server-only";

// Yahoo Finance의 비공식(문서화되지 않은) 차트 API를 사용한다.
// 토스 공식 API(openapi.tossinvest.com)는 개별 종목만 지원하고 지수 심볼(KS11/KQ11/SPX/VIX 등)에는
// 빈 결과를 반환함을 실측으로 확인했다(2026-07-09). 이 엔드포인트는 언제든 응답 형식이
// 바뀌거나 차단될 수 있으므로, 실패 시 개별 항목만 null로 남기고 절대 throw하지 않는다.
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const FETCH_TIMEOUT_MS = 5_000;

const INDEX_DEFS: { key: IndexQuote["key"]; label: string; symbol: string }[] = [
  { key: "kospi", label: "코스피", symbol: "^KS11" },
  { key: "kosdaq", label: "코스닥", symbol: "^KQ11" },
  { key: "sp500", label: "S&P 500", symbol: "^GSPC" },
  { key: "vix", label: "VIX", symbol: "^VIX" },
];

export interface IndexQuote {
  key: "kospi" | "kosdaq" | "sp500" | "vix";
  label: string;
  price: number | null;
  changePct: number | null;
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
}

async function fetchOne(def: (typeof INDEX_DEFS)[number]): Promise<IndexQuote> {
  try {
    const url = `${CHART_URL}/${encodeURIComponent(def.symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { key: def.key, label: def.label, price: null, changePct: null };
    }
    const json = (await res.json()) as {
      chart: { result: { meta: YahooChartMeta }[] | null };
    };
    const meta = json.chart.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prevClose = meta?.chartPreviousClose;
    if (price == null || prevClose == null || prevClose === 0) {
      return { key: def.key, label: def.label, price: price ?? null, changePct: null };
    }
    const changePct = ((price - prevClose) / prevClose) * 100;
    return { key: def.key, label: def.label, price, changePct };
  } catch {
    return { key: def.key, label: def.label, price: null, changePct: null };
  }
}

export async function getMarketIndices(): Promise<IndexQuote[]> {
  const results = await Promise.allSettled(INDEX_DEFS.map(fetchOne));
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { key: INDEX_DEFS[i].key, label: INDEX_DEFS[i].label, price: null, changePct: null }
  );
}
