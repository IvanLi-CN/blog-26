import Icon from "@/components/ui/Icon";
import { buildTagHref } from "@/lib/tag-href";
import type { loadtags } from "../../lib/page-data/tags";
import { pickTagIconSvg } from "../../lib/public-site-client";
import { toPublicSitePath } from "../../lib/runtime-urls";
export default function tagsPage(data: Awaited<ReturnType<typeof loadtags>>) {
  const { snapshot, groups } = data;

  return (
    <section className="nature-container w-full px-2 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <span className="nature-kicker w-fit gap-2">
              <Icon name="tabler:tags" className="h-4 w-4" />
              标签
            </span>
            <div>
              <h1 className="nature-title text-3xl sm:text-4xl">浏览所有标签</h1>
              <p className="nature-muted mt-2 text-sm">按标签发现公开文章、闪念与项目。</p>
            </div>
          </div>
          <div className="nature-panel-soft flex items-center gap-4 px-4 py-3 text-sm text-[color:var(--nature-text-soft)]">
            <div>
              <p className="nature-stat-label">标签数量</p>
              <p className="nature-stat-value text-2xl">{snapshot.tags.summaries.length}</p>
            </div>
          </div>
        </div>

        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.key} className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="nature-chip gap-2 text-sm">
                  <Icon
                    name={snapshot.tags.categoryIcons[group.key] || "tabler:category"}
                    className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
                  />
                  {group.title}
                </span>
                <span className="text-xs text-[color:var(--nature-text-faint)]">
                  {group.items.length} 个标签
                </span>
              </div>

              <div className="nature-surface nature-mobile-structural p-3 sm:p-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-3 sm:gap-4">
                  {group.items.map((tag) => {
                    const { iconId, iconSvg } = pickTagIconSvg(
                      tag.name,
                      snapshot.tags.tagIconMap,
                      snapshot.tags.tagIconSvgMap
                    );
                    return (
                      <a
                        key={tag.name}
                        href={toPublicSitePath(buildTagHref(tag.name))}
                        className="nature-hover-hitbox group block h-full rounded-[var(--nature-radius-md)]"
                      >
                        <div className="nature-hover-lift nature-hover-surface relative flex h-full flex-col overflow-hidden rounded-[var(--nature-radius-md)] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.92)] p-4 shadow-[0_14px_32px_rgba(8,21,16,0.08)] transition duration-300 [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.5)] [--nature-hover-lift-offset:-0.125rem] [--nature-hover-shadow:0_18px_40px_rgba(8,21,16,0.14)]">
                          <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--nature-accent-rgb),0.6)] to-transparent opacity-0 transition group-hover:opacity-100" />
                          <div className="flex items-start gap-3">
                            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgba(var(--nature-accent-rgb),0.12)] text-[color:var(--nature-accent-strong)]">
                              {iconSvg ? (
                                <span
                                  className="inline-flex [&>svg]:h-5 [&>svg]:w-5"
                                  dangerouslySetInnerHTML={{ __html: iconSvg }}
                                />
                              ) : (
                                <Icon name={iconId} className="h-5 w-5" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold text-[color:var(--nature-text)]">
                                {tag.lastSegment}
                              </p>
                              <p className="mt-1 text-xs text-[color:var(--nature-text-soft)]">
                                {tag.postCount} 篇文章 · {tag.memoCount} 条闪念 · {tag.projectCount}{" "}
                                个项目
                              </p>
                            </div>
                            <Icon
                              name="tabler:chevron-right"
                              className="mt-1 h-4 w-4 flex-shrink-0 text-[color:var(--nature-text-faint)] transition group-hover:text-[color:var(--nature-accent-strong)]"
                            />
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
