import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RiskPortfolioStats {
  weights: Record<string, number>;
  expected_annual_return_arithmetic: number;
  annual_volatility: number;
  sharpe_ratio: number | null;
  geometric_return_estimate?: number;
  volatility_drag?: number;
}

interface RiskResult {
  methodology_note: string;
  data_source: string;
  tickers_used: string[];
  tickers_missing_data: string[];
  lookback_years: number;
  trading_days_used: number;
  usd_krw_rate: number;
  risk_free_rate: number;
  risk_free_rate_source: string;
  risk_free_rate_is_fallback_estimate: boolean;
  current_portfolio: RiskPortfolioStats;
  max_sharpe_comparison_portfolio: RiskPortfolioStats;
  min_variance_comparison_portfolio: RiskPortfolioStats;
}

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function sharpeLabel(sharpe: number | null): { label: string; color: string } {
  if (sharpe == null) return { label: "계산 불가", color: "var(--text-faint)" };
  if (sharpe < 1) return { label: "낮음", color: "var(--color-down)" };
  if (sharpe < 2) return { label: "양호", color: "var(--text-body)" };
  if (sharpe < 3) return { label: "우수", color: "var(--accent-teal)" };
  return { label: "매우 우수 (짧은 관측기간 영향일 수 있음)", color: "var(--accent-teal)" };
}

/**
 * 현재 배분과 max-Sharpe/min-variance 배분을 비교해, 비중 차이가 큰 순서로
 * "늘리면 과거 기준 유리했던" / "줄이면 과거 기준 유리했던" 종목을 뽑는다.
 * 어디까지나 과거 통계에 대한 사후 비교이며 매매 추천이 아니라는 점을 페이지 문구로 명시한다.
 */
