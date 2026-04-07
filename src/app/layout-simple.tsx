import type { Metadata } from "next";
import "./globals.css";
import "./nature-restored.css";

export const metadata: Metadata = {
  title: "Ivan's Blog",
  description: "Ivan Li 的个人博客，分享技术文章、项目经验和思考",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
