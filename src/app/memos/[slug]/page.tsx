import type { Metadata } from "next";
import { headers } from "next/headers";
import PageLayout from "../../../components/common/PageLayout";
import { MemoDetailPage } from "../../../components/memos/MemoDetailPage";
import { parseContentTags } from "../../../lib/tag-parser";
import { createSsrCaller } from "../../../lib/trpc-ssr";
import { resolveTagIconSvgsForTags } from "../../../server/services/tag-icon-ssr";

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

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
      }
    } catch {
      // ignore JSON parse errors and fall back to comma-separated parsing
    }

    return trimmed
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

export default async function MemoPage({ params }: MemoPageProps) {
  // 等待 params
  const { slug } = await params;

  const h = await headers();
  const caller = await createSsrCaller(h);
  let initialMemo: Awaited<ReturnType<(typeof caller)["memos"]["bySlug"]>> | undefined;
  try {
    initialMemo = await caller.memos.bySlug({ slug });
  } catch {
    initialMemo = undefined;
  }

  const parsed = parseContentTags(String((initialMemo as { content?: unknown })?.content ?? ""));
  const inlineTags = parsed.tags.map((tag) => tag.name);
  const storedTags = normalizeTags((initialMemo as { tags?: unknown })?.tags);
  const derivedTags = Array.from(new Set<string>([...inlineTags, ...storedTags]));

  const { iconMap, svgMap } =
    derivedTags.length > 0
      ? await resolveTagIconSvgsForTags(derivedTags, {
          svgHeight: "12",
          includeHashFallback: true,
        })
      : { iconMap: {}, svgMap: {} };

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
    <PageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <section className="nature-reading-container px-6 py-10">
        <MemoDetailPage
          slug={slug}
          initialData={initialMemo}
          tagIconMap={iconMap}
          tagIconSvgMap={svgMap}
          showEditFeatures={false}
          className="mx-auto max-w-4xl"
        />
      </section>
    </PageLayout>
  );
}
