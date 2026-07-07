import Link from "next/link";

export function NavBar() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 px-8 py-4 text-sm">
        <Link href="/" className="font-semibold">
          홈
        </Link>
        <Link href="/accounts" className="underline">
          계좌 관리
        </Link>
        <Link href="/trades" className="underline">
          매매기록
        </Link>
        <Link href="/analysis" className="underline">
          계좌 분석
        </Link>
      </nav>
    </header>
  );
}
