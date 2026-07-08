# 토스증권 시세 동기화(Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `holdings` 테이블의 보유 종목 현재가를 토스증권 Open API(`/api/v1/prices`)로 5분마다 자동 갱신하고, 대시보드에 평가손익과 갱신 상태를 표시한다.

**Architecture:** Next.js Route Handler(`/api/cron/toss-price-sync`)가 토스 OAuth2 토큰을 발급/캐싱(`src/lib/toss/auth.ts`)하고, `holdings.ticker`를 모아 시세를 조회(`src/lib/toss/prices.ts`)해 DB에 반영한다. GitHub Actions가 5분마다 이 라우트를 `CRON_SECRET`으로 인증 호출한다. 실행 결과는 `price_sync_runs` 테이블에 기록되고 대시보드가 최신 행을 읽어 상태 배지로 보여준다.

**Tech Stack:** Next.js 16 App Router + TypeScript, Supabase(Postgres, `@supabase/supabase-js` admin client), GitHub Actions(`schedule` cron), 토스증권 Open API(`https://openapi.tossinvest.com`).

이 프로젝트에는 자동 테스트 러너가 구성되어 있지 않다(`CLAUDE.md`에 명시). 각 태스크의 검증은 실제 API/DB 왕복이 가능한 Node 스크립트를 `.claude/skills/_lib` 패턴과 동일하게 임시 스크립트로 작성해 실행하고, 확인 후 삭제하는 방식으로 진행한다. 자동화된 유닛테스트를 새로 도입하지 않는다.

## Global Constraints

- 배포는 `git push origin main`으로만 한다. Vercel/Netlify CLI 직접 배포 금지 (CLAUDE.md).
- 시크릿(TOSS_CLIENT_ID/SECRET, CRON_SECRET)은 절대 클라이언트 코드/커밋에 노출하지 않는다.
- DB 접근은 기존 관례대로 `src/lib/supabase/admin.ts`의 `createAdminClient()`(secret key, RLS 우회)만 사용한다.
- 응답 언어와 커밋 메시지는 기존 관례를 따른다(코드 주석은 최소화, 필요한 경우만 한글/영문 혼용 기존 스타일 유지).
- 토스 API 심볼 형식은 국내 6자리 숫자(예: `005930`) 또는 해외 티커(예: `AAPL`) 그대로 사용 — 별도 변환 로직 없음 (실제 DB 확인 결과 `holdings.ticker`가 이미 이 형식).

---

## Task 1: DB 스키마 변경 (마이그레이션)

**Files:**
- Create: `supabase/migrations/0002_toss_price_sync.sql`

**Interfaces:**
- Produces: `holdings.last_price numeric`, `holdings.price_updated_at timestamptz`, `toss_credentials`(컬럼 축소: `client_id`/`client_secret_encrypted` 제거, `access_token_encrypted`/`token_expires_at` 유지), `price_sync_runs` 테이블(`id, started_at, finished_at, status, synced_count, failed_tickers, error_message`).

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- holdings에 시세 캐시 컬럼 추가
alter table holdings add column last_price numeric;
alter table holdings add column price_updated_at timestamptz;

-- toss_credentials: client_id/secret은 Vercel 환경변수로 이관, access_token 캐시만 남김
alter table toss_credentials drop column if exists client_id;
alter table toss_credentials drop column if exists client_secret_encrypted;

-- 시세 동기화 실행 로그
create table price_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('success','partial','failed')),
  synced_count int not null default 0,
  failed_tickers text[],
  error_message text
);

alter table price_sync_runs enable row level security;
```

- [ ] **Step 2: Supabase 프로젝트에 마이그레이션 적용**

Run: Supabase 대시보드 SQL Editor에서 `supabase/migrations/0002_toss_price_sync.sql` 전체 내용을 실행하거나, `supabase db push`(Supabase CLI가 로컬에 연결되어 있다면). 이 프로젝트는 기존에도 Supabase 대시보드에서 수동 적용해왔으므로 동일하게 진행.

Expected: 에러 없이 실행 완료. 아래 확인 스크립트로 재확인.

- [ ] **Step 3: 스키마 반영 확인 스크립트 작성 및 실행**

`C:\Users\miyoc\AppData\Local\Temp\claude\d-----\3ea27c6f-c5bc-4463-ac42-64f274e9700c\scratchpad\verify-schema.mjs`:

```javascript
import { getSupabaseAdminClient } from "d:/클로드/.claude/skills/_lib/supabase.mjs";

