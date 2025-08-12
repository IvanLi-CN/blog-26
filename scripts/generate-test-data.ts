#!/usr/bin/env bun

/**
 * 生成测试数据脚本
 * 创建用于开发和测试的示例内容
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";

// 下载图片到本地（带重试机制）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _downloadImage(
  url: string,
  filePath: string,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TestDataGenerator/1.0)",
        },
        // 忽略证书验证错误（仅用于测试数据生成）
        tls: {
          rejectUnauthorized: false,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      writeFileSync(filePath, buffer);

      console.log(`✅ ${filePath.split("/").pop()}`);
      return; // 成功下载，退出重试循环
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        console.log(
          `⚠️  ${filePath.split("/").pop()} 下载失败 (尝试 ${attempt}/${maxRetries}), 1秒后重试...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // 所有重试都失败了
  throw new Error(`下载失败 ${url} (${maxRetries} 次尝试): ${lastError?.message}`);
}

// 测试数据配置
function getDataDirectories(environment: "dev" | "test" = "test") {
  const baseDir = environment === "dev" ? "dev-data" : "test-data";
  return {
    WEBDAV_DIR: join(baseDir, "webdav"),
    LOCAL_DIR: join(baseDir, "local"),
  };
}

// 生成随机日期（过去30天内）
function generateRandomDate(): Date {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const randomTime =
    thirtyDaysAgo.getTime() + Math.random() * (now.getTime() - thirtyDaysAgo.getTime());
  return new Date(randomTime);
}

// 从 Markdown 内容中提取第一个标题（优先H1，备选H2）
function extractFirstH1Title(markdown: string): string | null {
  // 优先匹配H1标题：# 标题
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // 如果没有H1，尝试匹配H2标题：## 标题
  const h2Match = markdown.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }

  return null;
}

// 清理标题用作文件名
function cleanTitleForFilename(title: string): string {
  const cleaned = title.replace(/[^\w\u4e00-\u9fa5\s-]/g, "");
  const withUnderscores = cleaned.replace(/\s+/g, "_");
  return withUnderscores.substring(0, 50);
}

// 生成闪念文件名（与实际应用逻辑一致）
function generateMemoFilename(content: string, createdAt: Date): string {
  const datePrefix = `${createdAt.getFullYear()}${(createdAt.getMonth() + 1).toString().padStart(2, "0")}${createdAt.getDate().toString().padStart(2, "0")}`;

  const title = extractFirstH1Title(content);
  let filenamePart: string;

  if (title) {
    filenamePart = cleanTitleForFilename(title);
  } else {
    // 如果没有标题，使用内容的前20个字符
    const firstLine = content.split("\n")[0].trim();
    filenamePart = cleanTitleForFilename(firstLine.substring(0, 20));
  }

  // 如果清理后的文件名为空，使用随机ID
  if (!filenamePart) {
    filenamePart = nanoid(8);
  }

  return `${datePrefix}_${filenamePart}.md`;
}

// 示例闪念内容
const SAMPLE_MEMOS = [
  {
    content: `# 今日学习笔记

学习了 React 的新特性，特别是 Concurrent Features。

## 主要收获

- React 18 的 Suspense 改进
- useTransition 的使用场景
- useDeferredValue 的性能优化

感觉前端技术发展真快！`,
    public: true,
  },
  {
    content: `# 项目进展

今天完成了博客系统的评论功能。

## 技术栈
- tRPC 用于类型安全的 API
- Drizzle ORM 处理数据库
- React Query 管理状态

下一步要实现实时通知功能。`,
    public: true,
  },
  {
    content: `# 读书笔记：《代码整洁之道》

## 第三章：函数

- 函数应该短小
- 只做一件事
- 使用描述性的名称

> 代码是写给人看的，只是偶尔让计算机执行。

这句话很有道理！`,
    public: false,
  },
  {
    content: `# 周末计划

- [ ] 完成博客的 Markdown 渲染优化
- [ ] 学习 Next.js 13 的 App Router
- [ ] 写一篇关于 TypeScript 的文章
- [ ] 整理代码仓库

希望这个周末能高效完成这些任务！`,
    public: true,
  },
  {
    content: `# 技术思考

最近在思考前端架构的演进：

1. **jQuery 时代** - DOM 操作为主
2. **MVC 框架** - Angular, Backbone
3. **组件化时代** - React, Vue
4. **现代全栈** - Next.js, Nuxt

每个时代都有其特点和价值。`,
    public: true,
  },
];

// 示例博客文章内容
const SAMPLE_POSTS = [
  {
    title: "React Hooks 深度解析",
    content: `---
title: "React Hooks 深度解析"
description: "深入理解 React Hooks 的工作原理和最佳实践"
publishDate: 2024-01-15
draft: false
public: true
tags: ["React", "JavaScript", "前端"]
category: "技术"
---

# React Hooks 深度解析

React Hooks 是 React 16.8 引入的新特性，它让我们能够在函数组件中使用状态和其他 React 特性。

## 为什么需要 Hooks？

在 Hooks 出现之前，我们需要使用类组件来管理状态：

\`\`\`jsx
class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
  }

  render() {
    return (
      <div>
        <p>You clicked {this.state.count} times</p>
        <button onClick={() => this.setState({ count: this.state.count + 1 })}>
          Click me
        </button>
      </div>
    );
  }
}
\`\`\`

使用 Hooks 后，我们可以用函数组件实现同样的功能：

\`\`\`jsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
\`\`\`

## 常用的 Hooks

### useState

\`useState\` 是最基本的 Hook，用于在函数组件中添加状态。

### useEffect

\`useEffect\` 用于处理副作用，相当于类组件中的 \`componentDidMount\`、\`componentDidUpdate\` 和 \`componentWillUnmount\` 的组合。

### useContext

\`useContext\` 用于消费 React Context，避免了深层嵌套的问题。

## 自定义 Hooks

自定义 Hooks 是 React Hooks 最强大的特性之一：

\`\`\`jsx
function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);

  const increment = () => setCount(count + 1);
  const decrement = () => setCount(count - 1);
  const reset = () => setCount(initialValue);

  return { count, increment, decrement, reset };
}
\`\`\`

## 总结

React Hooks 让函数组件变得更加强大，同时保持了代码的简洁性。掌握 Hooks 是现代 React 开发的必备技能。`,
    tags: ["React", "JavaScript", "前端"],
    category: "技术",
  },
];

// 创建目录结构
function createDirectories(dirs: { WEBDAV_DIR: string; LOCAL_DIR: string }): void {
  const { WEBDAV_DIR, LOCAL_DIR } = dirs;

  // 创建 WebDAV 目录结构
  const webdavDirs = [
    WEBDAV_DIR,
    join(WEBDAV_DIR, "Memos"),
    join(WEBDAV_DIR, "assets"),
    join(WEBDAV_DIR, "Project"),
  ];

  // 创建本地目录结构
  const localDirs = [LOCAL_DIR, join(LOCAL_DIR, "assets"), join(LOCAL_DIR, "projects")];

  [...webdavDirs, ...localDirs].forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });
}

// 生成闪念文件
async function generateMemos(webdavDir: string): Promise<void> {
  console.log("📝 生成闪念文件...");

  const memosDir = join(webdavDir, "Memos");

  for (const memo of SAMPLE_MEMOS) {
    const createdAt = generateRandomDate();
    const filename = generateMemoFilename(memo.content, createdAt);
    const filePath = join(memosDir, filename);

    const frontmatter = `---
created_at: ${createdAt.toISOString()}
public: ${memo.public}
---

${memo.content}`;

    writeFileSync(filePath, frontmatter, "utf-8");
    console.log(`✅ ${filename}`);
  }
}

// 生成博客文章
async function generatePosts(localDir: string): Promise<void> {
  console.log("📄 生成博客文章...");

  for (const post of SAMPLE_POSTS) {
    const filename = `${post.title
      .replace(/[^\w\u4e00-\u9fa5\s]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()}.md`;
    const filePath = join(localDir, filename);

    writeFileSync(filePath, post.content, "utf-8");
    console.log(`✅ ${filename}`);
  }
}

// 清理测试数据
function cleanTestData(environment: "dev" | "test" = "test"): void {
  const dirs = getDataDirectories(environment);
  const { WEBDAV_DIR, LOCAL_DIR } = dirs;

  console.log(`🧹 清理${environment === "dev" ? "开发" : "测试"}数据...`);

  [WEBDAV_DIR, LOCAL_DIR].forEach((dir) => {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`✅ 已删除: ${dir}`);
    }
  });
}

// 主函数
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDevMode = args.includes("--dev");
  const isCleanMode = args.includes("--clean");
  const environment = isDevMode ? "dev" : "test";

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
测试数据生成脚本

用法:
  bun run scripts/generate-test-data.ts [选项]

选项:
  --dev                     生成开发环境数据 (dev-data/)
  --clean                   清理现有数据
  --help, -h                显示帮助信息

示例:
  bun run scripts/generate-test-data.ts                    # 生成测试数据
  bun run scripts/generate-test-data.ts --dev              # 生成开发数据
  bun run scripts/generate-test-data.ts --clean            # 清理测试数据
  bun run scripts/generate-test-data.ts --dev --clean      # 清理开发数据
`);
    return;
  }

  try {
    if (isCleanMode) {
      cleanTestData(environment);
      return;
    }

    const dirs = getDataDirectories(environment);
    console.log(`🚀 生成${environment === "dev" ? "开发" : "测试"}环境数据...`);

    // 创建目录结构
    createDirectories(dirs);

    // 生成内容
    await generateMemos(dirs.WEBDAV_DIR);
    await generatePosts(dirs.LOCAL_DIR);

    console.log(`\n✅ ${environment === "dev" ? "开发" : "测试"}数据生成完成！`);
    console.log(`📁 WebDAV 数据: ${dirs.WEBDAV_DIR}`);
    console.log(`📁 本地数据: ${dirs.LOCAL_DIR}`);
  } catch (error) {
    console.error("❌ 生成失败:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
