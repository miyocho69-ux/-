# 포트폴리오 대시보드 개편 — 수익/추이/비중 설계

## 배경

사용자가 "도미노"(자산관리 앱)의 홈 화면 UI를 참고 스크린샷으로 제공했다. 도미노 앱은 홈 화면에 총자산+일간수익을 보여주고, 그 아래 탭(수익/세금/배당/추이/비중)으로 상세 화면을 전환하는 구조다. 이번 작업 범위는 그중 **수익/추이/비중** 3개 탭만 최대한 비슷하게 구현하는 것이다(세금/배당 탭은 제외).

현재 홈 화면(`src/app/page.tsx`)은 보유종목을 업데이트 시각순으로 나열하는 단순 리스트다. 이를 도미노 스타일의 총자산 요약 + 3탭 구조로 교체한다.

## 범위 밖

- **배당수익**: DB에 배당 기록 테이블이 없고, 이번 작업에서 배당 입력 기능 자체를 만들지 않는다. 수익 화면에는 배당수익을 항상 0으로 표시한다.
- **세금 탭**: 만들지 않는다.
- **유형별 비중**(ETF/주식/현금성자산): 종목별 자산유형 메타데이터가 없어 이번 범위에서 제외. 비중 탭은 "종목별"/"계좌별" 두 가지 뷰만 제공한다.
- **`/analysis` 페이지**(섹터 분류 + 섹터 도넛차트 + AI 재분류): 변경하지 않고 그대로 유지. 새 홈 화면의 "비중" 탭과는 별개의 기존 기능이다.
- **추이 데이터의 과거 이력**: 지금까지 일별 자산 스냅샷을 저장한 적이 없으므로, 스냅샷은 이 기능 배포 시점부터 새로 쌓기 시작한다. 배포 초기에는 추이 차트에 며칠 치 데이터만 보인다.

## 데이터 모델 변경

```sql
-- 일별 총자산 스냅샷 — 추이 탭의 라인차트 소스
create table portfolio_snapshots (
  date date primary key,
  total_value numeric not null,
  total_cost numeric not null
);

-- 매도 거래의 확정 손익을 저장 (매수 행은 항상 null)
alter table trades add column realized_pnl numeric;
```

- `portfolio_snapshots`는 날짜 단독 PK인 싱글 사용자 테이블이다(계좌 구분 없이 전체 합산 1행/일). RLS는 기존 관례대로 활성화하되 정책 없음(서버는 admin client로 접근).
- `realized_pnl`은 매도 거래를 재생하는 시점에 계산해 저장한다(아래 "실현손익 계산" 참고). 기존 거래에는 이 마이그레이션 시점엔 값이 없으므로(과거 매도 건은 소급 계산하지 않음), 배포 후 `recalcHolding`이 다시 실행되는 계좌/종목 조합에 한해 채워진다. 과거 매도 이력이 있는 경우 실현수익 합계가 실제보다 낮게 잡힐 수 있음을 사용자가 인지해야 한다(마이그레이션 직후 한 번, 전체 계좌의 거래를 재생하는 백필을 실행해 이 문제를 해소한다 — 아래 "배포 시 백필" 참고).

## 실현손익 계산 (`src/lib/holdings/recalc.ts` 확장)

현재 `recalcHolding`은 거래를 시간순으로 재생하며 `quantity`/`avg_cost`만 갱신한다. 매도 거래를 처리하는 지점에서, **매도 직전의 평단가**를 이미 알고 있으므로 다음을 추가한다:

```
매도 처리 시:
  realizedPnl = (매도단가 - 매도직전평단가) × 매도수량
  해당 trades 행의 realized_pnl 컬럼에 저장
```

- 이 계산은 재생 루프 안에서 각 매도 거래를 만날 때마다 수행되므로, 거래를 삭제하고 재계산해도(`deleteTrade`) 항상 최신 상태로 재계산된다.
- 여러 매도 거래가 있으면 각 매도 거래마다 개별 `realized_pnl`이 저장되고, 화면에서는 이를 기간별로 합산한다.

## 배포 시 백필

마이그레이션 적용 후, 기존에 등록된 모든 (account_id, ticker) 조합에 대해 `recalcHolding`을 1회 재실행하는 일회성 스크립트를 실행해 과거 매도 건의 `realized_pnl`을 채운다. 이 스크립트는 `scratchpad`에 임시로 작성해 실행 후 삭제한다(반복 실행할 코드가 아니므로 리포지토리에 남기지 않는다).

## 일별 스냅샷 저장 (`src/app/page.tsx` 확장)

`ENABLE_LOCAL_PRICE_SYNC=true`로 `syncHoldingPrices()`가 **성공**(status `"success"` 또는 `"partial"`, 즉 최소 1건 이상 갱신)했을 때, 그 직후 아래를 계산해 `portfolio_snapshots`에 upsert한다:

```
totalValue = Σ (holding.last_price ?? holding.avg_cost) × holding.quantity   (전체 계좌 합산)
totalCost  = Σ holding.avg_cost × holding.quantity                           (전체 계좌 합산)
date       = 오늘 날짜 (KST 기준, YYYY-MM-DD)
```

`onConflict: "date"`로 upsert하므로 하루에 여러 번 동기화해도 그날 값은 마지막 값으로 덮어써진다(하루 1행 유지).

동기화가 꺼져 있거나(`ENABLE_LOCAL_PRICE_SYNC` 미설정) 실패한 경우 스냅샷을 쓰지 않는다 — 그날은 그냥 기록이 비는 날이 된다(추이 차트에서 해당 날짜가 비거나 직전 값과 이어지는 건 차트 렌더링 쪽에서 자연히 처리됨, 별도 보간 로직은 만들지 않는다).

