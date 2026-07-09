# 다크 터미널 대시보드 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** claude.ai/design에서 받은 "STOCK TERM" 다크 터미널 프로토타입을, 이 저장소의 4개 화면(홈/계좌관리/매매기록/계좌분석)과 전역 크롬(네비/사이드바)에 그대로 재현한다.

**Architecture:** Next.js App Router 서버 컴포넌트로 데이터 조회는 그대로 유지하고, 인터랙션이 필요한 부분(탭, 필터, 인라인 편집, 차트 호버)만 `"use client"` 컴포넌트로 감싼다. 차트는 Recharts로 신규 도입. 지수 시세는 Yahoo Finance 비공식 API를 서버에서 직접 fetch(단명 캐시, 실패 시 null 관대 처리).

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / Supabase / Recharts(신규) / next/font (JetBrains Mono, Noto Sans KR)

## Global Constraints

- 색상: 상승=`#f5495c`(빨강), 하락=`#3f8cff`(파랑) — 국내 관례, 반대로 쓰지 말 것.
- 액센트: teal `#24d3b5`. 페이지 배경 `#080a10`, 카드 `#0e121a`, 사이드바/네비 `#0b0e16`.
- 숫자/티커/날짜는 항상 JetBrains Mono, UI 텍스트는 Noto Sans KR.
- 이번 리디자인은 **항상 다크 테마 고정**(라이트/시스템 분기 제거).
- 공포·탐욕 지수 카드는 만들지 않는다. 로고 업로드는 이번 범위에 없다(이니셜 배지만).
- Yahoo Finance 연동은 실패해도 절대 페이지 렌더링을 막지 않는다 (`null` 반환 후 `-` 표시).
- `export const dynamic = "force-dynamic"`이 이미 걸린 4개 페이지는 계속 유지한다.
- 각 단계 완료 후 `npm run build` 통과 확인 + 커밋. 가능하면 `npm run dev`로 실제 화면 확인.

---

## 파일 구조 개요

| 파일 | 상태 | 책임 |
|---|---|---|
| `src/app/globals.css` | 수정 | 다크 테마 토큰, 폰트 변수 |
| `src/app/layout.tsx` | 수정 | 폰트 교체, `NavBar` + `MarketSidebar` 배치 |
| `src/components/NavBar.tsx` | 수정 | 다크 테마 네비 (로고, 링크, 날짜) |
| `src/lib/market/indices.ts` | 신규 | Yahoo Finance 지수 조회 |
| `src/components/MarketSidebar.tsx` | 신규 | 우측 시장지표/환율 사이드바 |
| `src/app/page.tsx` | 수정 | 헤더 스타일, 데이터 전달 |
| `src/components/HoldingsMoversCard.tsx` | 수정 | 배지, 필터, 정렬 추가 |
| `src/components/PortfolioTabs.tsx` | 수정 | 다크 pill 스타일 |
| `src/components/ProfitTab.tsx` | 수정 | 다크 카드 스타일 |
| `src/components/TrendTab.tsx` | 수정 | Recharts 라인/영역 차트 |
| `src/components/AllocationTab.tsx` | 수정 | 다크 스타일 |
| `src/components/SectorDonutChart.tsx` | 수정 | Recharts 도넛으로 교체 |
| `src/lib/portfolio/accountStats.ts` | 신규 | 계좌별 통계 공용 유틸 |
| `src/app/accounts/page.tsx` | 수정 | 서버: 통계 계산 후 클라이언트에 전달 |
| `src/components/AccountManageGrid.tsx` | 신규 | 클라이언트: 인라인 편집/삭제/추가 |
| `src/lib/actions/accounts.ts` | 수정 | `renameAccount` 추가 |
| `src/app/trades/page.tsx` | 수정 | 다크 스타일 |
| `src/components/TradeFilterTabs.tsx` | 신규 | 클라이언트: 전체/매수/매도 필터 |
| `src/app/analysis/page.tsx` | 수정 | 계좌 탭, 통계 카드, 보유종목 테이블 |
| `src/components/AccountAnalysisTabs.tsx` | 신규 | 클라이언트: 계좌 탭 전환 |

---

### Task 1: 의존성 추가 + 전역 디자인 토큰 + 폰트

**Files:**
- Modify: `package.json`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: CSS 커스텀 프로퍼티 `--bg-page`, `--bg-panel`, `--bg-panel-alt`, `--bg-nav`, `--border-card`, `--border-pill`, `--border-row`, `--border-input`, `--text-headline`, `--text-body`, `--text-body-secondary`, `--text-tertiary`, `--text-muted`, `--text-faint`, `--color-up`, `--color-down`, `--accent-teal`. `--font-jetbrains-mono`, `--font-noto-sans-kr` (layout.tsx의 `next/font` 변수).

- [ ] **Step 1: Recharts 설치**

Run: `cd "d:\클로드" && npm install recharts`
Expected: `package.json`의 `dependencies`에 `recharts` 추가됨, 설치 성공.

- [ ] **Step 2: `globals.css`를 다크 테마 고정 토큰으로 교체**

`src/app/globals.css` 전체를 다음으로 교체한다:

```css
@import "tailwindcss";

:root {
  --bg-page: #080a10;
  --bg-panel: #0e121a;
  --bg-panel-alt: #11151f;
  --bg-nav: #0b0e16;
  --border-card: #1a1f2b;
  --border-pill: #1e2431;
  --border-row: #161b26;
  --border-input: #2c3342;
  --text-headline: #f5f7fa;
  --text-body: #e7eaf1;
  --text-body-secondary: #c7cddb;
  --text-tertiary: #9aa3b6;
  --text-muted: #7c8598;
  --text-faint: #5b6577;
  --color-up: #f5495c;
  --color-down: #3f8cff;
  --accent-teal: #24d3b5;

  --background: var(--bg-page);
  --foreground: var(--text-body);
  --chart-surface: var(--bg-panel);
  --series-1: #3f8cff;
  --series-2: #f5495c;
  --series-3: #f0b90b;
  --series-4: #24d3b5;
  --series-5: #a78bfa;
  --series-6: #34d399;
  --series-7: #fb7185;
  --series-8: #60a5fa;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-noto-sans-kr);
  --font-mono: var(--font-jetbrains-mono);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: #252b3a; border-radius: 4px; }
::-webkit-scrollbar-track { background: transparent; }

@keyframes livedot {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-noto-sans-kr), sans-serif;
}
```

- [ ] **Step 3: `layout.tsx`에서 폰트를 JetBrains Mono + Noto Sans KR로 교체**

`src/app/layout.tsx`를 다음으로 교체한다:

```tsx
import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_KR } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "주식 포트폴리오 대시보드",
  description: "개인 주식 보유현황 및 매매기록 관리 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#080a10]">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
```

(참고: 우측 사이드바는 Task 3에서 이 파일을 다시 수정해 `flex` 컨테이너로 감싼다.)

- [ ] **Step 4: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 빌드 성공 (기존 컴포넌트들은 아직 옛 클래스명을 쓰므로 시각적으로는 안 맞을 수 있으나 타입/컴파일 에러는 없어야 함).

- [ ] **Step 5: 커밋**

```bash
cd "d:\클로드"
git add package.json package-lock.json src/app/globals.css src/app/layout.tsx
git commit -m "Add dark terminal design tokens, JetBrains Mono/Noto Sans KR fonts, recharts dependency"
```

---

### Task 2: `NavBar` 다크 테마 적용

**Files:**
- Modify: `src/components/NavBar.tsx`

**Interfaces:**
- Consumes: 없음 (순수 UI, props 없음).
- Produces: 변경 없음 (export `NavBar` 컴포넌트, 시그니처 동일).

- [ ] **Step 1: `NavBar.tsx`를 프로토타입 스펙대로 교체**

`src/components/NavBar.tsx`:

