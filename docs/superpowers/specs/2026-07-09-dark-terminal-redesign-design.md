# 다크 터미널 대시보드 리디자인 설계

## 배경

claude.ai/design에서 만든 "STOCK TERM" 다크 터미널 스타일 프로토타입(`README.md` + `Stock Dashboard.dc.html`, 프로젝트 외부에서 전달받음)을 이 저장소의 실제 Next.js/Tailwind 환경에 재구현한다. 프로토타입은 독자 컴포넌트 런타임(`sc-for`/`sc-if`, `DCLogic`)으로 만들어진 스펙 문서일 뿐 실행 가능한 코드가 아니며, 레이아웃·색상·상호작용 사양만 그대로 가져온다.

대상은 기존 4개 화면 전체다: 홈(`/`), 계좌 관리(`/accounts`), 매매기록(`/trades`), 계좌 분석(`/analysis`). 전역 크롬(상단 네비 + 우측 사이드바)도 새로 추가한다.

## 범위 밖

- **로고 업로드 기능**: 종목 배지는 프로토타입대로 이니셜+색상 배지로 구현한다. 실제 로고 이미지 업로드(Supabase Storage 연동)는 별도 작업으로 분리한다.
- **공포·탐욕 지수 카드**: 프로토타입에는 그라디언트 게이지 카드가 있으나, 데이터 소스가 없고 VIX로 임의 대체 시 신뢰도가 낮아 이번 범위에서 제외한다. 우측 사이드바에는 시장지표(코스피/코스닥/S&P500/VIX)와 환율만 남긴다.
- **회원가입/다중 사용자**: 기존과 동일하게 단일 사용자 앱을 전제로 한다.
- **모바일 반응형 최적화**: 프로토타입은 데스크톱 우선(1440px) 레이아웃이다. 이번 작업은 데스크톱 레이아웃 재현에 집중하고, 모바일 대응은 범위에 넣지 않는다(완전히 깨지지만 않으면 충분).

## 전역 디자인 토큰 (`src/app/globals.css`)

라이트/시스템 다크 모드 분기를 없애고 **항상 다크 테마로 고정**한다(프로토타입이 라이트 모드를 정의하지 않았고, 금융 터미널 컨셉 자체가 다크 전용이므로).

```css
--bg-page: #080a10;
--bg-panel: #0e121a;      /* 카드 기본 */
--bg-panel-alt: #11151f;  /* 중첩/보조 패널, 필터 그룹 배경 */
--bg-nav: #0b0e16;        /* 상단 네비, 사이드바 */
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
--color-up: #f5495c;    /* 국내 관례: 상승=빨강 */
--color-down: #3f8cff;  /* 하락=파랑 */
--accent-teal: #24d3b5;
```

배지/차트 팔레트(10색 홀딩스 배지, 8색 섹터 팔레트)는 프로토타입 값 그대로 상수로 옮긴다. 폰트는 JetBrains Mono를 `next/font/google`로 추가해 모든 숫자·티커·날짜에 사용하고(현재 `Geist_Mono` 대체), UI 텍스트는 Noto Sans KR로 교체한다(현재 `Geist Sans` 대체).

## 전역 크롬

### 상단 네비 (`src/components/NavBar.tsx` 교체)
- 60px 높이, `bg-nav`, 하단 보더, 좌측 로고("STOCK" + teal "TERM" + pulsing dot), 중앙 네비 링크 4개(활성 시 `bg-[#161b26]`), 우측 오늘 날짜(KST, JetBrains Mono).
- pulsing dot은 Tailwind `@keyframes`로 CSS만으로 구현(JS 불필요).

### 우측 사이드바 (신규 `src/components/MarketSidebar.tsx`)
- 280px 고정 폭, 스크롤 가능, `layout.tsx`에서 `NavBar` 아래 `flex` 컨테이너로 메인 콘텐츠와 나란히 배치.
- **시장 지표**: 코스피/코스닥/S&P500/VIX 4개. **공포·탐욕 게이지 카드는 만들지 않는다.**
- **환율**: 기존 `getStoredUsdKrwRate()`로 이미 확보된 값을 그대로 사용(신규 연동 불필요).
- 데이터가 없거나 지연 시 `-`로 표시하고 절대 화면을 깨뜨리지 않는다.

## 지수 시세 연동 (신규 `src/lib/market/indices.ts`)

