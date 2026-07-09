# 해외주식 원화 환산 + 비중 탭 계좌별 뷰 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** USD 표시 종목(메리츠증권 해외주식 등)을 토스증권 실시간 환율로 원화 환산해 모든 합산/비중/추이 계산에 정확히 반영하고, 비중 탭의 "계좌별" 뷰를 "계좌 선택 → 그 계좌의 종목별 비중"으로 개편한다.

**Architecture:** `src/lib/portfolio/currency.ts`에 티커 기반 통화 판단(`isKrwTicker`)과 환산(`toKrw`) 순수 함수를 두고, `src/lib/toss/exchangeRate.ts`에 토스 API로 USD/KRW 환율을 조회·저장하는 로직을 둔다. `page.tsx`의 기존 가격 동기화 성공 분기에서 환율도 함께 갱신하고, 모든 금액 계산(`totalValue`, `unrealizedPnl`, `totalCostBasis`, `groupByTicker`, `upsertTodaySnapshot`, `groupRealizedByDay`/`Month`)에 환산을 적용한다. `AllocationTab`의 "계좌별" 뷰는 계좌 선택 드롭다운 + 선택된 계좌의 종목별 슬라이스로 교체한다.

**Tech Stack:** Next.js 16 App Router + TypeScript, Supabase(Postgres, admin client), 토스증권 Open API(`GET /api/v1/exchange-rate`).

이 프로젝트에는 자동 테스트 러너가 없다. 각 태스크는 실제 DB/토스 API/브라우저 왕복으로 검증한다.

## Global Constraints

- 배포는 `git push origin main`으로만 한다.
- DB 접근은 `src/lib/supabase/admin.ts`의 `createAdminClient()`(secret key)만 사용한다.
- `src/app/page.tsx`는 반드시 `export const dynamic = "force-dynamic"`을 유지해야 한다(이 프로젝트에서 이 설정 누락으로 인한 실제 프로덕션 버그가 두 번 발생했다 — 매 태스크에서 `npm run build` 결과의 `/`가 `ƒ (Dynamic)`인지 확인).
- 토스 API 호출은 `getTossAccessToken()`(`src/lib/toss/auth.ts`)을 재사용한다. 새 토큰 발급 로직을 만들지 않는다.
- 통화 판단 규칙: 티커 첫 글자가 숫자(`0`-`9`)면 KRW, 그 외(알파벳 시작)는 USD. 정규식 `/^[0-9]/`.
- `exchange_rates`에 데이터가 없을 때의 fallback 환율은 `1500`(고정 상수, `FALLBACK_USD_KRW_RATE`).
- 환율 갱신은 시세 동기화(`syncHoldingPrices()`)가 `syncedCount > 0`으로 성공했을 때만 함께 실행한다(기존 `upsertTodaySnapshot` 호출과 같은 조건/타이밍).
- 손익 색상 관례: 양수는 `text-red-600`, 음수는 `text-blue-600` (기존 관례 유지, 이번 작업에서 변경 없음).

---

## Task 1: DB 스키마 (exchange_rates 테이블)

**Files:**
- Create: `supabase/migrations/0005_exchange_rates.sql`

**Interfaces:**
- Produces: `exchange_rates` 테이블(`base_currency text primary key, quote_currency text not null, rate numeric not null, updated_at timestamptz not null default now()`).

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- USD/KRW 등 환율 정보 (base_currency가 PK인 소규모 참조 테이블)
create table exchange_rates (
  base_currency text primary key,
  quote_currency text not null,
  rate numeric not null,
  updated_at timestamptz not null default now()
);

alter table exchange_rates enable row level security;
```

- [ ] **Step 2: Supabase 대시보드 SQL Editor에서 실행**

사용자에게 위 SQL을 Supabase 대시보드 SQL Editor에서 실행하도록 안내(이 프로젝트는 지금까지 이 방식으로 마이그레이션을 적용해왔음).

- [ ] **Step 3: 스키마 반영 확인 스크립트**

`C:\Users\miyoc\AppData\Local\Temp\claude\d-----\3ea27c6f-c5bc-4463-ac42-64f274e9700c\scratchpad\verify-exchange-rates-schema.mjs`:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);

const supabase = getSupabaseAdminClient();
const { error } = await supabase
  .from("exchange_rates")
  .select("base_currency, quote_currency, rate, updated_at")
  .limit(1);
if (error) throw error;
console.log("exchange_rates 테이블 OK");
```

