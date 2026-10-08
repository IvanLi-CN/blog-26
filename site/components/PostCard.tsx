import Icon from "@/components/ui/Icon";
import { calculateReadingTime, formatReadingTime } from "@/lib/reading-time";
import type { PublicPostRecord } from "@/public-site/snapshot";
import { formatAbsoluteDate } from "../lib/format";
import { appendPublicAssetVersion } from "../lib/public-site-client";
import { toPublicSitePath } from "../lib/runtime-urls";
import TagBadge from "./TagBadge";

interface Props {
  post: PublicPostRecord & { readingMinutes?: number };
  iconMap?: Record<string, string | null>;
  iconSvgMap?: Record<string, string | null>;
  assetVersion?: string | null;
}
export default function PostCard(props: Props) {
  const { post, iconMap = {}, iconSvgMap = {}, assetVersion = null } = props;
  const readingTime = formatReadingTime(
    post.readingMinutes ?? calculateReadingTime(post.body || "")
  );
  const imageSrc = appendPublicAssetVersion(
    post.media.cover?.variants.card ?? post.media.primary?.variants.card ?? post.image,
    assetVersion
  );
  return (
    <article
      className="nature-panel post-list-entry relative mx-auto grid max-w-md gap-6 p-4 md:max-w-none md:grid-cols-2 md:gap-8"
      data-testid="post-card"
    >
      <div
        className={`post-list-copy mt-2 ${imageSrc ? "md:col-start-2 md:row-start-1" : "md:col-span-2"} flex h-full flex-col`}
      >
        <header>
          <div className="mb-1">
            <span className="nature-muted flex flex-wrap items-center gap-1 text-sm">
              <Icon name="tabler:clock" className="h-3.5 w-3.5 -mt-0.5" />
              <time dateTime={post.publishDate}>{formatAbsoluteDate(post.publishDate)}</time>
              <span>·</span>
              <Icon name="tabler:hourglass" className="h-3.5 w-3.5 -mt-0.5" />
              <span>{readingTime}</span>
              {post.author && (
                <>
                  <span>·</span>
                  <Icon name="tabler:user" className="h-3.5 w-3.5 -mt-0.5" />
                  <span>{post.author}</span>
                </>
              )}
              {post.category && (
                <>
                  <span>·</span>
                  <span>{post.category}</span>
                </>
              )}
            </span>
          </div>
          <h2 className="nature-title font-heading text-xl font-bold leading-tight sm:text-2xl">
            <a
              className="inline-block transition-all duration-300 hover:translate-x-1 hover:text-[color:var(--nature-accent-strong)]"
              href={toPublicSitePath(`/posts/${post.slug}`)}
            >
              {post.title}
            </a>
          </h2>
        </header>

        {post.excerpt && (
          <p className="nature-muted mt-3 flex-grow text-lg leading-8">{post.excerpt}</p>
        )}

        {post.tags.length > 0 && (
          <footer className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            {post.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} iconMap={iconMap} iconSvgMap={iconSvgMap} />
            ))}
          </footer>
        )}
      </div>

      {imageSrc && (
        <a
          className="relative block group"
          href={toPublicSitePath(`/posts/${post.slug}`)}
          data-post-card-cover=""
          data-testid="post-card-cover"
        >
          <div className="relative h-0 overflow-hidden rounded-[var(--nature-radius-md)] border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.2)] pb-[56.25%] shadow-[var(--nature-shadow)] transition-all duration-300 group-hover:shadow-[var(--nature-shadow-strong)] md:h-72 md:pb-[75%] lg:pb-[56.25%]">
            <img
              src={imageSrc}
              className="absolute inset-0 h-full w-full rounded-[var(--nature-radius-md)] bg-[rgba(var(--nature-highlight-rgb),0.12)] object-cover transition-transform duration-300 group-hover:scale-105"
              alt={post.title}
              loading="lazy"
            />
          </div>
        </a>
      )}
    </article>
  );
}