토스 공식 API(`openapi.tossinvest.com`)는 개별 종목만 지원하고 지수 심볼(KS11/KQ11/SPX/VIX 등 시도)에는 빈 배열을 반환함을 실측으로 확인했다(2026-07-09). 지수는 **Yahoo Finance 비공식 엔드포인트**(`https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`, 인증 불필요)로 조회한다.

```ts
const INDEX_SYMBOLS = {
  kospi: "^KS11",
  kosdaq: "^KQ11",
  sp500: "^GSPC",
  vix: "^VIX",
} as const;

async function fetchIndexQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  // fetch(`.../v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`)
  // meta.regularMarketPrice, meta.chartPreviousClose 로 등락률 계산
  // 실패(네트워크 오류, 4xx/5xx, JSON 파싱 실패, 필드 누락) 시 null 반환 — throw 금지
}
```

- **실패에 관대하게**: 개별 심볼 실패가 다른 심볼이나 페이지 렌더링에 영향을 주지 않는다. `Promise.allSettled`로 4개를 병렬 조회하고, 실패한 항목만 `null`로 남겨 사이드바에서 `-` 처리한다.
- **캐싱**: Next.js `fetch`의 `next: { revalidate: 60 }`(60초)로 과도한 호출을 피한다. 별도 DB 저장/스케줄러는 두지 않는다(토스 시세처럼 `ENABLE_LOCAL_PRICE_SYNC` 게이팅 대상이 아님 — 이 API는 서버 렌더링 시점에 직접 호출).
- 이 의존성은 비공식·비문서화 API이므로 언제든 응답 형식이 바뀌거나 차단될 수 있다는 리스크를 코드 상단 주석으로 남긴다.

## 홈 화면 (`src/app/page.tsx` + 관련 컴포넌트)

### 헤더
- "총 평가금액" 큰 숫자(40px) + "오늘 수익률"/"총 수익률(누적)" 배지 2개. 기존 `totalValue`/`unrealizedPnl`/`realizedPnl` 계산 로직 재사용, 표시 포맷만 프로토타입 스타일(부호+색상)로 교체.

### 보유종목 등락 현황 카드 (`HoldingsMoversCard.tsx` 확장)
- **"오늘 등락"이 아니라 "평가손익(평단가 대비)"으로 표시한다** — 전일 종가 데이터가 없으므로, 기존 `computeHoldingsMovers()`가 이미 계산하는 `changeRate`/`changeAmount`(평단가 대비 평가손익률/금액)를 그대로 재사용한다. 라벨은 "등락률"이 아니라 실제 의미에 맞게 조정.
- 계좌 필터 pill 그룹 + 정렬(등락률 오름/내림차순) 토글 추가(현재 없음 — 신규 클라이언트 상태).
- 각 행: 이니셜 배지(10색 순환) + 종목명/티커 + 등락률 + 금액.

### 탭 (수익/추이/비중) — `PortfolioTabs.tsx`, `ProfitTab.tsx`, `TrendTab.tsx`, `AllocationTab.tsx`
- 탭 자체 구조(3개 탭, pill 스타일)는 유지하고 색상 토큰만 다크 테마로 교체.
- **수익 탭**: 3열 통계 카드(평가손익/실현손익/총손익), 기존 계산 로직 그대로, 카드 스타일만 교체(세 번째 카드에 teal 보더).
- **추이 탭**: 기존 손그림 SVG 라인 차트를 **Recharts**(`AreaChart`/`ComposedChart`)로 교체. 원금(점선 회색) vs 총자산(실선 teal) 두 시리즈 + 사이 영역 채우기, 호버 시 세로 가이드라인 + 툴팁. 데이터 소스(`portfolio_snapshots`)는 변경 없음.
- **비중 탭**: 기존 손그림 도넛을 Recharts `PieChart`(donut)로 교체 + 우측 스크롤 범례. 호버 시 슬라이스 확대/나머지 dim + 중앙 라벨 갱신.

## 계좌 관리 (`/accounts`)

**클라이언트 컴포넌트로 전환**한다(인라인 편집·삭제 확인이 필요하므로).

