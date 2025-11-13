import Link from "next/link";
import { notFound } from "next/navigation";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { decodeTagFromPath, getPostsByTag } from "@/server/services/tag-service";
import { formatUnknownError } from "@/utils/error-format";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tag: string }>;
}

export default async function TagDetailPage({ params }: PageProps) {
  const { tag } = await params;
  const decoded = decodeTagFromPath(tag || "");

  let posts: Awaited<ReturnType<typeof getPostsByTag>>;
  try {
    posts = await getPostsByTag(decoded, { includeDrafts: false, includeUnpublished: false });
  } catch (error) {
    console.error(
      `❌ [TagDetailPage] Failed to load tag '${decoded || tag || "<unknown>"}'`,
      error
    );
    return renderTagPageError(decoded || tag || "", error);
  }

  if (posts.length === 0) {
    // 未找到该标签对应的文章，返回 404，避免产生可抓取的空页面
    notFound();
  }

  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-4xl">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="tabler:hash" className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold">
            {decoded.includes("/") ? decoded.split("/").pop() : decoded}
          </h1>
          <span className="text-base-content/60 text-sm">{posts.length} posts</span>
          <Link
            href={`/tags/${encodeURIComponent(decoded)}/feed.xml`}
            className="ml-auto text-sm text-primary hover:underline"
          >
            RSS
          </Link>
        </div>

        {
          <ul className="space-y-4">
            {posts.map((p) => (
              <li
                key={p.slug}
                className="rounded-lg border border-base-content/10 bg-base-100/60 p-4"
              >
                <h2 className="text-lg font-semibold">
                  <Link href={`/posts/${p.slug}`} className="hover:underline">
                    {p.title}
                  </Link>
                </h2>
                {p.excerpt && <p className="mt-1 text-base-content/70">{p.excerpt}</p>}
              </li>
            ))}
          </ul>
        }

        <div className="mt-8">
          <Link href="/tags" className="text-sm text-base-content/60 hover:underline">
            ← Back to tags
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}

function renderTagPageError(tag: string, error: unknown) {
  const { message, details } = formatUnknownError(error);
  const display = tag.includes("/") ? (tag.split("/").pop() ?? tag) : tag;
  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-3xl">
        <div className="rounded-xl border border-error/40 bg-error/10 p-6 text-base-content">
          <div className="flex items-center gap-3 text-error">
            <Icon name="tabler:alert-triangle" className="h-6 w-6" />
            <h1 className="text-xl font-semibold">无法加载标签 {display || "(unknown)"}</h1>
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
