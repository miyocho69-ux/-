export interface HoldingMover {
  name: string;
  ticker: string;
  changeRate: number; // (last_price - avg_cost) / avg_cost * 100
  changeAmount: number; // 원화 환산된 평가손익
}

export interface HoldingsMoversCardProps {
  movers: HoldingMover[];
}

function formatSignedRate(rate: number): string {
  const sign = rate >= 0 ? "+" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

function formatSignedAmount(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${Math.round(amount).toLocaleString()}원`;
}

export function HoldingsMoversCard({ movers }: HoldingsMoversCardProps) {
  if (movers.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 font-semibold">보유종목 등락 현황</h3>
        <p className="text-sm text-gray-400">시세가 아직 확인되지 않았습니다.</p>
      </div>
    );
  }

  const sorted = [...movers].sort((a, b) => b.changeRate - a.changeRate);

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">보유종목 등락 현황</h3>
      <ul className="space-y-2">
        {sorted.map((m) => (
          <li key={m.ticker} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {m.name} ({m.ticker})
            </span>
            <span className={`tabular-nums font-medium ${m.changeRate >= 0 ? "text-red-600" : "text-blue-600"}`}>
              {formatSignedRate(m.changeRate)} · {formatSignedAmount(m.changeAmount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
