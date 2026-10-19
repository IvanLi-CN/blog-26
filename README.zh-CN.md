<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/IvanLi-CN/blog-26/releases"><img src="https://img.shields.io/github/v/release/IvanLi-CN/blog-26?display_name=tag&label=%E5%8F%91%E5%B8%83&style=flat-square" alt="最新发布" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/ci.yml?branch=main&label=CI&style=flat-square" alt="main 分支 CI 状态" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/actions/workflows/e2e.yml"><img src="https://img.shields.io/github/actions/workflow/status/IvanLi-CN/blog-26/e2e.yml?branch=main&label=E2E&style=flat-square" alt="main 分支 E2E 状态" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/package.json"><img src="https://img.shields.io/badge/Bun-%5E1.0.0-f9f1e1?logo=bun&logoColor=000000&style=flat-square" alt="Bun 运行时要求" /></a>
  <a href="https://github.com/IvanLi-CN/blog-26/blob/main/Dockerfile"><img src="https://img.shields.io/badge/Docker-image-2496ED?logo=docker&logoColor=white&style=flat-square" alt="Docker 镜像构建" /></a>
</p>

# Ivan's Blog

Ivan's Blog 是一个供人类与获授权 AI Agent 共同使用的个人知识库。它让记录、资料、项目经验和可复用规则能够跨越阅读、写作与实际工作持续使用；博客只是其中一个选择性发布入口，不是产品的全部。

知识所有者决定保存什么、谁可以访问，以及哪些内容可以公开。面向人的界面与面向 Agent 的工具使用同一批知识，但交互方式和权限可以不同。当前实现状态为 `active / partial`。

<table align="center" border="0" cellpadding="16" cellspacing="0">
  <tr>
    <td align="center" bgcolor="#f3f0e8">
      <a href="./site/assets/brand/source/ivan-blog-mark.svg"><img src="./site/assets/brand/source/ivan-blog-mark.svg" width="96" alt="Ivan's Blog 产品主标记" /></a>
    </td>
  </tr>
</table>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./site/assets/projects/social-source/blog-26-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="./site/assets/projects/social-source/blog-26-light.png" />
    <img src="./site/assets/projects/social-source/blog-26-light.png" width="100%" alt="供人类与 AI Agent 共同使用的 Ivan's Blog 个人知识库" />
  </picture>
</p>

## 产品做什么

- **记录与整理：** 在本地 Markdown 内容根目录中维护 Posts、Memos、Projects、Tags、资料和可复用的 Playbook 规则。
- **检索与引用：** 结合关键词、全文和可用的 AI 检索，同时保留可见性、来源和降级边界。
- **选择性发布：** 公开选定的文章、Memo、项目、Playbook 条目和 RSS 内容；未公开的记录保持私有。
- **接入获授权的 Agent：** 通过远程 MCP 让获授权的 Agent 在权限范围内读取、检索、创建和更新内容。
- **处理外部资料：** 先保存 Memo 作者输入，再异步生成摘要和译文，同时保留原始来源与上一份成功版本。
- **管理系统：** 通过管理控制台完成编辑、预览、评论、计划任务、访问令牌、AI 配置和内容同步。

## 知识库如何工作

1. 人把记录、资料、项目决定或可复用规则保存下来。
2. 获授权的 Agent 检索相关记录，引用依据，并在任务中使用它。
3. 新的认识或修正可以作为可辨认的 Agent 贡献返回，由所有者审阅和维护。
4. 所有者决定维护后的记录继续私有，还是作为文章、Memo、项目或 Playbook 条目公开。

共享知识不等于自动公开。读取、写入、Agent 接入和公开发布是彼此独立的决定。

## Quick Start

运行要求：Bun `^1.0.0`，以及 Astro CLI 所需的 Node.js 22.12 或更新版本。

### 确定性的 Web Demo

Web Demo 使用已交付的应用路由、fixture、mock API 和内存状态构建。不需要登录、模型调用、live gateway 或外部内容源，交互产生的修改也不会写入真实服务。

