"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import Link from "next/link";
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
  tags?: string;
  published: boolean;
  dataSource?: string; // 内容源：local/webdav
}

interface BlogListItemProps {
  post: Post;
}

export default function BlogListItem({ post }: BlogListItemProps) {
  const link = `/posts/${post.slug}`;

  // 处理标签 - 从逗号分隔的字符串转换为数组
  const tags = post.tags
    ? post.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  // 使用新的图片路径解析函数
  const contentSource = (post.dataSource === "local" ? "local" : "webdav") as "local" | "webdav";
  const markdownFilePath = post.id; // post.id 就是文件路径
  const imageSrc = resolveImagePath(post.image, contentSource, markdownFilePath);

  return (
    <article className="max-w-md mx-auto md:max-w-none grid gap-6 md:gap-8 md:grid-cols-2 relative group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-lg p-4 hover:bg-base-100/50">
      <div className={`mt-2 ${imageSrc ? "md:col-start-2 md:row-start-1" : "md:col-span-2"}`}>
        <header>
          <div className="mb-1">
            <span className="text-sm">
              <Icon
                icon="tabler:clock"
                className="w-3.5 h-3.5 inline-block -mt-0.5 dark:text-gray-400"
              />
              <time
                dateTime={new Date(toMsTimestamp(post.publishDate)).toISOString()}
                className="inline-block"
              >
                {getFormattedDateFromTimestamp(post.publishDate)}
              </time>
              {post.author && (
                <>
                  {" "}
                  ·{" "}
                  <Icon
                    icon="tabler:user"
                    className="w-3.5 h-3.5 inline-block -mt-0.5 dark:text-gray-400"
                  />
                  <span>{post.author.replaceAll("-", " ")}</span>
                </>
              )}
              {post.category && (
                <>
                  {" "}
                  ·{" "}
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

        {tags.length > 0 && (
          <footer className="mt-5">
            <PostTags tags={tags} />
          </footer>
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
}

function PostTags({ tags }: PostTagsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/tag/${encodeURIComponent(tag)}`}
          className="badge badge-outline badge-sm hover:badge-primary transition-colors"
        >
          #{tag}
        </Link>
      ))}
    </div>
  );
}
