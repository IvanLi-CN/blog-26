#!/usr/bin/env bun

/**
 * 数据库 Seed 脚本
 * 用于填充开发和测试环境的示例数据
 */

import { like } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, initializeDB } from "../src/lib/db";
import { comments, emailVerificationCodes, posts, users } from "../src/lib/schema";

interface SeedOptions {
  clearExisting: boolean;
  developmentOnly: boolean;
  dataTypes: Array<"posts" | "comments" | "users">;
  verbose: boolean;
}

// 解析命令行参数
function parseArgs(): {
  action: "seed" | "clear" | "check";
  options: SeedOptions;
} {
  const args = process.argv.slice(2);

  let action: "seed" | "clear" | "check" = "seed";
  const options: SeedOptions = {
    clearExisting: true,
    developmentOnly: true,
    dataTypes: ["posts", "comments", "users"],
    verbose: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--clear":
      case "-c":
        action = "clear";
        break;

      case "--check":
        action = "check";
        break;

      case "--no-clear":
        options.clearExisting = false;
        break;

      case "--production":
        options.developmentOnly = false;
        break;

      case "--quiet":
      case "-q":
        options.verbose = false;
        break;

      case "--types":
      case "-t":
        if (i + 1 < args.length) {
          const types = args[i + 1].split(",").map((t) => t.trim());
          options.dataTypes = types.filter((t) =>
            ["posts", "comments", "users"].includes(t)
          ) as Array<"posts" | "comments" | "users">;
          i++; // 跳过下一个参数
        }
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return { action, options };
}

// 打印帮助信息
function printHelp(): void {
  console.log(`
数据库 Seed 脚本

用法:
  bun run seed [选项]

动作:
  (默认)           执行 seed 操作
  --clear, -c      清理所有测试数据
  --check          检查是否存在测试数据

选项:
  --no-clear       不清理现有测试数据（增量添加）
  --production     允许在生产环境运行（危险！）
  --quiet, -q      静默模式，减少输出
  --types, -t      指定要 seed 的数据类型（逗号分隔）
                   可选值: posts,comments,users
  --help, -h       显示此帮助信息

示例:
  bun run seed                           # 执行完整 seed
  bun run seed --clear                   # 清理测试数据
  bun run seed --check                   # 检查测试数据
  bun run seed --types posts,users       # 只 seed 文章和用户
  bun run seed --no-clear --quiet        # 增量添加，静默模式

注意:
  - 默认只在开发和测试环境运行
  - 生产环境需要使用 --production 参数（不推荐）
  - 测试数据都有特殊前缀，不会与真实数据冲突
`);
}

// 检查是否有测试数据
async function hasTestData(): Promise<boolean> {
  try {
    const testUsers = await db.select().from(users).where(like(users.email, "%test%")).limit(1);
    return testUsers.length > 0;
  } catch (error) {
    console.error("检查测试数据时出错:", error);
    return false;
  }
}

// 清理所有测试数据
async function clearAllTestData(): Promise<void> {
  try {
    // 清理测试用户
    await db.delete(users).where(like(users.email, "%test%"));

    // 清理测试文章
    await db.delete(posts).where(like(posts.title, "测试%"));

    // 清理测试评论
    await db.delete(comments).where(like(comments.content, "%测试%"));

    // 清理验证码
    await db.delete(emailVerificationCodes);

    console.log("✅ 测试数据清理完成");
  } catch (error) {
    console.error("清理测试数据时出错:", error);
    throw error;
  }
}

// 执行种子数据填充
async function seedDatabase(options: SeedOptions): Promise<{
  success: boolean;
  message: string;
  seededCounts: { posts: number; comments: number; users: number };
  errors?: string[];
}> {
  try {
    // 环境检查
    if (options.developmentOnly && process.env.NODE_ENV === "production") {
      return {
        success: false,
        message: "生产环境不允许执行 seed 操作，使用 --production 参数强制执行",
        seededCounts: { posts: 0, comments: 0, users: 0 },
      };
    }

    // 清理现有数据
    if (options.clearExisting) {
      if (options.verbose) console.log("🧹 清理现有测试数据...");
      await clearAllTestData();
    }

    const seededCounts = { posts: 0, comments: 0, users: 0 };

    // 创建测试用户
    if (options.dataTypes.includes("users")) {
      if (options.verbose) console.log("👥 创建测试用户...");

      const testUsers = [
        {
          id: uuidv4(),
          email: "test1@example.com",
          name: "测试用户1",
          createdAt: Date.now(),
        },
        {
          id: uuidv4(),
          email: "test2@example.com",
          name: "测试用户2",
          createdAt: Date.now(),
        },
      ];

      await db.insert(users).values(testUsers);
      seededCounts.users = testUsers.length;
    }

    // 创建测试文章
    if (options.dataTypes.includes("posts")) {
      if (options.verbose) console.log("📝 创建测试文章...");

      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      const testPosts = [
        {
          id: "test-post-1",
          title: "Next.js 15 新特性深度解析",
          body: `# Next.js 15 新特性深度解析

Next.js 15 带来了许多令人兴奋的新特性，让我们一起来深入了解这些改进。

## 主要新特性

### 1. React 19 支持
Next.js 15 完全支持 React 19，包括新的并发特性和服务器组件改进。

### 2. Turbopack 稳定版
Turbopack 现在已经稳定，构建速度提升了 76%。

### 3. 改进的缓存策略
新的缓存策略让应用性能更加出色。

## 代码示例

\`\`\`typescript
// app/page.tsx
export default function HomePage() {
  return (
    <div>
      <h1>Welcome to Next.js 15!</h1>
    </div>
  );
}
\`\`\`

这些新特性让 Next.js 15 成为了构建现代 Web 应用的最佳选择。`,
          slug: "nextjs-15-features",
          type: "post",
          excerpt:
            "深入解析 Next.js 15 的新特性，包括 React 19 支持、Turbopack 稳定版和改进的缓存策略。",
          publishDate: now - oneDay * 1,
          updateDate: now - oneDay * 1,
          draft: false,
          public: true,
          image:
            "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&h=400&fit=crop",
          tags: "Next.js,React,前端开发,Web开发",
          category: "技术",
          author: "Ivan Li",
          contentHash: "nextjs-15-hash",
          lastModified: now - oneDay * 1,
          createdAt: now - oneDay * 1,
          updatedAt: now - oneDay * 1,
          dataSource: "database",
        },
        {
          id: "test-post-2",
          title: "TypeScript 5.0 实战指南",
          body: `# TypeScript 5.0 实战指南

TypeScript 5.0 引入了许多强大的新特性，让我们的开发体验更加出色。

## 核心改进

### 1. 装饰器支持
原生支持 ECMAScript 装饰器，无需额外配置。

### 2. const 类型参数
新的 const 类型参数让类型推断更加精确。

### 3. 性能优化
编译速度提升了 10-20%，内存使用减少了 13%。

## 实际应用

\`\`\`typescript
// 装饰器示例
class ApiController {
  @Get('/users')
  getUsers() {
    return this.userService.findAll();
  }
}

// const 类型参数
function createConfig<const T>(config: T): T {
  return config;
}
\`\`\`

TypeScript 5.0 让我们能够写出更安全、更高效的代码。`,
          slug: "typescript-5-guide",
          type: "post",
          excerpt: "全面介绍 TypeScript 5.0 的新特性，包括装饰器支持、const 类型参数和性能优化。",
          publishDate: now - oneDay * 2,
          updateDate: now - oneDay * 2,
          draft: false,
          public: true,
          image:
            "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=800&h=400&fit=crop",
          tags: "TypeScript,JavaScript,编程语言,类型系统",
          category: "技术",
          author: "Ivan Li",
          contentHash: "typescript-5-hash",
          lastModified: now - oneDay * 2,
          createdAt: now - oneDay * 2,
          updatedAt: now - oneDay * 2,
          dataSource: "database",
        },
        {
          id: "test-post-3",
          title: "现代前端架构设计思考",
          body: `# 现代前端架构设计思考

在快速发展的前端生态中，如何设计一个可维护、可扩展的前端架构是每个开发者都需要思考的问题。

## 架构原则

### 1. 模块化设计
将应用拆分为独立的模块，每个模块负责特定的功能。

### 2. 状态管理
选择合适的状态管理方案，如 Zustand、Redux Toolkit 等。

### 3. 组件设计
遵循单一职责原则，构建可复用的组件库。

## 技术选型

\`\`\`typescript
// 状态管理示例
import { create } from 'zustand';

interface AppState {
  user: User | null;
  setUser: (user: User) => void;
}

const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
\`\`\`

好的架构设计能够让团队更高效地协作，让产品更稳定地运行。`,
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
          lastModified: now - oneDay * 3,
          createdAt: now - oneDay * 3,
          updatedAt: now - oneDay * 3,
          dataSource: "database",
        },
        {
          id: "test-post-4",
          title: "AI 辅助编程的实践与思考",
          body: `# AI 辅助编程的实践与思考

AI 工具正在改变我们的编程方式，让我们来看看如何更好地利用这些工具。

## AI 工具的优势

### 1. 代码生成
快速生成样板代码和常见模式。

### 2. 代码审查
自动发现潜在的问题和改进建议。

### 3. 文档生成
自动生成代码文档和注释。

## 实践经验

\`\`\`typescript
// AI 生成的工具函数
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
\`\`\`

AI 是工具，不是替代品。关键是要学会如何与 AI 协作。`,
          slug: "ai-assisted-programming",
          type: "post",
          excerpt: "分享 AI 辅助编程的实践经验，探讨如何更好地利用 AI 工具提高开发效率。",
          publishDate: now - oneDay * 4,
          updateDate: now - oneDay * 4,
          draft: false,
          public: true,
          image:
            "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop",
          tags: "AI,编程工具,开发效率,人工智能",
          category: "AI",
          author: "Ivan Li",
          contentHash: "ai-programming-hash",
          lastModified: now - oneDay * 4,
          createdAt: now - oneDay * 4,
          updatedAt: now - oneDay * 4,
          dataSource: "database",
        },
        {
          id: "test-post-5",
          title: "Web 性能优化实战",
          body: `# Web 性能优化实战

性能优化是前端开发中的重要话题，让我们来看看一些实用的优化技巧。

## 优化策略

### 1. 资源优化
压缩图片、使用 WebP 格式、懒加载等。

### 2. 代码分割
使用动态导入和路由级别的代码分割。

### 3. 缓存策略
合理使用浏览器缓存和 CDN。

## 性能监控

\`\`\`typescript
// 性能监控示例
function measurePerformance(name: string, fn: () => void) {
  const start = performance.now();
  fn();
  const end = performance.now();
  console.log(\`\${name} took \${end - start} milliseconds\`);
}

// 使用示例
measurePerformance('data processing', () => {
  // 数据处理逻辑
});
\`\`\`

性能优化是一个持续的过程，需要不断地测量和改进。`,
          slug: "web-performance-optimization",
          type: "post",
          excerpt: "分享 Web 性能优化的实战经验，包括资源优化、代码分割和缓存策略等方面。",
          publishDate: now - oneDay * 5,
          updateDate: now - oneDay * 5,
          draft: false,
          public: true,
          image:
            "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop",
          tags: "性能优化,Web开发,前端优化,用户体验",
          category: "性能",
          author: "Ivan Li",
          contentHash: "performance-hash",
          lastModified: now - oneDay * 5,
          createdAt: now - oneDay * 5,
          updatedAt: now - oneDay * 5,
          dataSource: "database",
        },
        {
          id: "test-post-6",
          title: "开源项目维护心得",
          body: `# 开源项目维护心得

维护开源项目是一件既有挑战又有收获的事情，让我分享一些心得体会。

## 项目管理

### 1. 版本规划
制定清晰的版本发布计划和里程碑。

### 2. 社区建设
积极回应 issue 和 PR，建立友好的社区氛围。

### 3. 文档维护
保持文档的及时更新和完整性。

## 技术债务

\`\`\`typescript
// 重构示例
// Before
function processData(data: any) {
  // 复杂的处理逻辑
}

// After
interface DataProcessor {
  validate(data: unknown): boolean;
  transform(data: ValidData): ProcessedData;
  save(data: ProcessedData): Promise<void>;
}

class DefaultDataProcessor implements DataProcessor {
  // 清晰的实现
}
\`\`\`

开源项目不仅是代码，更是一个社区和生态系统。`,
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
          lastModified: now - oneDay * 6,
          createdAt: now - oneDay * 6,
          updatedAt: now - oneDay * 6,
          dataSource: "database",
        },
      ];

      await db.insert(posts).values(testPosts);
      seededCounts.posts = testPosts.length;
    }

    return {
      success: true,
      message: "Seed 操作完成",
      seededCounts,
    };
  } catch (error) {
    return {
      success: false,
      message: "Seed 操作失败",
      seededCounts: { posts: 0, comments: 0, users: 0 },
      errors: [String(error)],
    };
  }
}

// 主函数
async function main(): Promise<void> {
  try {
    // 初始化数据库
    await initializeDB();

    const { action, options } = parseArgs();

    switch (action) {
      case "seed": {
        console.log("🌱 开始执行数据库 seed...\n");
        const result = await seedDatabase(options);

        if (result.success) {
          console.log(`\n✅ ${result.message}`);
          if (options.verbose) {
            console.log("\n📊 Seed 统计:");
            console.log(`   文章: ${result.seededCounts.posts}`);
            console.log(`   评论: ${result.seededCounts.comments}`);
            console.log(`   用户: ${result.seededCounts.users}`);
          }
        } else {
          console.error(`\n❌ ${result.message}`);
          if (result.errors) {
            console.error("错误详情:");
            result.errors.forEach((error) => console.error(`   - ${error}`));
          }
          process.exit(1);
        }
        break;
      }

      case "clear":
        console.log("🧹 清理所有测试数据...\n");
        await clearAllTestData();
        console.log("✅ 测试数据清理完成");
        break;

      case "check": {
        console.log("🔍 检查测试数据...\n");
        const exists = await hasTestData();
        if (exists) {
          console.log("✅ 发现测试数据");
        } else {
          console.log("❌ 未发现测试数据");
        }
        break;
      }
    }
  } catch (error) {
    console.error("❌ 执行失败:", error);
    process.exit(1);
  }
}

// 运行脚本
if (import.meta.main) {
  main();
}
