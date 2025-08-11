# 📝 Ivan's Blog - 详细项目说明文档

## 📋 项目概览

**项目名称**: Ivan's Blog (@ivanli-cn/blog)  
**版本**: 1.0.0  
**作者**: Ivan Li (ivanli2048@gmail.com)  
**许可证**: MIT (代码) + CC BY-NC-ND 4.0 (内容)  
**仓库**: ssh://gitea@git.ivanli.cc:7018/Ivan/blog-astrowind.git

这是一个功能丰富的现代化个人博客系统，基于 Astro 5.0 构建，集成了完整的内容管理、评论系统、AI 增强功能和向量搜索能力。

## 🛠 技术栈详解

### 核心框架与运行时
- **前端框架**: Astro 5.0 (SSG/SSR) + React 19.1.0
- **运行时**: Bun 1.0+ (包管理器 + JavaScript 运行时)
- **适配器**: @nurodev/astro-bun (Bun 适配器)
- **输出模式**: Server (服务器端渲染)

### 样式与UI
- **CSS 框架**: Tailwind CSS 4.1.10
- **组件库**: daisyUI 5.0.43
- **图标**: @iconify/react + 多个图标集
- **字体**: @fontsource-variable/inter

### 数据层
- **数据库**: SQLite (生产) + Drizzle ORM 0.44.2
- **缓存**: Redis 7 (ioredis 5.6.1)
- **向量存储**: SQLite BLOB 存储 embedding 向量
- **数据迁移**: Drizzle Kit 0.31.1

### AI 与搜索
- **AI 服务**: OpenAI API 5.6.0 + LlamaIndex 0.11.9
- **向量模型**: BAAI/bge-m3 (1024维)
- **聊天模型**: deepseek-v3
- **语义搜索**: 基于余弦相似度的向量搜索

### 内容处理
- **Markdown**: MDX 4.3.0 + 多个 remark/rehype 插件
- **数学公式**: KaTeX (rehype-katex)
- **图表**: Mermaid (rehype-mermaid)
- **代码高亮**: Shiki (github-light/dracula 主题)
- **编辑器**: Milkdown 7.15.2 + TipTap 3.0.1

### 开发工具
- **代码质量**: Biome 2.0.4 (格式化 + 检查)
- **类型检查**: TypeScript 5.8.3
- **测试**: Bun test + Playwright 1.54.1 (E2E)
- **Git 钩子**: Lefthook 1.11.14
- **提交规范**: Commitlint

### 部署与运维
- **容器化**: Docker + Docker Compose
- **反向代理**: 支持 Traefik SSO 集成
- **健康检查**: 内置 tRPC 健康检查端点
- **监控**: 详细的日志和错误处理

## 📁 详细项目结构

