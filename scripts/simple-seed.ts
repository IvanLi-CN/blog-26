#!/usr/bin/env bun

import { db, initializeDB } from "../src/lib/db";
import { posts } from "../src/lib/schema";

async function main() {
  await initializeDB();

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  const testPosts = [
    {
      id: "test-post-1",
      title: "Next.js 15 新特性深度解析",
      body: "深入解析 Next.js 15 的新特性，包括 React 19 支持、Turbopack 稳定版和改进的缓存策略。",
      slug: "nextjs-15-features",
      type: "post",
      excerpt:
        "深入解析 Next.js 15 的新特性，包括 React 19 支持、Turbopack 稳定版和改进的缓存策略。",
      publishDate: now - oneDay * 1,
      updateDate: now - oneDay * 1,
      draft: false,
      public: true,
      image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&h=400&fit=crop",
      tags: "Next.js,React,前端开发,Web开发",
      category: "技术",
      author: "Ivan Li",
      contentHash: "nextjs-15-hash",
      dataSource: "database",
    },
    {
      id: "test-post-2",
      title: "TypeScript 5.0 实战指南",
      body: "全面介绍 TypeScript 5.0 的新特性，包括装饰器支持、const 类型参数和性能优化。",
      slug: "typescript-5-guide",
      type: "post",
      excerpt: "全面介绍 TypeScript 5.0 的新特性，包括装饰器支持、const 类型参数和性能优化。",
      publishDate: now - oneDay * 2,
      updateDate: now - oneDay * 2,
      draft: false,
      public: true,
      image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=800&h=400&fit=crop",
      tags: "TypeScript,JavaScript,编程语言,类型系统",
      category: "技术",
      author: "Ivan Li",
      contentHash: "typescript-5-hash",
      dataSource: "database",
    },
    {
      id: "test-post-3",
      title: "现代前端架构设计思考",
      body: "探讨现代前端架构设计的核心原则，包括模块化设计、状态管理和组件设计等方面。",
      slug: "modern-frontend-architecture",
      type: "post",
      excerpt: "探讨现代前端架构设计的核心原则，包括模块化设计、状态管理和组件设计等方面。",
      publishDate: now - oneDay * 3,
      updateDate: now - oneDay * 3,
      draft: false,
      public: true,
      image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop",
      tags: "前端架构,设计模式,软件工程,最佳实践",
      category: "架构",
      author: "Ivan Li",
      contentHash: "frontend-arch-hash",
      dataSource: "database",
    },
    {
      id: "test-post-4",
      title: "AI 辅助编程的实践与思考",
      body: "分享 AI 辅助编程的实践经验，探讨如何更好地利用 AI 工具提高开发效率。",
      slug: "ai-assisted-programming",
      type: "post",
      excerpt: "分享 AI 辅助编程的实践经验，探讨如何更好地利用 AI 工具提高开发效率。",
      publishDate: now - oneDay * 4,
      updateDate: now - oneDay * 4,
      draft: false,
      public: true,
      image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop",
      tags: "AI,编程工具,开发效率,人工智能",
      category: "AI",
      author: "Ivan Li",
      contentHash: "ai-programming-hash",
      dataSource: "database",
    },
    {
      id: "test-post-5",
      title: "Web 性能优化实战",
      body: "分享 Web 性能优化的实战经验，包括资源优化、代码分割和缓存策略等方面。",
      slug: "web-performance-optimization",
      type: "post",
      excerpt: "分享 Web 性能优化的实战经验，包括资源优化、代码分割和缓存策略等方面。",
      publishDate: now - oneDay * 5,
      updateDate: now - oneDay * 5,
      draft: false,
      public: true,
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop",
      tags: "性能优化,Web开发,前端优化,用户体验",
      category: "性能",
      author: "Ivan Li",
      contentHash: "performance-hash",
      dataSource: "database",
    },
    {
      id: "test-post-6",
      title: "开源项目维护心得",
      body: "分享开源项目维护的心得体会，包括项目管理、社区建设和技术债务处理等方面。",
      slug: "open-source-maintenance",
      type: "post",
      excerpt: "分享开源项目维护的心得体会，包括项目管理、社区建设和技术债务处理等方面。",
      publishDate: now - oneDay * 6,
      updateDate: now - oneDay * 6,
      draft: false,
      public: true,
      image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=800&h=400&fit=crop",
      tags: "开源,项目管理,社区建设,软件开发",
      category: "开源",
      author: "Ivan Li",
      contentHash: "opensource-hash",
      dataSource: "database",
    },
  ];

  try {
    await db.insert(posts).values(testPosts);
    console.log(`✅ 成功添加 ${testPosts.length} 篇测试文章`);
  } catch (error) {
    console.error("❌ 添加测试文章失败:", error);
  }
}

if (import.meta.main) {
  main();
}