```tsx
import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "홈" },
  { href: "/accounts", label: "계좌 관리" },
  { href: "/trades", label: "매매기록" },
  { href: "/analysis", label: "계좌 분석" },
];

function todayKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

export function NavBar() {
  return (
    <header
      className="flex h-[60px] shrink-0 items-center gap-9 border-b px-7"
      style={{ background: "var(--bg-nav)", borderColor: "var(--border-card)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-[9px] w-[9px] rounded-full"
          style={{ background: "var(--accent-teal)", animation: "livedot 2s infinite" }}
        />
        <span
          className="font-mono text-base font-bold tracking-wide"
          style={{ color: "var(--text-headline)" }}
        >
          STOCK<span style={{ color: "var(--accent-teal)" }}>TERM</span>
        </span>
      </div>
      <nav className="flex gap-1">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-[#161b26]"
            style={{ color: "var(--text-muted)" }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
        {todayKst()} 기준
      </div>
    </header>
  );
}
```

참고: 프로토타입은 활성 링크를 `bg-[#161b26]` + 밝은 텍스트로 강조하지만, 이 프로젝트는 서버 컴포넌트 `NavBar`라 현재 경로를 알 수 없다. `usePathname()`을 쓰려면 클라이언트 컴포넌트 전환이 필요한데, 이는 스펙에 없는 추가 범위이므로 이번 태스크에서는 hover 스타일만 두고 활성 강조는 생략한다(모든 링크가 `text-muted`로 동일하게 보임). 이후 필요해지면 별도 태스크로 `"use client"` + `usePathname()` 전환.

- [ ] **Step 2: 빌드 + 개발서버로 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공.

Run (선택, 시각 확인용): `npm run dev` 후 브라우저로 모든 페이지에서 네비가 다크로 보이는지 확인.

- [ ] **Step 3: 커밋**

```bash
cd "d:\클로드"
git add src/components/NavBar.tsx
git commit -m "Apply dark terminal styling to NavBar"
```

---

### Task 3: Yahoo Finance 지수 연동 + 우측 사이드바

