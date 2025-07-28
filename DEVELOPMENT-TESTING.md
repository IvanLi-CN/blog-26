# 开发测试指南

本文档介绍如何使用项目提供的测试数据进行开发和测试。

## 🚀 快速开始

### 1. 生成测试数据

```bash
# 生成所有测试数据（文章、项目、备忘录）
bun run test-data:generate

# 验证生成的数据
bun run test-data:verify

# 清理测试数据（如需重新生成）
bun run test-data:clean
```

### 2. 启动 WebDAV 测试服务器

```bash
# 启动本地 WebDAV 服务器
bun run webdav:start
```

服务器信息：
- **地址**: http://localhost:8080
- **认证**: 无需认证

### 3. 配置环境变量

```bash
# 复制测试环境配置
cp .env.test-data.example .env

# 编辑 .env 文件，添加必要的配置（如 OpenAI API Key）
```

### 4. 启动开发服务器

```bash
# 启动开发服务器
bun run dev
```

## 📁 测试数据结构

生成的测试数据包含：

### WebDAV 数据 (`test-data/webdav/`)
- **文章**: 5篇技术文章（TypeScript、React、Node.js、Docker、Web安全）
- **项目**: 5个项目案例（博客系统、代码审查工具、微服务平台等）
- **备忘录**: 5篇备忘录（技术学习、生活思考、工作项目等）

### 本地数据 (`test-data/local/`)
- **文章**: 与 WebDAV 相同的 5篇文章
- **项目**: 与 WebDAV 相同的 5个项目

## 🧪 测试场景

### 多数据源测试
- 同时从本地文件系统和 WebDAV 服务器加载内容
- 验证内容合并和去重逻辑
- 测试缓存机制

### 内容类型测试
- **文章**: 标准博客文章格式
- **项目**: 项目展示页面格式
- **备忘录**: 时间线式快速记录格式

### 状态测试
- **草稿/已发布**: 测试内容发布状态
- **公开/私有**: 测试访问权限控制
- **时间处理**: 测试发布时间和更新时间

### 功能测试
- **搜索**: 测试全文搜索和标签搜索
- **分类**: 测试内容分类和筛选
- **编辑**: 测试在线编辑功能
- **AI 功能**: 测试智能摘要和向量搜索

## 🔧 开发工具

### 可用脚本

```bash
# 测试数据管理
bun run test-data:generate    # 生成测试数据
bun run test-data:verify      # 验证测试数据
bun run test-data:clean       # 清理测试数据

# WebDAV 服务器
bun run webdav:start          # 启动 WebDAV 测试服务器
bun run webdav:test           # 测试 WebDAV 连接（无认证）
bun run webdav:check          # 检查 WebDAV 连接
bun run webdav:list           # 列出 WebDAV 文件

# 数据库管理
bun run migrate               # 运行数据库迁移
bun run seed                  # 填充种子数据
bun run db:reset              # 重置数据库

# 开发服务器
bun run dev                   # 启动开发服务器（管理员模式）
bun run dev:prod              # 启动开发服务器（生产模式）
```

### 调试技巧

1. **查看日志**: 开发服务器会输出详细的内容加载日志
2. **检查缓存**: 使用 `bun run db:posts` 查看缓存的文章数据
3. **验证 WebDAV**: 使用 `bun run webdav:test` 测试 WebDAV 连接（无认证）
4. **重置环境**: 使用 `bun run db:reset` 重置数据库状态

## 📝 内容格式说明

### 文章和项目 Frontmatter
```yaml
---
title: "文章标题"                    # 必需
slug: "url-friendly-slug"           # 可选，自动生成
publishDate: 2025-07-28T10:00:00Z   # 发布时间
updateDate: 2025-07-28T12:00:00Z    # 更新时间
draft: false                        # 是否为草稿
public: true                        # 是否公开
excerpt: "文章摘要"                  # 摘要
category: "技术"                     # 分类
tags: ["标签1", "标签2"]             # 标签数组
author: "作者名"                     # 作者
image: "/images/cover.jpg"          # 封面图片
---
```

### 备忘录 Frontmatter
```yaml
---
createdAt: "2025-07-28T10:00:00Z"   # 创建时间
updatedAt: "2025-07-28T10:00:00Z"   # 更新时间
public: true                        # 是否公开
tags: ["标签1", "标签2"]             # 标签数组
attachments:                        # 附件数组
  - filename: "image.jpg"
    path: "/assets/image.jpg"
    contentType: "image/jpeg"
    size: 12345
    isImage: true
---
```

## 🔍 故障排除

### 常见问题

1. **WebDAV 服务器启动失败**
   - 检查端口 8080 是否被占用
   - 确保测试数据已生成

2. **内容加载失败**
   - 检查环境变量配置
   - 验证 WebDAV 服务器是否运行
   - 查看开发服务器日志

3. **数据库错误**
   - 运行 `bun run migrate` 更新数据库结构
   - 运行 `bun run db:reset` 重置数据库

4. **缓存问题**
   - 重启开发服务器
   - 清理浏览器缓存
   - 检查 Redis 连接（如果使用）

### 获取帮助

- 查看项目文档: `docs/` 目录
- 运行帮助命令: `bun run <script> --help`
- 检查日志输出: 开发服务器控制台
- 测试WebDAV连接: `bun run webdav:test`

## 📋 最佳实践

1. **开发流程**
   - 先生成测试数据
   - 启动 WebDAV 服务器
   - 配置环境变量
   - 启动开发服务器

2. **数据管理**
   - 定期验证测试数据完整性
   - 根据需要更新测试内容
   - 保持本地和 WebDAV 数据同步

3. **性能测试**
   - 使用大量测试数据测试性能
   - 监控内存使用情况
   - 测试并发访问场景

4. **功能测试**
   - 测试所有内容类型
   - 验证不同状态的内容
   - 测试边界情况和错误处理
