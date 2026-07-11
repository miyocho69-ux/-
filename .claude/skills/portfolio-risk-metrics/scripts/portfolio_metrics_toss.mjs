#!/usr/bin/env node
/**
 * portfolio_metrics_toss.mjs
 *
 * Same three diagnostics as the original yfinance-based skill (Sharpe ratio,
 * Markowitz max-Sharpe / min-variance comparison, volatility drag), but
 * sourced entirely from Toss Securities Open API candle data instead of
 * Yahoo Finance, since this project already holds Toss credentials and the
 * user's holdings/prices already flow through Toss.
 *
 * Differences from the yfinance version:
 *  - Daily candles (Toss only offers 1m/1d, no monthly) -> daily returns,
 *    annualized with sqrt(252) / *252 instead of monthly's sqrt(12)/*12.
 *  - Risk-free rate: Toss KR 2Y government bond yield
 *    (/api/v1/market-indicators/KR_BOND_2Y/candles), not a US T-bill --
 *    appropriate since this portfolio's weights are computed in KRW.
 *  - Holdings/weights are pulled live from Supabase + Toss last price +
 *    Toss USD/KRW rate, not typed in by hand.
 *
 * Usage: node portfolio_metrics_toss.mjs [--years 3]
 * Output: single JSON object on stdout.
 */

import { loadHoldingsWithWeights } from "./loadHoldings.mjs";
import { fetchTickerCandles, fetchIndicatorCandles } from "./fetchCandles.mjs";
import { getSupabaseAdminClient } from "../../_lib/supabase.mjs";

const TRADING_DAYS_PER_YEAR = 252;

function parseArgs() {
  const args = process.argv.slice(2);
  let years = 3;
  let minHistoryDays = TRADING_DAYS_PER_YEAR;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--years") years = Number(args[++i]);
    if (args[i] === "--min-history-days") minHistoryDays = Number(args[++i]);
  }
  return { years, minHistoryDays };
}

function dailyReturns(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(closes[i] / closes[i - 1] - 1);
  }
  return returns;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function annualizeReturn(dailyRets) {
  return (1 + mean(dailyRets)) ** TRADING_DAYS_PER_YEAR - 1;
}

function annualizeVol(dailyRets) {
  const m = mean(dailyRets);
  const variance = mean(dailyRets.map((r) => (r - m) ** 2));
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function covarianceMatrix(returnSeries) {
  // returnSeries: array of aligned daily return arrays (same length, same dates), one per ticker
  const n = returnSeries.length;
  const means = returnSeries.map(mean);
  const T = returnSeries[0].length;
  const cov = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) {
        s += (returnSeries[i][t] - means[i]) * (returnSeries[j][t] - means[j]);
      }
      const c = (s / T) * TRADING_DAYS_PER_YEAR;
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }
  return cov;
}

function portfolioStats(weights, meanReturns, cov) {
  const n = weights.length;
  let portReturn = 0;
  for (let i = 0; i < n; i++) portReturn += weights[i] * meanReturns[i];

  let portVar = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      portVar += weights[i] * weights[j] * cov[i][j];
    }
  }
  portVar = Math.max(portVar, 0);
  return { portReturn, portVar, portVol: Math.sqrt(portVar) };
}