**Files:**
- Create: `src/lib/market/indices.ts`
- Create: `src/components/MarketSidebar.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `getMarketIndices(): Promise<IndexQuote[]>` where
  ```ts
  export interface IndexQuote {
    key: "kospi" | "kosdaq" | "sp500" | "vix";
    label: string;
    price: number | null;
    changePct: number | null;
  }
  ```
- Consumes (in `MarketSidebar`): `getMarketIndices()`, `getStoredUsdKrwRate(supabase)` (기존, `src/lib/toss/exchangeRate.ts`), `createAdminClient()` (기존).

- [ ] **Step 1: `src/lib/market/indices.ts` 작성**

```ts
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
```

- [ ] **Step 2: `src/components/MarketSidebar.tsx` 작성**

```tsx
import { getMarketIndices } from "@/lib/market/indices";
import { getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";
import { createAdminClient } from "@/lib/supabase/admin";

function formatIndexValue(price: number | null): string {
  if (price == null) return "-";
  return price.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function formatChangePct(pct: number | null): string {
  if (pct == null) return "-";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function changeColor(pct: number | null): string {
  if (pct == null) return "var(--text-faint)";
  return pct >= 0 ? "var(--color-up)" : "var(--color-down)";
}

export async function MarketSidebar() {
  const [indices, usdKrwRate] = await Promise.all([
    getMarketIndices(),
    getStoredUsdKrwRate(createAdminClient()),
  ]);

  return (
    <aside
      className="w-[280px] shrink-0 overflow-auto border-l px-4 py-5"
      style={{ borderColor: "var(--border-card)", background: "var(--bg-nav)" }}
    >
      <div
        className="mb-3 text-xs font-bold tracking-wide"
        style={{ color: "var(--text-faint)" }}
      >
        시장 지표
      </div>
      {indices.map((idx) => (
        <div
          key={idx.key}
          className="flex items-center justify-between border-b py-2.5"
          style={{ borderColor: "var(--border-row)" }}
        >
          <div className="text-sm" style={{ color: "var(--text-body-secondary)" }}>
            {idx.label}
          </div>
          <div className="text-right">
            <div className="font-mono text-sm" style={{ color: "var(--text-body)" }}>
              {formatIndexValue(idx.price)}
            </div>
            <div className="font-mono text-xs" style={{ color: changeColor(idx.changePct) }}>
              {formatChangePct(idx.changePct)}
            </div>
          </div>
        </div>
      ))}

      <div
        className="mt-5 mb-2.5 text-xs font-bold tracking-wide"
        style={{ color: "var(--text-faint)" }}
      >
        환율
      </div>
      <div className="flex items-center justify-between py-2.5">
        <div className="text-sm" style={{ color: "var(--text-body-secondary)" }}>
          USD/KRW
        </div>
        <div className="text-right">
          <div className="font-mono text-sm" style={{ color: "var(--text-body)" }}>
            {usdKrwRate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </aside>
  );
}
```

참고: 프로토타입은 환율에도 등락률(전일 대비 %)을 보여주지만, `getStoredUsdKrwRate`는 현재 값만 저장하고 전일 값을 별도로 추적하지 않는다. 이 태스크 범위에서는 등락률 없이 현재 환율만 표시한다(스펙에도 "이미 확보된 값을 그대로 사용"이라 명시).

- [ ] **Step 3: `layout.tsx`에 사이드바 배치**

`src/app/layout.tsx`의 `body` 내부를 수정한다:

```tsx
import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_KR } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { MarketSidebar } from "@/components/MarketSidebar";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "주식 포트폴리오 대시보드",
  description: "개인 주식 보유현황 및 매매기록 관리 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-full flex-col bg-[#080a10]">
        <NavBar />
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">{children}</div>
          <MarketSidebar />
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공.

- [ ] **Step 5: dev 서버로 실제 지수 값 표시 확인**

Run: `npm run dev` (백그라운드) 후 브라우저에서 `http://localhost:3000` 접속, 우측에 코스피/코스닥/S&P500/VIX 값과 환율이 표시되는지 확인. 값이 안 나오면 `-`로라도 깨지지 않고 나오는지 확인.

- [ ] **Step 6: 커밋**

```bash
cd "d:\클로드"
git add src/lib/market/indices.ts src/components/MarketSidebar.tsx src/app/layout.tsx
git commit -m "Add Yahoo Finance index quotes and right-hand market sidebar"
```

---

### Task 4: 홈 화면 헤더 + `HoldingsMoversCard` 다크 리디자인

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/HoldingsMoversCard.tsx`

**Interfaces:**
- Consumes: 기존 `HoldingMover { name, ticker, changeRate, changeAmount }` (변경 없음), 기존 `computeHoldingsMovers()` (변경 없음).
- Produces: `HoldingsMoversCardProps`에 `accounts?: { id: string; name: string }[]` 및 각 mover에 `accountId?: string` 필드 추가 필요 — 계좌 필터를 위해 `HoldingMover`에 `accountId: string` 추가.

- [ ] **Step 1: `HoldingMover` 타입에 `accountId` 추가, `page.tsx`에서 채워서 전달**

`src/components/HoldingsMoversCard.tsx`의 상단 인터페이스를 수정:

```ts
export interface HoldingMover {
  name: string;
  ticker: string;
  accountId: string;
  changeRate: number; // (last_price - avg_cost) / avg_cost * 100
  changeAmount: number; // 원화 환산된 평가손익
}

export interface HoldingsMoversCardProps {
  movers: HoldingMover[];
  accounts: { id: string; name: string }[];
}
```

- [ ] **Step 2: `HoldingsMoversCard`를 클라이언트 컴포넌트로 전환, 배지/필터/정렬 추가**

`src/components/HoldingsMoversCard.tsx` 전체 교체:

```tsx
"use client";

import { useMemo, useState } from "react";

export interface HoldingMover {
  name: string;
  ticker: string;
  accountId: string;
  changeRate: number; // (last_price - avg_cost) / avg_cost * 100
  changeAmount: number; // 원화 환산된 평가손익
}

export interface HoldingsMoversCardProps {
  movers: HoldingMover[];
  accounts: { id: string; name: string }[];
}

const BADGE_PALETTE = [
  "#3f8cff", "#f5495c", "#f0b90b", "#24d3b5", "#a78bfa",
  "#fb7185", "#34d399", "#60a5fa", "#f59e0b", "#c084fc",
];

function formatSignedRate(rate: number): string {
  const sign = rate >= 0 ? "+" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

function formatSignedAmount(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${Math.round(amount).toLocaleString()}원`;
}

function monogram(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

export function HoldingsMoversCard({ movers, accounts }: HoldingsMoversCardProps) {
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const filtered = useMemo(
    () => movers.filter((m) => accountFilter === "all" || m.accountId === accountFilter),
    [movers, accountFilter]
  );
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        sortDir === "desc" ? b.changeRate - a.changeRate : a.changeRate - b.changeRate
      ),
    [filtered, sortDir]
  );

  if (movers.length === 0) {
    return (
      <div
        className="rounded-2xl border p-4"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        <h3 className="mb-2 font-semibold" style={{ color: "var(--text-headline)" }}>
          보유종목 등락 현황
        </h3>
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          시세가 아직 확인되지 않았습니다.
        </p>
      </div>
    );
  }

  const filterTabs = [{ id: "all", name: "전체" }, ...accounts];

  return (
    <div
      className="rounded-2xl border"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3.5 px-4.5 pb-2.5 pt-4">
        <div className="flex items-baseline gap-2">
          <div className="text-[15px] font-bold" style={{ color: "var(--text-body)" }}>
            보유종목 등락 현황
          </div>
          <div className="text-xs" style={{ color: "var(--text-faint)" }}>
            {sorted.length}/{movers.length}종목
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-[3px] rounded-lg border p-[3px]"
            style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
          >
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAccountFilter(tab.id)}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold"
                style={
                  accountFilter === tab.id
                    ? { background: "#1a2130", color: "var(--accent-teal)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {tab.name}
              </button>
            ))}
          </div>
          <div
            className="flex gap-[3px] rounded-lg border p-[3px]"
            style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
          >
            <button
              onClick={() => setSortDir("desc")}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold"
              style={
                sortDir === "desc"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
            >
              등락률 ↓
            </button>
            <button
              onClick={() => setSortDir("asc")}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold"
              style={
                sortDir === "asc"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
            >
              등락률 ↑
            </button>
          </div>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {sorted.map((m, i) => (
          <div
            key={m.ticker}
            className="flex items-center gap-3 border-t px-4.5 py-2.5"
            style={{ borderColor: "var(--border-row)" }}
          >
            <div
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-[10px] font-bold"
              style={{ background: BADGE_PALETTE[i % BADGE_PALETTE.length], color: "#0a0d13" }}
            >
              {monogram(m.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-medium"
                style={{ color: "var(--text-body)" }}
              >
                {m.name}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                {m.ticker}
              </div>
            </div>
            <div
              className="text-right font-mono text-[13px] font-semibold"
              style={{ color: m.changeRate >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedRate(m.changeRate)}
            </div>
            <div
              className="w-[130px] text-right font-mono text-[13px]"
              style={{ color: m.changeAmount >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedAmount(m.changeAmount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

주의: 카드 제목/라벨은 스펙에 따라 "오늘 등락"이 아니라 "보유종목 등락 현황"(평단가 대비 평가손익 의미)으로 그대로 유지 — 기존 문구가 이미 "오늘"이라는 말을 쓰지 않으므로 변경 불필요.

- [ ] **Step 3: `page.tsx`에서 `accountId` 채우기 + `accounts` 전달 + 헤더 스타일**

`src/app/page.tsx`의 `computeHoldingsMovers` 함수 시그니처와 반환값을 수정한다 (118행 근처):

```ts
function computeHoldingsMovers(
  holdings: {
    account_id: string;
    ticker: string;
    name: string;
    quantity: number;
    avg_cost: number;
    last_price: number | null;
  }[],
  usdKrwRate: number
): { name: string; ticker: string; accountId: string; changeRate: number; changeAmount: number }[] {
  const totals = new Map<
    string,
    { name: string; accountId: string; costBasis: number; changeAmount: number }
  >();

  for (const h of holdings) {
    if (h.last_price == null) continue;
    const costBasis = toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate);
    const changeAmount = toKrw(
      (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity),
      h.ticker,
      usdKrwRate
    );

    const existing = totals.get(h.ticker);
    if (existing) {
      existing.costBasis += costBasis;
      existing.changeAmount += changeAmount;
    } else {
      totals.set(h.ticker, { name: h.name, accountId: h.account_id, costBasis, changeAmount });
    }
  }

  return Array.from(totals.entries()).map(([ticker, { name, accountId, costBasis, changeAmount }]) => ({
    name,
    ticker,
    accountId,
    changeAmount,
    changeRate: costBasis > 0 ? (changeAmount / costBasis) * 100 : 0,
  }));
}
```

(참고: 같은 티커가 여러 계좌에 나뉘어 있으면 첫 계좌 id로 귀속된다 — 기존 groupByTicker의 관례와 동일하게 첫 등장 계좌를 대표로 삼는다. 계좌 필터는 근사치 필터 용도이므로 문제 없음.)

`Home` 컴포넌트 안의 렌더링 부분을 다음으로 교체한다:

```tsx
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-7 pb-[60px]">
      <div className="mb-1 flex flex-wrap items-end gap-5">
        <div>
          <div className="mb-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            총 평가금액
          </div>
          <div
            className="font-mono text-[40px] font-bold tracking-tight"
            style={{ color: "var(--text-headline)" }}
          >
            {Math.round(totalValue).toLocaleString()}원
          </div>
        </div>
      </div>

      <HoldingsMoversCard movers={movers} accounts={accounts ?? []} />

      <PortfolioTabs
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
        trendTab={<TrendTab snapshots={snapshots ?? []} />}
        allocationTab={
          <AllocationTab
            byTicker={byTicker}
            accounts={accounts ?? []}
            byAccountTicker={byAccountTicker}
          />
        }
      />
    </div>
  );
```

`movers` 변수 선언부(`const movers: HoldingMover[] = ...`)는 새 반환 타입에 맞춰 타입 임포트만 그대로 두면 된다(구조가 호환됨).

- [ ] **Step 4: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공. 타입 에러 있으면 `HoldingMover` import 경로/필드 누락 확인.

- [ ] **Step 5: dev 서버로 확인**

`npm run dev` 후 홈 화면에서 총 평가금액 헤더와 보유종목 카드(배지, 계좌 필터, 정렬 토글)가 다크 스타일로 정상 동작하는지 확인.

- [ ] **Step 6: 커밋**

```bash
cd "d:\클로드"
git add src/app/page.tsx src/components/HoldingsMoversCard.tsx
git commit -m "Redesign home header and holdings movers card with dark theme, account filter, sort"
```

---

### Task 5: 수익 탭 다크 스타일 + Recharts 추이/비중 차트

**Files:**
- Modify: `src/components/PortfolioTabs.tsx`
- Modify: `src/components/ProfitTab.tsx`
- Modify: `src/components/TrendTab.tsx`
- Modify: `src/components/AllocationTab.tsx`
- Modify: `src/components/SectorDonutChart.tsx`

**Interfaces:**
- Consumes: `recharts` (Task 1에서 설치됨) — `AreaChart`, `Area`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `PieChart`, `Pie`, `Cell`, `Legend`.
- Produces: `TrendTabProps`, `AllocationTabProps`, `SectorSlice` 타입은 변경 없음 (기존 그대로 재사용).

- [ ] **Step 1: `PortfolioTabs.tsx` 다크 pill 스타일 적용**

`src/components/PortfolioTabs.tsx`의 return 블록을 교체:

```tsx
  return (
    <div className="space-y-4">
      <div
        className="flex w-fit gap-1.5 rounded-xl border p-1"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className="rounded-lg px-5.5 py-2.5 text-[13px] font-bold"
            style={
              active === tab.key
                ? { background: "#1a2130", color: "var(--accent-teal)" }
                : { color: "var(--text-muted)" }
            }
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
```

- [ ] **Step 2: `ProfitTab.tsx` 다크 카드 스타일 적용**

`src/components/ProfitTab.tsx`의 `ProfitTab` 함수 return 블록을 교체 (BarChart는 그대로 두되 색상만 토큰화):

```tsx
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const [hovered, setHovered] = useState<{ label: string; value: number } | null>(null);
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));

  return (
    <div className="relative">
      {hovered && (
        <div
          className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs shadow"
          style={{ background: "var(--border-row)", color: "var(--text-body)" }}
        >
          {hovered.label}: {formatSigned(hovered.value)}
        </div>
      )}
      <div className="flex h-32 items-end gap-0.5 overflow-x-auto">
        {data.map((d) => {
          const heightPct = (Math.abs(d.value) / maxAbs) * 100;
          return (
            <div
              key={d.label}
              className="flex min-w-[6px] flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHovered(d)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${heightPct}%`,
                  minHeight: d.value !== 0 ? "2px" : "0",
                  background: d.value >= 0 ? "var(--color-up)" : "var(--color-down)",
                }}
              />
            </div>
          );
        })}
      </div>
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

  const cardStyle = { background: "var(--bg-panel)", borderColor: "var(--border-card)" };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3.5">
        <div className="rounded-xl border p-4.5" style={cardStyle}>
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            평가손익 (오늘)
          </div>
          <div
            className="font-mono text-[22px] font-bold"
            style={{ color: unrealizedPnl >= 0 ? "var(--color-up)" : "var(--color-down)" }}
          >
            {formatSigned(unrealizedPnl)}
          </div>
        </div>
        <div className="rounded-xl border p-4.5" style={cardStyle}>
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            실현손익
          </div>
          <div
            className="font-mono text-[22px] font-bold"
            style={{ color: realizedPnl >= 0 ? "var(--color-up)" : "var(--color-down)" }}
          >
            {formatSigned(realizedPnl)}
          </div>
        </div>
        <div
          className="rounded-xl border p-4.5"
          style={{ background: "var(--bg-panel)", borderColor: "#24d3b533" }}
        >
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            총 손익 (실현+평가)
          </div>
          <div
            className="font-mono text-[22px] font-bold"
            style={{
              color: unrealizedPnl + realizedPnl >= 0 ? "var(--color-up)" : "var(--color-down)",
            }}
          >
            {formatSigned(unrealizedPnl + realizedPnl)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4.5" style={cardStyle}>
        <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
          총 실현수익률
        </div>
        <div
          className="font-mono text-xl font-bold"
          style={{ color: totalRealizedRate >= 0 ? "var(--color-up)" : "var(--color-down)" }}
        >
          {totalRealizedRate >= 0 ? "+" : ""}
          {totalRealizedRate.toFixed(2)}%
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: "var(--text-body)" }}>
            실현손익 차트
          </h3>
          <div
            className="flex gap-1 rounded-md border p-0.5 text-xs"
            style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
          >
            <button
              onClick={() => setRange("daily")}
              className="rounded px-2 py-1"
              style={
                range === "daily"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
            >
              일별
            </button>
            <button
              onClick={() => setRange("monthly")}
              className="rounded px-2 py-1"
              style={
                range === "monthly"
                  ? { background: "#1a2130", color: "var(--accent-teal)" }
                  : { color: "var(--text-muted)" }
              }
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

(주석: 헤드라인 카드는 프로토타입처럼 "평가손익(오늘)"이라는 라벨을 쓰지만, 실제로는 스냅샷 기반 오늘 값이 아니라 현재 시점 평가손익 전체다. 기존 코드의 의미를 바꾸지 않고 라벨만 프로토타입에 맞춘다.)

- [ ] **Step 3: `TrendTab.tsx`를 Recharts `ComposedChart`로 교체**

`src/components/TrendTab.tsx`의 `LineChart` 함수와 렌더 부분을 교체 (파일 상단 `useState` import 아래에 recharts import 추가):

```tsx
"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  const cutoffStr = toLocalDateString(cutoff);
  return snapshots.filter((s) => s.date >= cutoffStr);
}

function TrendChart({ snapshots }: { snapshots: TrendTabProps["snapshots"] }) {
  if (snapshots.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-faint)" }}>
        표시할 데이터가 없습니다.
      </p>
    );
  }

  const data = snapshots.map((s) => ({
    date: s.date,
    원금: Math.round(s.total_cost),
    총자산: Math.round(s.total_value),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border-row)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(5)}
          axisLine={{ stroke: "var(--border-row)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          tickFormatter={(v: number) => `${Math.round(v / 10000).toLocaleString()}만`}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: "var(--border-row)",
            border: "1px solid var(--border-input)",
            borderRadius: 8,
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 12,
          }}
          formatter={(value: number) => `${value.toLocaleString()}원`}
        />
        <Area
          type="monotone"
          dataKey="총자산"
          stroke="var(--accent-teal)"
          strokeWidth={2.5}
          fill="rgba(36,211,181,0.08)"
        />
        <Line
          type="monotone"
          dataKey="원금"
          stroke="var(--text-faint)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TrendTab({ snapshots }: TrendTabProps) {
  const [range, setRange] = useState<RangeKey>("all");
  const filtered = filterByRange(snapshots, range);
  const latest = filtered[filtered.length - 1];

  return (
    <div
      className="space-y-4 rounded-xl border p-5"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      {latest && (
        <div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            투자 자산
          </div>
          <div className="font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
            {Math.round(latest.total_value).toLocaleString()}원
          </div>
          <div className="text-sm" style={{ color: "var(--text-faint)" }}>
            원금 {Math.round(latest.total_cost).toLocaleString()}원
          </div>
        </div>
      )}

      <TrendChart snapshots={filtered} />

      <div className="flex flex-wrap gap-1 text-xs">
        {RANGE_LABELS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className="rounded-full border px-3 py-1"
            style={
              range === r.key
                ? { background: "#1a2130", color: "var(--accent-teal)", borderColor: "var(--border-pill)" }
                : { color: "var(--text-muted)", borderColor: "var(--border-pill)" }
            }
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `SectorDonutChart.tsx`를 Recharts `PieChart`로 교체**

`src/components/SectorDonutChart.tsx` 전체 교체:

```tsx
"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const SERIES_COLORS = [
  "#3f8cff", "#f5495c", "#f0b90b", "#24d3b5",
  "#a78bfa", "#34d399", "#fb7185", "#60a5fa",
];