```bash
bun run setup
bun run web-demo:build
bun run web-demo:preview
```

公开 Demo 从 `/memos/` 开始，管理 Demo 从 `/admin/dashboard` 开始。共享 Inspector 提供场景、身份、网络、数据、模拟操作、分享状态和最近的内存变更。

### 本地开发

```bash
bun run setup
bun run dev-sync:trigger
bun run dev
```

`bun run setup` 会安装 checkout hooks，在缺失时创建本地环境入口，分配 worktree 本地端口并准备开发数据。应用只读取配置的本地文件系统内容根目录，不需要也不会启动远程内容源服务。

## 部署

仓库提供独立的公开站点、管理 SPA、Bun 网关和完整 Docker 产品面。本地 Markdown 是权威内容来源；SQLite 和生成的搜索索引都是派生投影。

Memo 剪藏会先保存作者内容，再异步生成摘要和译文。管理端的搜索 repair 和 rebuild 请求在异步任务持久记录后返回 `202 Accepted`；任务和状态接口提供进度、取消和失败详情，重试不会自动公开 Memo。

产品发布使用[手动产品发版](./docs/runbooks/manual-version-release.md)。一个 release identity 同时覆盖静态前台和完整功能 Docker 镜像，通过受保护的只修改 `VERSION` 的 PR 准备，然后发布为 GitHub Release 和 GHCR 镜像。

## 仓库结构

- `site/`：Astro 公开站点和公开安装面。
- `apps/admin/`：Vite/React 管理 SPA。
- `src/server/`：Bun 网关、HTTP API、tRPC、MCP 和内容服务。
- `src/lib/`：共享模型、搜索、Playbook、版本和运行时库。
- `drizzle/`：SQLite migrations 和数据库配置。
- `site/assets/brand/source/ivan-blog-mark.svg`：README 和公开品牌使用的 canonical mark；PWA 安装专用变体单独派生。
- `tests/`：单元、集成、E2E 和可复用组件交互覆盖。
- `docs/`：产品规格、实现记录、ADR、契约和运行手册。

## 本地验证

```bash
bun run check
bun run test
bun run test:e2e
bun run test:storybook-boundary
```

页面级证据使用官方 Web Demo 路由。Storybook 只覆盖可复用组件和聚焦的交互状态；[质量门禁](./.github/quality-gates.json)定义必需的 CI 与发布检查。

## 更多文档

- [产品愿景与目标](./PRODUCT.md)：产品目的、用户、目标、共享知识约束和非目标。
- [Context](./CONTEXT.md) 与 [Glossary](./GLOSSARY.md)：稳定的领域语言和公开运行面术语。
- [规格索引](./docs/specs/README.md)：Spec 层级，以及 `SPEC.md`、`IMPLEMENTATION.md`、`HISTORY.md` 的职责。
- [Remote MCP Spec](./docs/specs/remote-mcp/SPEC.md)：Agent 工具、鉴权和内容操作边界。
- [Search Spec](./docs/specs/search-relevance/SPEC.md) 与[实现记录](./docs/specs/search-relevance/IMPLEMENTATION.md)：搜索模式、降级、可见性和覆盖范围。
- [Memo clipping Spec](./docs/specs/memo-clipping/SPEC.md) 与[实现记录](./docs/specs/memo-clipping/IMPLEMENTATION.md)：资料捕获、摘要、翻译、讨论和发布边界。
- [内容同步 HTTP 契约](./docs/specs/style-playbook-integration/contracts/content-sync-status.md)：异步索引任务、进度、取消和终态。
- [Style Playbook 集成](./docs/specs/style-playbook-integration/SPEC.md)：公开 Playbook 快照、版本、同步和搜索边界。
- [架构决策](./docs/adr/)：持久化技术决策和取舍。
- [运行手册](./docs/runbooks/)：发布、部署、同步和恢复流程。
- [发布契约](./.github/release-contract.json)与[质量门禁](./.github/quality-gates.json)：发布身份、必需检查和分支策略。

## 许可证

[MIT License](./LICENSE)
