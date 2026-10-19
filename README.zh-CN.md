<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/IvanLi-CN/blog-26/releases"><img src="https://img.shields.io/github/v/release/IvanLi-CN/blog-26?display_name=tag&label=%E5%8F%91%E5%B8%83&style=flat-square" alt="最新发布" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/ci.yml?branch=main&label=CI&style=flat-square" alt="CI 状态" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/e2e.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/e2e.yml?branch=main&label=E2E&style=flat-square" alt="E2E 状态" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/package.json"><img src="https://img.shields.io/badge/Bun-%5E1.0.0-f9f1e1?logo=bun&logoColor=000000&style=flat-square" alt="Bun 运行时要求" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/Dockerfile"><img src="https://img.shields.io/badge/Docker-image-2496ED?logo=docker&logoColor=white&style=flat-square" alt="Docker 镜像构建" /></a>
</p>

# Ivan's Blog

Ivan's Blog 是一个由个人掌握、供人类与获授权 AI Agent 共同使用的个人知识库。它让记录、资料、项目经验和可复用规则能够跨越阅读、写作与实际工作持续使用；博客只是其中一个选择性发布入口，不是产品的全部。

知识所有者决定保存什么、谁可以访问，以及哪些内容可以公开。人类和 Agent 通过不同的界面与权限使用同一批知识。本项目不是默认的多租户 SaaS、企业知识治理产品或通用聊天产品；Agent 接入也不会默认公开私有内容。

当前实现状态为 `active / partial`；完整平台验证和真实 alpha 验收仍是单独的开放门禁，不能从现有绿色检查推断完成。