function randomLongOnlyWeights(n, rng) {
  // Dirichlet(1,...,1) via normalized exponential samples
  const samples = Array.from({ length: n }, () => -Math.log(rng()));
  const sum = samples.reduce((a, b) => a + b, 0);
  return samples.map((s) => s / sum);
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function maxSharpePortfolio(meanReturns, cov, rf, nPortfolios, seed) {
  const rng = mulberry32(seed);
  const n = meanReturns.length;
  let best = { sharpe: -Infinity, weights: null };
  for (let k = 0; k < nPortfolios; k++) {
    const w = randomLongOnlyWeights(n, rng);
    const { portReturn, portVol } = portfolioStats(w, meanReturns, cov);
    if (portVol === 0) continue;
    const sharpe = (portReturn - rf) / portVol;
    if (sharpe > best.sharpe) best = { sharpe, weights: w };
  }
  return best;
}

function minVariancePortfolio(meanReturns, cov, nPortfolios, seed) {
  const rng = mulberry32(seed);
  const n = meanReturns.length;
  let best = { variance: Infinity, weights: null };
  for (let k = 0; k < nPortfolios; k++) {
    const w = randomLongOnlyWeights(n, rng);
    const { portVar } = portfolioStats(w, meanReturns, cov);
    if (portVar < best.variance) best = { variance: portVar, weights: w };
  }
  return best;
}

async function main() {
  const { years, minHistoryDays } = parseArgs();
  const sinceDate = new Date();
  sinceDate.setFullYear(sinceDate.getFullYear() - years);

  process.stderr.write(`[1/4] holdings + 현재가 + 환율 조회 중...\n`);
  const { holdings, usdKrw, missingPrice } = await loadHoldingsWithWeights();

  process.stderr.write(`[2/4] 무위험수익률(KR 국채 2년물) 조회 중...\n`);
  const bondCandles = await fetchIndicatorCandles("KR_BOND_2Y", sinceDate);
  const latestBondYield = bondCandles.length > 0 ? bondCandles[bondCandles.length - 1].close / 100 : null;
  const rfIsFallback = latestBondYield == null;
  const rf = latestBondYield ?? 0.03;

  process.stderr.write(`[3/4] ${holdings.length}개 종목 일별 캔들 조회 중 (최대 ${years}년치)...\n`);
  const tickerData = [];
  const missingData = [...missingPrice];
  for (const [i, h] of holdings.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    try {
      const candles = await fetchTickerCandles(h.ticker, sinceDate);
      if (candles.length < minHistoryDays) {
        missingData.push(h.ticker);
        continue;
      }
      tickerData.push({ ...h, candles });
      process.stderr.write(`  ${h.ticker}: ${candles.length}개 캔들\n`);
    } catch (err) {
      process.stderr.write(`  ${h.ticker} 조회 실패: ${err.message}\n`);
      missingData.push(h.ticker);
    }
  }

  process.stderr.write(`[4/4] 지표 계산 중...\n`);

  if (tickerData.length < 2) {
    console.log(JSON.stringify({
      error: "1년 이상 가격 이력이 있는 종목이 2개 미만이라 공분산을 계산할 수 없습니다.",
      tickers_missing_data: missingData,
    }, null, 2));
    process.exit(1);
  }

  // Align on common dates (intersection) so covariance is computed on matched trading days.
  const dateSets = tickerData.map((t) => new Set(t.candles.map((c) => c.date)));
  const commonDates = tickerData[0].candles
    .map((c) => c.date)
    .filter((d) => dateSets.every((s) => s.has(d)))
    .sort();

  if (commonDates.length < 60) {
    console.log(JSON.stringify({
      error: `종목 간 공통 거래일이 ${commonDates.length}일뿐이라 신뢰할 수 있는 공분산을 계산할 수 없습니다.`,
      tickers_missing_data: missingData,
      tickers_used_attempted: tickerData.map((t) => t.ticker),
    }, null, 2));
    process.exit(1);
  }

  const returnSeries = tickerData.map((t) => {
    const closeByDate = new Map(t.candles.map((c) => [c.date, c.close]));
    const closes = commonDates.map((d) => closeByDate.get(d));
    return dailyReturns(closes);
  });

  const meanReturns = returnSeries.map(annualizeReturn);
  const cov = covarianceMatrix(returnSeries);

  const rawWeights = tickerData.map((t) => t.weight);
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map((w) => w / weightSum);

  const { portReturn, portVar, portVol } = portfolioStats(weights, meanReturns, cov);
  const sharpe = portVol > 0 ? (portReturn - rf) / portVol : null;
  const geoReturn = portReturn - portVar / 2;
  const drag = portReturn - geoReturn;

  const nPortfolios = 200_000;
  const maxSharpe = maxSharpePortfolio(meanReturns, cov, rf, nPortfolios, 42);
  const minVar = minVariancePortfolio(meanReturns, cov, nPortfolios, 7);

  const maxSharpeStats = portfolioStats(maxSharpe.weights, meanReturns, cov);
  const minVarStats = portfolioStats(minVar.weights, meanReturns, cov);

  const tickers = tickerData.map((t) => t.ticker);

  const result = {
    methodology_note:
      `모든 기대수익률과 변동성은 토스증권 Open API의 최근 ${years}년 일별 종가로 계산한 과거 통계입니다 — ` +
      `미래를 보장하지 않습니다. 'Sharpe 최대화'/'변동성 최소화' 포트폴리오는 현재 보유한 것과 동일한 종목들로 ` +
      `구성 가능한 최선의 조합(무작위 탐색 근사)이며, 그대로 따라야 할 추천이 아니라 비교 참고용입니다.`,
    data_source: "Toss Securities Open API (candles, prices, exchange-rate, market-indicators)",
    tickers_used: tickers,
    tickers_missing_data: missingData,
    lookback_years: years,
    trading_days_used: commonDates.length,
    usd_krw_rate: usdKrw,
    risk_free_rate: rf,
    risk_free_rate_source: "KR_BOND_2Y (토스 시장지표 캔들 최신 종가, 연이율)",
    risk_free_rate_is_fallback_estimate: rfIsFallback,
    current_portfolio: {
      weights: Object.fromEntries(tickers.map((t, i) => [t, weights[i]])),
      expected_annual_return_arithmetic: portReturn,
      annual_volatility: portVol,
      sharpe_ratio: sharpe,
      geometric_return_estimate: geoReturn,
      volatility_drag: drag,
    },
    max_sharpe_comparison_portfolio: {
      weights: Object.fromEntries(tickers.map((t, i) => [t, maxSharpe.weights[i]])),
      expected_annual_return_arithmetic: maxSharpeStats.portReturn,
      annual_volatility: maxSharpeStats.portVol,
      sharpe_ratio: maxSharpe.sharpe,
    },
    min_variance_comparison_portfolio: {
      weights: Object.fromEntries(tickers.map((t, i) => [t, minVar.weights[i]])),
      expected_annual_return_arithmetic: minVarStats.portReturn,
      annual_volatility: minVarStats.portVol,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (process.argv.includes("--save")) {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("portfolio_risk_snapshot").upsert({
      id: true,
      result,
      computed_at: new Date().toISOString(),
    });
    if (error) throw error;
    process.stderr.write(`저장 완료: portfolio_risk_snapshot\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