const supabase = getSupabaseAdminClient();

const { data: holdingsCols, error: e1 } = await supabase
  .from("holdings")
  .select("last_price, price_updated_at")
  .limit(1);
if (e1) throw e1;
console.log("holdings 신규 컬럼 OK:", holdingsCols);

const { error: e2 } = await supabase.from("price_sync_runs").select("id").limit(1);
if (e2) throw e2;
console.log("price_sync_runs 테이블 OK");

const { data: cred, error: e3 } = await supabase.from("toss_credentials").select("*").limit(1);
if (e3) throw e3;
console.log("toss_credentials 컬럼:", cred.length ? Object.keys(cred[0]) : "행 없음(정상)");
```

Run: `node --input-type=module < verify-schema.mjs` (또는 `node verify-schema.mjs`, ESM이므로 확장자 `.mjs` 필요)

Expected: 세 블록 모두 에러 없이 출력. `toss_credentials`에 `client_id`/`client_secret_encrypted` 컬럼이 없어야 함.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_toss_price_sync.sql
git commit -m "Add price sync schema: holdings price cache, price_sync_runs log, drop toss client creds columns"
```

---

## Task 2: 환경변수 자격증명 등록 + 검증 스크립트

**Files:**
- Modify: `.env.local` (로컬 전용, git에 커밋되지 않음 — `.gitignore` 확인 필요)

**Interfaces:**
- Produces: 로컬 환경변수 `TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET`, `CRON_SECRET`. 이후 태스크에서 `process.env.TOSS_CLIENT_ID` 등으로 참조.

- [ ] **Step 1: `.env.local`이 git 추적 대상이 아닌지 확인**

Run: `git check-ignore .env.local`
Expected: `.env.local` 출력(무시 대상 확인). 출력이 없으면 `.gitignore`에 `.env.local` 추가 후 재확인.

- [ ] **Step 2: 사용자에게 실제 client_id/secret 값 입력 요청**

사용자가 보유한 토스증권 개발자센터 client_id/secret을 `.env.local`에 추가:

```
TOSS_CLIENT_ID=<실제 값>
TOSS_CLIENT_SECRET=<실제 값>
CRON_SECRET=<임의의 긴 랜덤 문자열, 예: openssl rand -hex 32 결과>
```

이 값들은 사용자가 직접 붙여넣거나 불러주는 방식으로 진행(Claude가 URL/토큰을 추측하지 않음).

- [ ] **Step 3: 값이 로드되는지 확인**

`C:\Users\miyoc\AppData\Local\Temp\claude\...\scratchpad\verify-env.mjs`:

```javascript
import { readFileSync } from "node:fs";

const content = readFileSync("d:/클로드/.env.local", "utf-8");
const hasClientId = /^TOSS_CLIENT_ID=.+/m.test(content);
const hasClientSecret = /^TOSS_CLIENT_SECRET=.+/m.test(content);
const hasCronSecret = /^CRON_SECRET=.+/m.test(content);
console.log({ hasClientId, hasClientSecret, hasCronSecret });
```

Run: `node verify-env.mjs`
Expected: `{ hasClientId: true, hasClientSecret: true, hasCronSecret: true }`

- [ ] **Step 4: Commit 불필요**

`.env.local`은 git 추적 대상이 아니므로 커밋 생략. 대신 Vercel 프로젝트 환경변수 설정 필요성을 사용자에게 안내(Task 6에서 배포 전 최종 확인).

---

## Task 3: 토스 OAuth2 토큰 발급/캐싱 (`src/lib/toss/auth.ts`)

