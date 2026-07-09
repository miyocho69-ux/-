# 포트폴리오 대시보드 개편(수익/추이/비중) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면(`src/app/page.tsx`)을 총자산 요약 + 수익/추이/비중 3탭 구조로 교체하고, 실현손익 자동 계산과 일별 자산 스냅샷 저장을 추가한다.

**Architecture:** `page.tsx`(Server Component)가 holdings/trades/portfolio_snapshots/accounts를 모두 조회하고 기존 시세 동기화 로직(성공 시 스냅샷 upsert 추가)을 실행한 뒤, 계산된 데이터를 클라이언트 컴포넌트 `PortfolioTabs`에 props로 넘긴다. `PortfolioTabs`는 탭 전환만 담당하고 각 탭 전용 컴포넌트(`ProfitTab`/`TrendTab`/`AllocationTab`)가 렌더링을 맡는다. 실현손익은 `recalcHolding`이 매도 거래를 재생할 때 계산해 `trades.realized_pnl`에 저장한다.

**Tech Stack:** Next.js 16 App Router + TypeScript, Supabase(Postgres, admin client), Tailwind CSS. 차트는 외부 라이브러리 없이 기존 `SectorDonutChart`와 동일한 순수 SVG 방식.

이 프로젝트에는 자동 테스트 러너가 없다(`CLAUDE.md`에 명시). 각 태스크는 실제 DB/브라우저 왕복 검증으로 확인한다. `.claude/skills/_lib/supabase.mjs`의 `getSupabaseAdminClient()`(ESM, `pathToFileURL` 필요 없이 프로젝트 내부에서는 상대 경로 import가 되지만 독립 스크립트에서는 Windows에서 `file://` URL 필요)를 검증 스크립트에 재사용한다.

## Global Constraints

- 배포는 `git push origin main`으로만 한다 (CLAUDE.md).
- DB 접근은 `src/lib/supabase/admin.ts`의 `createAdminClient()`(secret key)만 사용한다.
- 배당수익은 이번 범위에서 항상 0으로 고정 표시한다(입력 기능 없음).
- 유형별 비중, 세금 탭은 만들지 않는다.
- `/analysis` 페이지는 변경하지 않는다.
- `src/app/page.tsx`는 반드시 `export const dynamic = "force-dynamic"`을 유지해야 한다(이전 세션에서 이 설정 누락으로 정적 프리렌더링되어 동기화가 무력화되는 버그가 있었다 — 수정 시 실수로 제거하지 않도록 각 태스크에서 `npm run build` 결과의 `/` 라우트가 `ƒ (Dynamic)`인지 확인한다).
- 총 실현수익률의 분모는 "현재 보유종목의 avg_cost × quantity 합계"이며, 분모가 0이면 0%로 표시한다(0으로 나누지 않는다).
- 수익 차트(일별/월별 막대그래프)는 일별 최근 30일, 월별 최근 12개월로 범위를 제한한다.
- 손익 색상 관례: 양수(이익)는 `text-red-600`, 음수(손실)는 `text-blue-600` (기존 `src/app/page.tsx`와 동일).

---

## Task 1: DB 스키마 변경 (마이그레이션) + 백필 스크립트

**Files:**
- Create: `supabase/migrations/0004_portfolio_dashboard.sql`

**Interfaces:**
- Produces: `portfolio_snapshots` 테이블(`date date primary key, total_value numeric not null, total_cost numeric not null`), `trades.realized_pnl numeric` 컬럼.

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 일별 총자산 스냅샷 (추이 탭의 라인차트 소스, 계좌 구분 없이 전체 합산 1행/일)
create table portfolio_snapshots (
  date date primary key,
  total_value numeric not null,
  total_cost numeric not null
);

alter table portfolio_snapshots enable row level security;

-- 매도 거래의 확정 손익 (매수 행은 항상 null)
alter table trades add column realized_pnl numeric;
```

- [ ] **Step 2: Supabase 대시보드 SQL Editor에서 실행**

사용자에게 위 SQL 전체를 Supabase 대시보드 SQL Editor에서 실행하도록 안내(이 프로젝트는 지금까지 이 방식으로 마이그레이션을 적용해왔음 — DDL 실행 권한이 없는 도구로는 적용 불가).

- [ ] **Step 3: 스키마 반영 확인 스크립트 작성 및 실행**

`C:\Users\miyoc\AppData\Local\Temp\claude\d-----\3ea27c6f-c5bc-4463-ac42-64f274e9700c\scratchpad\verify-portfolio-schema.mjs`:

```javascript
import { getSupabaseAdminClient } from "d:/클로드/.claude/skills/_lib/supabase.mjs";

const supabase = getSupabaseAdminClient();

const { error: e1 } = await supabase.from("portfolio_snapshots").select("date, total_value, total_cost").limit(1);
if (e1) throw e1;
console.log("portfolio_snapshots 테이블 OK");

const { error: e2 } = await supabase.from("trades").select("realized_pnl").limit(1);
if (e2) throw e2;
console.log("trades.realized_pnl 컬럼 OK");
```

Windows에서 이 프로젝트의 다른 검증 스크립트들이 bare `d:/...` import가 `ERR_UNSUPPORTED_ESM_URL_SCHEME`로 실패했던 이력이 있으므로, 실제로는 `pathToFileURL`을 사용한다:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);

const supabase = getSupabaseAdminClient();

const { error: e1 } = await supabase.from("portfolio_snapshots").select("date, total_value, total_cost").limit(1);
if (e1) throw e1;
console.log("portfolio_snapshots 테이블 OK");

const { error: e2 } = await supabase.from("trades").select("realized_pnl").limit(1);
if (e2) throw e2;
console.log("trades.realized_pnl 컬럼 OK");
```