export type SectorSlice = {
  sector: string;
  value: number;
};

export function SectorDonutChart({ slices, title }: { slices: SectorSlice[]; title: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (slices.length === 0 || total <= 0) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        <h3 className="mb-2 font-semibold" style={{ color: "var(--text-body)" }}>
          {title}
        </h3>
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          데이터가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      <h3 className="mb-3 font-semibold" style={{ color: "var(--text-body)" }}>
        {title}
      </h3>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="sector"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              stroke="var(--bg-panel)"
              strokeWidth={2}
            >
              {slices.map((slice, i) => (
                <Cell key={slice.sector} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--border-row)",
                border: "1px solid var(--border-input)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => `${Math.round(value).toLocaleString()}원`}
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="w-full space-y-1 text-sm">
          {slices.map((slice, i) => (
            <li key={slice.sector} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="flex-1 truncate" style={{ color: "var(--text-body-secondary)" }}>
                {slice.sector}
              </span>
              <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                {Math.round(slice.value).toLocaleString()}원 · {((slice.value / total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `AllocationTab.tsx` 다크 스타일 적용**

`src/components/AllocationTab.tsx`의 return 블록을 교체:

```tsx
  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 rounded-lg border p-0.5 text-xs"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        <button
          onClick={() => setView("ticker")}
          className="flex-1 rounded px-3 py-1.5"
          style={
            view === "ticker"
              ? { background: "#1a2130", color: "var(--accent-teal)" }
              : { color: "var(--text-muted)" }
          }
        >
          종목별
        </button>
        <button
          onClick={() => setView("account")}
          className="flex-1 rounded px-3 py-1.5"
          style={
            view === "account"
              ? { background: "#1a2130", color: "var(--accent-teal)" }
              : { color: "var(--text-muted)" }
          }
        >
          계좌별
        </button>
      </div>

      {view === "account" && accounts.length > 0 && (
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{
            background: "var(--border-row)",
            borderColor: "var(--border-input)",
            color: "var(--text-body)",
          }}
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
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          등록된 계좌가 없습니다.
        </p>
      ) : (
        <SectorDonutChart slices={accountSlices} title={`${selectedAccountName} 종목별 비중`} />
      )}
    </div>
  );
```

- [ ] **Step 6: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공. Recharts 타입 관련 에러가 나면 `formatter` 콜백의 인자 타입을 `recharts`가 요구하는 형태(`ValueType`)로 맞추거나 `number`로 캐스팅.

- [ ] **Step 7: dev 서버로 확인**

`npm run dev` 후 홈 화면 수익/추이/비중 탭 모두 확인 — 특히 추이 탭 차트 호버 시 툴팁이 뜨는지, 비중 탭 도넛이 정상 렌더링되는지, `/analysis` 페이지의 기존 `SectorDonutChart` 사용처도 깨지지 않는지 확인.

- [ ] **Step 8: 커밋**

```bash
cd "d:\클로드"
git add src/components/PortfolioTabs.tsx src/components/ProfitTab.tsx src/components/TrendTab.tsx src/components/AllocationTab.tsx src/components/SectorDonutChart.tsx
git commit -m "Apply dark theme to profit/allocation tabs, replace hand-rolled SVG charts with Recharts"
```

---

### Task 6: 계좌별 통계 공용 유틸

**Files:**
- Create: `src/lib/portfolio/accountStats.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AccountStatsHolding {
    account_id: string;
    ticker: string;
    quantity: number;
    avg_cost: number;
    last_price: number | null;
  }
  export interface AccountStats {
    totalValue: number;
    todayPnl: number;
    todayPnlPct: number;
    totalCostBasis: number;
  }
  export function computeAccountStats(
    holdings: AccountStatsHolding[],
    usdKrwRate: number,
    accountId?: string
  ): AccountStats;
  ```
- Consumes: `toKrw` (기존, `src/lib/portfolio/currency.ts`).

- [ ] **Step 1: `src/lib/portfolio/accountStats.ts` 작성**

```ts
import { toKrw } from "@/lib/portfolio/currency";

export interface AccountStatsHolding {
  account_id: string;
  ticker: string;
  quantity: number;
  avg_cost: number;
  last_price: number | null;
}

export interface AccountStats {
  totalValue: number;
  todayPnl: number;
  todayPnlPct: number;
  totalCostBasis: number;
}

/**
 * 계좌(또는 전체, accountId 생략 시)의 평가금액/평가손익/평가손익률을 계산한다.
 * "오늘"이라는 이름이 붙었지만 실제로는 전일 종가가 없어 평단가 대비 평가손익을 의미한다
 * (HoldingsMoversCard와 동일한 관례).
 */
export function computeAccountStats(
  holdings: AccountStatsHolding[],
  usdKrwRate: number,
  accountId?: string
): AccountStats {
  const scoped =
    accountId == null ? holdings : holdings.filter((h) => h.account_id === accountId);

  let totalValue = 0;
  let totalCostBasis = 0;
  let todayPnl = 0;

  for (const h of scoped) {
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
    const costBasis = toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate);
    totalValue += value;
    totalCostBasis += costBasis;
    if (h.last_price != null) {
      todayPnl += toKrw(
        (Number(h.last_price) - Number(h.avg_cost)) * Number(h.quantity),
        h.ticker,
        usdKrwRate
      );
    }
  }

  const todayPnlPct = totalCostBasis > 0 ? (todayPnl / totalCostBasis) * 100 : 0;

  return { totalValue, todayPnl, todayPnlPct, totalCostBasis };
}
```

- [ ] **Step 2: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공 (아직 아무도 이 파일을 import하지 않으므로 순수 추가).

- [ ] **Step 3: 커밋**

```bash
cd "d:\클로드"
git add src/lib/portfolio/accountStats.ts
git commit -m "Add computeAccountStats shared utility for per-account portfolio stats"
```

---

### Task 7: 계좌 관리 페이지 — 클라이언트 컴포넌트 전환 + 인라인 편집

**Files:**
- Modify: `src/lib/actions/accounts.ts`
- Create: `src/components/AccountManageGrid.tsx`
- Modify: `src/app/accounts/page.tsx`

**Interfaces:**
- Produces: `renameAccount(accountId: string, name: string): Promise<void>` (Server Action, `src/lib/actions/accounts.ts`).
- Produces: `AccountManageGrid` props:
  ```ts
  interface AccountCardData {
    id: string;
    name: string;
    totalValue: number;
    todayPnlPct: number;
    holdingCount: number;
  }
  interface AccountManageGridProps {
    accounts: AccountCardData[];
  }
  ```
- Consumes: `computeAccountStats` (Task 6), `createAccount`/`deleteAccount`(기존)/`renameAccount`(신규).

- [ ] **Step 1: `renameAccount` Server Action 추가**

`src/lib/actions/accounts.ts`에 함수 추가:

```ts
export async function renameAccount(accountId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("계좌 이름은 비어 있을 수 없습니다.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("accounts").update({ name: trimmed }).eq("id", accountId);
  if (error) throw error;

  revalidatePath("/accounts");
  revalidatePath("/");
  revalidatePath("/analysis");
}
```

- [ ] **Step 2: `AccountManageGrid.tsx` 작성**

```tsx
"use client";

import { useState, useTransition } from "react";
import { createAccount, deleteAccount, renameAccount } from "@/lib/actions/accounts";

interface AccountCardData {
  id: string;
  name: string;
  totalValue: number;
  todayPnlPct: number;
  holdingCount: number;
}

interface AccountManageGridProps {
  accounts: AccountCardData[];
}

function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString()}원`;
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function AccountCard({ account }: { account: AccountCardData }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(account.name);
  const [isPending, startTransition] = useTransition();

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await renameAccount(account.id, trimmed);
      setIsEditing(false);
    });
  };

  const onDelete = () => {
    if (!window.confirm(`${account.name} 계좌를 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      await deleteAccount(account.id);
    });
  };

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {isEditing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            placeholder="계좌 이름"
            className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
            style={{
              background: "var(--border-row)",
              borderColor: "var(--border-input)",
              color: "var(--text-body)",
            }}
          />
        ) : (
          <div
            className="truncate text-sm font-semibold"
            style={{ color: "var(--text-body-secondary)" }}
          >
            {account.name}
          </div>
        )}
        <div className="flex shrink-0 gap-1">
          {isEditing ? (
            <button
              onClick={commit}
              disabled={isPending}
              className="whitespace-nowrap rounded-md px-2 py-1 text-[11px]"
              style={{ color: "var(--accent-teal)" }}
            >
              저장
            </button>
          ) : (
            <button
              onClick={() => {
                setDraft(account.name);
                setIsEditing(true);
              }}
              className="whitespace-nowrap rounded-md px-2 py-1 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              수정
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={isPending}
            className="whitespace-nowrap rounded-md px-2 py-1 text-[11px]"
            style={{ color: "var(--color-up)" }}
          >
            삭제
          </button>
        </div>
      </div>
      <div className="mb-2.5 font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
        {formatWon(account.totalValue)}
      </div>
      <div className="flex justify-between text-xs">
        <span style={{ color: "var(--text-muted)" }}>오늘</span>
        <span style={{ color: account.todayPnlPct >= 0 ? "var(--color-up)" : "var(--color-down)" }}>
          {formatSignedPct(account.todayPnlPct)}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span style={{ color: "var(--text-muted)" }}>보유종목</span>
        <span style={{ color: "var(--text-tertiary)" }}>{account.holdingCount}종목</span>
      </div>
    </div>
  );
}

function AddAccountCard() {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const formData = new FormData();
    formData.set("name", trimmed);
    formData.set("market", "KR");
    startTransition(async () => {
      await createAccount(formData);
      setName("");
    });
  };

  return (
    <div
      className="flex min-h-[150px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed p-5"
      style={{ borderColor: "var(--border-input)" }}
    >
      <div className="text-xs" style={{ color: "var(--text-faint)" }}>
        새 계좌 추가
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="계좌 이름"
        className="w-40 rounded-lg border px-3 py-2 text-center text-sm"
        style={{
          background: "var(--border-row)",
          borderColor: "var(--border-input)",
          color: "var(--text-body)",
        }}
      />
      <button
        onClick={submit}
        disabled={isPending}
        className="rounded-lg px-5 py-2 text-sm font-bold"
        style={{ background: "#12202f", color: "var(--accent-teal)" }}
      >
        + 계좌 추가
      </button>
    </div>
  );
}

export function AccountManageGrid({ accounts }: AccountManageGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
      <AddAccountCard />
    </div>
  );
}
```

참고: `createAccount` 기존 Server Action은 `market` 필드(`KR`/`US`)를 필수로 받는다. 새 인라인 추가 폼은 프로토타입처럼 이름만 입력받으므로 기본값 `"KR"`을 채워 보낸다 — 시장 구분이 실제로 중요한 경우(예: 미국 계좌) 사용자가 나중에 `/accounts`의 기존 폼 대신 이 카드로만 계좌를 만들면 부정확할 수 있음. 이 트레이드오프는 스펙에 명시된 "기존 `createAccount` Server Action을 폼 대신 controlled input으로 감싼다"는 지시를 따른 것이며, 시장 구분이 필요하면 계좌 생성 후 별도 수정 경로가 없다는 한계가 있다(기존에도 market 수정 UI는 없었으므로 회귀 아님).

- [ ] **Step 3: `src/app/accounts/page.tsx`를 서버 데이터 조회 + 클라이언트 그리드 조합으로 교체**

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAccountStats } from "@/lib/portfolio/accountStats";
import { getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";
import { AccountManageGrid } from "@/components/AccountManageGrid";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = createAdminClient();
  const [{ data: accounts, error: accountsError }, { data: holdings, error: holdingsError }] =
    await Promise.all([
      supabase.from("accounts").select("id, name").order("created_at", { ascending: true }),
      supabase
        .from("holdings")
        .select("account_id, ticker, quantity, avg_cost, last_price"),
    ]);

  if (accountsError || holdingsError) {
    return (
      <div className="p-8" style={{ color: "var(--color-up)" }}>
        데이터를 불러오지 못했습니다: {(accountsError ?? holdingsError)?.message}
      </div>
    );
  }

  const usdKrwRate = await getStoredUsdKrwRate(supabase);
  const allHoldings = holdings ?? [];

  const cards = (accounts ?? []).map((account) => {
    const stats = computeAccountStats(allHoldings, usdKrwRate, account.id);
    const holdingCount = allHoldings.filter((h) => h.account_id === account.id).length;
    return {
      id: account.id,
      name: account.name,
      totalValue: stats.totalValue,
      todayPnlPct: stats.todayPnlPct,
      holdingCount,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-7">
      <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
        계좌 관리
      </h1>
      <AccountManageGrid accounts={cards} />
    </div>
  );
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공.

- [ ] **Step 5: dev 서버로 인라인 편집/삭제/추가 동작 확인**

`npm run dev` 후 `/accounts`에서: (a) 계좌 카드 "수정" 클릭 → input 노출 → 이름 바꾸고 Enter → 저장되는지, (b) "삭제" 클릭 → confirm → 삭제되는지, (c) 마지막 점선 카드에서 이름 입력 후 "+ 계좌 추가" 클릭 → 새 카드 생기는지 확인.

- [ ] **Step 6: 커밋**

```bash
cd "d:\클로드"
git add src/lib/actions/accounts.ts src/components/AccountManageGrid.tsx src/app/accounts/page.tsx
git commit -m "Convert account management page to client grid with inline rename/delete/add"
```

---

### Task 8: 매매기록 페이지 다크 스타일 + 필터

**Files:**
- Create: `src/components/TradeFilterTabs.tsx`
- Modify: `src/app/trades/page.tsx`

**Interfaces:**
- Produces: `TradeFilterTabsProps`:
  ```ts
  interface TradeRow {
    id: string;
    date: string;
    accountName: string;
    type: "매수" | "매도";
    name: string;
    ticker: string;
    qty: number;
    priceFmt: string;
    amountFmt: string;
    accountId: string;
  }
  interface TradeFilterTabsProps {
    trades: TradeRow[];
    deleteAction: (formData: FormData) => Promise<void>; // unused directly; deletion stays as <form> per row, passed via render prop
  }
  ```
  (단순화: 필터링만 클라이언트에서 하고, 삭제는 각 행에 서버 `<form action={...}>`를 그대로 유지하기 위해 `TradeFilterTabs`는 미리 렌더링된 행(JSX)을 필터링 키와 함께 받는 방식으로 구현한다 — 아래 코드 참고.)

- [ ] **Step 1: `TradeFilterTabs.tsx` 작성**

행 자체는 서버에서 렌더링된 JSX(삭제 폼 포함)를 그대로 유지하고, 클라이언트는 `type` 기준으로 보이기/숨기기만 토글하는 방식을 쓴다 — 이러면 `deleteTrade` Server Action을 클라이언트 컴포넌트에 다시 넘길 필요가 없다.

```tsx
"use client";

import { useState, type ReactNode } from "react";

export interface TradeFilterTabsProps {
  items: { id: string; type: "매수" | "매도"; node: ReactNode }[];
}

type FilterKey = "all" | "buy" | "sell";

export function TradeFilterTabs({ items }: TradeFilterTabsProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const visible = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "buy") return item.type === "매수";
    return item.type === "매도";
  });

  const tabs: { key: FilterKey; label: string; activeStyle: React.CSSProperties }[] = [
    { key: "all", label: "전체", activeStyle: { background: "#1a2130", color: "var(--text-headline)" } },
    { key: "buy", label: "매수", activeStyle: { background: "#2a1418", color: "var(--color-up)" } },
    { key: "sell", label: "매도", activeStyle: { background: "#12202f", color: "var(--color-down)" } },
  ];

  return (
    <div>
      <div
        className="mb-4 flex w-fit gap-1.5 rounded-xl border p-1"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="whitespace-nowrap rounded-lg px-4.5 py-2 text-[13px] font-bold"
            style={filter === tab.key ? tab.activeStyle : { color: "var(--text-muted)" }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="rounded-2xl border"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        {visible.map((item) => (
          <div key={item.id}>{item.node}</div>
        ))}
        {visible.length === 0 && (
          <div className="p-4 text-sm" style={{ color: "var(--text-faint)" }}>
            해당 조건의 매매기록이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/trades/page.tsx`를 다크 스타일 + `TradeFilterTabs` 사용으로 교체**

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { createTrade, deleteTrade } from "@/lib/actions/trades";
import { TradeFilterTabs } from "@/components/TradeFilterTabs";

export const dynamic = "force-dynamic";

const inputStyle = {
  background: "var(--border-row)",
  borderColor: "var(--border-input)",
  color: "var(--text-body)",
};

export default async function TradesPage() {
  const supabase = createAdminClient();

  const [{ data: accounts, error: accountsError }, { data: trades, error: tradesError }] =
    await Promise.all([
      supabase.from("accounts").select("id, name").order("created_at", { ascending: true }),
      supabase
        .from("trades")
        .select("id, account_id, ticker, name, side, quantity, price, traded_at, memo")
        .order("traded_at", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  if (accountsError || tradesError) {
    return (
      <div className="p-8" style={{ color: "var(--color-up)" }}>
        데이터를 불러오지 못했습니다: {(accountsError ?? tradesError)?.message}
      </div>
    );
  }

  const accountNameById = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  const items = (trades ?? []).map((trade) => {
    const isBuy = trade.side === "buy";
    const amount = trade.quantity * trade.price;
    const color = isBuy ? "var(--color-up)" : "var(--color-down)";
    return {
      id: trade.id,
      type: (isBuy ? "매수" : "매도") as "매수" | "매도",
      node: (
        <div
          className="flex items-center justify-between border-t px-4.5 py-3 first:border-t-0"
          style={{ borderColor: "var(--border-row)" }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--text-body)" }}>
              <span style={{ color }}>{isBuy ? "매수" : "매도"}</span>{" "}
              {trade.name}({trade.ticker}) · {accountNameById.get(trade.account_id) ?? "알 수 없는 계좌"}
            </div>
            <div className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
              {trade.traded_at} · {trade.quantity}주 @ {trade.price.toLocaleString()}
              {trade.memo ? ` · ${trade.memo}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-sm font-semibold" style={{ color }}>
              {isBuy ? "-" : "+"}
              {Math.round(amount).toLocaleString()}원
            </div>
            <form action={deleteTrade.bind(null, trade.id, trade.account_id, trade.ticker)}>
              <button type="submit" className="text-xs" style={{ color: "var(--color-up)" }}>
                삭제
              </button>
            </form>
          </div>
        </div>
      ),
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-7">
      <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
        매매기록
      </h1>

      {(accounts ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          매매기록을 입력하려면 먼저{" "}
          <a href="/accounts" className="underline">
            계좌를 등록
          </a>
          하세요.
        </p>
      ) : (
        <form
          action={createTrade}
          className="space-y-3 rounded-2xl border p-4"
          style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--text-body)" }}>
            매매기록 입력
          </h2>
          <select name="account_id" required className="w-full rounded-lg border px-3 py-2" style={inputStyle}>
            <option value="">계좌 선택</option>
            {(accounts ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <input name="ticker" placeholder="종목 코드" required className="w-1/2 rounded-lg border px-3 py-2" style={inputStyle} />
            <input name="name" placeholder="종목명" required className="w-1/2 rounded-lg border px-3 py-2" style={inputStyle} />
          </div>
          <div className="flex gap-3">
            <select name="side" required className="w-1/3 rounded-lg border px-3 py-2" style={inputStyle}>
              <option value="">매수/매도</option>
              <option value="buy">매수</option>
              <option value="sell">매도</option>
            </select>
            <input name="quantity" type="number" step="any" min="0" placeholder="수량" required className="w-1/3 rounded-lg border px-3 py-2" style={inputStyle} />
            <input name="price" type="number" step="any" min="0" placeholder="단가" required className="w-1/3 rounded-lg border px-3 py-2" style={inputStyle} />
          </div>
          <input name="traded_at" type="date" required className="w-full rounded-lg border px-3 py-2" style={inputStyle} />
          <input name="memo" placeholder="메모 (선택)" className="w-full rounded-lg border px-3 py-2" style={inputStyle} />
          <button type="submit" className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: "#12202f", color: "var(--accent-teal)" }}>
            등록
          </button>
        </form>
      )}

      <TradeFilterTabs items={items} />
    </div>
  );
}
```

- [ ] **Step 3: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공.

- [ ] **Step 4: dev 서버로 필터/등록/삭제 확인**

`npm run dev` 후 `/trades`에서 전체/매수/매도 필터가 리스트를 걸러내는지, 등록/삭제 폼이 정상 동작하는지 확인.

- [ ] **Step 5: 커밋**

```bash
cd "d:\클로드"
git add src/components/TradeFilterTabs.tsx src/app/trades/page.tsx
git commit -m "Redesign trade history page with dark theme and buy/sell filter tabs"
```

---

### Task 9: 계좌 분석 페이지 — 계좌 탭 + 통계 카드 + 보유종목 테이블

**Files:**
- Create: `src/components/AccountAnalysisTabs.tsx`
- Modify: `src/app/analysis/page.tsx`

**Interfaces:**
- Produces: `AccountAnalysisTabsProps`:
  ```ts
  interface AccountOption {
    id: string; // "all" | 실제 account id
    name: string;
  }
  interface AccountAnalysisTabsProps {
    accounts: AccountOption[];
    selected: string;
    onSelect: (id: string) => void; // 실제로는 내부 state로 관리, 외부엔 렌더 함수로 노출
  }
  ```
  (구현 단순화를 위해, 이 컴포넌트는 탭 선택 상태와 계좌별로 미리 계산된 콘텐츠 맵을 함께 받아 내부에서 선택된 콘텐츠만 렌더링하는 방식을 쓴다 — 아래 코드 참고.)

- [ ] **Step 1: `AccountAnalysisTabs.tsx` 작성**

서버에서 계좌별 콘텐츠(통계 카드+섹터+테이블 JSX)를 전부 미리 렌더링해 두고, 클라이언트는 탭 전환에 따라 보여줄 콘텐츠만 고르는 방식을 쓴다(각 계좌 데이터를 클라이언트로 따로 넘기지 않아 단순함).

```tsx
"use client";

import { useState, type ReactNode } from "react";

interface AccountTabDef {
  id: string;
  name: string;
  content: ReactNode;
}

export function AccountAnalysisTabs({ tabs }: { tabs: AccountTabDef[] }) {
  const [selected, setSelected] = useState(tabs[0]?.id ?? "all");
  const active = tabs.find((t) => t.id === selected) ?? tabs[0];

  return (
    <div>
      <div
        className="mb-5 flex w-fit gap-1.5 rounded-xl border p-1"
        style={{ background: "var(--bg-panel-alt)", borderColor: "var(--border-pill)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelected(tab.id)}
            className="whitespace-nowrap rounded-lg px-4.5 py-2.5 text-[13px] font-bold"
            style={
              selected === tab.id
                ? { background: "#1a2130", color: "var(--accent-teal)" }
                : { color: "var(--text-muted)" }
            }
          >
            {tab.name}
          </button>
        ))}
      </div>
      {active?.content}
    </div>
  );
}
```

- [ ] **Step 2: `src/app/analysis/page.tsx`를 계좌 탭 + 통계 카드 + 보유종목 테이블 포함 구조로 교체**

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { setUserSector, clearUserSector } from "@/lib/actions/sectors";
import { SectorDonutChart, type SectorSlice } from "@/components/SectorDonutChart";
import { AccountAnalysisTabs } from "@/components/AccountAnalysisTabs";
import { computeAccountStats } from "@/lib/portfolio/accountStats";
import { toKrw } from "@/lib/portfolio/currency";
import { getStoredUsdKrwRate } from "@/lib/toss/exchangeRate";

export const dynamic = "force-dynamic";

const UNCLASSIFIED = "미분류";

interface HoldingRow {
  ticker: string;
  name: string;
  quantity: number;
  avg_cost: number;
  last_price: number | null;
  account_id: string;
}

function groupBySector(
  holdings: HoldingRow[],
  sectorByTicker: Map<string, string>,
  usdKrwRate: number
): SectorSlice[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    const sector = sectorByTicker.get(h.ticker) ?? UNCLASSIFIED;
    const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
    const value = toKrw(Number(h.quantity) * price, h.ticker, usdKrwRate);
    totals.set(sector, (totals.get(sector) ?? 0) + value);
  }
  return Array.from(totals.entries())
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export default async function AnalysisPage() {
  const supabase = createAdminClient();

  const [
    { data: holdings, error: holdingsError },
    { data: accounts, error: accountsError },
    { data: sectors, error: sectorsError },
  ] = await Promise.all([
    supabase
      .from("holdings")
      .select("ticker, name, quantity, avg_cost, last_price, account_id"),
    supabase.from("accounts").select("id, name").order("created_at", { ascending: true }),
    supabase.from("sector_classifications").select("ticker, ai_sector, user_sector"),
  ]);

  if (holdingsError || accountsError || sectorsError) {
    return (
      <div className="p-8" style={{ color: "var(--color-up)" }}>
        데이터를 불러오지 못했습니다:{" "}
        {(holdingsError ?? accountsError ?? sectorsError)?.message}
      </div>
    );
  }

  const sectorByTicker = new Map(
    (sectors ?? []).map((s) => [s.ticker, s.user_sector ?? s.ai_sector ?? UNCLASSIFIED])
  );
  const usdKrwRate = await getStoredUsdKrwRate(supabase);
  const allHoldings: HoldingRow[] = holdings ?? [];

  const accountOptions = [{ id: "all", name: "전체 계좌" }, ...(accounts ?? [])];

  const tabs = accountOptions.map((opt) => {
    const scopedHoldings =
      opt.id === "all" ? allHoldings : allHoldings.filter((h) => h.account_id === opt.id);
    const stats = computeAccountStats(allHoldings, usdKrwRate, opt.id === "all" ? undefined : opt.id);
    const sectorSlices = groupBySector(scopedHoldings, sectorByTicker, usdKrwRate);
    const sectorTotal = sectorSlices.reduce((sum, s) => sum + s.value, 0) || 1;

    const holdingsTable = [...scopedHoldings]
      .map((h) => {
        const price = h.last_price != null ? Number(h.last_price) : Number(h.avg_cost);
        const evalAmount = toKrw(price * Number(h.quantity), h.ticker, usdKrwRate);
        const costBasis = toKrw(Number(h.avg_cost) * Number(h.quantity), h.ticker, usdKrwRate);
        const rate = costBasis > 0 ? ((evalAmount - costBasis) / costBasis) * 100 : 0;
        return {
          ticker: h.ticker,
          name: h.name,
          sector: sectorByTicker.get(h.ticker) ?? UNCLASSIFIED,
          rate,
          evalAmount,
          weightPct: (evalAmount / sectorTotal) * 100,
        };
      })
      .sort((a, b) => b.evalAmount - a.evalAmount);

    const content = (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3.5">
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              총 평가금액
            </div>
            <div className="font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
              {Math.round(stats.totalValue).toLocaleString()}원
            </div>
          </div>
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              오늘 수익률
            </div>
            <div
              className="font-mono text-2xl font-bold"
              style={{ color: stats.todayPnlPct >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedPct(stats.todayPnlPct)}
            </div>
          </div>
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
              총 수익률
            </div>
            <div
              className="font-mono text-2xl font-bold"
              style={{ color: stats.todayPnlPct >= 0 ? "var(--color-up)" : "var(--color-down)" }}
            >
              {formatSignedPct(stats.todayPnlPct)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <div
            className="rounded-xl border p-4.5"
            style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
          >
            <div className="mb-3.5 text-sm font-bold" style={{ color: "var(--text-body)" }}>
              섹터별 보유 비중
            </div>
            {sectorSlices.map((sec, i) => (
              <div key={sec.sector} className="mb-2.5">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span style={{ color: "var(--text-body-secondary)" }}>{sec.sector}</span>
                  <span className="font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {((sec.value / sectorTotal) * 100).toFixed(1)}% ·{" "}
                    {Math.round(sec.value).toLocaleString()}원
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full"
                  style={{ background: "var(--border-row)" }}
                >
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${((sec.value / sectorTotal) * 100).toFixed(1)}%`,
                      background: ["#3f8cff", "#f5495c", "#f0b90b", "#24d3b5", "#a78bfa", "#34d399", "#fb7185", "#60a5fa"][
                        i % 8
                      ],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <SectorDonutChart slices={sectorSlices} title="섹터 분포" />
        </div>

        <div
          className="overflow-hidden rounded-xl border"
          style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
        >
          <div className="px-4.5 pb-2.5 pt-4 text-sm font-bold" style={{ color: "var(--text-body)" }}>
            보유 종목
          </div>
          <div className="max-h-[360px] overflow-auto">
            {holdingsTable.map((h) => (
              <div
                key={h.ticker}
                className="flex items-center border-t px-4.5 py-2.5 text-sm"
                style={{ borderColor: "var(--border-row)" }}
              >
                <div className="min-w-0 flex-1 truncate" style={{ color: "var(--text-body)" }}>
                  {h.name}
                </div>
                <div className="w-[100px] shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                  {h.sector}
                </div>
                <div
                  className="w-20 shrink-0 text-right font-mono text-sm font-semibold"
                  style={{ color: h.rate >= 0 ? "var(--color-up)" : "var(--color-down)" }}
                >
                  {formatSignedPct(h.rate)}
                </div>
                <div
                  className="w-[130px] shrink-0 text-right font-mono"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {Math.round(h.evalAmount).toLocaleString()}원
                </div>
                <div className="w-[70px] shrink-0 text-right font-mono" style={{ color: "var(--text-faint)" }}>
                  {h.weightPct.toFixed(1)}%
                </div>
              </div>
            ))}
            {holdingsTable.length === 0 && (
              <div className="p-4 text-sm" style={{ color: "var(--text-faint)" }}>
                보유종목이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    );

    return { id: opt.id, name: opt.name, content };
  });

  const uniqueTickers = Array.from(
    new Map(allHoldings.map((h) => [h.ticker, h.name])).entries()
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-7">
      <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
        계좌 분석
      </h1>

      <AccountAnalysisTabs tabs={tabs} />

      <div
        className="rounded-2xl border p-4"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}
      >
        <h2 className="mb-3 font-semibold" style={{ color: "var(--text-body)" }}>
          종목별 섹터 지정
        </h2>
        <ul className="space-y-3">
          {uniqueTickers.map(([ticker, name]) => {
            const current = sectorByTicker.get(ticker) ?? UNCLASSIFIED;
            const record = (sectors ?? []).find((s) => s.ticker === ticker);
            return (
              <li
                key={ticker}
                className="flex flex-wrap items-center gap-2 border-b pb-3"
                style={{ borderColor: "var(--border-row)" }}
              >
                <span className="w-40 shrink-0 font-medium" style={{ color: "var(--text-body)" }}>
                  {name} ({ticker})
                </span>
                <span className="text-sm" style={{ color: "var(--text-faint)" }}>
                  현재: {current}
                </span>
                <form action={setUserSector} className="flex gap-2">
                  <input type="hidden" name="ticker" value={ticker} />
                  <input
                    name="user_sector"
                    placeholder="섹터 입력 (예: 반도체)"
                    className="rounded-md border px-2 py-1 text-sm"
                    style={{
                      background: "var(--border-row)",
                      borderColor: "var(--border-input)",
                      color: "var(--text-body)",
                    }}
                  />
                  <button
                    type="submit"
                    className="rounded-md px-3 py-1 text-sm font-bold"
                    style={{ background: "#12202f", color: "var(--accent-teal)" }}
                  >
                    지정
                  </button>
                </form>
                {record?.user_sector && (
                  <form action={clearUserSector.bind(null, ticker)}>
                    <button type="submit" className="text-sm" style={{ color: "var(--color-up)" }}>
                      수동 지정 해제
                    </button>
                  </form>
                )}
              </li>
            );
          })}
          {uniqueTickers.length === 0 && (
            <li className="text-sm" style={{ color: "var(--text-faint)" }}>
              보유종목이 없습니다.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

참고: "총 수익률" 카드는 `computeAccountStats`가 반환하는 `todayPnlPct`를 임시로 재사용했다 — 실현손익까지 합산한 진짜 "총 수익률"을 계산하려면 계좌별 실현손익 조회가 추가로 필요한데, 이는 스펙에 없는 범위 확장이라 이번 태스크에서는 평가손익률과 동일한 값을 쓴다. 이 한계는 코드 주석으로 남긴다:

`computeAccountStats` 호출부 근처에 주석 추가:
```tsx
        {/* 총 수익률 카드는 실현손익 데이터를 계좌별로 분리 집계하는 별도 작업이 필요해
            이번 리디자인에서는 평가손익률(todayPnlPct)과 동일한 값을 임시로 표시한다. */}
```

- [ ] **Step 3: 빌드 확인**

Run: `cd "d:\클로드" && npm run build`
Expected: 성공.

- [ ] **Step 4: dev 서버로 계좌 탭 전환 + 테이블 확인**

`npm run dev` 후 `/analysis`에서 전체/계좌별 탭 전환 시 통계 카드·섹터 바·도넛·보유종목 테이블이 모두 갱신되는지 확인.

- [ ] **Step 5: 커밋**

```bash
cd "d:\클로드"
git add src/components/AccountAnalysisTabs.tsx src/app/analysis/page.tsx
git commit -m "Add account tabs, stat cards, and holdings table to account analysis page"
```

---

### Task 10: 전체 통합 확인

**Files:** 없음 (검증 전용 태스크)

- [ ] **Step 1: 전체 빌드**

Run: `cd "d:\클로드" && npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 2: lint 확인**

Run: `cd "d:\클로드" && npm run lint`
Expected: 에러 없음(경고는 허용).

- [ ] **Step 3: dev 서버로 4개 화면 전체 순회**

Run: `npm run dev`
브라우저에서 `/`, `/accounts`, `/trades`, `/analysis` 각각 방문해:
- 다크 배경/테두리/텍스트 색상이 일관되게 적용됐는지
- 우측 사이드바가 모든 페이지에서 보이는지
- 상승/하락 색상(빨강/파랑)이 뒤바뀌지 않았는지
- 각 페이지의 인터랙션(탭 전환, 필터, 인라인 편집, 차트 호버)이 실제로 동작하는지

확인한다. 문제 발견 시 해당 태스크로 돌아가 수정 후 재커밋.

- [ ] **Step 4: PROGRESS.md 갱신 여부 확인 (선택)**

사용자가 세션 시작 시 참고하는 `PROGRESS.md`에 이번 리디자인 완료 사실을 추가할지 사용자에게 확인 후 반영.
