import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engineer Quest — SESエンジニア育成アプリ",
  description:
    "クエストをクリアしてスキルを習得し、成長と想定単価の関係を可視化するゲーミフィケーション育成アプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
