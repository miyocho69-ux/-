import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "홈" },
  { href: "/accounts", label: "계좌 관리" },
  { href: "/trades", label: "매매기록" },
  { href: "/analysis", label: "계좌 분석" },
  { href: "/risk", label: "리스크 분석" },
];

function todayKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

export function NavBar() {
  return (
    <header
      className="flex h-[60px] shrink-0 items-center gap-9 border-b px-7"
      style={{ background: "var(--bg-nav)", borderColor: "var(--border-card)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-[9px] w-[9px] rounded-full"
          style={{ background: "var(--accent-teal)", animation: "livedot 2s infinite" }}
        />
        <span
          className="font-mono text-base font-bold tracking-wide"
          style={{ color: "var(--text-headline)" }}
        >
          STOCK<span style={{ color: "var(--accent-teal)" }}>TERM</span>
        </span>
      </div>
      <nav className="flex gap-1">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-[#161b26]"
            style={{ color: "var(--text-muted)" }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
        {todayKst()} 기준
      </div>
    </header>
  );
}