**Files:**
- Create: `src/lib/toss/auth.ts`

**Interfaces:**
- Consumes: `createAdminClient()` from `src/lib/supabase/admin.ts`; `process.env.TOSS_CLIENT_ID`, `process.env.TOSS_CLIENT_SECRET`.
- Produces: `export async function getTossAccessToken(): Promise<string>` — 유효한 access token 문자열을 반환(캐시 재사용 또는 재발급). 다른 모든 토스 API 호출 코드는 이 함수만 사용.

- [ ] **Step 1: 구현 작성**

```typescript
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://openapi.tossinvest.com/oauth2/token";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface TossCredentialsRow {
  access_token_encrypted: string | null;
  token_expires_at: string | null;
}

async function fetchNewToken(): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`토스 토큰 발급 실패 (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + json.expires_in * 1000);
  return { accessToken: json.access_token, expiresAt };
}

export async function getTossAccessToken(): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("toss_credentials")
    .select("access_token_encrypted, token_expires_at")
    .eq("id", true)
    .maybeSingle<TossCredentialsRow>();
  if (error) throw error;

  const now = Date.now();
  const cachedExpiry = data?.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  const isValid = data?.access_token_encrypted && cachedExpiry - now > EXPIRY_BUFFER_MS;

  if (isValid) {
    return data!.access_token_encrypted!;
  }

  const { accessToken, expiresAt } = await fetchNewToken();

  const { error: upsertError } = await supabase.from("toss_credentials").upsert({
    id: true,
    access_token_encrypted: accessToken,
    token_expires_at: expiresAt.toISOString(),
  });
  if (upsertError) throw upsertError;

  return accessToken;
}
```

- [ ] **Step 2: 실제 토큰 발급 왕복 검증 스크립트 작성**

`scratchpad/verify-toss-token.mjs`:

```javascript
import { getSupabaseAdminClient } from "d:/클로드/.claude/skills/_lib/supabase.mjs";
import { readFileSync } from "node:fs";

const envContent = readFileSync("d:/클로드/.env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (key) process.env[key] = value;
}

const res = await fetch("https://openapi.tossinvest.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.TOSS_CLIENT_ID,
    client_secret: process.env.TOSS_CLIENT_SECRET,
  }),
});

console.log("status:", res.status);
const json = await res.json();
console.log("응답 키:", Object.keys(json));
if (res.ok) {
  console.log("access_token 길이:", json.access_token.length, "expires_in:", json.expires_in);
} else {
  console.log("에러 응답:", json);
}
```

Run: `node scratchpad/verify-toss-token.mjs`
Expected: `status: 200`이고 `access_token`, `token_type`, `expires_in` 키 확인. 401이 나오면 client_id/secret이 유효하지 않다는 뜻이므로 여기서 멈추고 사용자에게 재확인 요청(이 프로젝트의 자격증명이 실제로 유효한지 여기서 최초로 검증됨).

- [ ] **Step 3: `getTossAccessToken()` 자체를 호출하는 통합 스크립트로 캐싱 동작 확인**

`scratchpad/verify-token-caching.mjs` (Next.js 서버 컨텍스트 밖에서 `src/lib/toss/auth.ts`를 직접 import하려면 `server-only` 패키지가 에러를 던지므로, 이 스크립트에서는 `src/lib/toss/auth.ts`의 로직을 그대로 재현하되 `createAdminClient` 대신 `getSupabaseAdminClient()`를 사용하는 임시 인라인 버전으로 검증한다):

```javascript
import { getSupabaseAdminClient } from "d:/클로드/.claude/skills/_lib/supabase.mjs";
import { readFileSync } from "node:fs";

const envContent = readFileSync("d:/클로드/.env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (key) process.env[key] = value;
}

const supabase = getSupabaseAdminClient();

// 1차 호출: 캐시 없으므로 새로 발급되어야 함
const { data: before } = await supabase
  .from("toss_credentials")
  .select("access_token_encrypted, token_expires_at")
  .eq("id", true)
  .maybeSingle();
