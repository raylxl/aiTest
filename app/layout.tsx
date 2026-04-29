import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "费用类型维护 - 基础管理 - 业务基础数据",
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