```
├── src/                           # 源代码目录
│   ├── components/                # React/Astro 组件
│   │   ├── admin/                # 管理后台组件
│   │   │   ├── ActivityCalendar.tsx    # 活动日历
│   │   │   └── TrendChart.tsx          # 趋势图表
│   │   ├── blog/                 # 博客相关组件
│   │   │   ├── SinglePost.astro        # 单篇文章
│   │   │   ├── PostReactions.tsx       # 文章反应
│   │   │   └── RelatedPosts.astro      # 相关文章
│   │   ├── comments/             # 评论系统组件
│   │   │   ├── CommentSection.tsx      # 评论区
│   │   │   ├── CommentForm.tsx         # 评论表单
│   │   │   └── Reactions.tsx           # 反应组件
│   │   ├── memos/                # 闪念/备忘录组件
│   │   │   ├── MemosApp.tsx            # 闪念应用
│   │   │   ├── MilkdownEditor.tsx      # Milkdown 编辑器
│   │   │   └── QuickMemoEditor.tsx     # 快速编辑器
│   │   ├── editor/               # 编辑器组件
│   │   │   ├── PostEditor.tsx          # 文章编辑器
│   │   │   ├── MarkdownPreview.tsx     # Markdown 预览
│   │   │   └── DirectoryTree.tsx       # 目录树
│   │   ├── common/               # 通用组件
│   │   │   ├── ImageLightbox.tsx       # 图片灯箱
│   │   │   ├── MarkdownRenderer.tsx    # Markdown 渲染器
│   │   │   └── UniversalEditor.tsx     # 通用编辑器
│   │   ├── ui/                   # UI 基础组件
│   │   ├── vectorization/        # 向量化组件
│   │   └── widgets/              # 页面小部件
│   ├── content/                  # 内容文件
│   │   ├── config.ts             # 内容集合配置
│   │   ├── posts/                # 博客文章 (MDX)
│   │   └── projects/             # 项目文档
│   ├── lib/                      # 核心库
│   │   ├── config.ts             # 统一配置管理 (Zod 验证)
│   │   ├── db.ts                 # 数据库连接
│   │   ├── schema.ts             # 数据库模式定义
│   │   ├── auth.ts               # 身份验证
│   │   ├── email.ts              # 邮件服务
│   │   ├── captcha.ts            # 验证码服务
│   │   ├── rag.ts                # RAG 查询
│   │   ├── vectorizer.ts         # 向量化服务
│   │   ├── content-sources/      # 多源内容架构
│   │   │   ├── types.ts          # 类型定义
│   │   │   ├── local.ts          # 本地文件源
│   │   │   ├── webdav.ts         # WebDAV 源
│   │   │   └── manager.ts        # 多源管理器
│   │   └── seed/                 # 数据填充
│   │       ├── index.ts          # 主入口
│   │       ├── test-data.ts      # 测试数据
│   │       └── types.ts          # 类型定义
│   ├── pages/                    # 页面路由
│   │   ├── api/                  # API 路由
│   │   │   ├── trpc/             # tRPC API
│   │   │   ├── file/             # 文件 API
│   │   │   └── webdav-image/     # WebDAV 图片
│   │   ├── admin/                # 管理页面
│   │   │   ├── dashboard.astro   # 仪表板
│   │   │   ├── posts.astro       # 文章管理
│   │   │   ├── comments.astro    # 评论管理
│   │   │   └── vectorize.astro   # 向量化管理
│   │   ├── blog/                 # 博客页面
│   │   ├── memos/                # 闪念页面
│   │   └── projects/             # 项目页面
│   ├── server/                   # tRPC 服务器
│   │   ├── router.ts             # 主路由器
│   │   └── routers/              # 子路由器
│   │       ├── auth.ts           # 认证路由
│   │       ├── comments.ts       # 评论路由
│   │       ├── posts.ts          # 文章路由
│   │       ├── memos.ts          # 闪念路由
│   │       ├── search.ts         # 搜索路由
│   │       └── vectorization.ts  # 向量化路由
│   └── utils/                    # 工具函数
├── tests/                        # 测试文件
│   ├── e2e/                      # E2E 测试
│   │   ├── specs/                # 测试规范
│   │   │   ├── memo-publish.spec.ts      # 闪念发布测试
│   │   │   ├── memo-attachments.spec.ts  # 附件测试
│   │   │   └── file-api.spec.ts          # 文件 API 测试
│   │   ├── setup/                # 测试设置
│   │   ├── test-data/            # 测试数据
│   │   └── utils/                # 测试工具
│   ├── integration/              # 集成测试
│   ├── lib/                      # 库测试
│   └── server/                   # 服务器测试
├── scripts/                      # 脚本工具
│   ├── migrate.ts                # 数据库迁移
│   ├── seed.ts                   # 数据填充
│   ├── generate-test-data.ts     # 测试数据生成
│   ├── db-tools.ts               # 数据库工具
│   ├── webdav-tools.ts           # WebDAV 工具
│   └── start-test-servers.ts     # 测试服务器启动
├── docs/                         # 项目文档
│   ├── multi-source-content-architecture.md  # 多源架构
│   ├── e2e-test-requirements.md              # E2E 测试需求
│   └── admin-dashboard.md                    # 管理面板文档
├── dev-data/                     # 开发数据
│   ├── local/                    # 本地测试数据
│   └── webdav/                   # WebDAV 测试数据
├── drizzle/                      # 数据库迁移文件
└── vendor/                       # 第三方集成
```

## 🗄️ 数据库架构详解

### 核心表结构

