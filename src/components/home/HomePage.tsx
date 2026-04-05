"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { SITE } from "../../config/site";
import { toMsTimestamp } from "../../lib/utils";
import type { AppRouter } from "../../server/router";
import PageLayout from "../common/PageLayout";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import Icon from "../ui/Icon";
import ProjectCard from "./ProjectCard";
import TimelineItem from "./TimelineItem";

// 解析标签的辅助函数
function parseTags(raw: unknown): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  if (typeof raw !== "string") return [];

  const tagsJson = raw.trim();
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((tag) => typeof tag === "string");
    }
    return [];
  } catch {
    return [];
  }
}

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PostsListOutput = RouterOutputs["posts"]["list"];
type MemosListOutput = RouterOutputs["memos"]["list"];

export default function HomePage({
  initialPosts,
  initialMemos,
  tagIconMap,
  tagIconSvgMap,
}: {
  initialPosts?: PostsListOutput;
  initialMemos?: MemosListOutput;
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
}) {
  const postsData = initialPosts;
  const memos = initialMemos;

  // 处理文章数据
  const processedPosts =
    postsData?.posts?.slice(0, 10).map((post) => ({
      type: "post" as const,
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt || `${post.body.substring(0, 200)}...`,
      publishDate: new Date(toMsTimestamp(post.publishDate)), // 兼容秒/毫秒时间戳
      tags: Array.isArray(post.tags) ? post.tags : [],
      image: post.image || undefined,
      permalink: `/posts/${post.slug}`,
      dataSource: post.dataSource || "webdav",
    })) || [];

  // 处理闪念数据
  const processedMemos =
    memos?.memos?.slice(0, 5).map((memo) => ({
      type: "memo" as const,
      id: memo.id,
      slug: memo.slug,
      title: memo.title || "",
      content: memo.content,
      body: memo.content,
      publishDate: new Date(
        memo.publishedAt ?? memo.createdAt ?? memo.updatedAt ?? new Date().toISOString()
      ),
      tags: parseTags(memo.tags),
      dataSource: (memo as { dataSource?: string }).dataSource || "webdav",
    })) || [];

  // 合并文章和闪念，按时间排序
  const timelineItems = [...processedPosts, ...processedMemos]
    .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime())
    .slice(0, 15); // 显示最新的15条

  // 精选项目数据 - 模拟数据
  const featuredProjects = [
    { title: "智能聊天机器人平台", href: "/projects/chatbot-platform", category: "AI" },
    { title: "微服务架构实践", href: "/projects/microservices", category: "架构" },
    { title: "个人博客系统", href: "/projects/blog-system", category: "前端" },
    { title: "数据可视化大屏", href: "/projects/data-viz", category: "可视化" },
    { title: "AI代码审查工具", href: "/projects/code-review", category: "工具" },
    { title: "性能监控系统", href: "/projects/performance", category: "监控" },
  ];

  return (
    <PageLayout>
      <section className="px-3 py-8 sm:px-4 md:py-12">
        <div className="nature-container">
          <div className="nature-surface px-5 py-8 text-center sm:px-8 sm:py-12">
            <span className="nature-kicker mx-auto mb-5">Nature Interface</span>
            <h1 className="nature-title mx-auto max-w-4xl text-4xl font-bold sm:text-5xl md:text-6xl">
              Ivan&apos;s <span className="text-[color:var(--nature-accent-strong)]">Blog</span>
              ，在流动的数字温室里安放想法。
            </h1>
            <p className="nature-muted mx-auto mt-5 max-w-3xl text-base leading-8 sm:text-lg">
              {SITE.description}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/posts" className="nature-button nature-button-primary">
                <Icon name="tabler:article" className="h-4 w-4" />
                浏览文章
              </Link>
              <Link href="/memos" className="nature-button nature-button-outline">
                <Icon name="tabler:bulb" className="h-4 w-4" />
                进入 Memos
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="px-3 py-6 sm:px-4 md:py-8">
        <div className="nature-container grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="nature-surface-quiet px-5 py-5 sm:px-6">
            <div className="nature-kicker mb-4">Latest Flow</div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="nature-title text-2xl font-semibold sm:text-3xl">最新动态</h2>
                <p className="nature-muted mt-2 text-sm sm:text-base">
                  文章与闪念混合排列，像水流一样按时间缓慢向下展开。
                </p>
              </div>
              <div className="hidden flex-wrap gap-2 sm:flex">
                <Link href="/posts" className="nature-chip">
                  <Icon name="tabler:article" className="h-3.5 w-3.5" />
                  文章
                </Link>
                <Link href="/memos" className="nature-chip nature-chip-accent">
                  <Icon name="tabler:bulb" className="h-3.5 w-3.5" />
                  闪念
                </Link>
              </div>
            </div>
          </div>

          <div className="nature-panel nature-panel-soft overflow-hidden px-5 py-5">
            <div className="nature-kicker mb-4">Featured Grid</div>
            <h2 className="nature-title text-2xl font-semibold">精选项目</h2>
            <p className="nature-muted mt-2 text-sm leading-7">
              一组更轻的索引入口，用湿润、圆润的表面保持页面呼吸感。
            </p>
          </div>
        </div>
      </section>

      <section className="px-3 py-6 sm:px-4 md:py-10">
        <div className="nature-reading-container">
          <div className="timeline flex flex-col">
            {timelineItems.length > 0 ? (
              timelineItems.map((item, index) => (
                <TimelineItem
                  key={`${item.type}-${item.id}`}
                  item={item}
                  isLast={index === timelineItems.length - 1}
                  tagIconMap={tagIconMap}
                  tagIconSvgMap={tagIconSvgMap}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted">
                <Icon name="tabler:timeline" className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>暂无内容</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-3 py-6 sm:px-4 md:py-8">
        <div className="nature-container">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="nature-title flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
                <Icon
                  name="tabler:code"
                  className="h-6 w-6 text-[color:var(--nature-accent-strong)]"
                />
                精选项目 ({featuredProjects.length})
              </h2>
              <p className="nature-muted mt-2 text-sm">
                不再使用硬朗卡片网格，而是改成更柔和的气泡索引。
              </p>
            </div>
            <Link href="/projects" prefetch={false} className="nature-button nature-button-ghost">
              查看全部
            </Link>
          </div>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {featuredProjects.map((project) => (
              <ProjectCard
                key={project.href}
                title={project.title}
                href={project.href}
                category={project.category}
              />
            ))}
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
