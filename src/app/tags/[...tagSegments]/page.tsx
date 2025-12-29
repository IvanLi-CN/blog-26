import Link from "next/link";
import { notFound } from "next/navigation";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { buildTagHref } from "@/lib/tag-href";
import { createCaller } from "@/lib/trpc-ssr";
import { buildMockRequestUrl } from "@/lib/url-builder";
import { createContext } from "@/server/context";
import { formatUnknownError } from "@/utils/error-format";
import TagTimeline from "./TagTimeline";

export const dynamic = "force-dynamic";

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

async function getTrpcCaller() {
  const mockRequestUrl = buildMockRequestUrl("/api/trpc");
  const req = new Request(mockRequestUrl);
  const resHeaders = new Headers();
  return createCaller(await createContext({ req, resHeaders }));
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
  let hasAnyContent = false;

  try {
    const caller = await getTrpcCaller();
    const candidates = [tagPath, `#${tagPath}`];
    for (const candidate of candidates) {
      const firstPage = await caller.tags.timeline({ tagPath: candidate, limit: 1 });
      if (firstPage.items.length > 0) {
        queryTagPath = candidate;
        hasAnyContent = true;
        break;
      }
    }
  } catch (error) {
    console.error(`❌ [TagDetailPage] Failed to load tag timeline '${tagPath}'`, error);
    return renderTagPageError(leafTag, error);
  }

  if (!hasAnyContent) {
    // 未找到该标签（含子标签）对应的公开内容，返回 404，避免产生可抓取的空页面
    notFound();
  }

  const breadcrumbItems = segments.map((segment, index) => {
    const partialPath = segments.slice(0, index + 1).join("/");
    return { label: segment, href: buildTagHref(partialPath) };
  });

  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-4xl">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-base-content/60">
            <li>
              <Link href="/tags" className="hover:text-primary transition-colors">
                标签
              </Link>
            </li>
            {breadcrumbItems.map((item) => (
              <li key={item.href} className="flex items-center gap-2">
                <Icon name="tabler:chevron-right" className="h-4 w-4 text-base-content/40" />
                <Link href={item.href} prefetch={false} className="hover:text-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex items-center justify-between mb-8">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Icon name="tabler:hash" className="w-5 h-5 text-primary" />
              <span className="truncate">{leafTag}</span>
            </h1>
            <p className="mt-2 text-sm text-base-content/60 truncate">#{tagPath}</p>
          </div>

          <div className="flex items-center gap-4 text-sm flex-shrink-0">
            <Link
              href="/tags"
              className="flex items-center gap-1 text-muted hover:text-primary transition-colors"
            >
              <Icon name="tabler:tags" className="w-4 h-4" />
              返回
            </Link>
          </div>
        </div>

        <TagTimeline tagPath={queryTagPath} />
      </section>
    </PageLayout>
  );
}

function renderTagPageError(tagLeaf: string, error: unknown) {
  const { message, details } = formatUnknownError(error);
  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-3xl">
        <div className="rounded-xl border border-error/40 bg-error/10 p-6 text-base-content">
          <div className="flex items-center gap-3 text-error">
            <Icon name="tabler:alert-triangle" className="h-6 w-6" />
            <h1 className="text-xl font-semibold">无法加载标签 {tagLeaf || "(unknown)"}</h1>
          </div>
          <p className="mt-4 text-sm text-base-content/80">
            获取该标签内容时出现错误，详细信息已记录在服务端日志中：
          </p>
          <p className="mt-2 text-base font-mono whitespace-pre-wrap text-error">{message}</p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-base-100/70 p-4 text-xs">
            {details}
          </pre>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-base-content/70">
            <Link href="/tags" className="text-primary hover:underline">
              返回标签列表
            </Link>
            <span>刷新页面或稍后重试以重新触发请求。</span>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