Run: `node verify-exchange-rates-schema.mjs`
Expected: 에러 없이 "exchange_rates 테이블 OK" 출력.

- [ ] **Step 4: 임시 스크립트 삭제**

Run: `rm scratchpad/verify-exchange-rates-schema.mjs`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_exchange_rates.sql
git commit -m "Add exchange_rates table for USD/KRW conversion"
```

---

## Task 2: 통화 판단 유틸 + 환율 조회/저장 로직

**Files:**
- Create: `src/lib/portfolio/currency.ts`
- Create: `src/lib/toss/exchangeRate.ts`

**Interfaces:**
- Produces:
  - `isKrwTicker(ticker: string): boolean`
  - `toKrw(value: number, ticker: string, usdKrwRate: number): number`
  - `FALLBACK_USD_KRW_RATE = 1500` (exported constant)
  - `getUsdKrwRate(): Promise<number>` — 토스 API에서 실시간 환율 조회
  - `upsertExchangeRate(supabase: SupabaseClient): Promise<void>` — 조회 후 DB에 upsert
  - `getStoredUsdKrwRate(supabase: SupabaseClient): Promise<number>` — DB에서 저장된 환율 조회, 없으면 `FALLBACK_USD_KRW_RATE` 반환
- Consumes: `getTossAccessToken()` from `src/lib/toss/auth.ts`.

- [ ] **Step 1: `src/lib/portfolio/currency.ts` 작성**

```typescript
export const FALLBACK_USD_KRW_RATE = 1500;

export function isKrwTicker(ticker: string): boolean {
  return /^[0-9]/.test(ticker);
}

export function toKrw(value: number, ticker: string, usdKrwRate: number): number {
  return isKrwTicker(ticker) ? value : value * usdKrwRate;
}
```

- [ ] **Step 2: `src/lib/toss/exchangeRate.ts` 작성**

```typescript
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
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

- [ ] **Step 4: 실제 토스 API로 환율 조회 검증**

`scratchpad/verify-exchange-rate-fetch.mjs`:

```javascript
import { readFileSync } from "node:fs";

const envContent = readFileSync("d:/클로드/.env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (key) process.env[key] = value;
}

const tokenRes = await fetch("https://openapi.tossinvest.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.TOSS_CLIENT_ID,
    client_secret: process.env.TOSS_CLIENT_SECRET,
  }),
});
const { access_token } = await tokenRes.json();

const rateRes = await fetch(
  "https://openapi.tossinvest.com/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW",
  { headers: { Authorization: `Bearer ${access_token}` } }
);
console.log("status:", rateRes.status);
console.log(JSON.stringify(await rateRes.json(), null, 2));
```

Run: `node scratchpad/verify-exchange-rate-fetch.mjs`
Expected: `status: 200`, `result.rate`가 1000~2000 사이의 숫자 문자열(예: "1503.4").

- [ ] **Step 5: `isKrwTicker`/`toKrw` 로직을 실제 26개 holdings 티커로 검증**

`scratchpad/verify-currency-classification.mjs`:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);

function isKrwTicker(ticker) {
  return /^[0-9]/.test(ticker);
}

const supabase = getSupabaseAdminClient();
const { data } = await supabase.from("holdings").select("ticker, name");
for (const h of data) {
  console.log(h.ticker, "->", isKrwTicker(h.ticker) ? "KRW" : "USD", `(${h.name})`);
}
```

Run: `node scratchpad/verify-currency-classification.mjs`
Expected: 국내 ETF(122090, 487240, 379800, 379810, 495940, 0019K0, 0133E0, 447620)는 KRW, 해외 티커(SMH, NVT, NEE, GLW, VST, GOOGL, VRT, BE, ETN, SCCO, MOD, LITE)는 USD로 전부 정확히 분류.

- [ ] **Step 6: 임시 스크립트 삭제**

Run: `rm scratchpad/verify-exchange-rate-fetch.mjs scratchpad/verify-currency-classification.mjs`

- [ ] **Step 7: Commit**

```bash
git add src/lib/portfolio/currency.ts src/lib/toss/exchangeRate.ts
git commit -m "Add currency classification util and Toss exchange rate fetch/store logic"
```

---

## Task 3: `page.tsx`/`snapshot.ts`에 환율 갱신 연결 + 모든 금액 계산에 환산 적용

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/lib/portfolio/snapshot.ts`