console.log("발급 전 캐시:", before);

const res = await fetch("https://openapi.tossinvest.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.TOSS_CLIENT_ID,
    client_secret: process.env.TOSS_CLIENT_SECRET,
  }),
});
const json = await res.json();
const expiresAt = new Date(Date.now() + json.expires_in * 1000);

await supabase.from("toss_credentials").upsert({
  id: true,
  access_token_encrypted: json.access_token,
  token_expires_at: expiresAt.toISOString(),
});

const { data: after } = await supabase
  .from("toss_credentials")
  .select("access_token_encrypted, token_expires_at")
  .eq("id", true)
  .maybeSingle();
console.log("발급 후 캐시:", after?.token_expires_at, "(값 존재:", !!after?.access_token_encrypted, ")");
```

Run: `node scratchpad/verify-token-caching.mjs`
Expected: "발급 전 캐시"는 `null` 또는 값 없음, "발급 후 캐시"는 `token_expires_at`이 약 24시간 뒤 시각으로 채워짐.

- [ ] **Step 4: 임시 검증 스크립트 삭제**

Run: `rm scratchpad/verify-toss-token.mjs scratchpad/verify-token-caching.mjs scratchpad/verify-env.mjs scratchpad/verify-schema.mjs` (scratchpad 디렉토리 실제 경로 기준)

- [ ] **Step 5: Commit**

```bash
git add src/lib/toss/auth.ts
git commit -m "Add Toss OAuth2 token fetch/cache logic"
```

---

## Task 4: 시세 조회 + holdings 반영 로직 (`src/lib/toss/prices.ts`)

**Files:**
- Create: `src/lib/toss/prices.ts`

**Interfaces:**
- Consumes: `getTossAccessToken()` from `src/lib/toss/auth.ts`; `createAdminClient()`.
- Produces: `export async function syncHoldingPrices(): Promise<SyncResult>` where
  ```typescript
  interface SyncResult {
    status: "success" | "partial" | "failed";
    syncedCount: number;
    failedTickers: string[];
    errorMessage: string | null;
  }
  ```
  Task 5(`/api/cron/toss-price-sync`)가 이 함수 하나만 호출한다.

- [ ] **Step 1: 구현 작성**

```typescript
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTossAccessToken } from "@/lib/toss/auth";

