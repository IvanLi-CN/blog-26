import type { Metadata } from "next";
import { headers } from "next/headers";
import PageLayout from "../../components/common/PageLayout";
import { isLocalContentEnabled } from "../../config/paths";
import { isAdminFromRequest } from "../../lib/auth";
import { getServerLocalMemoRootPath } from "../../lib/memo-paths";
import { parseContentTags } from "../../lib/tag-parser";
import { createSsrCaller } from "../../lib/trpc-ssr";
import { resolveTagIconSvgsForTags } from "../../server/services/tag-icon-ssr";
import { MemosPageContent } from "./MemosPageContent";

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
  alternates: {
    canonical: "/memos",
    types: {
      "application/rss+xml": [{ url: "/memos/feed.xml", title: "Memos RSS Feed" }],
      "application/atom+xml": [{ url: "/atom.xml", title: "Site Atom Feed" }],
      "application/feed+json": [{ url: "/feed.json", title: "Site JSON Feed" }],
    },
  },
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
 * SSR:
 * - 首屏预取 memo 列表，避免骨架屏作为主内容
 * - 仅为首屏可见 memo 的标签按需批量解析并内联 SVG 图标
 */
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

function readSearchParam(
  value: string | string[] | undefined,
  options: { maxLength?: number } = {}
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const maxLength = options.maxLength ?? 200;
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MemosPage({ searchParams }: PageProps) {
  // SSR 判定是否为管理员，用于首屏快速展示管理功能，避免客户端首次请求延迟
  const h = await headers();
  const initialIsAdmin = await isAdminFromRequest(h);

  const sp = (await searchParams) ?? {};
  const initialSearch = readSearchParam(sp.search);
  const initialTag = readSearchParam(sp.tag);

  const caller = await createSsrCaller(h);
  const localSourceEnabled = isLocalContentEnabled();
  const localMemoRootPath = localSourceEnabled ? getServerLocalMemoRootPath() : undefined;
  const initialMemos = await caller.memos.list({
    limit: 20,
    publicOnly: true,
    search: initialSearch || undefined,
    tag: initialTag || undefined,
  });

  const SSR_ICON_MEMO_COUNT = 8;
  const tagsForSsrIcons = (initialMemos.memos ?? [])
    .slice(0, SSR_ICON_MEMO_COUNT)
    .flatMap((memo) => {
      const parsed = parseContentTags(String((memo as { content?: unknown }).content ?? ""));
      const inlineTags = parsed.tags.map((tag) => tag.name);
      const storedTags = normalizeTags((memo as { tags?: unknown }).tags);
      return Array.from(new Set<string>([...inlineTags, ...storedTags]));
    });

  const uniqueTagsForSsrIcons = Array.from(new Set(tagsForSsrIcons));
  const { iconMap, svgMap } =
    uniqueTagsForSsrIcons.length > 0
      ? await resolveTagIconSvgsForTags(uniqueTagsForSsrIcons, {
          svgHeight: "12",
          includeHashFallback: true,
        })
      : { iconMap: {}, svgMap: {} };

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
      <section className="nature-reading-container px-6 py-8 sm:py-12 lg:py-16">
        <div className="mb-8 text-center sm:mb-12">
          <span className="nature-kicker justify-center">Flow Notes</span>
          <h1 className="nature-title mt-4 text-4xl sm:text-5xl lg:text-6xl">Memos</h1>
          <p className="nature-muted mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            记录想法、灵感和日常思考的快速笔记
          </p>
        </div>

        {/* Memos 应用 - 根据用户权限动态显示功能 */}
        <MemosPageContent
          initialIsAdmin={initialIsAdmin}
          initialMemos={initialMemos}
          tagIconMap={iconMap}
          tagIconSvgMap={svgMap}
          localSourceEnabled={localSourceEnabled}
          localMemoRootPath={localMemoRootPath}
        />
      </section>
    </PageLayout>
  );
}