- `src/app/accounts/page.tsx`(서버): 계좌 목록 + 계좌별 보유종목 집계(평가금액/오늘 손익/보유종목수)를 조회해 클라이언트 컴포넌트에 props로 전달.
- 신규 `src/components/AccountManageGrid.tsx`(클라이언트): 3열 카드 그리드, 각 카드에 `useState`로 편집 모드 토글. "수정" 클릭 시 이름 input 노출, Enter/"저장" 클릭 시 신규 Server Action(`renameAccount`, `src/lib/actions/accounts.ts`에 추가) 호출. "삭제"는 기존과 동일하게 네이티브 `confirm()` 유지(프로토타입도 네이티브 confirm이라고 명시) 후 기존 `deleteAccount` Server Action 호출.
- "계좌 추가" 카드(점선 보더, 항상 그리드 마지막)는 기존 `createAccount` Server Action을 폼 대신 controlled input + 버튼 클릭으로 감싼다.
- 카드 통계(총액/오늘%/보유종목수)는 서버에서 계산해 내려주고 클라이언트는 표시만 담당 — 계좌 목록의 실시간 재계산(리네임 후 즉시 반영 등)은 Server Action 완료 후 Next.js의 기본 재검증(`revalidatePath`)에 의존한다.

## 매매기록 (`/trades`)

주로 스타일 교체. 기존 서버 컴포넌트 구조(폼 + 리스트) 유지, 필터(전체/매수/매도)는 신규 클라이언트 상태로 추가(현재 없음 — `TradeFilterTabs.tsx` 신규 클라이언트 컴포넌트로 감싸서 리스트를 필터링). 테이블 스타일(구분 색상: 매수=빨강, 매도=파랑, 금액 부호 `-`/`+`)은 프로토타입 그대로.

## 계좌 분석 (`/analysis`)

- 계좌 탭(전체+계좌별) 추가 — 현재는 전체 섹터 도넛 + 계좌별 도넛을 세로로 나열하는 구조라, pill 탭으로 전환해 선택된 계좌만 보여주는 방식으로 변경.
- 3열 통계 카드(총 평가금액/오늘 수익률/총 수익률) 추가 — 계좌별로 `computeStats`류 헬퍼 필요(홈 화면 계산 로직과 유사, 계좌 필터만 다름 → 공용 유틸로 추출 검토).
- 섹터별 보유 비중: 기존 `SectorDonutChart` 대신 막대그래프 리스트(프로토타입 스타일) + Recharts 도넛으로 2열 배치.
- 보유종목 테이블(종목/섹터/등락률/평가금액/비중) 신규 추가 — 현재 `/analysis`에는 섹터 지정 폼만 있고 보유종목 테이블이 없음. 기존 "종목별 섹터 지정" 폼은 그대로 하단에 유지(디자인 스펙엔 없지만 기존 기능이므로 제거하지 않음).

## 공용 유틸 정리

홈/계좌관리/계좌분석 3곳에서 "계좌(또는 전체)별 평가금액/오늘손익률/총손익률"을 계산하는 로직이 중복될 가능성이 높다. `src/lib/portfolio/` 아래에 `computeAccountStats(holdings, trades, usdKrwRate, accountId?)` 형태의 공용 함수를 추출해 재사용한다(정확한 시그니처는 구현 단계에서 각 화면이 실제로 필요로 하는 필드를 보고 확정).

## 의존성 추가

- `recharts` (npm) — 추이/비중 차트.
- 그 외 신규 외부 패키지 없음(Yahoo Finance는 `fetch`로 직접 호출, 별도 SDK 불필요).

## 구현 순서 (단계별 진행, 각 단계 후 확인)

1. 전역 디자인 토큰(`globals.css`) + 폰트 교체 + `NavBar` 다크 테마 적용
2. `MarketSidebar` + `src/lib/market/indices.ts` (Yahoo Finance 연동) + `layout.tsx`에 사이드바 배치
3. 홈 화면 전체 리디자인 (헤더, `HoldingsMoversCard`, 3탭 — Recharts 전환 포함)
4. 계좌 관리 클라이언트 컴포넌트 전환 + rename Server Action
5. 매매기록 필터 + 스타일
6. 계좌 분석 (탭 전환 + 통계 카드 + 보유종목 테이블 + 차트 교체)

각 단계 완료 후 `npm run build` 통과 + 로컬 dev 서버에서 실제 화면 확인(가능하면 브라우저로 시각 검증) 후 다음 단계로 진행한다.