#### 1. users (用户表)
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at INTEGER NOT NULL
);
```

#### 2. comments (评论表)
```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  post_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  parent_id TEXT,  -- 支持嵌套回复
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/approved/rejected
  created_at INTEGER NOT NULL
);
```

#### 3. posts (文章缓存表)
```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,  -- 文件路径作为唯一标识
  slug TEXT NOT NULL,
  type TEXT NOT NULL,   -- post/project
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL,   -- markdown 纯文本内容
  publish_date INTEGER NOT NULL,
  update_date INTEGER,
  draft BOOLEAN NOT NULL DEFAULT false,
  public BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  tags TEXT,           -- JSON 字符串存储标签数组
  author TEXT,
  image TEXT,
  metadata TEXT,       -- JSON 字符串存储其他元数据
  data_source TEXT,    -- local/webdav/database
  content_hash TEXT NOT NULL
);
```

#### 4. vectorized_files (向量化文件表)
```sql
CREATE TABLE vectorized_files (
  filepath TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  last_modified_time INTEGER NOT NULL,
  content_updated_at INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  vector BLOB,         -- BLOB 类型存储向量 embeddings
  error_message TEXT   -- 向量化失败原因
);
```

#### 5. reactions (反应表)
```sql
CREATE TABLE reactions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,  -- post/comment
  target_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

#### 6. email_verification_codes (邮箱验证码表)
```sql
CREATE TABLE email_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
```

### 数据源架构

项目实现了多源内容架构，支持以下数据源：

#### 1. 本地文件系统 (Local)
- **路径**: `src/content/`
- **支持类型**: 博客文章、项目文档
- **格式**: MDX 文件
- **特点**: 直接文件系统访问，支持热重载

#### 2. WebDAV 远程存储
- **配置**: 通过环境变量配置 WebDAV 服务器
- **路径映射**:
  - 博客文章: `/blog/`
  - 项目文档: `/projects/`
  - 闪念: `/Memos/`
  - 资源文件: `/assets/`
- **特点**: 支持远程内容同步，实时更新

#### 3. 数据库缓存层
- **作用**: 统一的内容缓存和索引
- **功能**: 内容搜索、标签管理、状态跟踪
- **同步**: 自动检测内容变更并更新缓存

## 🎯 核心功能模块详解

### 1. 内容管理系统

#### 多源内容架构
- **统一接口**: `IContentSource` 抽象接口
- **数据源类型**: local、webdav、git、database
- **管理器**: `ContentSourceManager` 统一管理多个数据源
- **策略**: 支持优先级、合并、第一可用等读取策略

#### 内容缓存系统
- **缓存层**: Redis + SQLite 双层缓存
- **TTL 配置**: 可配置缓存过期时间 (默认 10 分钟)
- **自动刷新**: 定时检测内容变更并刷新缓存
- **最大容量**: 可配置最大缓存条目数 (默认 1000)

#### 内容处理流水线
1. **内容读取**: 从多个数据源读取原始内容
2. **Frontmatter 解析**: 提取元数据和正文
3. **Markdown 处理**: 使用 unified 生态系统处理
4. **图片优化**: 自动图片优化和懒加载
5. **向量化**: 生成内容 embedding 用于搜索

### 2. 评论系统

#### 核心特性
- **嵌套回复**: 支持无限层级的评论回复
- **状态管理**: pending/approved/rejected 三种状态
- **邮件通知**: 新评论自动发送邮件通知
- **管理审核**: 管理员可批量审核、删除、回复评论
- **反垃圾**: 集成 Luosimao CAPTCHA 防护

#### 技术实现
- **数据模型**: 使用 parent_id 实现树形结构
- **实时更新**: 基于 tRPC 的实时数据同步
- **权限控制**: 基于用户角色的权限管理
- **表情反应**: 支持 emoji 反应功能

### 3. 管理后台

#### 认证系统
- **双重认证**: JWT + Traefik SSO 集成
- **邮箱验证**: 验证码登录机制
- **会话管理**: 基于 cookie 的会话存储
- **权限控制**: 基于邮箱的管理员权限

#### 管理功能
- **内容管理**: 可视化编辑器，支持实时预览
- **评论管理**: 批量审核、删除、回复评论
- **向量化监控**: 查看内容向量化状态和错误
- **统计面板**: 访问统计、内容分析、活动日历
- **缓存管理**: 查看和清理内容缓存

