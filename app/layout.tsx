import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智能多格式批量下单系统",
  description: "智能多格式批量下单系统 - 万能导入V2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}
