import PostReactions from "@/components/blog/PostReactions";
import CommentSectionWithProvider from "@/components/comments/CommentSectionWithProvider";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import Icon from "@/components/ui/Icon";
import { formatAbsoluteDate, formatDateTime } from "../../lib/format";
import type { loadpost } from "../../lib/page-data/post";
import RelatedPostCard from "../RelatedPostCard";
import TagBadge from "../TagBadge";
export default function postPage(data: Awaited<ReturnType<typeof loadpost>>) {
  const {
    snapshot,
    post,
    relatedPosts,
    assetVersion,
    contentSource,
    publicMediaContext,
    imageSrc,
    readingTime,
    structuredData,
  } = data;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <section className="nature-detail-container post-detail-layout px-2 py-8 sm:px-6 sm:py-10 lg:py-14">
        <article className="nature-reading-measure">
          <header className="space-y-6">
            <div className="nature-surface nature-mobile-reading-surface post-detail-header px-4 py-5 sm:px-8 sm:py-7">
              <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
                <span className="nature-chip nature-chip-info gap-1">
                  <Icon name="tabler:clock" className="h-3.5 w-3.5" />
                  <time dateTime={post.publishDate} title={formatDateTime(post.publishDate)}>
                    {formatAbsoluteDate(post.publishDate)}
                  </time>
                </span>
                {post.updateDate && (
                  <span className="text-xs italic text-[color:var(--nature-text-faint)]">
                    编辑于 {formatAbsoluteDate(post.updateDate)}
                  </span>
                )}
                <span className="nature-chip gap-1">
                  <Icon name="tabler:user" className="h-3.5 w-3.5" />
                  {post.author || snapshot.site.author.name}
                </span>
                {post.category && (
                  <span className="nature-chip nature-chip-accent">{post.category}</span>
                )}
                <span className="nature-chip gap-1">
                  <Icon name="tabler:hourglass" className="h-3.5 w-3.5" />
                  {readingTime}
                </span>
              </div>

              <h1 className="mt-5 font-heading text-3xl font-semibold leading-tight tracking-[-0.05em] text-[color:var(--nature-text)] sm:text-4xl md:text-5xl">
                {post.title}
              </h1>

              {post.excerpt && (
                <p className="nature-muted mt-5 max-w-3xl text-base sm:text-lg">{post.excerpt}</p>
              )}

              {post.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <TagBadge
                      key={tag}
                      tag={tag}
                      iconMap={snapshot.tags.tagIconMap}
                      iconSvgMap={snapshot.tags.tagIconSvgMap}
                    />
                  ))}
                </div>
              )}
            </div>

            {imageSrc ? (
              <div className="post-detail-cover overflow-hidden rounded-[var(--nature-radius-lg)] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.78)] p-2.5 shadow-[0_18px_40px_rgba(8,21,16,0.12)] sm:p-3">
                <img
                  src={imageSrc}
                  className="max-h-[60vh] w-full rounded-[var(--nature-radius-md)] object-contain"
                  alt={post.title}
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="nature-divider" />
            )}
          </header>

          <div className="nature-panel nature-mobile-reading-surface post-detail-body mt-6 px-4 py-5 sm:mt-8 sm:px-8 sm:py-7">
            <MarkdownRenderer
              content={post.body}
              variant="article"
              enableMath={true}
              enableMermaid={true}
              enableCodeFolding={true}
              rewritePublicSitePaths={true}
              articlePath={post.filePath}
              contentSource={contentSource}
              publicMediaContext={publicMediaContext}
            />
          </div>

          <div className="nature-panel-soft mt-6 flex items-center justify-between gap-4 px-4 py-4 sm:mt-8 sm:px-6 sm:py-5">
            <div>
              <div className="nature-kicker">Feedback</div>
              <p className="nature-muted mt-2 text-sm">
                如果这篇文章对你有帮助，欢迎留下反应或评论。
              </p>
            </div>
            <PostReactions postSlug={post.slug} />
          </div>

          <CommentSectionWithProvider postSlug={post.slug} usePublicSitePaths={true} />
        </article>
      </section>

      {relatedPosts.length > 0 && (
        <section className="nature-container px-2 pb-12 sm:px-6 sm:pb-16 lg:pb-20">
          <div className="space-y-6 border-t border-[rgba(var(--nature-border-rgb),0.72)] pt-8">
            <div className="flex items-center gap-3">
              <Icon
                name="tabler:article"
                className="h-6 w-6 text-[color:var(--nature-accent-strong)]"
              />
              <h2 className="font-heading text-2xl font-semibold text-[color:var(--nature-text)]">
                相关文章
              </h2>
            </div>
            <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
              {relatedPosts.map((relatedPost) => (
                <RelatedPostCard
                  key={relatedPost.slug}
                  post={relatedPost}
                  assetVersion={assetVersion}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
