import Link from "next/link";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { getTagSummaries } from "@/server/services/tag-service";

export const dynamic = "force-dynamic";

export default async function TagsIndexPage() {
  const tagSummaries = await getTagSummaries({
    includeDrafts: false,
    includeUnpublished: false,
  });

  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-4xl">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="tabler:tag" className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold">标签</h1>
        </div>

        <div className="space-y-6 text-base-content/80">
          <p>
            这里汇总了近期文章中使用到的标签，默认仅展示已公开且已发布的内容，帮助你快速浏览不同主题的文章覆盖情况。
          </p>
          <p className="text-sm text-base-content/60">
            标签按最后一级名称排序，并保留完整路径以区分层级。后续我们会在这里扩展标签详情页和更多筛选能力。
          </p>
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-base-content">全部标签</h2>
            <span className="text-sm text-base-content/60">共 {tagSummaries.length} 个标签</span>
          </div>

          {tagSummaries.length === 0 ? (
            <p className="mt-6 text-base-content/60">当前没有可展示的标签，请稍后再试。</p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {tagSummaries.map((tag) => {
                const fullPathLabel = tag.name !== tag.lastSegment ? tag.name : undefined;
                return (
                  <div
                    key={tag.name}
                    className="group rounded-lg border border-base-content/10 bg-base-100/60 p-4 transition hover:border-primary/60 hover:bg-base-100 shadow-sm"
                    title={tag.name}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-medium text-base-content">
                        {tag.lastSegment}
                      </span>
                      <span className="text-sm text-primary/80">共 {tag.count} 篇</span>
                    </div>
                    {fullPathLabel && (
                      <span className="mt-1 block text-xs uppercase tracking-wide text-base-content/50">
                        {fullPathLabel}
                      </span>
                    )}
                    <div className="mt-3 text-xs text-base-content/60">
                      <span>即将支持访问 </span>
                      <Link
                        className="text-primary hover:underline"
                        href={`/tags/${encodeURIComponent(tag.name)}`}
                        prefetch={false}
                      >
                        /tags/{encodeURIComponent(tag.name)}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