#### 编辑器功能
- **多编辑器支持**: Milkdown + TipTap
- **实时预览**: 所见即所得的编辑体验
- **文件管理**: 支持文件上传和目录浏览
- **语法高亮**: 代码块语法高亮
- **数学公式**: KaTeX 数学公式支持

### 4. AI 增强功能

#### 向量搜索
- **模型**: BAAI/bge-m3 (1024维向量)
- **存储**: SQLite BLOB 存储向量数据
- **搜索**: 基于余弦相似度的语义搜索
- **索引**: 自动内容向量化和索引更新

#### RAG 查询系统
- **LlamaIndex**: 基于 LlamaIndex 的 RAG 实现
- **OpenAI 集成**: 支持 OpenAI API 和自定义端点
- **上下文检索**: 基于向量相似度的上下文检索
- **智能问答**: 基于内容的智能问答系统

#### 自动化功能
- **内容向量化**: 新内容自动生成 embedding
- **相关文章推荐**: 基于相似度的文章推荐
- **智能标签**: 基于内容的自动标签建议
- **内容摘要**: 自动生成文章摘要

### 5. 闪念系统 (Memos)

#### 核心特性
- **快速记录**: 类似微博的快速内容发布
- **Markdown 支持**: 完整的 Markdown 语法支持
- **附件管理**: 图片、文件上传和管理
- **实时预览**: 所见即所得的编辑体验
- **状态控制**: 公开/私有状态控制

#### 技术实现
- **编辑器**: Milkdown 富文本编辑器
- **文件存储**: WebDAV 远程存储
- **实时同步**: 基于 tRPC 的实时数据同步
- **附件处理**: 自动文件上传和路径管理

## 🔧 开发环境详解

### 环境配置

#### 必需环境变量
```bash
# 数据库配置
DB_PATH=./sqlite.db

# OpenAI 配置
OPENAI_API_KEY=sk-your-openai-key
OPENAI_API_BASE_URL=https://api.openai.com/v1

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# WebDAV 配置
WEBDAV_URL=https://your-webdav-url/
WEBDAV_USERNAME=your-username
WEBDAV_PASSWORD=your-password
WEBDAV_MEMOS_PATH=/Memos
WEBDAV_EXCLUDE_PATHS=.git,node_modules,draft

# 站点配置
SITE_URL=https://yourdomain.com
JWT_SECRET=your-32-char-secret-key

# SMTP 配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_NAME=Your Blog Name
SMTP_FROM_EMAIL=noreply@yourdomain.com

# 管理员配置
ADMIN_EMAIL=admin@yourdomain.com

# 验证码配置
PUBLIC_LUOSIMAO_SITE_KEY=your-site-key
LUOSIMAO_SECRET_KEY=your-secret-key
```

#### 配置验证
项目使用 Zod 进行配置验证：
```bash
# 测试配置
bun test-config.ts

# 在 Docker 环境中测试
docker-compose exec blog bun test-config.ts
```

### 开发数据管理

#### 数据目录结构
```
├── dev-data/                    # 开发环境数据
│   ├── local/                   # 本地文件数据
│   │   ├── 01-react-hooks-deep-dive.md
│   │   ├── assets/              # 本地资源文件
│   │   └── projects/            # 本地项目文档
│   └── webdav/                  # WebDAV 模拟数据
│       ├── Memos/               # 闪念数据
│       ├── Project/             # 项目数据
│       ├── assets/              # 资源文件
│       └── *.md                 # 博客文章
├── tests/e2e/test-data/         # E2E 测试数据
│   ├── Memos/                   # 测试闪念
│   ├── content/                 # 测试内容
│   ├── images/                  # 测试图片
│   └── assets/                  # 测试资源
└── data/                        # 生产数据目录
    └── sqlite.db                # 生产数据库
```

#### 数据生成和管理

##### 1. 测试数据生成
```bash
# 生成开发环境测试数据
bun run dev-data:generate

# 生成 E2E 测试数据
bun run test-data:generate

# 清理测试数据
bun run test-data:clean
bun run dev-data:clean

# 验证测试数据
bun run test-data:verify
```

##### 2. 数据库管理
```bash
# 数据库迁移
bun run migrate

# 数据填充 (开发环境)
bun run seed

# 清理测试数据
bun run seed:clear

# 检查测试数据
bun run seed:check

# 重置数据库
bun run db:reset

# 数据库工具
bun run db:check          # 检查数据库状态
bun run db:schema         # 显示数据库结构
bun run db:posts          # 显示文章数据
bun run db:comments       # 显示评论数据
```