## 홈 화면 구조 (`src/app/page.tsx` 전면 개편)

```
[총 평가금액]
[일간수익 금액 (%)]

[수익] [추이] [비중]   <- 탭 (클라이언트 컴포넌트, useState로 전환, URL 불변)

(탭 내용)
```

세 탭 모두 하나의 Server Component(`page.tsx`)가 필요한 데이터를 전부 조회해서 클라이언트 컴포넌트(`PortfolioTabs`)에 props로 내려주고, 클라이언트 컴포넌트는 탭 전환만 담당한다(탭마다 재요청 없음 — 데이터가 크지 않으므로 최초 로드 시 3개 탭 데이터를 모두 가져온다).

### 수익 탭

- **평가수익** = Σ (last_price - avg_cost) × quantity, 전 종목 합산 (last_price가 null인 종목은 0으로 취급)
- **실현수익** = Σ trades.realized_pnl (전체 기간 합산, null 제외)
- **배당수익** = 0 (고정)
- **총 실현수익률** = 실현수익 ÷ (현재 보유종목의 avg_cost × quantity 합계). 분모가 0이면 0%로 표시(0으로 나누지 않음).
- **수익 차트**: 일별/월별 토글(간단한 버튼 두 개, 클라이언트 상태). `trades.realized_pnl`을 `traded_at` 기준으로 그룹핑해 막대그래프로 표시. 일별은 최근 30일, 월별은 최근 12개월 범위로 제한한다(무한정 늘어나지 않도록). 막대 색상은 양수는 빨강(text-red-600과 동일 계열), 음수는 파랑 — 기존 프로젝트의 수익/손실 색상 관례(`page.tsx`의 `text-red-600`/`text-blue-600`)를 따른다.

### 추이 탭

- `portfolio_snapshots`를 날짜순으로 조회해 라인차트로 표시(자산 라인 + 원금 라인 2개 — 도미노 스타일 참고).
- 기간 필터 버튼: 이달 / 1달 / 6달 / 1년 / 올해 / 전체. 데이터가 스냅샷 시작일부터만 있으므로, 필터가 요청한 기간보다 실제 데이터가 짧으면 있는 만큼만 그린다(빈 구간을 인위적으로 채우지 않는다).
- 차트는 SVG 기반 커스텀 구현(기존 `SectorDonutChart`와 동일하게 외부 차트 라이브러리 의존성 추가하지 않음).

### 비중 탭

- 뷰 토글: 종목별 / 계좌별 (기존 섹터 도넛차트 컴포넌트 `SectorDonutChart`를 재사용 가능하도록 이미 `slices: {sector, value}[]` 형태의 범용 인터페이스이므로 그대로 사용 — `sector` 필드에 종목명 또는 계좌명을 넣는다).
- 종목별: `holding.name (ticker)`를 라벨로, 평가금액(`last_price ?? avg_cost) × quantity`) 기준 비중.
- 계좌별: `account.name`을 라벨로, 해당 계좌 소속 holdings 평가금액 합산 기준 비중.
- 도넛차트 아래 리스트에 라벨/비중%/평가금액을 표시(기존 SectorDonutChart 레이아웃 그대로).

## 컴포넌트/파일 구조

- `src/app/page.tsx` — Server Component. 모든 데이터 조회(holdings, trades, portfolio_snapshots, accounts) + 동기화 트리거(기존 로직 유지) + `PortfolioTabs`에 props 전달.
- `src/components/PortfolioTabs.tsx` — Client Component. 탭 상태(`useState`) 관리, 3개 하위 컴포넌트 중 선택된 것만 렌더링.
- `src/components/ProfitTab.tsx` — 수익 탭 내용(요약 카드 3개 + 일별/월별 막대그래프).
- `src/components/TrendTab.tsx` — 추이 탭 내용(기간 필터 + 라인차트).
- `src/components/PortfolioDonutChart.tsx` — 기존 `SectorDonutChart`를 이름 그대로 재사용(파일명/컴포넌트명 변경 없음, import만 해서 씀). 종목별/계좌별 토글은 비중 탭 컴포넌트(`AllocationTab.tsx`)에서 관리하고 차트 자체는 기존 컴포넌트에 위임.
- `src/components/AllocationTab.tsx` — 비중 탭 내용(종목별/계좌별 토글 + `SectorDonutChart` 호출).
- `src/lib/holdings/recalc.ts` — 매도 처리 시 `realized_pnl` 계산 로직 추가(기존 파일 수정, 새 파일 아님).

## 검증 방법

1. 마이그레이션(`portfolio_snapshots`, `trades.realized_pnl`) 적용 후 스키마 확인 스크립트로 실제 반영 확인.
2. 백필 스크립트 실행 후, 기존에 있던 매도 거래(있다면)의 `realized_pnl`이 채워졌는지 DB에서 직접 확인.
3. 로컬에서 `ENABLE_LOCAL_PRICE_SYNC=true`로 dev 서버 실행 → 페이지 로드 → `portfolio_snapshots`에 오늘 날짜 행이 upsert됐는지 확인. 같은 날 두 번째 로드 시 행이 늘지 않고 값만 갱신되는지 확인.
4. 브라우저에서 세 탭 모두 실제로 클릭해 전환되는지, 각 탭의 숫자가 holdings/trades 실제 값과 수기 계산 결과가 일치하는지 대조.
5. 매도 거래를 하나 새로 등록해(테스트 후 삭제) 실현손익이 예상대로 계산되는지 확인.
6. `npx tsc --noEmit`, `npm run build`로 정적/동적 렌더링 정상 여부 확인(이전 세션에서 겪은 정적 프리렌더링 버그 재발 방지 차원에서 반드시 `npm run build` 결과의 `/` 라우트가 `ƒ (Dynamic)`인지 확인).