**Interfaces:**
- Consumes: `upsertExchangeRate`, `getStoredUsdKrwRate` from `src/lib/toss/exchangeRate.ts`; `toKrw`, `isKrwTicker` from `src/lib/portfolio/currency.ts`.
- Produces: `page.tsx`의 `totalValue`/`unrealizedPnl`/`totalCostBasis`/`groupByTicker`/`groupRealizedByDay`/`groupRealizedByMonth`와 `snapshot.ts`의 `upsertTodaySnapshot`이 모두 원화 환산 적용된 값을 계산. `groupByAccount` 함수는 이 태스크에서 제거(Task 4에서 `groupByAccountTicker`로 대체).

- [ ] **Step 1: import 추가 및 환율 조회를 시세 동기화 성공 분기에 연결**

`src/app/page.tsx` 상단 import에 추가:

```typescript
import { upsertExchangeRate, getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";
```

기존 동기화 성공 분기(`if (result.syncedCount > 0) { await upsertTodaySnapshot(supabase); }`)를 다음으로 수정:

```typescript
      if (result.syncedCount > 0) {
        await upsertExchangeRate(supabase);
        await upsertTodaySnapshot(supabase);
      }
```

(환율을 먼저 갱신한 뒤 스냅샷을 찍어야, 스냅샷 계산 시 방금 갱신된 환율을 즉시 사용할 수 있다.)

- [ ] **Step 1-A: `snapshot.ts`에 환산 적용**

