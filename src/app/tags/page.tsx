import Link from "next/link";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { readTagGroupsFromDB } from "@/server/services/tag-groups";
import { getAllCategoryIcons, getAllTagIcons } from "@/server/services/tag-icons";
import { getTagSummaries } from "@/server/services/tag-service";
import { formatUnknownError } from "@/utils/error-format";

const TAG_LABEL_MAX_LENGTH = 26;
const tagLabelCollator = new Intl.Collator("zh-Hans", {
  numeric: true,
  sensitivity: "base",
});
const tagCountFormatter = new Intl.NumberFormat("zh-Hans", {
  maximumFractionDigits: 0,
});

function truncateLeafLabel(label: string) {
  const chars = Array.from(label.trim());
  if (chars.length <= TAG_LABEL_MAX_LENGTH) return label.trim();
  return `${chars.slice(0, TAG_LABEL_MAX_LENGTH - 1).join("")}…`;
}

function sortByLeafName<T extends { lastSegment: string }>(items: T[]) {
  return [...items].sort((a, b) => tagLabelCollator.compare(a.lastSegment, b.lastSegment));
}

function formatTagCount(count: number) {
  return `${tagCountFormatter.format(count)} 篇内容`;
}

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
        .filter((g) => g.items.length > 0)
        .map((g) => ({
          key: g.key,
          title: g.title,
          items: sortByLeafName(g.items),
        })),
    ];
    if (grouped.has("other") && (grouped.get("other")?.items.length ?? 0) > 0) {
      orderedGroups.push({
        key: "other",
        title: "Other",
        items: sortByLeafName(grouped.get("other")?.items ?? []),
      });
    }

    const tagGridClass = "grid gap-3 sm:gap-4 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]";

    return (
      <PageLayout>
        <section className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-base-content/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">
                  <Icon name="tabler:tags" className="h-4 w-4" />
                  标签
                </span>
                <div>
                  <h1 className="font-heading text-3xl sm:text-4xl font-bold text-base-content">
                    浏览所有标签
                  </h1>
                  <p className="mt-2 text-sm text-base-content/70">
                    最新公开内容使用到的标签都会记录在这里。
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-base-content/10 bg-base-100/70 px-4 py-3 text-sm text-base-content/70">
                <div>
                  <p className="text-xs uppercase tracking-wide text-base-content/50">标签数量</p>
                  <p className="text-2xl font-semibold text-base-content">{tagSummaries.length}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-base-content">全部标签</h2>
                  <p className="text-sm text-base-content/60">点击任意标签可查看相关内容。</p>
                </div>
                <span className="text-sm font-medium text-base-content/70">
                  共 {tagSummaries.length} 个标签
                </span>
              </div>

              {tagSummaries.length === 0 ? (
                <p className="mt-6 text-base-content/60">当前没有可展示的标签，请稍后再试。</p>
              ) : (
                <div className="space-y-10">
                  {orderedGroups.map((group) => (
                    <section key={group.key} className="space-y-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-2 rounded-full bg-base-100/70 px-3 py-1 text-sm font-medium text-base-content">
                          <Icon
                            name={categoryIcons[group.key] || "tabler:category"}
                            className="h-4 w-4 text-primary"
                          />
                          {group.title}
                        </span>
                        <span className="text-xs text-base-content/50">
                          {group.items.length} 个标签
                        </span>
                      </div>
                      <div className="rounded-2xl border border-base-content/5 bg-base-100/70 p-3 sm:p-4">
                        <div className={tagGridClass}>
                          {group.items.map((tag) => (
                            <Link
                              key={tag.name}
                              href={`/tags/${encodeURIComponent(tag.name)}`}
                              prefetch={false}
                              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-base-content/10 bg-base-100/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-base-100"
                              title={tag.lastSegment}
                              aria-label={`查看 ${tag.lastSegment} 标签的文章`}
                            >
                              <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition group-hover:opacity-100" />
                              <div className="flex items-start gap-3">
                                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                  <Icon
                                    name={tagIcons[tag.name] || "tabler:hash"}
                                    className="h-5 w-5"
                                  />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-semibold text-base-content truncate">
                                    {truncateLeafLabel(tag.lastSegment)}
                                  </p>
                                  <p className="mt-1 text-xs text-base-content/60">
                                    {formatTagCount(tag.count)}
                                  </p>
                                </div>
                                <Icon
                                  name="tabler:chevron-right"
                                  className="mt-1 h-4 w-4 flex-shrink-0 text-base-content/40 transition group-hover:text-primary"
                                />
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
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
