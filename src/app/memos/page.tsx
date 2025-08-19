import type { Metadata } from "next";
import PageLayout from "../../components/common/PageLayout";
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

/**
 * Memos 页面组件
 *
 * 完全匹配旧项目 (Astro) 的闪念列表页面样式和布局
 * 包括页面标题、QuickMemoEditor 和时间线样式的 memo 列表
 *
 * TODO: 添加 SSR 支持以提升首屏加载性能
 */
export default function MemosPage() {
  return (
    <PageLayout>
      {/* 结构化数据 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />

      {/* 页面内容 - 完全匹配旧项目的布局和样式 */}
      <section className="px-4 sm:px-6 py-8 sm:py-12 lg:py-16 mx-auto max-w-4xl">
        {/* 页面标题 - 匹配旧项目的 Headline 组件样式 */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-base-content mb-4">
            Memos
          </h1>
          <p className="text-base sm:text-lg text-base-content/70 max-w-2xl mx-auto">
            记录想法、灵感和日常思考的快速笔记
          </p>
        </div>

        {/* Memos 应用 - 启用管理员功能以显示 QuickMemoEditor */}
        <TRPCProvider>
          <MemosApp publicOnly={false} showManageFeatures={true} initialView="list" />
        </TRPCProvider>
      </section>
    </PageLayout>
  );
}