현재 `src/lib/portfolio/snapshot.ts`를 읽고, `totalValue`/`totalCost` 계산 부분에 환산을 추가한다. 전체 파일을 다음으로 교체한다(기존 KST 날짜 계산 로직은 그대로 유지하고 환산 부분만 추가):

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { toKrw } from "@/lib/portfolio/currency";
import { getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";

/**
 * 전체 계좌 합산 기준으로 오늘 날짜의 총평가금액/총매수원가를 계산해
 * portfolio_snapshots에 upsert한다. 하루에 여러 번 호출돼도 그날 값은 마지막 값으로 덮어써진다.
 * USD 종목은 저장된 환율로 원화 환산 후 합산한다.
 */
export async function upsertTodaySnapshot(supabase: SupabaseClient): Promise<void> {
  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("ticker, avg_cost, quantity, last_price");
  if (error) throw error;

  const usdKrwRate = await getStoredUsdKrwRate(supabase);

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
  }, 0);

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate),
    0
  );

  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstDate.toISOString().slice(0, 10);

  const { error: upsertError } = await supabase
    .from("portfolio_snapshots")
    .upsert({ date: today, total_value: totalValue, total_cost: totalCost }, { onConflict: "date" });
  if (upsertError) throw upsertError;
}
```

`page.tsx`에서 `upsertExchangeRate(supabase)`를 먼저 호출한 뒤 `upsertTodaySnapshot(supabase)`를 호출하므로(Step 1에서 이미 이 순서로 배치됨), `upsertTodaySnapshot` 내부의 `getStoredUsdKrwRate` 호출은 방금 DB에 upsert된 최신 환율을 즉시 읽게 된다.

- [ ] **Step 2: `groupRealizedByDay`/`groupRealizedByMonth`에 환산 로직 추가**

두 함수 모두 `ticker` 필드를 받아 환산하도록 시그니처를 변경한다. 현재 파일의 해당 함수를 다음으로 교체:

```typescript
function groupRealizedByDay(
  trades: { traded_at: string; realized_pnl: number | null; ticker: string }[],
  days: number,
  usdKrwRate: number
): { label: string; value: number }[] {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST-shifted "now"
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    buckets.set(label, 0);
  }
  for (const t of trades) {
    if (t.realized_pnl == null) continue;
    if (buckets.has(t.traded_at)) {
      const value = toKrw(Number(t.realized_pnl), t.ticker, usdKrwRate);
      buckets.set(t.traded_at, (buckets.get(t.traded_at) ?? 0) + value);
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

function groupRealizedByMonth(
  trades: { traded_at: string; realized_pnl: number | null; ticker: string }[],
  months: number,
  usdKrwRate: number
): { label: string; value: number }[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(label, 0);
  }
  for (const t of trades) {
    if (t.realized_pnl == null) continue;
    const label = t.traded_at.slice(0, 7);
    if (buckets.has(label)) {
      const value = toKrw(Number(t.realized_pnl), t.ticker, usdKrwRate);
      buckets.set(label, (buckets.get(label) ?? 0) + value);
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}
```

파일 상단에 `import { toKrw } from "@/lib/portfolio/currency";` 추가.

- [ ] **Step 3: `groupByTicker`에 환산 로직 추가**

```typescript
function groupByTicker(
  holdings: { ticker: string; name: string; quantity: number; avg_cost: number; last_price: number | null }[],
  usdKrwRate: number
): { sector: string; value: number }[] {
  const totals = new Map<string, { label: string; value: number }>();
  for (const h of holdings) {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
    const existing = totals.get(h.ticker);
    if (existing) {
      existing.value += value;
    } else {
      totals.set(h.ticker, { label: `${h.name} (${h.ticker})`, value });
    }
  }
  return Array.from(totals.values())
    .map(({ label, value }) => ({ sector: label, value }))
    .sort((a, b) => b.value - a.value);
}
```

- [ ] **Step 4: `groupByAccount` 함수 삭제**

현재 파일의 `groupByAccount` 함수 전체(Task 7에서 만들었던 계좌당-1슬라이스 버전)를 삭제한다. Task 4에서 `groupByAccountTicker`로 대체된다.

- [ ] **Step 5: `Home` 컴포넌트 본문의 계산 로직 수정**

`trades` 조회에 `ticker` 컬럼 추가:

```typescript
  const { data: trades } = await supabase
    .from("trades")
    .select("traded_at, realized_pnl, ticker")
    .not("realized_pnl", "is", null);
```

환율 조회를 holdings/trades 조회 이후, 계산 이전에 추가:

```typescript
  const usdKrwRate = await getStoredUsdKrwRate(supabase);
```

`totalValue`, `unrealizedPnl`, `totalCostBasis` 계산을 다음으로 교체:

```typescript
  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + toKrw(Number(h.quantity) * price, h.ticker, usdKrwRate);
  }, 0);

  const unrealizedPnl = (holdings ?? []).reduce((sum, h) => {
    if (h.last_price == null) return sum;
    const diff = (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity);
    return sum + toKrw(diff, h.ticker, usdKrwRate);
  }, 0);

  const totalCostBasis = (holdings ?? []).reduce(
    (sum, h) => sum + toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate),
    0
  );
```

`dailyRealized`/`monthlyRealized` 호출부를 다음으로 교체:

```typescript
  const dailyRealized = groupRealizedByDay(trades ?? [], 30, usdKrwRate);
  const monthlyRealized = groupRealizedByMonth(trades ?? [], 12, usdKrwRate);
```

`byTicker` 호출부를 다음으로 교체(Task 4에서 `byAccount` 관련 부분을 추가로 수정하므로, 여기서는 `byTicker`만 교체):

```typescript
  const byTicker = groupByTicker(holdings ?? [], usdKrwRate);