function buildAdjustmentHints(
  current: Record<string, number>,
  target: Record<string, number>,
  tickerNames: Map<string, string>,
  minDiff = 0.02
): { ticker: string; name: string; currentPct: number; targetPct: number; diff: number }[] {
  const tickers = new Set([...Object.keys(current), ...Object.keys(target)]);
  const rows = Array.from(tickers).map((t) => {
    const c = current[t] ?? 0;
    const g = target[t] ?? 0;
    return { ticker: t, name: tickerNames.get(t) ?? t, currentPct: c, targetPct: g, diff: g - c };
  });
  return rows.filter((r) => Math.abs(r.diff) >= minDiff).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export default async function RiskPage() {
  const supabase = createAdminClient();

  const [{ data: snapshot, error: snapshotError }, { data: holdings }] = await Promise.all([
    supabase.from("portfolio_risk_snapshot").select("result, computed_at").eq("id", true).maybeSingle(),
    supabase.from("holdings").select("ticker, name"),
  ]);

  const tickerNames = new Map((holdings ?? []).map((h) => [h.ticker, h.name]));

  if (snapshotError) {
    return (
      <div className="mx-auto max-w-4xl p-7" style={{ color: "var(--color-down)" }}>
        리스크 스냅샷을 불러오지 못했습니다: {snapshotError.message}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-7">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
          리스크 분석
        </h1>
        <div
          className="rounded-xl border p-5 text-sm"
          style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)", color: "var(--text-body)" }}
        >
          아직 계산된 결과가 없습니다. 아래 명령을 로컬에서 실행하면 이 페이지에 표시됩니다.
          <pre
            className="mt-3 overflow-auto rounded-lg p-3 font-mono text-xs"
            style={{ background: "#0b0f16", color: "var(--text-tertiary)" }}
          >
            {`node .claude/skills/portfolio-risk-metrics/scripts/portfolio_metrics_toss.mjs --years 3 --min-history-days 500 --save`}
          </pre>
        </div>
      </div>
    );
  }

  const result = snapshot.result as RiskResult;
  const computedAt = new Date(snapshot.computed_at);
  const computedAtLabel = computedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const monthsUsed = (result.trading_days_used / 252) * 12;

  const sharpeInfo = sharpeLabel(result.current_portfolio.sharpe_ratio);

  const towardMaxSharpe = buildAdjustmentHints(
    result.current_portfolio.weights,
    result.max_sharpe_comparison_portfolio.weights,
    tickerNames
  );
  const towardMinVariance = buildAdjustmentHints(
    result.current_portfolio.weights,
    result.min_variance_comparison_portfolio.weights,
    tickerNames
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-7">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-headline)" }}>
          리스크 분석
        </h1>
        <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
          {computedAtLabel} 계산 (토스 API 기반)
        </span>
      </div>

      <div
        className="rounded-xl border p-4 text-xs leading-relaxed"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)", color: "var(--text-muted)" }}
      >
        {result.methodology_note} 실제 사용된 관측 기간은 <b>{result.trading_days_used}거래일 (약 {monthsUsed.toFixed(1)}개월)</b>
        입니다 — 요청한 {result.lookback_years}년보다 짧을 수 있으며, 그 경우 이 짧은 구간의 시장 상황(강세장/약세장)이 수치에
        그대로 반영됩니다.
        {result.tickers_missing_data.length > 0 && (
          <div className="mt-2">
            제외된 종목 (이력 부족 등): {result.tickers_missing_data.map((t) => tickerNames.get(t) ?? t).join(", ")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <div className="rounded-xl border p-4.5" style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}>
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            샤프비율
          </div>
          <div className="font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
            {result.current_portfolio.sharpe_ratio?.toFixed(2) ?? "-"}
          </div>
          <div className="mt-1 text-xs" style={{ color: sharpeInfo.color }}>
            {sharpeInfo.label}
          </div>
        </div>
        <div className="rounded-xl border p-4.5" style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}>
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            연 변동성
          </div>
          <div className="font-mono text-2xl font-bold" style={{ color: "var(--text-headline)" }}>
            {pct(result.current_portfolio.annual_volatility)}
          </div>
        </div>
        <div className="rounded-xl border p-4.5" style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}>
          <div className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            변동성 손실
          </div>
          <div className="font-mono text-2xl font-bold" style={{ color: "var(--color-down)" }}>
            {result.current_portfolio.volatility_drag != null ? pct(result.current_portfolio.volatility_drag) : "-"}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
            산술 {pct(result.current_portfolio.expected_annual_return_arithmetic)} → 기하{" "}
            {result.current_portfolio.geometric_return_estimate != null
              ? pct(result.current_portfolio.geometric_return_estimate)
              : "-"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4.5" style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}>
        <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--text-body)" }}>
          마코위츠 비교 (동일 종목, 다른 비중)
        </h2>
        <div className="grid grid-cols-3 gap-2 border-b pb-2 text-xs font-semibold" style={{ borderColor: "var(--border-row)", color: "var(--text-faint)" }}>
          <div>구분</div>
          <div className="text-right">연 수익률 / 변동성</div>
          <div className="text-right">샤프비율</div>
        </div>
        {[
          { label: "현재 배분", stats: result.current_portfolio },
          { label: "샤프 최대화 (과거 기준)", stats: result.max_sharpe_comparison_portfolio },
          { label: "변동성 최소화 (과거 기준)", stats: result.min_variance_comparison_portfolio },
        ].map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-3 gap-2 border-b py-2 text-sm"
            style={{ borderColor: "var(--border-row)" }}
          >
            <div style={{ color: "var(--text-body)" }}>{row.label}</div>
            <div className="text-right font-mono" style={{ color: "var(--text-tertiary)" }}>
              {pct(row.stats.expected_annual_return_arithmetic)} / {pct(row.stats.annual_volatility)}
            </div>
            <div className="text-right font-mono" style={{ color: "var(--text-tertiary)" }}>
              {row.stats.sharpe_ratio?.toFixed(2) ?? "-"}
            </div>
          </div>
        ))}
        <div className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
          '샤프 최대화'/'변동성 최소화' 배분은 위 관측 기간에 사후적으로 가장 잘 맞았던 조합을 무작위 탐색으로 근사한
          것으로, 앞으로도 그대로 유효하다는 보장은 없습니다(look-ahead bias). 매매 추천이 아니라 비교 참고용입니다.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <AdjustmentCard
          title="변동성을 낮추고 싶다면 (과거 기준 참고)"
          hints={towardMinVariance}
        />
        <AdjustmentCard
          title="샤프비율을 높이고 싶다면 (과거 기준 참고)"
          hints={towardMaxSharpe}
        />
      </div>

      <div
        className="rounded-xl border p-4 text-xs leading-relaxed"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)", color: "var(--text-faint)" }}
      >
        무위험수익률: {result.risk_free_rate_source} ({pct(result.risk_free_rate, 2)})
        {result.risk_free_rate_is_fallback_estimate && " — 실제 조회 실패로 추정값 사용"}. USD/KRW 환율{" "}
        {result.usd_krw_rate.toLocaleString()}원 기준. 재계산하려면{" "}
        <code className="rounded px-1" style={{ background: "#0b0f16" }}>
          node .claude/skills/portfolio-risk-metrics/scripts/portfolio_metrics_toss.mjs --years 3 --min-history-days 500 --save
        </code>{" "}
        실행.
      </div>
    </div>
  );
}

function AdjustmentCard({
  title,
  hints,
}: {
  title: string;
  hints: { ticker: string; name: string; currentPct: number; targetPct: number; diff: number }[];
}) {
  return (
    <div className="rounded-xl border p-4.5" style={{ background: "var(--bg-panel)", borderColor: "var(--border-card)" }}>
      <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-body)" }}>
        {title}
      </h3>
      {hints.length === 0 && (
        <div className="text-xs" style={{ color: "var(--text-faint)" }}>
          현재 배분과 비교 포트폴리오 간 유의미한 차이가 없습니다.
        </div>
      )}
      <div className="space-y-2">
        {hints.slice(0, 6).map((h) => (
          <div key={h.ticker} className="flex items-center justify-between text-sm">
            <span className="truncate" style={{ color: "var(--text-body)" }}>
              {h.name}
            </span>
            <span
              className="shrink-0 font-mono text-xs"
              style={{ color: h.diff > 0 ? "var(--accent-teal)" : "var(--color-down)" }}
            >
              {pct(h.currentPct)} → {pct(h.targetPct)} ({h.diff > 0 ? "+" : ""}
              {pct(h.diff)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
