import Icon from "@/components/ui/Icon";
import { extractTextSummary } from "@/lib/markdown-utils";
import { getMemoPresentation } from "@/lib/memo-presentation";
import type { PublicMediaCollection } from "@/lib/public-media";
import { formatAbsoluteDate } from "../lib/format";
import { appendPublicAssetVersion } from "../lib/public-site-client";
import { toPublicSitePath } from "../lib/runtime-urls";
import TagBadge from "./TagBadge";

interface Props {
  item: {
    type: "post" | "memo";
    slug: string;
    title: string | null;
    excerpt: string | null;
    content: string | null;
    publishDate: string;
    tags: string[];
    image: string | null;
    media?: PublicMediaCollection;
    dataSource: string | null;
    filePath: string;
  };
  isLast?: boolean;
  iconMap?: Record<string, string | null>;
  iconSvgMap?: Record<string, string | null>;
  assetVersion?: string | null;
}
export default function TimelineCard(props: Props) {
  const { item, isLast = true, iconMap = {}, iconSvgMap = {}, assetVersion = null } = props;
  const presentation =
    item.type === "memo"
      ? getMemoPresentation(item)
      : { kind: "post", label: "文章", icon: "tabler:article", tags: item.tags };
  const href = toPublicSitePath(
    item.type === "memo" ? `/memos/${item.slug}` : `/posts/${item.slug}`
  );
  const preview = item.excerpt || extractTextSummary(item.content || "", 180);
  const imageSrc = appendPublicAssetVersion(
    item.media?.primary?.variants.card ?? item.media?.cover?.variants.card ?? item.image ?? null,
    assetVersion
  );
  return (
    <article
      className="nature-timeline-item nature-mobile-reading-row"
      data-is-last={isLast}
      data-testid="timeline-item"
    >
      <div className="nature-timeline-rail" aria-hidden="true">
        <div
          className="nature-timeline-node"
          data-testid="timeline-node"
          data-timeline-kind={presentation.kind}
        >
          <Icon
            name={presentation.icon}
            className={`h-5 w-5 sm:h-6 sm:w-6 ${item.type === "memo" ? "text-[color:var(--nature-secondary)]" : "text-[color:var(--nature-accent-strong)]"}`}
          />
        </div>
        {!isLast && (
          <div className="nature-timeline-connector" data-testid="timeline-connector"></div>
        )}
      </div>

      <div className="nature-timeline-content pb-1 sm:pb-2">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
          <span
            className="nature-timeline-type-icon inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(var(--nature-accent-rgb),0.12)] text-[color:var(--nature-accent-strong)]"
            data-testid="timeline-type-icon"
            aria-hidden="true"
          >
            <Icon name={presentation.icon} className="h-3.5 w-3.5" />
          </span>
          <span className="sr-only sm:hidden" data-testid="timeline-accessible-type">
            {presentation.label}
          </span>
          <time dateTime={item.publishDate}>{formatAbsoluteDate(item.publishDate)}</time>
          <span
            className="nature-chip nature-timeline-type-label gap-1"
            data-testid="timeline-type-label"
          >
            <Icon name={presentation.icon} className="h-3.5 w-3.5" />
            {presentation.label}
          </span>
        </div>

        <div className="nature-hover-hitbox group block">
          <div className="nature-panel nature-panel-soft nature-hover-lift nature-hover-surface nature-timeline-card px-4 py-4 sm:px-5 [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.3)] [--nature-hover-lift-offset:-0.125rem] [--nature-hover-shadow:0_22px_42px_rgba(8,21,16,0.14)]">
            <div className="flex flex-col gap-4 md:flex-row">
              {imageSrc && item.type === "post" && (
                <a
                  href={href}
                  className="block overflow-hidden rounded-[var(--nature-radius-sm)] md:w-48"
                >
                  <img
                    src={imageSrc}
                    alt={item.title || item.slug}
                    className="h-32 w-full object-cover md:h-full"
                    loading="lazy"
                  />
                </a>
              )}
              <div className="min-w-0 flex-1">
                {item.title && (
                  <h2 className="nature-title text-xl font-semibold">
                    <a
                      href={href}
                      className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
                    >
                      {item.title}
                    </a>
                  </h2>
                )}
                {!item.title && item.type === "memo" && (
                  <a
                    href={href}
                    className="nature-link-inline mt-3 inline-flex min-h-10 items-center px-2 text-sm"
                  >
                    查看{presentation.label}详情
                  </a>
                )}
                {preview && <p className="nature-muted mt-3 text-base leading-7">{preview}</p>}
                {presentation.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {presentation.tags.slice(0, 4).map((tag) => (
                      <TagBadge key={tag} tag={tag} iconMap={iconMap} iconSvgMap={iconSvgMap} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