Run: `node verify-portfolio-schema.mjs`
Expected: 두 줄 모두 에러 없이 출력.

- [ ] **Step 4: 기존 거래 백필 — 현재 등록된 모든 (account_id, ticker) 조합에 대해 recalcHolding 재실행**

이 시점에는 아직 Task 2에서 `recalcHolding`에 `realized_pnl` 계산 로직을 추가하지 않았으므로, 이 백필은 **Task 2 완료 후에 실행**한다(아래 Task 2의 마지막 스텝으로 순서를 옮김). 이 스텝은 백필이 필요하다는 사실만 기록해두고 넘어간다 — 실제 실행은 Task 2 Step 5에서 수행.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_portfolio_dashboard.sql
git commit -m "Add portfolio_snapshots table and trades.realized_pnl column"
```

---

## Task 2: 실현손익 계산 (`recalcHolding` 확장) + 백필 실행

**Files:**
- Modify: `src/lib/holdings/recalc.ts`

**Interfaces:**
- Produces: `recalcHolding`은 기존과 동일한 시그니처(`(supabase, accountId, ticker) => Promise<{quantity, avgCost}>`)를 유지하되, 매도 거래를 재생하는 과정에서 각 매도 `trades` 행의 `realized_pnl`을 계산해 UPDATE한다. 반환값 타입은 변경하지 않는다(호출부인 `src/lib/actions/trades.ts`가 그대로 동작해야 함).

- [ ] **Step 1: 현재 파일 읽기 및 수정 지점 확인**

`src/lib/holdings/recalc.ts`의 현재 내용(전체):

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

export async function recalcHolding(
  supabase: SupabaseClient,
  accountId: string,
  ticker: string
) {
  const { data: trades, error: fetchError } = await supabase
    .from("trades")
    .select("side, quantity, price, name, traded_at")
    .eq("account_id", accountId)
    .eq("ticker", ticker)
    .order("traded_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) throw fetchError;

  let quantity = 0;
  let avgCost = 0;
  let lastName = ticker;

  for (const trade of trades ?? []) {
    lastName = trade.name;
    const tradeQty = Number(trade.quantity);
    const tradePrice = Number(trade.price);

    if (trade.side === "buy") {
      const totalCost = avgCost * quantity + tradePrice * tradeQty;
      quantity += tradeQty;
      avgCost = quantity > 0 ? totalCost / quantity : 0;
    } else {
      quantity -= tradeQty;
      if (quantity <= 0) {
        quantity = 0;
        avgCost = 0;
      }
    }
  }

  if (quantity <= 0) {
    const { error: deleteError } = await supabase
      .from("holdings")
      .delete()
      .eq("account_id", accountId)
      .eq("ticker", ticker);
    if (deleteError) throw deleteError;
    return { quantity: 0, avgCost: 0 };
  }

  const { error: upsertError } = await supabase.from("holdings").upsert(
    {
      account_id: accountId,
      ticker,
      name: lastName,
      quantity,
      avg_cost: avgCost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,ticker" }
  );
  if (upsertError) throw upsertError;

  return { quantity, avgCost };
}
```

매도 분기(`else` 블록)에서 `quantity -= tradeQty` 하기 **전의** `avgCost`가 "매도 직전 평단가"이므로, 그 값을 사용해 `realized_pnl`을 계산하고 저장해야 한다. `trade` 객체에는 현재 `id`가 select되지 않으므로 select 목록에 `id`를 추가해야 한다.

- [ ] **Step 2: 수정된 전체 파일 작성**

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * account_id + ticker의 모든 trades를 시간순으로 재생해 quantity/avg_cost를 다시 계산하고
 * holdings 테이블에 반영한다. 매수/매도가 발생할 때마다 이 함수 하나만 거치도록 해서
 * 재계산 로직이 여러 곳에 흩어지지 않게 한다.
 * 매도 거래는 처리 시점에 확정 손익(realized_pnl)을 계산해 해당 trades 행에 저장한다.
 */
