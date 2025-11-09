import Link from "next/link";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { readTagGroupsFromDB } from "@/server/services/tag-groups";
import { getAllCategoryIcons, getAllTagIcons } from "@/server/services/tag-icons";
import { getTagSummaries } from "@/server/services/tag-service";
import { formatUnknownError } from "@/utils/error-format";

export const dynamic = "force-dynamic";

export default async function TagsIndexPage() {
  try {
    const [tagGroupsConfig, tagSummaries, tagIcons, categoryIcons] = await Promise.all([
      readTagGroupsFromDB(),
      getTagSummaries({ includeDrafts: false, includeUnpublished: false }),
      getAllTagIcons(),
      getAllCategoryIcons(),
    ]);

    // Build tag -> group map from config
    const tagToGroup = new Map<string, { key: string; title: string }>();
    for (const group of tagGroupsConfig.groups) {
      for (const tag of group.tags) {
        tagToGroup.set(tag, { key: group.key, title: group.title });
      }
    }

    // Group tag summaries by configured groups; anything unmatched goes to "Other"
    const grouped = new Map<string, { title: string; items: typeof tagSummaries }>();
    const ensureGroup = (key: string, title: string) => {
      if (!grouped.has(key)) grouped.set(key, { title, items: [] });
      const found = grouped.get(key);
      return found ?? { title, items: [] };
    };

    for (const tag of tagSummaries) {
      const grp = tagToGroup.get(tag.name);
      if (grp) {
        ensureGroup(grp.key, grp.title).items.push(tag);
      } else {
        ensureGroup("other", "Other").items.push(tag);
      }
    }

    // Preserve config order, append Other at the end if exists
    const orderedGroups = [
      ...tagGroupsConfig.groups
        .map((g) => ({ key: g.key, title: g.title, items: grouped.get(g.key)?.items ?? [] }))
        .filter((g) => g.items.length > 0),
    ];
    if (grouped.has("other") && (grouped.get("other")?.items.length ?? 0) > 0) {
      orderedGroups.push({
        key: "other",
        title: "Other",
        items: grouped.get("other")?.items ?? [],
      });
    }

    return (
      <PageLayout>
        <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-6xl">
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

          <div className="mt-10 space-y-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-base-content">全部标签</h2>
              <span className="text-sm text-base-content/60">共 {tagSummaries.length} 个标签</span>
            </div>

            {tagSummaries.length === 0 ? (
              <p className="mt-6 text-base-content/60">当前没有可展示的标签，请稍后再试。</p>
            ) : (
              <div className="mt-6 space-y-10">
                {orderedGroups.map((group) => (
                  <section key={group.key} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Icon
                        name={categoryIcons[group.key] || "tabler:category"}
                        className="w-5 h-5 text-primary/80"
                      />
                      <h3 className="text-lg font-semibold text-base-content">{group.title}</h3>
                      <span className="text-xs text-base-content/50">{group.items.length}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                      {group.items.map((tag) => {
                        const fullPathLabel = tag.name !== tag.lastSegment ? tag.name : undefined;
                        return (
                          <div
                            key={tag.name}
                            className="rounded-lg border border-base-content/10 bg-base-100/60 p-3 transition hover:border-primary/60 hover:bg-base-100 shadow-sm"
                            title={tag.name}
                          >
                            <Link
                              href={`/tags/${encodeURIComponent(tag.name)}`}
                              prefetch={false}
                              className="flex items-center gap-2 hover:text-primary"
                              title={tag.name}
                            >
                              <Icon name={tagIcons[tag.name] || "tabler:tag"} className="w-4 h-4" />
                              <span className="text-base text-base-content">{tag.lastSegment}</span>
                              {fullPathLabel && (
                                <span className="text-xs text-base-content/50">
                                  {fullPathLabel}
                                </span>
                              )}
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      </PageLayout>
    );
  } catch (error) {
    console.error("❌ [TagsIndexPage] Failed to load tags index", error);
    return renderTagsIndexError(error);
  }
}

function renderTagsIndexError(error: unknown) {
  const { message, details } = formatUnknownError(error);
  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-3xl">
        <div className="rounded-xl border border-error/40 bg-error/10 p-6 text-base-content">
          <div className="flex items-center gap-3 text-error">
            <Icon name="tabler:alert-triangle" className="h-6 w-6" />
            <h1 className="text-xl font-semibold">无法加载标签列表</h1>
          </div>
          <p className="mt-4 text-sm text-base-content/80">
            服务端在读取标签数据时发生错误，以下信息可帮助定位问题：
          </p>
          <p className="mt-2 font-mono text-base text-error">{message}</p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-base-100/70 p-4 text-xs">
            {details}
          </pre>
          <div className="mt-4 text-sm text-base-content/70">
            请查看服务端日志并确认数据库或内容源配置无误，随后刷新页面重试。
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