```

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `groupByAccount`를 여전히 참조하는 곳(AllocationTab에 넘기는 `byAccount` prop)에서 에러가 날 수 있음 — 이는 Task 4에서 해결되므로 이 태스크에서는 무시하고 넘어간다. 단, `groupByTicker`/`groupRealizedByDay`/`groupRealizedByMonth` 시그니처 변경으로 인한 에러가 없는지만 확인한다.

**주의**: 이 태스크 완료 시점에는 `byAccount`/`groupByAccount` 관련 컴파일 에러가 남아있는 게 정상이다(Task 4가 이어서 고침). 만약 이 태스크 하나만 커밋하기 전에 전체 타입체크를 통과시키고 싶다면, 임시로 `groupByTicker(holdings ?? [], usdKrwRate)`를 `byAccount` 자리에도 그대로 재사용해 컴파일이 되게 해두고(계좌별 뷰의 실제 동작은 어차피 Task 4에서 교체되므로), 그 사실을 커밋 메시지에 남긴다. 아래 Step 7에서 이 임시 처리를 반영한다.

- [ ] **Step 7: 임시 컴파일 통과 처리 (Task 4 전까지)**

`page.tsx`에서 `AllocationTab`에 넘기는 부분을 임시로 다음과 같이 수정해 타입 에러 없이 커밋 가능한 상태로 만든다:

```typescript
      allocationTab={<AllocationTab byTicker={byTicker} byAccount={byTicker} />}
```

(임시로 `byAccount` 자리에 `byTicker`를 그대로 전달 — 다음 태스크에서 즉시 교체됨. `groupByAccount` 함수는 이미 삭제했으므로 이 임시 조치가 없으면 컴파일이 깨진다.)

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

Run: `npm run build`
Expected: 빌드 성공, `/`가 `ƒ (Dynamic)`.

- [ ] **Step 8: 실제 데이터로 환산 결과 검증**

Run: `npm run dev` (백그라운드, `.env.local`에 `ENABLE_LOCAL_PRICE_SYNC=true` 이미 설정됨)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

`scratchpad/verify-currency-conversion.mjs`:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);
const supabase = getSupabaseAdminClient();

const { data: rate } = await supabase.from("exchange_rates").select("*").eq("base_currency", "USD").maybeSingle();
console.log("저장된 환율:", JSON.stringify(rate));

const { data: holdings } = await supabase.from("holdings").select("ticker, quantity, avg_cost, last_price");
let krwTotal = 0;
let usdTotal = 0;
for (const h of holdings) {
  const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
  const value = price * Number(h.quantity);
  if (/^[0-9]/.test(h.ticker)) krwTotal += value;
  else usdTotal += value;
}
console.log("KRW 종목 합계:", krwTotal);
console.log("USD 종목 합계(달러 기준):", usdTotal);
console.log("기대 총 평가금액(원화):", krwTotal + usdTotal * Number(rate.rate));
```

Run: `node scratchpad/verify-currency-conversion.mjs`
Expected: "저장된 환율"이 1000~2000 사이 값으로 채워짐. "기대 총 평가금액"을 계산한 뒤, 브라우저에서 `http://localhost:3000`의 "총 평가금액" 카드 값과 대조해 일치 확인.

- [ ] **Step 9: 임시 스크립트 삭제, dev 서버 종료**

- [ ] **Step 10: Commit**

```bash
git add src/app/page.tsx src/lib/portfolio/snapshot.ts
git commit -m "Apply USD-to-KRW conversion to all portfolio calculations"
```

---