export async function recalcHolding(
  supabase: SupabaseClient,
  accountId: string,
  ticker: string
) {
  const { data: trades, error: fetchError } = await supabase
    .from("trades")
    .select("id, side, quantity, price, name, traded_at")
    .eq("account_id", accountId)
    .eq("ticker", ticker)
    .order("traded_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) throw fetchError;

  let quantity = 0;
  let avgCost = 0;
  let lastName = ticker;

  for (const trade of trades ?? []) {
    lastName = trade.name;
    const tradeQty = Number(trade.quantity);
    const tradePrice = Number(trade.price);

    if (trade.side === "buy") {
      const totalCost = avgCost * quantity + tradePrice * tradeQty;
      quantity += tradeQty;
      avgCost = quantity > 0 ? totalCost / quantity : 0;
    } else {
      const realizedPnl = (tradePrice - avgCost) * tradeQty;
      const { error: pnlError } = await supabase
        .from("trades")
        .update({ realized_pnl: realizedPnl })
        .eq("id", trade.id);
      if (pnlError) throw pnlError;

      quantity -= tradeQty;
      if (quantity <= 0) {
        quantity = 0;
        avgCost = 0;
      }
      // 매도는 평단가에 영향을 주지 않는다 (남은 수량의 평단가는 유지)
    }
  }

  if (quantity <= 0) {
    // 전량 매도된 경우 holdings 행을 지운다 (0주 보유를 표시할 필요 없음)
    const { error: deleteError } = await supabase
      .from("holdings")
      .delete()
      .eq("account_id", accountId)
      .eq("ticker", ticker);
    if (deleteError) throw deleteError;
    return { quantity: 0, avgCost: 0 };
  }

  const { error: upsertError } = await supabase.from("holdings").upsert(
    {
      account_id: accountId,
      ticker,
      name: lastName,
      quantity,
      avg_cost: avgCost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,ticker" }
  );
  if (upsertError) throw upsertError;

  return { quantity, avgCost };
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

- [ ] **Step 4: 실제 매도 거래로 검증 — 테스트 거래 등록 후 삭제**

`scratchpad/verify-realized-pnl.mjs`:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);

const supabase = getSupabaseAdminClient();

// 실제 계좌/보유종목 확인 (NVDA, 12주, 평단가 12)
const { data: holdingsBefore } = await supabase
  .from("holdings")
  .select("account_id, ticker, quantity, avg_cost")
  .eq("ticker", "NVDA")
  .single();
console.log("매도 전 holdings:", holdingsBefore);

// 3주를 20원에 매도하는 테스트 거래 삽입 (avg_cost=12 기준 realized_pnl = (20-12)*3 = 24 기대)
const { data: sellTrade, error: insertError } = await supabase
  .from("trades")
  .insert({
    account_id: holdingsBefore.account_id,
    ticker: "NVDA",
    name: "NVDA",
    side: "sell",
    quantity: 3,
    price: 20,
    traded_at: "2026-07-09",
    source: "manual",
  })
  .select("id")
  .single();
if (insertError) throw insertError;

// recalcHolding 로직을 인라인으로 재현 (src/lib/holdings/recalc.ts를 직접 import하지 않고 동일 로직으로 검증)
// -- 대신 실제 recalcHolding을 호출하려면 Next.js 서버 컨텍스트가 필요하므로,
//    다음 단계(Step 5)에서 실제 앱 코드 경로(deleteTrade/createTrade 서버 액션)를 통해 간접 검증한다.
console.log("테스트 매도 거래 등록됨:", sellTrade.id, "-- 다음 단계에서 npm run dev로 실제 recalcHolding 트리거 필요");
```

이 스크립트만으로는 `recalcHolding`(server-only 아님, 하지만 Next.js 경로 별칭 `@/lib/...`을 쓰므로 독립 실행 불가)을 직접 검증할 수 없다. 대신:

- [ ] **Step 5: `npm run dev`로 실제 서버 액션 경로를 통해 검증**

Run: `npm run dev` (백그라운드)

브라우저 또는 curl로 `/trades` 페이지에 접속해 실제로 폼을 통해 위와 동일한 매도 거래(NVDA, 3주, 20원, 2026-07-09)를 등록한다. 등록 후:

```javascript
// scratchpad/verify-realized-pnl-result.mjs
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);
const supabase = getSupabaseAdminClient();

const { data: trade } = await supabase
  .from("trades")
  .select("id, side, quantity, price, realized_pnl")
  .eq("ticker", "NVDA")
  .eq("side", "sell")
  .single();
console.log("매도 거래 realized_pnl (24 기대):", trade);

const { data: holding } = await supabase
  .from("holdings")
  .select("quantity, avg_cost")
  .eq("ticker", "NVDA")
  .single();
console.log("매도 후 holdings (quantity=9, avg_cost=12 유지 기대):", holding);
```

Run: `node scratchpad/verify-realized-pnl-result.mjs`
Expected: `realized_pnl: 24`, `quantity: 9`, `avg_cost: 12`.

- [ ] **Step 6: 테스트 거래 삭제 (원상복구)**

`/trades` 페이지에서 방금 등록한 테스트 매도 거래를 삭제 버튼으로 제거. 삭제 후 holdings가 원래대로(quantity=12) 복원됐는지 확인:

```javascript
// scratchpad/verify-cleanup.mjs
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);
const supabase = getSupabaseAdminClient();

const { data: holding } = await supabase
  .from("holdings")
  .select("quantity, avg_cost")
  .eq("ticker", "NVDA")
  .single();
console.log("복원 후 holdings (quantity=12 기대):", holding);

const { data: trades } = await supabase.from("trades").select("id, side").eq("ticker", "NVDA");
console.log("NVDA 거래 목록 (매도 거래 없어야 함):", trades);
```

Run: `node scratchpad/verify-cleanup.mjs`
Expected: `quantity: 12`, 거래 목록에 `side: "sell"` 없음(매수 1건만 남음).

- [ ] **Step 7: 백필 실행 — 기존 매도 거래의 realized_pnl 채우기**

현재 DB에는 매도 거래가 없으므로(전체 2건 모두 매수), 실질적으로 백필할 대상이 없다. 다만 향후 재실행 가능하도록 스크립트는 작성해서 1회 실행 후 삭제한다:

`scratchpad/backfill-realized-pnl.mjs`:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);
const supabase = getSupabaseAdminClient();

const { data: pairs } = await supabase
  .from("trades")
  .select("account_id, ticker");

const uniquePairs = Array.from(
  new Map((pairs ?? []).map((p) => [`${p.account_id}:${p.ticker}`, p])).values()
);

console.log(`${uniquePairs.length}개의 (account_id, ticker) 조합 백필 대상`);

for (const { account_id, ticker } of uniquePairs) {
  // recalcHolding과 완전히 동일한 로직을 인라인 재현 (독립 스크립트라 @/lib import 불가)
  const { data: trades } = await supabase
    .from("trades")
    .select("id, side, quantity, price, name, traded_at")
    .eq("account_id", account_id)
    .eq("ticker", ticker)
    .order("traded_at", { ascending: true })
    .order("created_at", { ascending: true });

  let quantity = 0;
  let avgCost = 0;

  for (const trade of trades ?? []) {
    const tradeQty = Number(trade.quantity);
    const tradePrice = Number(trade.price);

    if (trade.side === "buy") {
      const totalCost = avgCost * quantity + tradePrice * tradeQty;
      quantity += tradeQty;
      avgCost = quantity > 0 ? totalCost / quantity : 0;
    } else {
      const realizedPnl = (tradePrice - avgCost) * tradeQty;
      await supabase.from("trades").update({ realized_pnl: realizedPnl }).eq("id", trade.id);
      console.log(`  백필: ${ticker} 매도 거래 ${trade.id} -> realized_pnl=${realizedPnl}`);
      quantity -= tradeQty;
      if (quantity <= 0) quantity = 0;
    }
  }
}

console.log("백필 완료");
```

