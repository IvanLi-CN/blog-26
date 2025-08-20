import type { Metadata } from "next";
import { MemoDetailPage } from "../../../components/memos/MemoDetailPage";
import { TRPCProvider } from "../../../components/providers/TRPCProvider";

/**
 * Memo 详情页面
 *
 * 支持编辑功能和动态 metadata
 */

interface MemoPageProps {
  params: Promise<{
    slug: string;
  }>;
}

// 生成动态元数据
export async function generateMetadata({ params }: MemoPageProps): Promise<Metadata> {
  // 等待 params
  const { slug } = await params;

  // 简化元数据生成，避免在构建时进行数据库查询
  const title = `Memo ${slug}`;
  const description = "查看这个 memo";
  const url = `/memos/${slug}`;

  return {
    title: `${title} - Memos`,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url,
      images: [
        {
          url: "/og-memo-default.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-memo-default.png"],
    },
    alternates: {
      canonical: url,
    },
  };
}

// 生成静态参数（可选，用于 SSG）
export async function generateStaticParams() {
  // 暂时返回空数组，使用动态路由
  return [];
}

export default async function MemoPage({ params }: MemoPageProps) {
  // 等待 params
  const { slug } = await params;

  // 简化的结构化数据
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: `Memo ${slug}`,
    url: `/memos/${slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `/memos/${slug}`,
    },
    publisher: {
      "@type": "Organization",
      name: "Memos",
    },
    articleSection: "Memo",
    inLanguage: "zh-CN",
  };

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
          <MemoDetailPage slug={slug} showEditFeatures={false} className="max-w-4xl mx-auto" />
        </TRPCProvider>
      </div>
    </>
  );
}