## Task 4: 비중 탭 "계좌별" 뷰를 계좌 선택 드릴다운으로 개편

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/AllocationTab.tsx`

**Interfaces:**
- Consumes: `groupByTicker`(같은 로직 재사용, account-scoped holdings에 적용), `toKrw` from `src/lib/portfolio/currency.ts`.
- Produces: `AllocationTabProps`가 `byTicker: SectorSlice[]`, `accounts: {id: string, name: string}[]`, `byAccountTicker: Record<string, SectorSlice[]>`로 변경됨(이 태스크가 최종 인터페이스 — 이후 태스크 없음).

- [ ] **Step 1: `page.tsx`에 `groupByAccountTicker` 헬퍼 추가**

`groupByTicker` 함수 바로 아래에 추가:

```typescript
function groupByAccountTicker(
  holdings: {
    account_id: string;
    ticker: string;
    name: string;
    quantity: number;
    avg_cost: number;
    last_price: number | null;
  }[],
  usdKrwRate: number
): Record<string, { sector: string; value: number }[]> {
  const byAccount = new Map<string, typeof holdings>();
  for (const h of holdings) {
    const list = byAccount.get(h.account_id) ?? [];
    list.push(h);
    byAccount.set(h.account_id, list);
  }

  const result: Record<string, { sector: string; value: number }[]> = {};
  for (const [accountId, accountHoldings] of byAccount.entries()) {
    result[accountId] = groupByTicker(accountHoldings, usdKrwRate);
  }
  return result;
}
```

- [ ] **Step 2: `page.tsx`에서 계좌 목록 조회 및 `byAccountTicker` 계산 추가**

기존 holdings 조회 이후에 계좌 목록 조회를 추가:

```typescript
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .order("created_at", { ascending: true });
```

Task 3 Step 7에서 만든 임시 처리(`byAccount={byTicker}`)를 제거하고, `byTicker` 계산 다음에 아래를 추가:

```typescript
  const byAccountTicker = groupByAccountTicker(holdings ?? [], usdKrwRate);
```

`AllocationTab` 호출부를 다음으로 교체:

```typescript
      allocationTab={
        <AllocationTab
          byTicker={byTicker}
          accounts={accounts ?? []}
          byAccountTicker={byAccountTicker}
        />
      }
```

- [ ] **Step 3: `AllocationTab.tsx` 전체 교체**

```typescript
"use client";

import { useState } from "react";
import { SectorDonutChart, type SectorSlice } from "@/components/SectorDonutChart";

export interface AllocationTabProps {
  byTicker: SectorSlice[];
  accounts: { id: string; name: string }[];
  byAccountTicker: Record<string, SectorSlice[]>;
}

