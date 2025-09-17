"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/config/site";
import { resolveImagePath } from "../../lib/image-utils";
import { getFormattedDateFromTimestamp, toMsTimestamp } from "../../lib/utils";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  body: string;
  image?: string;
  publishDate: number;
  author?: string;
  category?: string;
  tags?: string[];
  published: boolean;
  dataSource?: string; // 内容源：local/webdav
  isVectorized?: boolean; // 是否已完成向量化（当前模型且哈希匹配）
}

interface BlogListItemProps {
  post: Post;
}

export default function BlogListItem({ post }: BlogListItemProps) {
  const link = `/posts/${post.slug}`;

  // 处理标签 - 兼容字符串数组并清洗空白
  const tags = Array.isArray(post.tags) ? post.tags.map((tag) => tag.trim()).filter(Boolean) : [];

  // 使用新的图片路径解析函数
  // 检查数据源是否包含 "local"（支持 "local" 和 "local-test" 等变体）
  const contentSource = (post.dataSource?.includes("local") ? "local" : "webdav") as
    | "local"
    | "webdav";
  const markdownFilePath = post.id; // post.id 就是文件路径
  const imageSrc = resolveImagePath(post.image, contentSource, markdownFilePath);

  const authorName = post.author?.trim() || SITE.author.name;
  const displayAuthor = post.author ? post.author.replaceAll("-", " ") : authorName;

  return (
    <article className="max-w-md mx-auto md:max-w-none grid gap-6 md:gap-8 md:grid-cols-2 relative group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-lg p-4 hover:bg-base-100/50">
      <div
        className={`mt-2 ${imageSrc ? "md:col-start-2 md:row-start-1" : "md:col-span-2"} h-full flex flex-col`}
      >
        <header>
          <div className="mb-1">
            <span className="text-sm flex flex-wrap items-center gap-1">
              <Icon icon="tabler:clock" className="w-3.5 h-3.5 -mt-0.5 dark:text-gray-400" />
              <time
                dateTime={new Date(toMsTimestamp(post.publishDate)).toISOString()}
                className="inline-block"
              >
                {getFormattedDateFromTimestamp(post.publishDate)}
              </time>
              <span>·</span>
              <Icon icon="tabler:user" className="w-3.5 h-3.5 -mt-0.5 dark:text-gray-400" />
              <span>{displayAuthor}</span>
              {post.category && (
                <>
                  <span>·</span>
                  <Link className="hover:underline" href={`/category/${post.category}`}>
                    {post.category}
                  </Link>
                </>
              )}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold leading-tight font-heading dark:text-slate-300 flex-grow">
              <Link
                className="inline-block hover:text-primary dark:hover:text-blue-700 transition-all duration-300 group-hover:translate-x-1"
                href={link}
              >
                {post.title}
              </Link>
            </h2>
            <PostStatus post={post} size="sm" className="flex-shrink-0" />
          </div>
        </header>

        {post.excerpt && <p className="flex-grow text-base-content/70 text-lg">{post.excerpt}</p>}

        {tags.length > 0 ? (
          <footer className="mt-auto pt-4">
            <PostTags tags={tags} showVectorized={post.isVectorized} />
          </footer>
        ) : (
          // 无标签时也保证星标在文本列底部对齐显示（单独占一行，靠右）
          post.isVectorized && (
            <div className="mt-auto pt-4 flex">
              <span
                className="ml-auto text-secondary/80 drop-shadow shrink-0"
                title="已向量化（当前模型，哈希匹配）"
              >
                <Icon icon="tabler:sparkles" className="w-5 h-5" aria-hidden="true" />
              </span>
            </div>
          )
        )}
      </div>

      {imageSrc && (
        <Link className="relative block group" href={link}>
          <div className="relative h-0 pb-[56.25%] md:pb-[75%] md:h-72 lg:pb-[56.25%] overflow-hidden bg-gray-400 dark:bg-slate-700 rounded shadow-lg transition-all duration-300 group-hover:shadow-xl">
            <Image
              src={
                imageSrc ||
                (post.image?.startsWith("./assets/")
                  ? `/api/files/webdav/${post.image.substring(2)}`
                  : post.image) ||
                ""
              }
              className="absolute inset-0 object-cover w-full h-full mb-6 rounded shadow-lg bg-gray-400 dark:bg-slate-700 transition-transform duration-300 group-hover:scale-105"
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        </Link>
      )}

      {/* 星标已移入文本列底部（或标签行），避免在移动端覆盖图片 */}
    </article>
  );
}

// PostStatus 组件
interface PostStatusProps {
  post: Post;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function PostStatus({ post, size = "md", className = "" }: PostStatusProps) {
  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-2",
  };

  return (
    <span
      className={`badge ${post.published ? "badge-success" : "badge-warning"} ${sizeClasses[size]} ${className}`}
    >
      <Icon icon={post.published ? "tabler:eye" : "tabler:eye-off"} className="w-3 h-3 mr-1" />
      {post.published ? "公开" : "私有"}
    </span>
  );
}

// PostTags 组件
interface PostTagsProps {
  tags: string[];
  showVectorized?: boolean;
}

function PostTags({ tags, showVectorized }: PostTagsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 min-h-5">
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/tag/${encodeURIComponent(tag)}`}
          className="badge badge-outline badge-sm hover:badge-primary transition-colors"
        >
          #{tag}
        </Link>
      ))}
      {showVectorized && (
        <span
          className="ml-auto flex items-center text-secondary/80 drop-shadow shrink-0"
          title="已向量化（当前模型，哈希匹配）"
        >
          <Icon icon="tabler:sparkles" className="w-5 h-5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