公开站点：[ivanli.cc](https://ivanli.cc)

<p align="center">
  <a href="./site/assets/brand/source/ivan-blog-mark.svg"><img src="./site/assets/brand/source/ivan-blog-mark.svg" width="128" alt="Ivan's Blog 产品主标记" /></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/projects/social/blog-26-dark-1280.webp" />
    <source media="(prefers-color-scheme: light)" srcset="./public/projects/social/blog-26-light-1280.webp" />
    <img src="./public/projects/social/blog-26-light-1280.webp" width="100%" alt="供人类与 AI Agent 共同使用的 Ivan's Blog 个人知识库" />
  </picture>
</p>

## 产品做什么

- **记录与整理：** 在本地 Markdown 内容根目录中维护 Posts、Memos、Projects、Tags、资料和可复用的 Playbook 规则。
- **检索与引用：** 结合关键词、全文和可用的 AI 检索，同时保留可见性、来源和降级边界。
- **阅读与选择性发布：** 通过公开站点和 RSS 发布选定的文章、Memo、项目和 Playbook 内容；未公开的内容保持私有。
- **接入获授权的 Agent：** 远程 MCP 让获授权的 Agent 在权限范围内读取、检索、创建和更新内容。
- **处理外部资料：** Memo 剪藏先保存作者输入，再异步生成摘要和译文，同时保留原始来源与上一份成功版本。
- **管理系统：** 管理控制台提供编辑、预览、评论、计划任务、访问令牌、AI 配置和内容同步控制。

共享知识不等于自动公开。读取、写入、Agent 接入和公开发布是彼此独立的决定。

## 知识如何循环

1. 人把记录、资料、项目决定或可复用规则保存到知识库。
2. 获授权的 Agent 检索相关记录，引用依据，并在任务中使用它。
3. 新的认识或修正可以作为可辨认的 Agent 贡献返回，由所有者审阅和维护。
4. 所有者决定维护后的记录继续私有，还是作为文章、Memo、项目或 Playbook 条目公开。

## 使用确定性的 Web Demo

Web Demo 使用真实应用路由、fixture、mock API 和内存状态构建。它不需要登录、模型调用、live gateway 或外部内容源，交互产生的修改也不会写入真实服务。

```bash
bun run setup
bun run web-demo:build
bun run web-demo:preview
```

公开 Demo 从 `/memos/` 开始，管理 Demo 从 `/admin/dashboard` 开始。共享 Inspector 提供场景、身份、网络、数据、模拟操作、分享状态和最近的内存变更。Demo 是独立构建产物，不能通过查询字符串或浏览器存储注入到正式产物。

## 本地开发

仓库使用 Bun `^1.0.0`，Astro CLI 需要 Node.js 22.12 或更新版本。`bun run setup` 会初始化 checkout 或 worktree，并在缺失时创建本地环境入口。

```bash
bun run setup
bun run dev-sync:trigger
bun run dev
```

应用只读取配置的本地内容根目录，不需要也不会启动远程内容源服务。常用本地设置如下：

```bash
DB_PATH=./dev-data/sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/local
CONTENT_SOURCES=local
PORT=<leased gateway port>
SITE_PORT=<leased site port>
ADMIN_PORT=<leased admin port>
```

完整本地构建使用 `bun run build`；生产 console runtime 使用 `bun run start`。不要复用其他 worktree 的端口；生成状态需要重建时使用 `bun run worktree:bootstrap -- --force`。

## 搜索、剪藏与内容同步

搜索支持 `keyword`、`rewrite` 和 `rag` 模式。关键词命中会被保留；AI 检索不可用时直接降级到关键词搜索。SQLite FTS5 和内置 Tantivy 都是可重建的索引投影，权威来源仍是本地 Markdown。

Memo 剪藏由 `#剪藏` 和 HTTP(S) 目标 URL 触发。异步处理开始前会先保存作者输入。处理状态包括 `queued`、`processing`、`completed` 和 `failed`；摘要与翻译进度相互独立，失败时保留作者内容，重试也不会自动公开 Memo。

管理端的 RAG repair 和 rebuild 请求在异步内容同步任务持久记录后返回 `202 Accepted`。`202` 不代表索引已经完成：应通过任务和状态接口观察阶段、进度、取消和失败详情。repair 与 rebuild 都是显式恢复动作；此任务契约没有隐式 delivery retry、下游 delivery 状态或 dead-letter 状态。详见[内容同步 HTTP 契约](docs/specs/style-playbook-integration/contracts/content-sync-status.md)。

## 部署

运行时使用本地文件系统内容根目录、SQLite 和生成的搜索投影。仓库提供公开站点、管理端、网关和完整 Docker 产品面，它们的构建与运行边界不能互相替代。

## 发布交付

产品发布使用[手动产品发版](docs/runbooks/manual-version-release.md)。一个 release identity 同时覆盖静态前台和完整功能 Docker 镜像，通过受保护的只修改 `VERSION` 的 PR 准备，然后发布为 GitHub Release 和 GHCR 镜像。稳定版在验证后可以推进生产站点；预发布只发布产物，不推进稳定站点。

## 仓库结构

- `site/`：Astro 公开站点和公开安装面。
- `apps/admin/`：Vite/React 管理 SPA。
- `src/server/`：Bun 网关、HTTP API、tRPC、MCP 和内容服务。
- `src/lib/`：共享模型、搜索、Playbook、版本和运行时库。
- `drizzle/`：SQLite migrations 和数据库配置。
- `site/assets/brand/source/ivan-blog-mark.svg`：README 和公开品牌使用的 canonical mark；PWA 安装专用变体单独派生。
- `tests/`：单元、集成、E2E 和可复用组件交互覆盖。
- `docs/`：产品规格、实现记录、ADR、契约和运行手册。

## 验证改动

```bash
bun run check
bun run test
bun run test:e2e
bun run test:storybook-boundary
```

页面级证据使用官方 Web Demo 路由。Storybook 只覆盖可复用组件和聚焦的交互状态；[质量门禁](.github/quality-gates.json)定义必需的 CI 与发布检查。

## 更多文档

- [产品愿景与目标](PRODUCT.md)：产品目的、用户、目标、共享知识约束和非目标。
- [Context](CONTEXT.md) 与 [Glossary](GLOSSARY.md)：稳定的领域语言和公开运行面术语。
- [规格索引](docs/specs/README.md)：Spec 层级，以及 `SPEC.md`、`IMPLEMENTATION.md`、`HISTORY.md` 的职责。
- [Remote MCP Spec](docs/specs/remote-mcp/SPEC.md)：Agent 工具、鉴权和内容操作边界。
- [Search Spec](docs/specs/search-relevance/SPEC.md) 与[实现记录](docs/specs/search-relevance/IMPLEMENTATION.md)：搜索模式、降级、可见性和覆盖范围。
- [统一搜索 HTTP 契约](docs/specs/search-relevance/contracts/unified-search.md)：公开搜索契约的请求、响应和状态语义。
- [Memo clipping Spec](docs/specs/memo-clipping/SPEC.md) 与[实现记录](docs/specs/memo-clipping/IMPLEMENTATION.md)：资料捕获、摘要、翻译、讨论和发布边界。
- [内容同步 HTTP 契约](docs/specs/style-playbook-integration/contracts/content-sync-status.md)：异步索引任务、进度、取消和终态。
- [Public PWA Spec](docs/specs/public-pwa/SPEC.md) 与[实现记录](docs/specs/public-pwa/IMPLEMENTATION.md)：canonical brand source、生成的安装资产、manifest 和缓存边界。
- [Style Playbook 集成](docs/specs/style-playbook-integration/SPEC.md)：公开 Playbook 快照、版本、同步和搜索边界。
- [架构决策](docs/adr/)：持久化技术决策和取舍。
- [运行手册](docs/runbooks/)：发布、部署、同步和恢复流程。
- [发布契约](.github/release-contract.json)：release identity、版本策略和产品产物边界。
- [质量门禁](.github/quality-gates.json)：必需检查、分支策略和门禁声明。

## 许可证

[MIT License](LICENSE)
