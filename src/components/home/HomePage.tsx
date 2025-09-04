"use client";

import Link from "next/link";
import { SITE } from "../../config/site";
import { trpc as api } from "../../lib/trpc";
import { toMsTimestamp } from "../../lib/utils";
import PageLayout from "../common/PageLayout";
import Icon from "../ui/Icon";
import ProjectCard from "./ProjectCard";
import TimelineItem from "./TimelineItem";

// 解析标签的辅助函数
function parseTags(tagsJson: string | null): string[] {
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

export default function HomePage() {
  // 获取最新文章
  const { data: postsData, isLoading: postsLoading } = api.posts.list.useQuery({
    page: 1,
    limit: 10,
    published: true,
  });

  // 使用 tRPC 查询真实数据
  const { data: memos, isLoading: memosLoading } = api.memos.list.useQuery({
    limit: 5,
    publicOnly: true,
  });

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
      publishDate: new Date(memo.createdAt), // memo.createdAt 已经是 ISO 字符串格式
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

  if (postsLoading || memosLoading) {
    return (
      <PageLayout>
        <div className="flex justify-center items-center py-20">
          <span className="loading loading-spinner loading-lg"></span>
          <span className="ml-2">正在加载...</span>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Hero Section */}
      <section className="relative px-3 sm:px-4 md:px-6 py-6 md:py-12 mx-auto max-w-6xl">
        <div className="text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            Ivan&apos;s <span className="text-accent">Blog</span>
          </h1>
          <p className="text-lg md:text-xl text-muted mb-6 max-w-2xl mx-auto">{SITE.description}</p>
        </div>
      </section>

      {/* Timeline Section - 文章和闪念混合时间线 */}
      <section className="px-3 sm:px-4 md:px-6 py-8 md:py-12 mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Icon name="tabler:timeline" className="w-5 h-5 text-primary" />
            最新动态
          </h2>
          {/* 简洁的导航链接 */}
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/posts"
              className="flex items-center gap-1 text-muted hover:text-primary transition-colors"
            >
              <Icon name="tabler:article" className="w-4 h-4" />
              文章
            </Link>
            <Link
              href="/memos"
              className="flex items-center gap-1 text-muted hover:text-primary transition-colors"
            >
              <Icon name="tabler:bulb" className="w-4 h-4" />
              闪念
            </Link>
          </div>
        </div>

        <div className="timeline flex flex-col">
          {timelineItems.length > 0 ? (
            timelineItems.map((item, index) => (
              <TimelineItem
                key={`${item.type}-${item.id}`}
                item={item}
                isLast={index === timelineItems.length - 1}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted">
              <Icon name="tabler:timeline" className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>暂无内容</p>
            </div>
          )}
        </div>
      </section>

      {/* Featured Projects Section */}
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Icon name="tabler:code" className="w-5 h-5 text-green-500" />
            精选项目 ({featuredProjects.length})
          </h2>
          <Link href="/projects" className="btn btn-link text-sm">
            查看全部 »
          </Link>
        </div>

        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {featuredProjects.map((project) => (
            <ProjectCard
              key={project.href}
              title={project.title}
              href={project.href}
              category={project.category}
            />
          ))}
        </div>
      </section>
    </PageLayout>
  );
}
