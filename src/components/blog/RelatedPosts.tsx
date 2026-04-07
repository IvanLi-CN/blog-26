import { Icon } from "@iconify/react";
import Image from "next/image";
import Link from "next/link";
import { resolveImagePath } from "../../lib/image-utils";
import { toMsTimestamp } from "../../lib/utils";
import ReadingTime from "./ReadingTime";

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  publishDate: number;
  excerpt?: string;
  body: string;
  category?: string;
  tags?: string[];
  image?: string;
  dataSource?: string;
}

interface RelatedPostsProps {
  posts: RelatedPost[];
  currentPostCategory?: string;
  currentPostTags?: string[];
}

export default function RelatedPosts({
  posts,
  currentPostCategory,
  currentPostTags,
}: RelatedPostsProps) {
  if (!posts || posts.length === 0) {
    return null;
  }

  const toTagArray = (value?: string[]): string[] =>
    Array.isArray(value) ? value.map((tag) => String(tag).trim()).filter(Boolean) : [];

  // 智能排序：优先显示同分类或同标签的文章
  const sortedPosts = [...posts].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    // 同分类加分
    if (currentPostCategory && a.category === currentPostCategory) scoreA += 3;
    if (currentPostCategory && b.category === currentPostCategory) scoreB += 3;

    // 同标签加分
    const currentTags = toTagArray(currentPostTags);
    if (currentTags.length) {
      const aTags = toTagArray(a.tags);
      const commonTagsA = currentTags.filter((tag) => aTags.includes(tag));
      scoreA += commonTagsA.length;

      const bTags = toTagArray(b.tags);
      const commonTagsB = currentTags.filter((tag) => bTags.includes(tag));
      scoreB += commonTagsB.length;
    }

    // 按发布时间排序（新的优先）
    if (scoreA === scoreB) {
      return b.publishDate - a.publishDate;
    }

    return scoreB - scoreA;
  });

  return (
    <section className="mx-auto mt-12 max-w-3xl px-4 sm:px-6">
      <div className="border-t border-[rgba(var(--nature-border-rgb),0.72)] pt-8">
        <h2 className="mb-6 flex items-center gap-2 font-heading text-2xl font-semibold text-[color:var(--nature-text)]">
          <Icon
            icon="tabler:article"
            className="w-6 h-6 text-[color:var(--nature-accent-strong)]"
          />
          相关文章
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {sortedPosts.map((post) => (
            <article
              key={post.id}
              className="group"
              itemScope
              itemType="https://schema.org/Article"
            >
              <Link
                href={`/posts/${post.slug}`}
                className="nature-panel block p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(var(--nature-accent-rgb),0.42)]"
                itemProp="url"
              >
                {post.image && (
                  <div className="mb-3 overflow-hidden rounded-md">
                    <Image
                      src={
                        resolveImagePath(
                          post.image,
                          (post.dataSource === "local" ? "local" : "webdav") as "local" | "webdav",
                          `blog/${post.slug}.md`
                        ) || post.image
                      }
                      alt={post.title}
                      className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-200"
                      itemProp="image"
                      width={640}
                      height={240}
                    />
                  </div>
                )}

                <h3
                  className="mb-2 line-clamp-2 text-lg font-semibold text-[color:var(--nature-text)] transition-colors duration-200 group-hover:text-[color:var(--nature-accent-strong)]"
                  itemProp="headline"
                >
                  {post.title}
                </h3>

                {post.excerpt && (
                  <p
                    className="mb-3 line-clamp-2 text-sm text-[color:var(--nature-text-soft)]"
                    itemProp="description"
                  >
                    {post.excerpt}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-[color:var(--nature-text-faint)]">
                  <time
                    dateTime={new Date(toMsTimestamp(post.publishDate)).toISOString()}
                    itemProp="datePublished"
                  >
                    {new Date(toMsTimestamp(post.publishDate)).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>

                  <ReadingTime content={post.body} />
                </div>

                {post.category && (
                  <div className="mt-2">
                    <span className="nature-chip nature-chip-accent" itemProp="articleSection">
                      {post.category}
                    </span>
                  </div>
                )}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
