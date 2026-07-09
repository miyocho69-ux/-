# 해외주식 원화 환산 설계

## 배경

계좌 관리 스킬로 6개 계좌(국내 3개, 해외 1개, 연금저축/ISA 2개)를 실제 데이터로 등록한 뒤, 홈 화면의 총 평가금액/총 실현수익률/비중 탭이 **USD 표시 종목(메리츠증권 해외주식, 12개 종목)과 KRW 표시 종목을 단순 숫자 합산**하고 있다는 게 드러났다. 예를 들어 SMH(달러 단가 471.0758)를 원화 종목과 그대로 더해서 총액에 반영하고 있어, 실제 금액과 완전히 다른 값이 나온다.

이번 세션 이전까지는 실계좌가 1개(NVDA/VRT, 둘 다 사실상 같은 취급)뿐이라 이 문제가 드러나지 않았다. 이제 실제 다통화 데이터가 들어왔으니 고쳐야 한다.

## 목표

`holdings`에 있는 각 종목의 통화(KRW/USD)를 판단해, USD 종목은 토스증권 API의 실시간 환율로 원화 환산한 뒤 모든 합산/비중/추이 계산에 반영한다.

## 통화 판단 규칙

별도 DB 컬럼을 추가하지 않고, **티커 형식으로 판단**한다:
- 첫 글자가 숫자(`0`-`9`)인 티커 → KRW (국내 상장 종목/ETF. 순수 6자리 숫자든, `0019K0`/`0133E0` 같은 혼합형 코드든 첫 글자는 항상 숫자)
- 그 외(알파벳으로 시작) → USD (해외 티커: `SMH`, `VRT`, `GOOGL` 등)

실제 등록된 26개 holdings 전건에 대해 이 규칙을 검증했고 100% 정확히 분류됨을 확인했다(`/^[0-9]/` 정규식).

## 데이터 모델

```sql
create table exchange_rates (
  base_currency text primary key,
  quote_currency text not null,
  rate numeric not null,
  updated_at timestamptz not null default now()
);
```

- `base_currency`가 PK인 소규모 테이블. 현재는 `USD`/`KRW` 한 쌍만 사용하지만, 나중에 다른 통화가 추가돼도 스키마 변경 없이 행만 추가하면 되는 구조.
- RLS enable-only(정책 없음), 기존 프로젝트 관례와 동일.

## 환율 조회/갱신

`src/lib/toss/exchangeRate.ts`(신규):
- `getUsdKrwRate(): Promise<number>` — `GET https://openapi.tossinvest.com/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW`, `getTossAccessToken()` 재사용. 응답의 `rate` 필드 반환.
- `upsertExchangeRate(supabase): Promise<void>` — `getUsdKrwRate()` 호출 후 `exchange_rates`에 `{base_currency: "USD", quote_currency: "KRW", rate, updated_at: now()}` upsert.

`src/app/page.tsx`의 기존 시세 동기화 성공 분기(`ENABLE_LOCAL_PRICE_SYNC === "true"`이고 `syncHoldingPrices()`가 `syncedCount > 0`으로 성공한 직후, 기존 `upsertTodaySnapshot` 호출과 같은 자리)에서 `upsertExchangeRate`도 함께 호출한다. 즉 시세 동기화와 환율 갱신은 항상 같은 타이밍에 일어난다.

로컬(`ENABLE_LOCAL_PRICE_SYNC=true`)에서만 실제로 갱신되고, 배포본은 `exchange_rates`에 저장된 마지막 값을 그대로 읽는다(시세와 동일한 패턴 — Vercel은 IP 제한으로 토스 API를 직접 호출할 수 없으므로 이미 확립된 아키텍처).

## Fallback

`exchange_rates`에 아직 행이 없는 초기 상태(첫 배포 직후, 로컬에서 한 번도 동기화하지 않은 경우)를 대비해 고정 fallback 값을 코드에 상수로 둔다:

```typescript
const FALLBACK_USD_KRW_RATE = 1500;
```

`exchange_rates`에서 조회 결과가 없으면 이 값을 사용한다. 실제 환율과 오차가 있을 수 있지만 "0원"이나 크래시보다는 낫다는 사용자 판단.

## 통화 변환 유틸

`src/lib/portfolio/currency.ts`(신규):

```typescript
export function isKrwTicker(ticker: string): boolean {
  return /^[0-9]/.test(ticker);
}

export function toKrw(value: number, ticker: string, usdKrwRate: number): number {
  return isKrwTicker(ticker) ? value : value * usdKrwRate;
}
```

## 영향받는 계산 로직 (모두 `src/app/page.tsx`)

다음 계산에 전부 `toKrw()`를 적용해 USD 종목의 금액을 원화로 환산한 후 합산하도록 수정한다:

1. **`totalValue`**(총 평가금액 카드) — `(last_price ?? avg_cost) × quantity`를 원화 환산 후 합산
2. **`totalCostBasis`**(총 실현수익률 분모) — `avg_cost × quantity`를 원화 환산 후 합산
3. **`unrealizedPnl`**(평가수익) — `(last_price - avg_cost) × quantity`를 원화 환산 후 합산 (환율 변동 자체로 인한 손익은 이번 범위에서 별도 계산하지 않는다 — 현재 시점 환율로 평가금액과 매수원가를 각각 환산해 차이를 구하는 방식으로 충분히 근사)
4. **`groupByTicker`/`groupByAccount`**(비중 탭) — 슬라이스 값 계산 시 원화 환산 적용
5. **`upsertTodaySnapshot`**(추이 탭 스냅샷) — `total_value`/`total_cost` 계산에 원화 환산 적용. 이렇게 해야 추이 차트도 통화가 섞이지 않는다.
6. **`groupRealizedByDay`/`groupRealizedByMonth`**(실현손익 차트) — `trades.realized_pnl`은 거래 시점의 원래 통화(그 거래의 `ticker` 통화)로 저장되어 있으므로, 합산 시 각 거래의 `ticker`로 통화를 판단해 원화 환산 후 더한다. 이를 위해 두 함수의 인자에 `ticker` 필드를 추가로 넘겨야 한다(`trades` select에 `ticker` 컬럼 추가).

## 범위 밖

- **환율 변동 손익의 별도 표시**: "환차손익"을 평가손익과 분리해서 보여주는 기능은 만들지 않는다. 현재 환율로 일괄 환산하는 것으로 충분하다는 판단.
- **KRW 외 다른 통화**: 현재 등록된 종목은 KRW/USD만 있다. 다른 통화(JPY, EUR 등)가 필요해지면 그때 `exchange_rates`에 행을 추가하고 판단 로직을 확장한다.
- **`trades` 테이블의 과거 매수 시점 환율 소급 적용**: 실현손익은 "거래 시점의 환율"이 아니라 "현재 환율"로 환산한다(과거 시점별 환율 이력을 저장하지 않음 — 정확한 환차손익 회계보다는 대략적인 현재가치 파악이 목적).

## 검증 방법

1. 마이그레이션(`exchange_rates`) 적용 후 스키마 확인.
2. 로컬에서 실제 토스 환율 API 왕복 테스트(이미 1회 확인: 1 USD = 1503.4 KRW).
3. `ENABLE_LOCAL_PRICE_SYNC=true`로 페이지 로드 → `exchange_rates`에 실제 환율 upsert 확인.
4. 홈 화면 총 평가금액을 실제 holdings 데이터로 수기 계산(KRW 종목 합 + USD 종목 합 × 환율)한 값과 대조.
5. 비중 탭에서 메리츠증권 해외주식 계좌의 슬라이스 값이 환산된 원화 기준으로 정확한지 확인.
6. `npx tsc --noEmit`, `npm run build`로 `/`가 여전히 `ƒ (Dynamic)`인지 확인.
