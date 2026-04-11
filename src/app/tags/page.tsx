import Link from "next/link";
import PageLayout from "@/components/common/PageLayout";
import Icon from "@/components/ui/Icon";
import { buildTagHref } from "@/lib/tag-href";
import { readTagGroupsFromDB } from "@/server/services/tag-groups";
import { resolveTagIconSvgsForTags, TAG_ICON_HASH_FALLBACK } from "@/server/services/tag-icon-ssr";
import { getAllCategoryIcons } from "@/server/services/tag-icons";
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
    const [tagGroupsConfig, tagSummaries, categoryIcons] = await Promise.all([
      readTagGroupsFromDB(),
      getTagSummaries({ includeDrafts: false, includeUnpublished: false }),
      getAllCategoryIcons(),
    ]);
    const { iconMap: tagIconMap, svgMap: tagIconSvgMap } = await resolveTagIconSvgsForTags(
      tagSummaries.map((tag) => tag.name),
      { svgHeight: "20" }
    );

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
        <section className="nature-container w-full px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <span className="nature-kicker w-fit gap-2">
                  <Icon name="tabler:tags" className="h-4 w-4" />
                  标签
                </span>
                <div>
                  <h1 className="nature-title text-3xl sm:text-4xl">浏览所有标签</h1>
                  <p className="nature-muted mt-2 text-sm">
                    最新公开内容使用到的标签都会记录在这里。
                  </p>
                </div>
              </div>
              <div className="nature-panel-soft flex items-center gap-4 px-4 py-3 text-sm text-[color:var(--nature-text-soft)]">
                <div>
                  <p className="nature-stat-label">标签数量</p>
                  <p className="nature-stat-value text-2xl">{tagSummaries.length}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[color:var(--nature-text)]">
                    全部标签
                  </h2>
                  <p className="text-sm text-[color:var(--nature-text-soft)]">
                    点击任意标签可查看相关内容。
                  </p>
                </div>
                <span className="text-sm font-medium text-[color:var(--nature-text-soft)]">
                  共 {tagSummaries.length} 个标签
                </span>
              </div>

              {tagSummaries.length === 0 ? (
                <p className="mt-6 text-[color:var(--nature-text-soft)]">
                  当前没有可展示的标签，请稍后再试。
                </p>
              ) : (
                <div className="space-y-10">
                  {orderedGroups.map((group) => (
                    <section key={group.key} className="space-y-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="nature-chip gap-2 text-sm">
                          <Icon
                            name={categoryIcons[group.key] || "tabler:category"}
                            className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
                          />
                          {group.title}
                        </span>
                        <span className="text-xs text-[color:var(--nature-text-faint)]">
                          {group.items.length} 个标签
                        </span>
                      </div>
                      <div className="nature-surface p-3 sm:p-4">
                        <div className={tagGridClass}>
                          {group.items.map((tag) => {
                            const resolvedIcon = tagIconMap[tag.name] ?? null;
                            const iconId = resolvedIcon ?? TAG_ICON_HASH_FALLBACK;
                            const iconSvg = tagIconSvgMap[iconId] ?? null;

                            return (
                              <Link
                                key={tag.name}
                                href={buildTagHref(tag.name)}
                                prefetch={false}
                                className="nature-hover-hitbox group block h-full rounded-[1.7rem]"
                                title={tag.lastSegment}
                                aria-label={`查看 ${tag.lastSegment} 标签的文章`}
                              >
                                <div className="nature-hover-lift nature-hover-surface relative flex h-full flex-col overflow-hidden rounded-[1.7rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.92)] p-4 shadow-[0_14px_32px_rgba(8,21,16,0.08)] transition duration-300 [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.5)] [--nature-hover-lift-offset:-0.125rem] [--nature-hover-shadow:0_18px_40px_rgba(8,21,16,0.14)]">
                                  <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--nature-accent-rgb),0.6)] to-transparent opacity-0 transition group-hover:opacity-100" />
                                  <div className="flex items-start gap-3">
                                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgba(var(--nature-accent-rgb),0.12)] text-[color:var(--nature-accent-strong)]">
                                      {iconSvg ? (
                                        <span
                                          className="inline-flex [&>svg]:w-5 [&>svg]:h-5"
                                          dangerouslySetInnerHTML={{ __html: iconSvg }}
                                        />
                                      ) : (
                                        <Icon name={iconId} className="h-5 w-5" />
                                      )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-base font-semibold text-[color:var(--nature-text)]">
                                        {truncateLeafLabel(tag.lastSegment)}
                                      </p>
                                      <p className="mt-1 text-xs text-[color:var(--nature-text-soft)]">
                                        {formatTagCount(tag.count)}
                                      </p>
                                    </div>
                                    <Icon
                                      name="tabler:chevron-right"
                                      className="mt-1 h-4 w-4 flex-shrink-0 text-[color:var(--nature-text-faint)] transition group-hover:text-[color:var(--nature-accent-strong)]"
                                    />
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
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
      <section className="nature-container px-6 py-10">
        <div className="nature-alert nature-alert-error block p-6">
          <div className="flex items-center gap-3 text-[color:var(--nature-danger)]">
            <Icon name="tabler:alert-triangle" className="h-6 w-6" />
            <h1 className="text-xl font-semibold">无法加载标签列表</h1>
          </div>
          <p className="mt-4 text-sm text-[color:var(--nature-text-soft)]">
            服务端在读取标签数据时发生错误，以下信息可帮助定位问题：
          </p>
          <p className="mt-2 font-mono text-base text-[color:var(--nature-danger)]">{message}</p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-[1.25rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.72)] p-4 text-xs">
            {details}
          </pre>
          <div className="mt-4 text-sm text-[color:var(--nature-text-soft)]">
            请查看服务端日志并确认数据库或内容源配置无误，随后刷新页面重试。
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
