---
title: "Hello World - 我的第一篇博客"
date: "2024-01-01T00:00:00Z"
publishDate: "2024-01-01T00:00:00Z"
excerpt: "这是我的第一篇博客文章，用来测试本地内容源功能。"
category: "技术"
tags: ["博客", "测试", "Hello World"]
author: "Ivan Li"
draft: false
public: true
image: "/images/hello-world.jpg"
---

# Hello World

欢迎来到我的博客！这是我的第一篇文章。

## 关于这个博客

这个博客使用了以下技术栈：

- **Next.js 15** - React 框架
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式框架
- **tRPC** - 类型安全的 API
- **Drizzle ORM** - 数据库 ORM
- **SQLite** - 数据库

## 多源内容采集系统

这篇文章是通过**多源内容采集系统**从本地文件系统读取的，该系统支持：

1. **本地文件系统** - 从 `src/content/` 目录读取 Markdown 文件
2. **WebDAV 服务器** - 从远程 WebDAV 服务器同步内容
3. **数据库存储** - 统一存储到 SQLite 数据库

### 特性

- ✅ **增量同步** - 只处理变更的文件
- ✅ **内容哈希** - 基于 SHA-256 的变更检测
- ✅ **冲突解决** - 智能的优先级策略
- ✅ **错误处理** - 完善的错误恢复机制

## 代码示例

```typescript
// 创建本地内容源
const localSource = new LocalContentSource({
  name: "local",
  priority: 50,
  enabled: true,
  options: {
    contentPath: "./src/content",
    recursive: true,
  },
});

// 初始化并获取内容
await localSource.initialize();
const contentItems = await localSource.listContent();
```

## 总结

这个多源内容采集系统为博客提供了灵活的内容管理能力，支持多种数据源，确保内容的一致性和可靠性。

期待在后续的文章中分享更多技术细节！ 🚀
