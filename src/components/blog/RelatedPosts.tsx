import { Icon } from "@iconify/react";
import Link from "next/link";
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
  tags?: string;
  image?: string;
}

interface RelatedPostsProps {
  posts: RelatedPost[];
  currentPostCategory?: string;
  currentPostTags?: string;
}

export default function RelatedPosts({
  posts,
  currentPostCategory,
  currentPostTags,
}: RelatedPostsProps) {
  if (!posts || posts.length === 0) {
    return null;
  }

  // 智能排序：优先显示同分类或同标签的文章
  const sortedPosts = [...posts].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    // 同分类加分
    if (currentPostCategory && a.category === currentPostCategory) scoreA += 3;
    if (currentPostCategory && b.category === currentPostCategory) scoreB += 3;

    // 同标签加分
    if (currentPostTags && a.tags) {
      const currentTags = currentPostTags.split(",").map((t) => t.trim());
      const aTags = a.tags.split(",").map((t) => t.trim());
      const commonTags = currentTags.filter((tag) => aTags.includes(tag));
      scoreA += commonTags.length;
    }
    if (currentPostTags && b.tags) {
      const currentTags = currentPostTags.split(",").map((t) => t.trim());
      const bTags = b.tags.split(",").map((t) => t.trim());
      const commonTags = currentTags.filter((tag) => bTags.includes(tag));
      scoreB += commonTags.length;
    }

    // 按发布时间排序（新的优先）
    if (scoreA === scoreB) {
      return b.publishDate - a.publishDate;
    }

    return scoreB - scoreA;
  });

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 mt-12">
      <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Icon icon="tabler:article" className="w-6 h-6 text-primary" />
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
                className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary/30 dark:hover:border-primary/30 hover:shadow-md transition-all duration-200"
                itemProp="url"
              >
                {post.image && (
                  <div className="mb-3 overflow-hidden rounded-md">
                    {/* biome-ignore lint/performance/noImgElement: Next/Image is not necessary in this context */}
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-200"
                      itemProp="image"
                    />
                  </div>
                )}

                <h3
                  className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors duration-200 line-clamp-2"
                  itemProp="headline"
                >
                  {post.title}
                </h3>

                {post.excerpt && (
                  <p
                    className="text-sm text-base-content/70 mb-3 line-clamp-2"
                    itemProp="description"
                  >
                    {post.excerpt}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-base-content/50">
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
                    <span
                      className="inline-block px-2 py-1 text-xs bg-primary/10 text-primary rounded-full"
                      itemProp="articleSection"
                    >
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
