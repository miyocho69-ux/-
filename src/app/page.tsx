import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function Home() {
  const supabase = createAdminClient();

  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("id, account_id, ticker, name, quantity, avg_cost, accounts(name, market)")
    .order("updated_at", { ascending: false });

  if (error) {
    return <div className="p-8 text-red-600">보유종목을 불러오지 못했습니다: {error.message}</div>;
  }

  const totalCost = (holdings ?? []).reduce(
    (sum, h) => sum + Number(h.quantity) * Number(h.avg_cost),
    0
  );

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">보유종목</h1>

      <div className="rounded-lg border p-4">
        <div className="text-sm text-gray-500">총 매수원가 합계</div>
        <div className="text-xl font-semibold">{totalCost.toLocaleString()}원</div>
      </div>

      <ul className="space-y-2">
        {(holdings ?? []).map((h) => {
          const account = h.accounts as unknown as { name: string; market: string } | null;
          return (
            <li key={h.id} className="rounded border px-4 py-3">
              <div className="font-medium">
                {h.name} ({h.ticker})
              </div>
              <div className="text-sm text-gray-500">
                {account?.name ?? "알 수 없는 계좌"} · {h.quantity}주 · 평단가{" "}
                {Number(h.avg_cost).toLocaleString()}원
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