export function AllocationTab({ byTicker, accounts, byAccountTicker }: AllocationTabProps) {
  const [view, setView] = useState<"ticker" | "account">("ticker");
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? "");

  const selectedAccountName = accounts.find((a) => a.id === selectedAccountId)?.name ?? "";
  const accountSlices = byAccountTicker[selectedAccountId] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md border p-0.5 text-xs">
        <button
          onClick={() => setView("ticker")}
          className={`flex-1 rounded px-3 py-1.5 ${view === "ticker" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
        >
          종목별
        </button>
        <button
          onClick={() => setView("account")}
          className={`flex-1 rounded px-3 py-1.5 ${view === "account" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
        >
          계좌별
        </button>
      </div>

      {view === "account" && accounts.length > 0 && (
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      )}

      {view === "ticker" ? (
        <SectorDonutChart slices={byTicker} title="종목별 비중" />
      ) : accounts.length === 0 ? (
        <p className="text-sm text-gray-400">등록된 계좌가 없습니다.</p>
      ) : (
        <SectorDonutChart slices={accountSlices} title={`${selectedAccountName} 종목별 비중`} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

- [ ] **Step 5: `npm run build`로 dynamic 확인**

Run: `npm run build`
Expected: 빌드 성공, `/`가 `ƒ (Dynamic)`.

- [ ] **Step 6: 브라우저로 계좌 드릴다운 실제 클릭 검증**

Run: `npm run dev` (백그라운드)

이 프로젝트는 이전 세션들에서 Playwright 등 브라우저 자동화 도구가 설치되어 있지 않아, 헤드리스 Chrome + CDP(Chrome DevTools Protocol)를 직접 구동하는 방식으로 실제 클릭을 검증해왔다. 동일한 방식을 사용한다(먼저 사용 가능한 브라우저 자동화 도구가 있는지 확인하고, 없으면 CDP로 진행):

1. "비중" 탭 클릭
2. "계좌별" 버튼 클릭
3. 드롭다운에 6개 계좌 이름이 모두 나오는지 확인
4. 드롭다운에서 "메리츠증권 해외주식" 선택
5. 도넛차트에 12개 종목(SMH, NVT, NEE, GLW, VST, GOOGL, VRT, BE, ETN, SCCO, MOD, LITE)이 나오고, 비중 합이 100%에 가까운지 확인
6. 드롭다운에서 "삼성증권 IRP" 선택
7. 도넛차트가 5개 종목(TIME 미국나스닥100채권혼합50액티브, TIGER 차이나증권, KODEX 미국S&P500, KODEX 미국나스닥100, SOL 미국TOP5채권혼합50)으로 바뀌는지 확인
8. "종목별" 버튼으로 돌아가 여전히 전체 통합 뷰가 나오는지 확인

- [ ] **Step 7: 계좌별 슬라이스 값 수기 검증**

`scratchpad/verify-account-drilldown.mjs`:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);
const supabase = getSupabaseAdminClient();

const { data: rate } = await supabase.from("exchange_rates").select("rate").eq("base_currency", "USD").maybeSingle();
const usdKrwRate = Number(rate.rate);

const { data: holdings } = await supabase
  .from("holdings")
  .select("ticker, name, quantity, avg_cost, last_price, accounts(name)")
  .eq("accounts.name", "메리츠증권 해외주식");

let total = 0;
for (const h of holdings) {
  const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
  total += price * Number(h.quantity) * usdKrwRate; // 전부 USD 종목이므로 환율 곱함
}
console.log("메리츠증권 해외주식 계좌 총 평가금액(원화 환산 기대값):", total);
```

Run: `node scratchpad/verify-account-drilldown.mjs`
Expected: 출력된 값이 브라우저에서 확인한 도넛차트 슬라이스 합계와 유사한 규모(정확한 % 대조는 브라우저에서 육안 확인).

- [ ] **Step 8: 임시 스크립트 삭제, dev 서버 종료**

- [ ] **Step 9: Commit**

```bash
git add src/app/page.tsx src/components/AllocationTab.tsx
git commit -m "Change allocation tab account view to per-account ticker drill-down"
```

---

## Task 5: 전체 빌드 검증 + 배포

**Files:**
- 없음 (검증 전용 태스크)

**Interfaces:**
- 없음.

- [ ] **Step 1: 전체 타입체크/빌드**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

Run: `npm run build`
Expected: 빌드 성공, `/`가 `ƒ (Dynamic)`.

- [ ] **Step 2: 최종 종단 브라우저 확인**

Run: `npm run dev`, 홈 화면 전체(총 평가금액 → 수익 탭 → 추이 탭 → 비중 탭 종목별/계좌별)를 순서대로 확인. 특히 총 평가금액이 이전(환산 전, 잘못된 값)과 다르게 훨씬 낮아졌는지 확인(USD 종목을 단순 숫자로 더하던 이전 버그값보다 실제로는 더 정확한 값으로 바뀜 — 정확한 방향의 변화인지 확인).

dev 서버 종료.

- [ ] **Step 3: 배포**

사용자에게 `git push origin main` 실행 여부 확인 후 진행.

---

## Self-Review 결과

- **Spec coverage**: 설계 문서의 통화 판단 규칙, `exchange_rates` 스키마, 환율 조회/저장, 영향받는 6개 계산 로직(totalValue/totalCostBasis/unrealizedPnl/groupByTicker/upsertTodaySnapshot/groupRealizedByDay·Month), fallback, 계좌별 드릴다운 개편이 모두 Task 1~4에 매핑됨. `upsertTodaySnapshot`(`src/lib/portfolio/snapshot.ts`)의 환산 적용은 Task 3 Step 1-A로 포함됨.
- **Placeholder scan**: "TBD" 없음. Task 3 Step 7의 임시 처리(`byAccount={byTicker}`)는 의도된 중간 상태이며 Task 4에서 명시적으로 교체됨 — 계획 결함 아님.
- **Type consistency**: `AllocationTabProps`가 Task 4에서 최종 확정되고 `page.tsx`가 그대로 소비. `groupByTicker`/`groupRealizedByDay`/`groupRealizedByMonth`의 시그니처 변경이 Task 3에서 한 번에 이뤄지고 이후 태스크가 그 시그니처를 그대로 사용. `upsertTodaySnapshot`의 시그니처(`(supabase: SupabaseClient) => Promise<void>`)는 변경되지 않아 `page.tsx`의 호출부 수정이 불필요함.
