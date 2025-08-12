---
title: "Next.js 博客系统"
date: "2024-01-02T00:00:00Z"
excerpt: "基于 Next.js 的现代化博客系统，支持多源内容采集和 AI 功能。"
category: "项目"
tags: ["Next.js", "博客", "TypeScript", "AI"]
author: "Ivan Li"
draft: false
public: true
status: "进行中"
github: "https://github.com/ivanli/blog-nextjs"
demo: "https://blog.ivanli.cc"
---

# Next.js 博客系统

这是一个基于 Next.js 15 构建的现代化个人博客系统，集成了多源内容采集、AI 功能和向量搜索等先进特性。

## 🎯 项目目标

- 创建一个高性能、可扩展的博客平台
- 支持多种内容源（本地文件、WebDAV、数据库）
- 集成 AI 功能提升用户体验
- 提供完善的管理后台

## 🏗️ 技术架构

### 前端技术栈
- **Next.js 15** - React 框架，使用 App Router
- **React 19** - 用户界面库
- **TypeScript** - 类型安全
- **Tailwind CSS 4** - 原子化 CSS 框架
- **daisyUI** - UI 组件库

### 后端技术栈
- **tRPC** - 类型安全的 API 层
- **Drizzle ORM** - 现代化 ORM
- **SQLite** - 轻量级数据库
- **Node.js** - 运行时环境

### AI 和搜索
- **OpenAI API** - AI 功能支持
- **LlamaIndex** - RAG 和向量搜索
- **Redis** - 缓存和会话存储

## 🚀 核心功能

### 多源内容采集系统
- **本地文件系统** - 支持 Markdown 文件读取
- **WebDAV 集成** - 远程内容同步
- **增量同步** - 智能变更检测
- **冲突解决** - 基于优先级的合并策略

### 内容管理
- **Markdown 支持** - 完整的 Markdown 语法
- **Frontmatter** - 元数据管理
- **分类和标签** - 内容组织
- **草稿系统** - 内容发布控制

### AI 功能
- **智能摘要** - 自动生成文章摘要
- **向量搜索** - 语义化内容搜索
- **内容推荐** - 基于相似度的推荐

## 📊 项目进度

### ✅ 已完成
- [x] 项目基础架构搭建
- [x] 数据库 Schema 设计
- [x] tRPC API 基础框架
- [x] 多源内容采集系统基础架构
- [x] 本地内容源实现

### 🔄 进行中
- [ ] WebDAV 内容源实现
- [ ] 内容源管理器
- [ ] 管理员界面
- [ ] Milkdown 编辑器集成

### 📋 计划中
- [ ] 闪念系统
- [ ] AI 功能集成
- [ ] 性能优化
- [ ] 部署和监控

## 🛠️ 开发环境

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 数据库迁移
bun run migrate

# 运行测试
bun test
```

## 📝 文档

- [开发文档](./docs/development.md)
- [API 文档](./docs/api.md)
- [部署指南](./docs/deployment.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
