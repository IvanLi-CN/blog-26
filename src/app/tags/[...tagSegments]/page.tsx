import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { buildTagHref } from "@/lib/tag-href";
import { createSsrCaller } from "@/lib/trpc-ssr";
import { resolveTagIconSvgsForTags, TAG_ICON_HASH_FALLBACK } from "@/server/services/tag-icon-ssr";
import { formatUnknownError } from "@/utils/error-format";
import TagTimeline from "./TagTimeline";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SsrCaller = Awaited<ReturnType<typeof createSsrCaller>>;
type TimelinePage = Awaited<ReturnType<SsrCaller["tags"]["timeline"]>>;

interface PageProps {
  params: Promise<{ tagSegments?: string[] }>;
}

function decodePathSegment(segment: string) {
  return decodeURIComponent(segment);
}

function buildTagPath(tagSegments: string[] | undefined) {
  return (tagSegments ?? [])
    .map(decodePathSegment)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export default async function TagDetailPage({ params }: PageProps) {
  const { tagSegments } = await params;
  const tagPath = buildTagPath(tagSegments);

  if (!tagPath) {
    notFound();
  }

  const segments = tagPath.split("/").filter(Boolean);
  const leafTag = segments.at(-1) ?? tagPath;
  let queryTagPath = tagPath;
  let initialTimelinePage: TimelinePage | null = null;

  try {
    const h = await headers();
    const caller = await createSsrCaller(h);
    const candidates = [tagPath, `#${tagPath}`];
    for (const candidate of candidates) {
      const page = await caller.tags.timeline({ tagPath: candidate, limit: PAGE_SIZE });
      if (page.items.length > 0) {
        queryTagPath = candidate;
        initialTimelinePage = page;
        break;
      }
    }
  } catch (error) {
    console.error(`❌ [TagDetailPage] Failed to load tag timeline '${tagPath}'`, error);
    return renderTagPageError(leafTag, error);
  }

  if (!initialTimelinePage || initialTimelinePage.items.length === 0) {
    // 未找到该标签（含子标签）对应的公开内容，返回 404，避免产生可抓取的空页面
    notFound();
  }

  const iconTagPaths = new Set<string>();
  iconTagPaths.add(tagPath);
  for (const item of initialTimelinePage.items) {
    for (const tag of item.tags?.slice(0, 3) ?? []) {
      iconTagPaths.add(tag);
    }
  }
  const { iconMap: tagIconMap, svgMap: tagIconSvgMap } = await resolveTagIconSvgsForTags(
    Array.from(iconTagPaths),
    { svgHeight: "20" }
  );
  const resolvedHeaderIcon = tagIconMap[tagPath] ?? null;
  const headerIconId = resolvedHeaderIcon ?? TAG_ICON_HASH_FALLBACK;
  const headerIconSvg = tagIconSvgMap[headerIconId] ?? null;

  const breadcrumbItems = segments.map((segment, index) => {
    const partialPath = segments.slice(0, index + 1).join("/");
    return { label: segment, href: buildTagHref(partialPath) };
  });

  return (
    <PageLayout>
      <section className="nature-reading-container px-6 py-8 lg:py-12">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--nature-text-soft)]">
            <li>
              <Link
                href="/tags"
                className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
              >
                标签
              </Link>
            </li>
            {breadcrumbItems.map((item) => (
              <li key={item.href} className="flex items-center gap-2">
                <Icon
                  name="tabler:chevron-right"
                  className="h-4 w-4 text-[color:var(--nature-text-faint)]"
                />
                <Link
                  href={item.href}
                  prefetch={false}
                  className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className="nature-surface mb-8 flex items-center justify-between gap-4 px-5 py-5">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)] md:text-3xl">
              {headerIconSvg ? (
                <span
                  className="inline-flex text-[color:var(--nature-accent-strong)] [&>svg]:h-5 [&>svg]:w-5"
                  dangerouslySetInnerHTML={{ __html: headerIconSvg }}
                />
              ) : (
                <Icon
                  name={headerIconId}
                  className="h-5 w-5 text-[color:var(--nature-accent-strong)]"
                />
              )}
              <span className="truncate">{leafTag}</span>
            </h1>
            <p className="mt-2 truncate text-sm text-[color:var(--nature-text-soft)]">#{tagPath}</p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-4 text-sm">
            <Link href="/tags" className="nature-button nature-button-ghost min-h-10 px-4 py-2">
              <Icon name="tabler:tags" className="w-4 h-4" />
              返回
            </Link>
          </div>
        </div>

        <TagTimeline
          tagPath={queryTagPath}
          initialPage={initialTimelinePage}
          tagIconMap={tagIconMap}
          tagIconSvgMap={tagIconSvgMap}
        />
      </section>
    </PageLayout>
  );
}

function renderTagPageError(tagLeaf: string, error: unknown) {
  const { message, details } = formatUnknownError(error);
  return (
    <PageLayout>
      <section className="nature-reading-container px-6 py-10">
        <div className="nature-alert nature-alert-error block p-6">
          <div className="flex items-center gap-3 text-[color:var(--nature-danger)]">
            <Icon name="tabler:alert-triangle" className="h-6 w-6" />
            <h1 className="text-xl font-semibold">无法加载标签 {tagLeaf || "(unknown)"}</h1>
          </div>
          <p className="mt-4 text-sm text-[color:var(--nature-text-soft)]">
            获取该标签内容时出现错误，详细信息已记录在服务端日志中：
          </p>
          <p className="mt-2 whitespace-pre-wrap font-mono text-base text-[color:var(--nature-danger)]">
            {message}
          </p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-[1.25rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.72)] p-4 text-xs">
            {details}
          </pre>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-[color:var(--nature-text-soft)]">
            <Link href="/tags" className="nature-link-inline">
              返回标签列表
            </Link>
            <span>刷新页面或稍后重试以重新触发请求。</span>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
