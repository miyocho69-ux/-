import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_KR } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { MarketSidebar } from "@/components/MarketSidebar";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "주식 포트폴리오 대시보드",
  description: "개인 주식 보유현황 및 매매기록 관리 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-full flex-col bg-[#080a10]">
        <NavBar />
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">{children}</div>
          <MarketSidebar />
        </div>
      </body>
    </html>
  );
}