Run: `node scratchpad/backfill-realized-pnl.mjs`
Expected: "0개의 (account_id, ticker) 조합" 이상이 출력되고, 매도 거래가 있었다면 "백필: ..." 로그가 찍힘. 현재는 매도 거래가 없으므로 백필 로그 없이 "백필 완료"만 출력되는 것이 정상.

- [ ] **Step 8: 임시 스크립트 삭제**

Run: `rm scratchpad/verify-portfolio-schema.mjs scratchpad/verify-realized-pnl.mjs scratchpad/verify-realized-pnl-result.mjs scratchpad/verify-cleanup.mjs scratchpad/backfill-realized-pnl.mjs`

- [ ] **Step 9: Commit**

```bash
git add src/lib/holdings/recalc.ts
git commit -m "Calculate and store realized P&L on sell trades in recalcHolding"
```

---

## Task 3: 일별 자산 스냅샷 저장 (`page.tsx` 확장)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: 기존 `syncHoldingPrices()` 반환값(`SyncResult`), `holdings` 테이블(`avg_cost`, `quantity`, `last_price`).
- Produces: `portfolio_snapshots`에 매 동기화 성공 시 오늘 날짜 행 upsert. 이 로직은 Task 4에서 `page.tsx`를 탭 구조로 리팩터링할 때 그대로 유지되어야 하는 부분이므로, 별도 함수로 분리해둔다: `src/lib/portfolio/snapshot.ts`의 `upsertTodaySnapshot(supabase): Promise<void>`.

- [ ] **Step 1: 스냅샷 저장 함수 작성**

`src/lib/portfolio/snapshot.ts` (신규 파일):

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * 전체 계좌 합산 기준으로 오늘 날짜의 총평가금액/총매수원가를 계산해
 * portfolio_snapshots에 upsert한다. 하루에 여러 번 호출돼도 그날 값은 마지막 값으로 덮어써진다.
 */
