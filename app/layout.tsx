import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "费用管理系统",
  description: "中通冷链鲸天系统 - 费用类型维护",
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