##### 3. WebDAV 数据管理
```bash
# 启动开发 WebDAV 服务器
bun run webdav:dev

# 启动测试 WebDAV 服务器
bun run webdav:test

# WebDAV 工具
bun run webdav:list       # 列出 WebDAV 内容
bun run webdav:check      # 检查 WebDAV 连接
```

### 测试环境详解

#### E2E 测试配置

##### 测试环境设置
- **测试框架**: Playwright 1.54.1
- **浏览器**: Chromium (可扩展到 Firefox、Safari)
- **测试数据库**: `./test-results/test.db` (临时文件)
- **WebDAV 服务器**: `http://localhost:8080` (测试专用)
- **应用端口**: `http://localhost:4321`

##### 测试数据位置
```
tests/e2e/test-data/
├── Memos/                       # 闪念测试数据
├── content/
│   └── test-memo.md            # 测试闪念文件
├── images/                      # 测试图片
│   ├── test-image.png
│   ├── test-image.jpg
│   ├── test-image.gif
│   ├── test-image-1.png
│   ├── test-image-2.png
│   └── test-image-3.png
└── assets/                      # 其他测试资源
```

##### 测试命令
```bash
# 运行所有 E2E 测试
bun run test:e2e

# 无头模式运行
bun run test:e2e:headless

# 有头模式运行 (可视化)
bun run test:e2e:headed

# 调试模式
bun run test:e2e:debug

# 测试 UI 界面
bun run test:e2e:ui

# 查看测试报告
bun run test:e2e:report
```

##### 测试覆盖范围
1. **闪念发布流程测试** (`memo-publish.spec.ts`)
   - 简单文本闪念发布
   - Markdown 格式闪念发布
   - 私有闪念发布
   - 键盘快捷键发布
   - 编辑器清空功能
   - 网络错误处理

2. **附件管理测试** (`memo-attachments.spec.ts`)
   - 图片附件上传
   - 多文件上传
   - 附件预览
   - 附件删除

3. **文件 API 测试** (`file-api.spec.ts`)
   - 文件上传权限
   - 文件访问控制
   - API 安全性

4. **Markdown 处理测试** (`memo-markdown.spec.ts`)
   - 复杂 Markdown 语法
   - 代码块处理
   - 表格渲染
   - 链接处理

#### 单元测试和集成测试

##### 测试结构
```
tests/
├── integration/                 # 集成测试
├── lib/                        # 库函数测试
├── server/                     # 服务器逻辑测试
└── utils/                      # 工具函数测试
```

##### 测试命令
```bash
# 运行单元测试和集成测试
bun test

# 监视模式
bun run test:watch

# 排除 E2E 测试
bun test --exclude='tests/e2e/**/*'
```

### 开发工作流

#### 1. 本地开发启动
```bash
# 克隆项目
git clone ssh://gitea@git.ivanli.cc:7018/Ivan/blog-astrowind.git
cd blog-astrowind

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 数据库初始化
bun run migrate
bun run seed

# 启动开发服务器 (包含 WebDAV)
bun run dev

# 或仅启动 Astro 开发服务器
bun run dev:astro
```

#### 2. 开发环境特性
- **热重载**: 文件变更自动重载
- **管理员模式**: `ADMIN_MODE=true` 启用管理功能
- **WebDAV 模拟**: 本地 WebDAV 服务器用于开发
- **实时预览**: 内容变更实时预览
- **错误处理**: 详细的错误信息和堆栈跟踪

#### 3. 代码质量工具
```bash
# 代码检查
bun run check

# 自动修复
bun run fix

# TypeScript 检查
bun run check:astro

# Git 钩子 (自动运行)
# - pre-commit: 代码格式化和检查
# - commit-msg: 提交信息规范检查
```

## 🚀 部署环境详解

### Docker 部署

#### 构建配置
- **基础镜像**: oven/bun:1
- **系统依赖**: Chromium 相关库 (用于 Mermaid 渲染)
- **Playwright**: 预安装 Chromium 浏览器
- **健康检查**: tRPC 健康检查端点

