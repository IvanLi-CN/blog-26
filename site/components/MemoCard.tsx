import Icon from "@/components/ui/Icon";
import { buildTagHref } from "@/lib/tag-href";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import { formatAbsoluteDate } from "../lib/format";
import { toPublicSitePath } from "../lib/runtime-urls";

export type MemoCardRecord = Pick<
  PublicMemoRecord,
  "id" | "slug" | "title" | "excerpt" | "tags" | "isPublic" | "createdAt" | "publishedAt"
>;

export default function MemoCard({
  memo,
  isLast = true,
  disablePrefetch = false,
  iconMap = {},
  iconSvgMap = {},
}: {
  memo: MemoCardRecord;
  isLast?: boolean;
  disablePrefetch?: boolean;
  iconMap?: Record<string, string | null>;
  iconSvgMap?: Record<string, string | null>;
}) {
  const displayDate = memo.publishedAt ?? memo.createdAt;
  const showMobileDetailLink = !memo.title;
  const detailLabel = memo.title || `无标题闪念 · ${formatAbsoluteDate(displayDate)}`;

  return (
    <article
      className="nature-timeline-item nature-mobile-reading-row"
      data-is-last={isLast}
      data-testid="memo-card"
      data-slug={memo.slug}
    >
      <div className="nature-timeline-rail" aria-hidden="true">
        <div
          className="nature-timeline-node text-[color:var(--nature-secondary)]"
          data-testid="timeline-node"
          data-timeline-kind="memo"
        >
          <Icon name="tabler:bulb" className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        {!isLast ? (
          <div className="nature-timeline-connector" data-testid="timeline-connector" />
        ) : null}
      </div>

      <div className="nature-timeline-content">
        <div className="nature-panel nature-timeline-card px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
            <span
              className="nature-timeline-type-icon inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(var(--nature-secondary-rgb),0.16)] text-[color:var(--nature-secondary)]"
              data-testid="timeline-type-icon"
              aria-hidden="true"
            >
              <Icon name="tabler:bulb" className="h-3.5 w-3.5" />
            </span>
            <span className="sr-only sm:hidden" data-testid="timeline-accessible-type">
              闪念
            </span>
            <span
              className="nature-timeline-date-icon inline-flex h-4 w-4 items-center justify-center text-[color:var(--nature-accent-strong)]"
              aria-hidden="true"
              data-testid="timeline-date-icon"
            >
              <Icon name="tabler:clock" className="h-4 w-4" />
            </span>
            <time dateTime={displayDate}>{formatAbsoluteDate(displayDate)}</time>
          </div>

          {memo.title ? (
            <h2 className="nature-title text-xl font-semibold">
              <a
                href={toPublicSitePath(`/memos/${memo.slug}`)}
                data-astro-prefetch={disablePrefetch ? "false" : undefined}
                className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
              >
                {memo.title}
              </a>
            </h2>
          ) : null}

          {memo.excerpt ? (
            <p className="nature-muted mt-3 text-base leading-7">{memo.excerpt}</p>
          ) : null}

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3">
              {memo.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {memo.tags.map((tag) => {
                    const iconId = iconMap[tag] ?? "tabler:hash";
                    const iconSvg = iconSvgMap[iconId] ?? iconSvgMap["tabler:hash"];
                    const label = tag.split("/").filter(Boolean).at(-1)?.replace(/^#/, "") ?? tag;

                    return (
                      <a
                        key={`${memo.slug}-${tag}`}
                        href={toPublicSitePath(buildTagHref(tag))}
                        data-astro-prefetch={disablePrefetch ? "false" : undefined}
                        className="nature-hover-hitbox nature-hover-hitbox-inline group align-middle"
                      >
                        <span className="nature-hover-lift nature-hover-surface inline-flex items-center gap-1 rounded-full border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.24)] px-2.5 py-1 text-sm font-medium text-[color:var(--nature-text-soft)] transition-all duration-200 [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.36)] [--nature-hover-lift-offset:-0.125rem] [--nature-hover-shadow:0_12px_24px_rgba(8,21,16,0.08)] group-hover:text-[color:var(--nature-accent-strong)]">
                          <span className="hidden text-[color:var(--nature-accent-strong)] sm:inline-flex">
                            {iconSvg ? (
                              <span
                                className="inline-flex [&>svg]:h-3 [&>svg]:w-3"
                                aria-hidden="true"
                                dangerouslySetInnerHTML={{ __html: iconSvg }}
                              />
                            ) : (
                              <Icon name={iconId} className="h-3 w-3" />
                            )}
                          </span>
                          <span>{label}</span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              ) : null}

              {showMobileDetailLink ? (
                <a
                  href={toPublicSitePath(`/memos/${memo.slug}`)}
                  data-astro-prefetch={disablePrefetch ? "false" : undefined}
                  className="nature-link-inline inline-flex min-h-11 min-w-11 items-center justify-center gap-1 self-start px-2 text-sm sm:hidden"
                  aria-label="查看详情"
                  title="查看详情"
                >
                  <span>查看详情</span>
                  <Icon name="tabler:arrow-up-right" className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <a
              href={toPublicSitePath(`/memos/${memo.slug}`)}
              data-astro-prefetch={disablePrefetch ? "false" : undefined}
              className="nature-icon-button hidden shrink-0 self-start border-0 bg-[rgba(var(--nature-accent-rgb),0.9)] text-white shadow-[0_14px_28px_rgba(var(--nature-accent-rgb),0.28)] transition-transform duration-200 hover:translate-x-0.5 sm:inline-flex sm:self-end"
              aria-label={`查看详情: ${detailLabel}`}
              title={`查看详情: ${detailLabel}`}
            >
              <Icon name="tabler:arrow-up-right" className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
