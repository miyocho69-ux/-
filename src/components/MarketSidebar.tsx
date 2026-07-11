import { getMarketIndices } from "@/lib/market/indices";
import { getStoredUsdKrwRate, getUsdKrwChangePct } from "@/lib/toss/exchangeRate";
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
  const supabase = createAdminClient();
  const [indices, usdKrwRate, usdKrwChangePct] = await Promise.all([
    getMarketIndices(),
    getStoredUsdKrwRate(supabase),
    getUsdKrwChangePct(supabase),
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
          <div className="font-mono text-xs" style={{ color: changeColor(usdKrwChangePct) }}>
            {formatChangePct(usdKrwChangePct)}
          </div>
        </div>
      </div>
    </aside>
  );
}
