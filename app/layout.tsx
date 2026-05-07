import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "鲸天管理系统",
  description: "中通冷链鲸天系统",
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
