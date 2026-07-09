import { createAdminClient } from "@/lib/supabase/admin";
import { createAccount, deleteAccount } from "@/lib/actions/accounts";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = createAdminClient();
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, name, broker, market, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return <div className="p-8 text-red-600">계좌 목록을 불러오지 못했습니다: {error.message}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">계좌 관리</h1>

      <form action={createAccount} className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">새 계좌 추가</h2>
        <input
          name="name"
          placeholder="계좌 이름 (예: 토스 국내)"
          required
          className="w-full rounded border px-3 py-2"
        />
        <input
          name="broker"
          placeholder="증권사 (예: 토스증권)"
          className="w-full rounded border px-3 py-2"
        />
        <select name="market" required className="w-full rounded border px-3 py-2">
          <option value="">시장 선택</option>
          <option value="KR">국내</option>
          <option value="US">미국</option>
        </select>
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          추가
        </button>
      </form>

      <ul className="space-y-2">
        {(accounts ?? []).map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between rounded border px-4 py-3"
          >
            <div>
              <div className="font-medium">{account.name}</div>
              <div className="text-sm text-gray-500">
                {account.broker ?? "증권사 미지정"} · {account.market === "KR" ? "국내" : "미국"}
              </div>
            </div>
            <form action={deleteAccount.bind(null, account.id)}>
              <button type="submit" className="text-sm text-red-600 hover:underline">
                삭제
              </button>
            </form>
          </li>
        ))}
        {(accounts ?? []).length === 0 && (
          <li className="text-gray-500">등록된 계좌가 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