export async function upsertTodaySnapshot(supabase: SupabaseClient): Promise<void> {
  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("avg_cost, quantity, last_price");
  if (error) throw error;

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + price * Number(h.quantity);
  }, 0);

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.avg_cost) * Number(h.quantity),
    0
  );

  const today = new Date().toISOString().slice(0, 10);

  const { error: upsertError } = await supabase
    .from("portfolio_snapshots")
    .upsert({ date: today, total_value: totalValue, total_cost: totalCost }, { onConflict: "date" });
  if (upsertError) throw upsertError;
}
```

- [ ] **Step 2: `page.tsx`에서 동기화 성공 시 호출하도록 수정**

현재 `src/app/page.tsx`의 동기화 성공 분기(`ENABLE_LOCAL_PRICE_SYNC === "true"`이고 `syncHoldingPrices()`가 성공한 직후)에 `upsertTodaySnapshot` 호출을 추가한다. 현재 해당 블록:

```typescript
  if (process.env.ENABLE_LOCAL_PRICE_SYNC === "true") {
    const startedAt = new Date().toISOString();
    try {
      const result = await syncHoldingPrices();
      const finishedAt = new Date().toISOString();
      lastRun = {
        status: result.status,
        finished_at: finishedAt,
        failed_tickers: result.failedTickers,
        error_message: result.errorMessage,
      };
      await supabase.from("price_sync_runs").upsert({
        id: true,
        started_at: startedAt,
        finished_at: finishedAt,
        status: result.status,
        synced_count: result.syncedCount,
        failed_tickers: result.failedTickers,
        error_message: result.errorMessage,
      });
    } catch (err) {
```

이를 다음으로 수정한다(import 추가 + 성공 시 스냅샷 upsert 추가):

```typescript
import { upsertTodaySnapshot } from "@/lib/portfolio/snapshot";
```

(파일 상단 import 목록에 추가)

```typescript
  if (process.env.ENABLE_LOCAL_PRICE_SYNC === "true") {
    const startedAt = new Date().toISOString();
    try {
      const result = await syncHoldingPrices();
      const finishedAt = new Date().toISOString();
      lastRun = {
        status: result.status,
        finished_at: finishedAt,
        failed_tickers: result.failedTickers,
        error_message: result.errorMessage,
      };
      await supabase.from("price_sync_runs").upsert({
        id: true,
        started_at: startedAt,
        finished_at: finishedAt,
        status: result.status,
        synced_count: result.syncedCount,
        failed_tickers: result.failedTickers,
        error_message: result.errorMessage,
      });
      if (result.syncedCount > 0) {
        await upsertTodaySnapshot(supabase);
      }
    } catch (err) {
```

(그 아래 `catch` 블록과 `else` 블록은 변경하지 않는다.)

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

- [ ] **Step 4: 실제 dev 서버로 스냅샷 upsert 검증**

Run: `npm run dev` (백그라운드, `ENABLE_LOCAL_PRICE_SYNC=true`가 `.env.local`에 이미 설정돼 있어야 함)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

`scratchpad/verify-snapshot.mjs`:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);
const supabase = getSupabaseAdminClient();

const { data } = await supabase.from("portfolio_snapshots").select("*");
console.log(JSON.stringify(data, null, 2));
```

Run: `node scratchpad/verify-snapshot.mjs`
Expected: 오늘 날짜 행 1개, `total_value`/`total_cost`가 실제 holdings 기준 계산값과 일치.

같은 페이지를 한 번 더 요청한 뒤 다시 스크립트를 실행해 행이 늘지 않고(오늘 날짜 여전히 1행) 값만 최신화되는지 확인한다.

- [ ] **Step 5: 임시 스크립트 삭제, dev 서버 종료**

Run: `rm scratchpad/verify-snapshot.mjs`, dev 서버 프로세스 종료(`netstat`으로 포트 3000 PID 확인 후 종료).

- [ ] **Step 6: Commit**

```bash
git add src/lib/portfolio/snapshot.ts src/app/page.tsx
git commit -m "Upsert daily portfolio snapshot on successful price sync"
```

---

## Task 4: 홈 화면을 탭 구조로 개편 — 데이터 조회 + `PortfolioTabs` 뼈대

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/PortfolioTabs.tsx`

**Interfaces:**
- Produces: `PortfolioTabs` 컴포넌트, props 타입:
  ```typescript
  export interface PortfolioTabsProps {
    profitData: ProfitData;   // Task 5에서 정의
    trendData: TrendData;     // Task 6에서 정의
    allocationData: AllocationData; // Task 7에서 정의
  }
  ```
  이 태스크에서는 아직 `ProfitData`/`TrendData`/`AllocationData` 내부 필드를 확정하지 않고, 각 탭 컴포넌트가 자체 파일에서 타입을 export하도록 한다(Task 5/6/7에서 정의). 이 태스크는 탭 전환 뼈대(빈 자리 표시)만 완성한다.

- [ ] **Step 1: `PortfolioTabs.tsx` 작성 (임시 placeholder 탭 내용)**

```typescript
"use client";

import { useState } from "react";

type TabKey = "profit" | "trend" | "allocation";

export function PortfolioTabs({
  profitTab,
  trendTab,
  allocationTab,
}: {
  profitTab: React.ReactNode;
  trendTab: React.ReactNode;
  allocationTab: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("profit");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "profit", label: "수익" },
    { key: "trend", label: "추이" },
    { key: "allocation", label: "비중" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              active === tab.key
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {active === "profit" && profitTab}
        {active === "trend" && trendTab}
        {active === "allocation" && allocationTab}
      </div>
    </div>
  );
}
```

이 설계는 각 탭의 실제 콘텐츠를 `page.tsx`(Server Component)가 자식으로 렌더링해서 `PortfolioTabs`(Client Component)에 `children` 형태로 넘기는 방식이다 — 이렇게 하면 `ProfitTab`/`TrendTab`/`AllocationTab` 자체는 Server Component로 남을 수 있고, `PortfolioTabs`는 순수하게 탭 전환 상태만 관리한다(Client Component 경계를 최소화).

- [ ] **Step 2: `page.tsx`를 임시로 이 구조에 맞게 수정 (탭 내용은 플레이스홀더)**

`src/app/page.tsx`의 `return` 문 이전 로직(동기화, holdings 조회 등)은 그대로 두고, `return` 문만 아래로 교체한다:

```typescript
  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6">
      <div>
        <div className="text-sm text-gray-500">총 평가금액</div>
        <div className="text-3xl font-bold">{totalValue.toLocaleString()}원</div>
      </div>

      <PortfolioTabs
        profitTab={<div className="text-gray-400">수익 탭 (Task 5에서 구현)</div>}
        trendTab={<div className="text-gray-400">추이 탭 (Task 6에서 구현)</div>}
        allocationTab={<div className="text-gray-400">비중 탭 (Task 7에서 구현)</div>}
      />
    </div>
  );
```

파일 상단 import에 `import { PortfolioTabs } from "@/components/PortfolioTabs";` 추가.

기존의 `syncBadge`, holdings map 렌더링(개별 종목 리스트), `totalCost` 카드 등은 이 스텝에서 일단 제거한다 — 이들은 각각 Task 5(수익 탭)/Task 7(비중 탭, 종목별 리스트로 흡수)에서 다시 구현된다. `totalCost` 계산 로직 자체(변수)는 남겨두되(Task 5에서 사용), 렌더링 부분만 교체한다.

- [ ] **Step 3: 타입체크 및 빌드 확인**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음(단, `syncBadge` 등 이제 안 쓰는 변수가 있으면 ESLint 경고 가능 — 미사용 변수는 제거한다).

Run: `npm run build`
Expected: 빌드 성공, 라우트 테이블에서 `/`가 `ƒ (Dynamic)`로 표시됨(이 확인은 필수 — Global Constraints 참고).

- [ ] **Step 4: 브라우저로 탭 전환 확인**

Run: `npm run dev`, 브라우저에서 `http://localhost:3000` 접속. "수익"/"추이"/"비중" 버튼을 각각 클릭해 플레이스홀더 텍스트가 바뀌는지 확인. dev 서버 종료.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/PortfolioTabs.tsx
git commit -m "Add tab shell (profit/trend/allocation) to home page, replacing flat holdings list"
```

---

## Task 5: 수익 탭 구현

**Files:**
- Create: `src/components/ProfitTab.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `holdings`(`avg_cost, quantity, last_price`), `trades`(`traded_at, realized_pnl`).
- Produces:
  ```typescript
  export interface ProfitTabProps {
    unrealizedPnl: number;
    realizedPnl: number;
    dividendPnl: number; // 항상 0
    totalCostBasis: number; // 분모, 0일 수 있음
    dailyRealized: { label: string; value: number }[]; // 최근 30일
    monthlyRealized: { label: string; value: number }[]; // 최근 12개월
  }
  export function ProfitTab(props: ProfitTabProps): JSX.Element;
  ```

- [ ] **Step 1: `page.tsx`에 trades 조회 추가**

`src/app/page.tsx`의 기존 holdings 조회 다음에 trades 조회를 추가한다:

```typescript
  const { data: trades } = await supabase
    .from("trades")
    .select("traded_at, realized_pnl")
    .not("realized_pnl", "is", null);
```

- [ ] **Step 2: 수익 데이터 계산 함수 작성**

`src/app/page.tsx`에 다음 헬퍼 함수들을 추가(홈 컴포넌트 함수 바깥, 파일 내 모듈 스코프):

```typescript
function groupRealizedByDay(
  trades: { traded_at: string; realized_pnl: number | null }[],
  days: number
): { label: string; value: number }[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const t of trades) {
    if (t.realized_pnl == null) continue;
    if (buckets.has(t.traded_at)) {
      buckets.set(t.traded_at, (buckets.get(t.traded_at) ?? 0) + Number(t.realized_pnl));
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

function groupRealizedByMonth(
  trades: { traded_at: string; realized_pnl: number | null }[],
  months: number
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
      buckets.set(label, (buckets.get(label) ?? 0) + Number(t.realized_pnl));
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}
```

- [ ] **Step 3: `ProfitTab.tsx` 작성**

```typescript
"use client";

import { useState } from "react";

export interface ProfitTabProps {
  unrealizedPnl: number;
  realizedPnl: number;
  dividendPnl: number;
  totalCostBasis: number;
  dailyRealized: { label: string; value: number }[];
  monthlyRealized: { label: string; value: number }[];
}

function formatSigned(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString()}원`;
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="flex h-32 items-end gap-0.5 overflow-x-auto">
      {data.map((d) => {
        const heightPct = (Math.abs(d.value) / maxAbs) * 100;
        return (
          <div key={d.label} className="flex min-w-[6px] flex-1 flex-col items-center justify-end" title={`${d.label}: ${formatSigned(d.value)}`}>
            <div
              className={`w-full rounded-sm ${d.value >= 0 ? "bg-red-500" : "bg-blue-500"}`}
              style={{ height: `${heightPct}%`, minHeight: d.value !== 0 ? "2px" : "0" }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ProfitTab({
  unrealizedPnl,
  realizedPnl,
  dividendPnl,
  totalCostBasis,
  dailyRealized,
  monthlyRealized,
}: ProfitTabProps) {
  const [range, setRange] = useState<"daily" | "monthly">("daily");
  const totalRealizedRate = totalCostBasis > 0 ? (realizedPnl / totalCostBasis) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">평가수익</div>
          <div className={`text-lg font-semibold ${unrealizedPnl >= 0 ? "text-red-600" : "text-blue-600"}`}>
            {formatSigned(unrealizedPnl)}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">실현수익</div>
          <div className={`text-lg font-semibold ${realizedPnl >= 0 ? "text-red-600" : "text-blue-600"}`}>
            {formatSigned(realizedPnl)}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">배당수익</div>
          <div className="text-lg font-semibold text-gray-400">{formatSigned(dividendPnl)}</div>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <div className="text-xs text-gray-500">총 실현수익률</div>
        <div className={`text-xl font-bold ${totalRealizedRate >= 0 ? "text-red-600" : "text-blue-600"}`}>
          {totalRealizedRate >= 0 ? "+" : ""}
          {totalRealizedRate.toFixed(2)}%
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">실현손익 차트</h3>
          <div className="flex gap-1 rounded-md border p-0.5 text-xs">
            <button
              onClick={() => setRange("daily")}
              className={`rounded px-2 py-1 ${range === "daily" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
            >
              일별
            </button>
            <button
              onClick={() => setRange("monthly")}
              className={`rounded px-2 py-1 ${range === "monthly" ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"}`}
            >
              월별
            </button>
          </div>
        </div>
        <BarChart data={range === "daily" ? dailyRealized : monthlyRealized} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx`에서 `ProfitTab` 연결**

import 추가:

```typescript
import { ProfitTab } from "@/components/ProfitTab";
```

holdings/trades 조회 이후, `return` 문 이전에 계산 로직 추가:

```typescript
  const unrealizedPnl = (holdings ?? []).reduce((sum, h) => {
    if (h.last_price == null) return sum;
    return sum + (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity);
  }, 0);

  const realizedPnl = (trades ?? []).reduce((sum, t) => sum + Number(t.realized_pnl ?? 0), 0);

  const totalCostBasis = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.avg_cost) * Number(h.quantity),
    0
  );

  const dailyRealized = groupRealizedByDay(trades ?? [], 30);
  const monthlyRealized = groupRealizedByMonth(trades ?? [], 12);
```

`PortfolioTabs`의 `profitTab` prop을 교체:

```typescript
        profitTab={
          <ProfitTab
            unrealizedPnl={unrealizedPnl}
            realizedPnl={realizedPnl}
            dividendPnl={0}
            totalCostBasis={totalCostBasis}
            dailyRealized={dailyRealized}
            monthlyRealized={monthlyRealized}
          />
        }
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

- [ ] **Step 6: 브라우저로 실제 수치 검증**

Run: `npm run dev`, 브라우저에서 `/` 접속, "수익" 탭 확인.

`scratchpad/verify-profit-numbers.mjs`로 실제 holdings/trades를 조회해 수기 계산한 값과 화면 표시값이 일치하는지 대조:

```javascript
import { pathToFileURL } from "node:url";
const { getSupabaseAdminClient } = await import(
  pathToFileURL("d:/클로드/.claude/skills/_lib/supabase.mjs").href
);
const supabase = getSupabaseAdminClient();

const { data: holdings } = await supabase.from("holdings").select("avg_cost, quantity, last_price");
const unrealized = holdings.reduce((s, h) => s + (h.last_price != null ? (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity) : 0), 0);
console.log("기대 평가수익:", unrealized);

const { data: trades } = await supabase.from("trades").select("realized_pnl").not("realized_pnl", "is", null);
const realized = trades.reduce((s, t) => s + Number(t.realized_pnl), 0);
console.log("기대 실현수익:", realized);
```

Run: `node scratchpad/verify-profit-numbers.mjs`, 브라우저 화면 값과 대조.

- [ ] **Step 7: 임시 스크립트 삭제, dev 서버 종료**

- [ ] **Step 8: Commit**

```bash
git add src/components/ProfitTab.tsx src/app/page.tsx
git commit -m "Implement profit tab: unrealized/realized P&L, total return rate, daily/monthly bar chart"
```

---

## Task 6: 추이 탭 구현

**Files:**
- Create: `src/components/TrendTab.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `portfolio_snapshots`(`date, total_value, total_cost`).
- Produces:
  ```typescript
  export interface TrendTabProps {
    snapshots: { date: string; total_value: number; total_cost: number }[];
  }
  export function TrendTab(props: TrendTabProps): JSX.Element;
  ```

- [ ] **Step 1: `page.tsx`에 스냅샷 조회 추가**

```typescript
  const { data: snapshots } = await supabase
    .from("portfolio_snapshots")
    .select("date, total_value, total_cost")
    .order("date", { ascending: true });
```

- [ ] **Step 2: `TrendTab.tsx` 작성**

```typescript
"use client";

import { useState } from "react";

export interface TrendTabProps {
  snapshots: { date: string; total_value: number; total_cost: number }[];
}

type RangeKey = "month" | "1m" | "6m" | "1y" | "ytd" | "all";

const RANGE_LABELS: { key: RangeKey; label: string }[] = [
  { key: "month", label: "이달" },
  { key: "1m", label: "1달" },
  { key: "6m", label: "6달" },
  { key: "1y", label: "1년" },
  { key: "ytd", label: "올해" },
  { key: "all", label: "전체" },
];

function filterByRange(
  snapshots: TrendTabProps["snapshots"],
  range: RangeKey
): TrendTabProps["snapshots"] {
  if (range === "all") return snapshots;
  const now = new Date();
  let cutoff: Date;
  if (range === "month" || range === "ytd") {
    cutoff = range === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1);
  } else {
    const monthsBack = range === "1m" ? 1 : range === "6m" ? 6 : 12;
    cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate());
  }
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return snapshots.filter((s) => s.date >= cutoffStr);
}

function LineChart({ snapshots }: { snapshots: TrendTabProps["snapshots"] }) {
  if (snapshots.length === 0) {
    return <p className="text-sm text-gray-400">표시할 데이터가 없습니다.</p>;
  }

  const width = 320;
  const height = 160;
  const values = snapshots.map((s) => s.total_value);
  const costs = snapshots.map((s) => s.total_cost);
  const allValues = [...values, ...costs];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  function toPoints(series: number[]): string {
    return series
      .map((v, i) => {
        const x = snapshots.length > 1 ? (i / (snapshots.length - 1)) * width : width / 2;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
      })
      .join(" ");
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="투자 자산 추이 차트">
      <polyline points={toPoints(costs)} fill="none" stroke="var(--series-3)" strokeWidth={1.5} strokeDasharray="4 2" />
      <polyline points={toPoints(values)} fill="none" stroke="var(--series-6)" strokeWidth={2} />
    </svg>
  );
}

export function TrendTab({ snapshots }: TrendTabProps) {
  const [range, setRange] = useState<RangeKey>("all");
  const filtered = filterByRange(snapshots, range);
  const latest = filtered[filtered.length - 1];

  return (
    <div className="space-y-4">
      {latest && (
        <div>
          <div className="text-xs text-gray-500">투자 자산</div>
          <div className="text-2xl font-bold">{Math.round(latest.total_value).toLocaleString()}원</div>
          <div className="text-sm text-gray-500">원금 {Math.round(latest.total_cost).toLocaleString()}원</div>
        </div>
      )}

      <LineChart snapshots={filtered} />

      <div className="flex flex-wrap gap-1 text-xs">
        {RANGE_LABELS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full border px-3 py-1 ${
              range === r.key ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-500"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx`에서 `TrendTab` 연결**

import 추가:

```typescript
import { TrendTab } from "@/components/TrendTab";
```

`PortfolioTabs`의 `trendTab` prop 교체:

```typescript
        trendTab={<TrendTab snapshots={snapshots ?? []} />}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

- [ ] **Step 5: 브라우저로 확인**

Run: `npm run dev`, `/` 접속, "추이" 탭에서 라인차트와 기간 필터 버튼이 렌더링되는지 확인(현재는 스냅샷이 1~2일치뿐이므로 점이 거의 없는 짧은 선으로 보이는 게 정상 — Task 3에서 이미 검증한 스냅샷 데이터를 그대로 사용).

- [ ] **Step 6: dev 서버 종료, Commit**

```bash
git add src/components/TrendTab.tsx src/app/page.tsx
git commit -m "Implement trend tab: asset/cost line chart with period filter"
```

---

## Task 7: 비중 탭 구현 (종목별/계좌별)

**Files:**
- Create: `src/components/AllocationTab.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `holdings`(`ticker, name, quantity, avg_cost, last_price, account_id, accounts(name)`), 기존 `SectorDonutChart`(`src/components/SectorDonutChart.tsx`)를 그대로 재사용.
- Produces:
  ```typescript
  export interface AllocationTabProps {
    byTicker: { sector: string; value: number }[];
    byAccount: { sector: string; value: number }[];
  }
  export function AllocationTab(props: AllocationTabProps): JSX.Element;
  ```
  (필드명이 `sector`인 이유: 기존 `SectorDonutChart`의 `SectorSlice` 타입이 `{sector: string; value: number}`이고 이를 그대로 재사용하기 위해 라벨 필드명을 맞춘다.)

- [ ] **Step 1: `page.tsx`의 holdings 조회에 `accounts(name)` 포함 확인**

기존 holdings 조회가 이미 `accounts(name, market)`을 포함하고 있는지 확인(Task 6 완료 시점 기준 `src/app/page.tsx`의 select 문 확인 필요 — 없다면 추가):

```typescript
  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("id, account_id, ticker, name, quantity, avg_cost, last_price, price_updated_at, accounts(name, market)")
    .order("updated_at", { ascending: false });
```

- [ ] **Step 2: 비중 계산 함수 작성 (`page.tsx`에 헬퍼 추가)**

```typescript
function groupByTicker(
  holdings: { ticker: string; name: string; quantity: number; avg_cost: number; last_price: number | null }[]
): { sector: string; value: number }[] {
  return holdings
    .map((h) => {
      const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
      return { sector: `${h.name} (${h.ticker})`, value: price * Number(h.quantity) };
    })
    .sort((a, b) => b.value - a.value);
}

function groupByAccount(
  holdings: {
    quantity: number;
    avg_cost: number;
    last_price: number | null;
    accounts: { name: string } | null;
  }[]
): { sector: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = price * Number(h.quantity);
    const accountName = h.accounts?.name ?? "알 수 없는 계좌";
    totals.set(accountName, (totals.get(accountName) ?? 0) + value);
  }
  return Array.from(totals.entries())
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);
}
```

- [ ] **Step 3: `AllocationTab.tsx` 작성**

```typescript
"use client";

import { useState } from "react";
import { SectorDonutChart, type SectorSlice } from "@/components/SectorDonutChart";

export interface AllocationTabProps {
  byTicker: SectorSlice[];
  byAccount: SectorSlice[];
}

export function AllocationTab({ byTicker, byAccount }: AllocationTabProps) {
  const [view, setView] = useState<"ticker" | "account">("ticker");

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

      <SectorDonutChart
        slices={view === "ticker" ? byTicker : byAccount}
        title={view === "ticker" ? "종목별 비중" : "계좌별 비중"}
      />
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx`에서 `AllocationTab` 연결**

import 추가:

```typescript
import { AllocationTab } from "@/components/AllocationTab";
```

계산 로직 추가(holdings 조회 이후):

```typescript
  const byTicker = groupByTicker(holdings ?? []);
  const byAccount = groupByAccount(
    (holdings ?? []).map((h) => ({
      ...h,
      accounts: h.accounts as unknown as { name: string } | null,
    }))
  );
```

`PortfolioTabs`의 `allocationTab` prop 교체:

```typescript
        allocationTab={<AllocationTab byTicker={byTicker} byAccount={byAccount} />}
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음.

- [ ] **Step 6: 브라우저로 확인**

Run: `npm run dev`, `/` 접속, "비중" 탭에서 종목별/계좌별 토글이 동작하고 도넛차트+리스트가 표시되는지 확인. 실제 holdings(NVDA, VRT)의 평가금액 비율과 화면 표시 비율이 일치하는지 수기 계산과 대조.

- [ ] **Step 7: dev 서버 종료, Commit**

```bash
git add src/components/AllocationTab.tsx src/app/page.tsx
git commit -m "Implement allocation tab: by-ticker and by-account donut charts"
```

---

## Task 8: 전체 빌드 검증 + 미사용 코드 정리

**Files:**
- Modify: `src/app/page.tsx` (정리만, 새 기능 없음)

**Interfaces:**
- 없음(정리 전용 태스크).

- [ ] **Step 1: `page.tsx` 전체를 읽고 미사용 import/변수 확인**

Task 4~7을 거치며 기존 `formatRelativeTime`/`syncBadge` 등 일부 헬퍼가 여전히 필요한지(동기화 상태 배지를 어디에 남길지 — 스펙에는 명시 안 됐으나 기존 기능이므로 제거하지 않고 총 평가금액 카드 옆에 작게 유지하는 것을 기본값으로 한다) 확인하고, 실제로 안 쓰는 것만 제거한다.

- [ ] **Step 2: `npm run build` 전체 실행**

Run: `npm run build`
Expected: 빌드 성공, 경고 없음(미사용 변수 경고가 있다면 Step 1에서 제거), `/` 라우트가 `ƒ (Dynamic)`.

- [ ] **Step 3: `npm run dev`로 최종 종단 확인**

전체 페이지 로드 → 3개 탭 모두 순서대로 클릭 → 각 탭이 실제 데이터를 정상 표시하는지 최종 확인. dev 서버 종료.

- [ ] **Step 4: Commit (변경사항이 있는 경우에만)**

```bash
git add src/app/page.tsx
git commit -m "Clean up unused code after portfolio dashboard tab migration"
```

---

## Self-Review 결과

- **Spec coverage**: 설계 문서의 데이터 모델(portfolio_snapshots, realized_pnl), 실현손익 계산, 백필, 일별 스냅샷, 홈 화면 구조, 수익/추이/비중 3탭이 모두 Task 1~7에 매핑됨. `/analysis` 미변경, 배당/세금/유형별 제외는 Global Constraints에 명시되어 모든 태스크에 암묵 적용됨.
- **Placeholder scan**: 모든 코드 스텝에 완전한 코드 포함. "TBD" 없음. Task 4의 탭 콘텐츠 placeholder(`<div>수익 탭 (Task 5에서 구현)</div>`)는 의도된 임시 상태이며 Task 5~7에서 명시적으로 교체됨 — 계획 결함이 아님.
- **Type consistency**: `SectorSlice`(`{sector, value}`)가 기존 컴포넌트 타입 그대로 `AllocationTab`에서 재사용됨. `ProfitTabProps`/`TrendTabProps`/`AllocationTabProps`가 각 컴포넌트 파일에서 정의되고 `page.tsx`에서 그대로 소비됨. `recalcHolding`의 반환 시그니처는 변경되지 않아 `src/lib/actions/trades.ts` 호출부가 그대로 동작함.