#### 部署命令
```bash
# 构建和部署
bun run build
docker-compose up -d --build

# 使用部署脚本
./deploy.sh

# 查看日志
docker-compose logs -f blog

# 重启服务
docker-compose restart

# 完全重建
docker-compose down && docker-compose up -d --build
```

#### 服务组成
- **blog**: 主应用服务 (端口 4321)
- **redis**: Redis 缓存服务 (端口 6379)
- **数据卷**:
  - `./data:/app/data` (数据库和文件存储)
  - `redis_data` (Redis 数据持久化)

### 生产环境配置

#### 环境变量管理
- **配置文件**: `.env` (生产环境)
- **Docker 环境**: `docker-compose.yml` 环境变量映射
- **验证**: 启动时自动配置验证
- **安全**: 敏感信息通过环境变量传递

#### 性能优化
- **静态资源**: Astro 静态生成优化
- **图片优化**: 自动图片压缩和格式转换
- **缓存策略**: Redis + SQLite 多层缓存
- **CDN 支持**: 静态资源 CDN 配置

#### 监控和维护
```bash
# 健康检查
curl -f http://localhost:4321/api/trpc/health

# 故障排除
./troubleshoot.sh

# 详细健康检查
./debug-health.sh

# 查看应用状态
docker-compose ps
```

## 🔒 安全特性详解

### 身份验证
- **JWT 令牌**: 基于 JWT 的无状态认证
- **邮箱验证**: 验证码登录机制
- **Traefik SSO**: 支持反向代理 SSO 集成
- **会话管理**: 安全的 cookie 会话存储

### 数据保护
- **输入验证**: Zod 模式验证所有输入
- **XSS 防护**: 内容过滤和转义
- **CSRF 保护**: 跨站请求伪造防护
- **速率限制**: API 请求频率限制

### 访问控制
- **权限管理**: 基于角色的访问控制
- **管理员验证**: 多重管理员身份验证
- **文件访问**: 安全的文件访问控制
- **API 安全**: tRPC 类型安全 API

## 📚 项目依赖详解

### 生产依赖 (主要)
- **@astrojs/react**: 4.3.0 - Astro React 集成
- **@astrojs/rss**: 4.0.12 - RSS 订阅生成
- **@astrojs/sitemap**: 3.4.1 - 站点地图生成
- **@llamaindex/core**: 0.6.11 - LlamaIndex 核心库
- **@milkdown/core**: 7.15.2 - Milkdown 编辑器核心
- **@trpc/server**: 11.4.3 - tRPC 服务器
- **drizzle-orm**: 0.44.2 - Drizzle ORM
- **react**: 19.1.0 - React 框架
- **openai**: 5.6.0 - OpenAI API 客户端
- **ioredis**: 5.6.1 - Redis 客户端
- **zod**: 3.25.67 - 模式验证库

### 开发依赖 (主要)
- **@biomejs/biome**: 2.0.4 - 代码格式化和检查
- **@playwright/test**: 1.54.1 - E2E 测试框架
- **@tailwindcss/typography**: 0.5.16 - Tailwind 排版插件
- **typescript**: 5.8.3 - TypeScript 编译器
- **lefthook**: 1.11.14 - Git 钩子管理

### 脚本命令详解
```json
{
  "dev": "启动开发服务器 (包含 WebDAV)",
  "build": "构建生产版本",
  "migrate": "运行数据库迁移",
  "seed": "填充测试数据",
  "test:e2e": "运行 E2E 测试",
  "webdav:dev": "启动开发 WebDAV 服务器",
  "db:reset": "重置数据库",
  "check": "代码质量检查",
  "fix": "自动修复代码问题"
}
```

## 📖 总结

Ivan's Blog 是一个技术栈先进、功能完整的现代化博客系统。它不仅具备传统博客的基本功能，还集成了 AI 增强、向量搜索、多源内容管理等前沿技术。项目在开发体验、测试覆盖、部署便利性等方面都有很好的设计，是一个值得学习和参考的全栈项目。

主要亮点：
- 🚀 基于 Astro 5.0 的高性能架构
- 🤖 完整的 AI 集成和向量搜索
- 📝 多源内容管理架构
- 🧪 完善的测试体系 (单元测试 + E2E 测试)
- 🐳 一键 Docker 部署
- 🔒 企业级安全特性
- 📱 现代化的用户界面和体验