const PRICES_URL = "https://openapi.tossinvest.com/api/v1/prices";
const CHUNK_SIZE = 200;

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
  });

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
    const retryRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!retryRes.ok) {
      throw new Error(`가격 조회 재시도 실패 (${retryRes.status})`);
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
```

- [ ] **Step 2: 실제 보유 티커(NVDA, VRT)로 시세 조회 왕복 검증**

`scratchpad/verify-prices.mjs` (Task 3의 env 로딩 패턴 재사용):

```javascript
import { getSupabaseAdminClient } from "d:/클로드/.claude/skills/_lib/supabase.mjs";
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

const supabase = getSupabaseAdminClient();
const { data: holdings } = await supabase.from("holdings").select("ticker");
const tickers = [...new Set(holdings.map((h) => h.ticker))];
console.log("조회할 티커:", tickers);

const priceRes = await fetch(
  `https://openapi.tossinvest.com/api/v1/prices?symbols=${tickers.join(",")}`,
  { headers: { Authorization: `Bearer ${access_token}` } }
);
console.log("status:", priceRes.status);
console.log(JSON.stringify(await priceRes.json(), null, 2));
```

Run: `node scratchpad/verify-prices.mjs`
Expected: `status: 200`, `result` 배열에 NVDA/VRT 각각의 `lastPrice`, `currency` 포함.

- [ ] **Step 3: `syncHoldingPrices()`를 직접 실행해 holdings 갱신 확인**

Task 3에서 만든 `src/lib/toss/auth.ts`는 `server-only`를 import하므로 Next.js 외부에서 직접 실행 불가. 대신 Route Handler 완성 후(Task 5) `next dev` 서버를 띄운 상태에서 실제 라우트를 호출하는 방식으로 최종 검증한다. 이 단계에서는 Step 2의 순수 API 왕복 검증으로 충분.

- [ ] **Step 4: 임시 검증 스크립트 삭제**

Run: `rm scratchpad/verify-prices.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/lib/toss/prices.ts
git commit -m "Add Toss price fetch and holdings sync logic with 429 retry"
```

---

## Task 5: Cron Route Handler (`/api/cron/toss-price-sync`)

**Files:**
- Create: `src/app/api/cron/toss-price-sync/route.ts`

**Interfaces:**
- Consumes: `syncHoldingPrices()` from `src/lib/toss/prices.ts`; `createAdminClient()`; `process.env.CRON_SECRET`.
- Produces: `GET /api/cron/toss-price-sync` — `Authorization: Bearer {CRON_SECRET}` 검증 후 동기화 실행, `price_sync_runs`에 기록, JSON 응답.

- [ ] **Step 1: 구현 작성**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncHoldingPrices } from "@/lib/toss/prices";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();

  try {
    const result = await syncHoldingPrices();

    await supabase.from("price_sync_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: result.status,
      synced_count: result.syncedCount,
      failed_tickers: result.failedTickers,
      error_message: result.errorMessage,
    });

    return NextResponse.json(result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await supabase.from("price_sync_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      synced_count: 0,
      failed_tickers: [],
      error_message: errorMessage,
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
```

- [ ] **Step 2: 로컬 dev 서버로 실제 왕복 검증**

Run: `npm run dev` (백그라운드 실행)

`scratchpad/verify-cron-route.mjs`:

```javascript
import { readFileSync } from "node:fs";

const envContent = readFileSync("d:/클로드/.env.local", "utf-8");
let cronSecret = "";
for (const line of envContent.split("\n")) {
  if (line.startsWith("CRON_SECRET=")) cronSecret = line.slice("CRON_SECRET=".length).trim();
}

const res = await fetch("http://localhost:3000/api/cron/toss-price-sync", {
  headers: { Authorization: `Bearer ${cronSecret}` },
});
console.log("status:", res.status);
console.log(JSON.stringify(await res.json(), null, 2));

const badRes = await fetch("http://localhost:3000/api/cron/toss-price-sync", {
  headers: { Authorization: "Bearer wrong-secret" },
});
console.log("잘못된 secret status (401 기대):", badRes.status);
```

Run: `node scratchpad/verify-cron-route.mjs`
Expected: 첫 호출 `status: 200`이고 `{ status: "success", syncedCount: 2, failedTickers: [], errorMessage: null }` (NVDA, VRT 2건). 두 번째 호출은 `401`.

- [ ] **Step 3: holdings 테이블에 실제로 last_price가 반영됐는지 확인**

`scratchpad/verify-holdings-updated.mjs`:

```javascript
import { getSupabaseAdminClient } from "d:/클로드/.claude/skills/_lib/supabase.mjs";

const supabase = getSupabaseAdminClient();
const { data } = await supabase.from("holdings").select("ticker, last_price, price_updated_at");
console.log(JSON.stringify(data, null, 2));
```

Run: `node scratchpad/verify-holdings-updated.mjs`
Expected: NVDA, VRT 모두 `last_price`가 숫자로 채워지고 `price_updated_at`이 방금 시각.

- [ ] **Step 4: `price_sync_runs`에 로그가 쌓였는지 확인**

`scratchpad/verify-sync-log.mjs`:

```javascript
import { getSupabaseAdminClient } from "d:/클로드/.claude/skills/_lib/supabase.mjs";

const supabase = getSupabaseAdminClient();
const { data } = await supabase
  .from("price_sync_runs")
  .select("*")
  .order("started_at", { ascending: false })
  .limit(3);
console.log(JSON.stringify(data, null, 2));
```

Run: `node scratchpad/verify-sync-log.mjs`
Expected: 최소 1개 행, `status: "success"`, `synced_count: 2`.

- [ ] **Step 5: 임시 검증 스크립트 삭제, dev 서버 종료**

Run: `rm scratchpad/verify-cron-route.mjs scratchpad/verify-holdings-updated.mjs scratchpad/verify-sync-log.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/toss-price-sync/route.ts
git commit -m "Add cron route handler for Toss price sync with CRON_SECRET auth"
```

---

## Task 6: 대시보드 표시 (평가손익 + 갱신 상태)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `holdings` 테이블의 `last_price`, `price_updated_at` (Task 1에서 추가됨); `price_sync_runs` 최신 행.
- Produces: 대시보드 페이지에 평가손익 표시 + 상단 동기화 상태 배지. 다른 태스크가 이 파일을 더 참조하지 않으므로 인터페이스 계약 없음.

- [ ] **Step 1: `src/app/page.tsx` 수정**

기존 파일 전체를 다음으로 교체:

```typescript
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function Home() {
  const supabase = createAdminClient();

  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("id, account_id, ticker, name, quantity, avg_cost, last_price, price_updated_at, accounts(name, market)")
    .order("updated_at", { ascending: false });

  if (error) {
    return <div className="p-8 text-red-600">보유종목을 불러오지 못했습니다: {error.message}</div>;
  }

  const { data: lastRun } = await supabase
    .from("price_sync_runs")
    .select("status, finished_at, failed_tickers, error_message")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.quantity) * Number(h.avg_cost),
    0
  );

  const totalValue = (holdings ?? []).reduce((sum, h) => {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    return sum + Number(h.quantity) * price;
  }, 0);

  function formatRelativeTime(iso: string | null | undefined) {
    if (!iso) return "갱신 기록 없음";
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}시간 전`;
  }

  const syncBadge = !lastRun ? (
    <span className="text-xs text-gray-400">시세 동기화 이력 없음</span>
  ) : lastRun.status === "success" ? (
    <span className="text-xs text-green-600">
      시세 갱신: {formatRelativeTime(lastRun.finished_at)}
    </span>
  ) : (
    <span className="text-xs text-red-600" title={lastRun.error_message ?? lastRun.failed_tickers?.join(", ")}>
      시세 갱신 {lastRun.status === "partial" ? "일부 실패" : "실패"}: {formatRelativeTime(lastRun.finished_at)}
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">보유종목</h1>
        {syncBadge}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">총 매수원가 합계</div>
          <div className="text-xl font-semibold">{totalCost.toLocaleString()}원</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">총 평가금액</div>
          <div className="text-xl font-semibold">{totalValue.toLocaleString()}원</div>
        </div>
      </div>

      <ul className="space-y-2">
        {(holdings ?? []).map((h) => {
          const account = h.accounts as unknown as { name: string; market: string } | null;
          const hasPrice = h.last_price != null;
          const profitLoss = hasPrice
            ? (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity)
            : null;

          return (
            <li key={h.id} className="rounded border px-4 py-3">
              <div className="font-medium">
                {h.name} ({h.ticker})
              </div>
              <div className="text-sm text-gray-500">
                {account?.name ?? "알 수 없는 계좌"} · {h.quantity}주 · 평단가{" "}
                {Number(h.avg_cost).toLocaleString()}원
              </div>
              <div className="text-sm">
                {hasPrice ? (
                  <span className={profitLoss! >= 0 ? "text-red-600" : "text-blue-600"}>
                    현재가 {Number(h.last_price).toLocaleString()}원 · 평가손익{" "}
                    {profitLoss! >= 0 ? "+" : ""}
                    {profitLoss!.toLocaleString()}원
                  </span>
                ) : (
                  <span className="text-gray-400">시세 미확인</span>
                )}
              </div>
            </li>
          );
        })}
        {(holdings ?? []).length === 0 && (
          <li className="text-gray-500">
            보유종목이 없습니다. <Link href="/trades" className="underline">매매기록</Link>을 입력해보세요.
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 브라우저로 실제 확인**

Run: `npm run dev` (아직 안 띄웠다면)
브라우저에서 `http://localhost:3000` 접속.

Expected: 상단에 초록색 "시세 갱신: N분 전" 배지, NVDA/VRT 각각 현재가와 평가손익(빨강=이익, 파랑=손실)이 표시됨. "총 평가금액" 카드가 매수원가와 다른 값으로 표시됨.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "Show last price, profit/loss, and sync status badge on dashboard"
```

---

## Task 7: GitHub Actions 5분 간격 스케줄러

**Files:**
- Create: `.github/workflows/toss-price-sync.yml`

**Interfaces:**
- Consumes: GitHub repo secrets `CRON_SECRET`, `VERCEL_APP_URL`(배포된 앱 도메인).
- Produces: 5분마다 `/api/cron/toss-price-sync`를 호출하는 워크플로우. 이후 태스크 없음(최종 태스크).

- [ ] **Step 1: 워크플로우 파일 작성**

```yaml
name: Toss Price Sync

on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Call price sync endpoint
        run: |
          curl -f -sS \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.VERCEL_APP_URL }}/api/cron/toss-price-sync"
```

- [ ] **Step 2: GitHub repo secrets 등록 안내**

사용자가 GitHub 저장소(`https://github.com/miyocho69-ux/-`) Settings → Secrets and variables → Actions에서 다음을 등록해야 함을 안내:
- `CRON_SECRET`: `.env.local`에 넣은 값과 동일한 값
- `VERCEL_APP_URL`: 배포된 앱 도메인, 예: `https://stock-blond-six.vercel.app` (프로토콜 포함, 끝에 슬래시 없이)

이 단계는 Claude가 대신 등록할 수 없으므로(GitHub 웹 UI 또는 `gh secret set` 명령이 필요하고 시크릿 값을 대화에 노출하지 않아야 함) 사용자에게 직접 요청.

- [ ] **Step 3: Vercel 환경변수 등록 안내**

Vercel 프로젝트 설정 → Environment Variables에 다음을 등록해야 함을 안내:
- `TOSS_CLIENT_ID`
- `TOSS_CLIENT_SECRET`
- `CRON_SECRET` (GitHub secret과 동일한 값)

- [ ] **Step 4: `git push origin main`으로 배포**

Run: `git push origin main`
Expected: Vercel이 자동으로 새 배포 시작(기존 배포 관례).

- [ ] **Step 5: GitHub Actions 수동 실행으로 배포 환경 종단 검증**

사용자가 GitHub 저장소 Actions 탭에서 "Toss Price Sync" 워크플로우를 `workflow_dispatch`로 1회 수동 실행.

Expected: 워크플로우 성공(초록 체크). 실패 시 로그에서 401(secret 불일치)인지 500(서버 에러)인지 확인.

- [ ] **Step 6: 배포된 대시보드에서 최종 확인**

브라우저에서 `https://stock-blond-six.vercel.app` 접속.

Expected: 로컬에서 확인한 것과 동일하게 시세 갱신 배지와 평가손익이 표시됨.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/toss-price-sync.yml
git commit -m "Add GitHub Actions workflow to trigger Toss price sync every 5 minutes"
```

---

## Self-Review 결과

- **Spec coverage**: 설계 문서의 6개 섹션(자격증명 저장, 토큰 발급/캐싱, 시세 조회/갱신, 스키마 변경, API 라우트, GitHub Actions, 대시보드 표시) 모두 Task 1~7에 매핑됨. 검증 방법 5개 항목도 각 태스크의 Step에 반영됨.
- **Placeholder scan**: "TBD"/"나중에"/뭉뚱그린 지시 없음. 모든 코드 스텝에 완전한 코드 포함.
- **Type consistency**: `SyncResult` 인터페이스가 Task 4에서 정의되고 Task 5에서 그대로 사용됨. `getTossAccessToken(): Promise<string>`이 Task 3에서 정의되고 Task 4에서 그대로 소비됨. 컬럼명(`last_price`, `price_updated_at`, `failed_tickers`, `synced_count`)이 Task 1(스키마)과 Task 4/5(코드)에서 동일하게 사용됨.
