---
name: portfolio-risk-metrics
description: Sharpe ratio, Markowitz mean-variance comparison (max-Sharpe / min-variance portfolios built from the same holdings), and volatility drag (geometric vs. arithmetic return gap) for this project's actual Supabase holdings, using price history from Toss Securities Open API (not Yahoo Finance). Use whenever the user asks to "평가", "샤프비율 계산해줘", "내 포트폴리오 위험 대비 수익 봐줘", "변동성 손실 계산", "효율적 프론티어랑 비교해줘", or wants a quantitative risk/return read rather than just a qualitative allocation opinion.
---

# Portfolio Risk Metrics (Toss 기반)

## 개요

이 프로젝트(주식 포트폴리오 대시보드)의 실제 보유 종목(Supabase `holdings` 테이블)을 대상으로
세 가지 리스크/수익 지표를 계산한다. 야후 파이낸스가 아니라 **토스증권 Open API**를 데이터
소스로 쓴다 — 이 프로젝트가 이미 토스 자격증명(`TOSS_CLIENT_ID`/`TOSS_CLIENT_SECRET`)과
현재가 동기화 로직을 갖고 있으므로 동일한 소스를 재사용한다.

1. **샤프비율** — (포트폴리오 수익률 − 무위험수익률) / 변동성
2. **마코위츠 비교** — 지금 보유한 것과 동일한 종목들로 만들 수 있는 최선의 조합(샤프 최대화 / 변동성 최소화)과 비교
3. **변동성 손실** — 산술평균 수익률과 기하(복리) 수익률의 차이

미래 수익을 예측하지 않으며, 매매를 실행하지 않는다. 항상 "과거 통계일 뿐" 이라는 점을 요약에 명시할 것.

## 실행 방법

```bash
node .claude/skills/portfolio-risk-metrics/scripts/portfolio_metrics_toss.mjs --years 3
```

내부적으로 하는 일:
1. `loadHoldings.mjs` — Supabase holdings + 토스 현재가(`/api/v1/prices`) + 토스 환율(`/api/v1/exchange-rate`)로 종목별 원화환산 weight 계산 (계좌 여러 개에 걸친 동일 종목은 합산)
2. `fetchCandles.mjs` — 토스 캔들 API(`/api/v1/candles`, 종목당)와 `/api/v1/market-indicators/KR_BOND_2Y/candles`(무위험수익률)를 `before` 파라미터로 페이지네이션하며 일봉 수집. 429 rate limit은 자동 backoff 재시도.
3. `portfolio_metrics_toss.mjs` — 일별 수익률 기반 공분산·연율화(×252/√252)로 샤프비율·마코위츠 비교·변동성 손실 계산 (200,000회 무작위 탐색으로 max-Sharpe/min-variance 근사)

결과는 JSON으로 stdout에 출력된다. 계산 자체는 스크립트가 하고, 사용자에게 보여줄 요약 설명은 Claude가 작성한다.

## 토스 API의 구조적 제약 (야후 버전과의 핵심 차이)

- **일봉만 지원** (`interval=1m` 또는 `1d`, 월봉 없음) → 일별 수익률로 계산, 연율화는 ×252 / √252
- **한 번 호출에 최대 200개 봉** → 여러 해를 모으려면 `before` 페이지네이션 필수 (스크립트가 자동 처리)
- **무위험수익률은 한국 국채 2년물**(`market-indicators/KR_BOND_2Y`) 사용 — 이 포트폴리오가 원화 가중치 기준이므로 미국 T-bill보다 적절한 선택. 국채 캔들의 `closePrice`는 이미 연이율(%) 값.
- **최근 상장/신규 종목은 이력이 짧음** — 스크립트는 `TRADING_DAYS_PER_YEAR`(252일) 미만인 종목을 `tickers_missing_data`로 자동 제외한다. 단, 남은 종목들끼리도 날짜 교집합(공통 거래일)으로 정렬하므로, **보유 종목 중 하나라도 상장 1~2년 이내인 게 있으면 전체 분석 기간이 그 종목의 상장일까지로 단축된다.** 이 경우 `trading_days_used`가 `--years`로 요청한 기간보다 훨씬 짧아질 수 있다 — 결과를 사용자에게 설명할 때 반드시 실제 사용된 기간(`trading_days_used`를 거래일→개월로 환산)을 명시하고, 기간이 짧으면 연율화된 수익률이 그 짧은 구간의 특성(예: 강세장)에 의해 과장/과소될 수 있음을 경고할 것.
- 짧은 기간 때문에 결과가 비현실적으로 보이면(예: 연 수익률이 100%를 넘는 등), `--years`를 줄여서 짧은 이력 종목도 자연스럽게 맞추거나, 반대로 문제가 되는 종목만 제외하고 재계산하는 대안을 사용자에게 제시할 것 — 임의로 데이터를 조작하거나 추정치로 대체하지 말 것.

## 결과 요약 시 반드시 포함할 것

1. **실제 분석 기간**: `trading_days_used`를 실제 개월/년 수로 환산해서 알려준다 (예: "약 307 거래일 ≈ 1.2년"). `--years 3`을 요청해도 실제로는 훨씬 짧을 수 있다는 점을 숨기지 말 것.
2. **제외된 종목**: `tickers_missing_data`에 있는 종목과 제외 사유(신규 상장이라 1년치 데이터 없음 등).
3. **샤프비율**: 숫자와 의미(<1 낮음, 1~2 양호, >2 우수 — 어디까지나 경험칙).
4. **마코위츠 비교**: 현재 배분과 max-Sharpe/min-variance 배분의 차이를 방향성 위주로 설명하되, "과거 데이터에 맞춘 결과(look-ahead bias)"이지 미래 추천이 아니라는 점을 반드시 병기.
5. **변동성 손실**: 산술-기하 수익률 차이를 %p로, 복리 관점에서 구체적으로 설명.
6. **무위험수익률 출처**: 한국 국채 2년물 사용을 명시.

## 근사 방법 관련 참고

max-Sharpe/min-variance는 scipy 없이 무작위 탐색(Dirichlet 분포, 200,000 샘플)으로 근사한 것이며, 종목 수가 20개 안팎이면 실제 최적해에 충분히 가깝지만 정확한 QP(이차계획법) 해는 아니다. "근사치"라고 표현하고, 더 정밀한 계산을 원하면 scipy.optimize 기반 정확한 해를 다음 단계로 제안할 수 있다(먼저 만들어두지는 말 것).
