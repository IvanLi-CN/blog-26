import type { Metadata } from "next";
import { MemosApp } from "../../components/memos/MemosApp";
import { TRPCProvider } from "../../components/providers/TRPCProvider";

/**
 * Memo 列表页面
 *
 * 支持 SSR 优化和 SEO metadata
 */

// 页面元数据
export const metadata: Metadata = {
  title: "Memos - 记录想法，分享见解",
  description: "浏览所有公开的 memo，发现有趣的想法和见解。支持搜索、标签过滤和时间线浏览。",
  keywords: ["memo", "笔记", "想法", "分享", "博客"],
  openGraph: {
    title: "Memos - 记录想法，分享见解",
    description: "浏览所有公开的 memo，发现有趣的想法和见解。",
    type: "website",
    url: "/memos",
    images: [
      {
        url: "/og-memos.png", // 需要创建这个图片
        width: 1200,
        height: 630,
        alt: "Memos - 记录想法，分享见解",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Memos - 记录想法，分享见解",
    description: "浏览所有公开的 memo，发现有趣的想法和见解。",
    images: ["/og-memos.png"],
  },
  alternates: {
    canonical: "/memos",
  },
};

// 结构化数据
const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Memos",
  description: "记录想法，分享见解的 memo 集合",
  url: "/memos",
  mainEntity: {
    "@type": "ItemList",
    name: "Memo 列表",
    description: "所有公开的 memo 列表",
  },
};

export default function MemosPage() {
  return (
    <>
      {/* 结构化数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />

      {/* 页面内容 */}
      <div className="container mx-auto px-4 py-8">
        <TRPCProvider>
          <MemosApp
            publicOnly={true}
            showManageFeatures={false}
            initialView="list"
            className="max-w-6xl mx-auto"
          />
        </TRPCProvider>
      </div>
    </>
  );
}
