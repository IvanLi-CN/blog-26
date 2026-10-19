# Ivan's Blog

Ivan's Blog 是一个由个人掌握、供人类与获授权 AI Agent 共同使用的个人知识库。它保存记录、资料、项目经验和可复用规则，让知识可以被找到、理解、引用、维护，并在需要时选择性公开。博客是它的一个发布入口，不是产品的全部。

公开站点：[ivanli.cc](https://ivanli.cc)

## 产品能力

| 能力 | 当前入口 | 作用 |
| --- | --- | --- |
| 记录与整理 | Posts、Memos、Projects、Tags | 保存文章、短记录、资料剪藏、项目实践和组织标签。 |
| 知识检索 | `/search`、后台搜索、MCP tools | 使用关键词、全文和可用的 AI 检索查找内容，并保留可见性边界。 |
| 资料加工 | Memo clipping | 保存外部资料，生成摘要和译文，并保留原文与私有讨论边界。 |
| 阅读与发布 | public site、RSS、Playbook | 阅读公开内容，把选定的文章、Memo、项目和 Playbook 内容发布给访客。 |
| Agent 接入 | authenticated remote MCP `/mcp` | 让 Agent 在授权范围内读取、搜索、创建和更新内容。 |
| 管理与维护 | React admin console | 编辑、预览、评论审核、计划任务、访问令牌、AI 配置和内容同步。 |

共享不等于公开。内容源、读取、写入和发布分别受权限控制；接入 MCP 或 Agent 不会自动开放私有内容，也不会自动发布贡献。

## 产品方向

产品愿景和边界以 [PRODUCT.md](PRODUCT.md) 为准：让人的长期积累成为 Agent 的工作依据，也让工作中形成的新认识回到同一知识库。当前仓库已经提供本地 Markdown 内容、公开阅读、管理控制台、搜索、Memo 剪藏、项目目录、Playbook 阅读和远程 MCP 基础；跨内容类型的一致知识身份、完整引用语义和可审阅的 Agent 贡献流程仍按专题逐步建设。

当前产品边界：

- 这是个人知识系统，不是默认的多租户 SaaS、企业知识治理或通用聊天产品。
- Agent 能力以知识检索、引用和授权贡献为中心，不以任意任务执行或全自动接管为前提。
- 保存内容、接受 Agent 贡献和公开发布是三个独立决定。
- 当前实现状态为 active / partial；完整平台验证和真实 alpha 验收仍需单独完成。

## Style Playbook Topics

这些是当前仓库可以由代码、配置或文档直接核对的工程 Topic；它们描述实现边界，不是营销标签。

- `Astro site`：`site/` 和 `astro.config.mjs` 负责 public static site。
- `React app`、`TypeScript web`：`apps/admin/` 负责管理控制台，公共页面复用共享 React renderer。
- `MCP server`：`src/server/mcp-http.ts` 和 [Remote MCP Spec](docs/specs/remote-mcp/SPEC.md) 定义 `/mcp` transport、鉴权和工具契约。
- `SQLite`：`drizzle/`、`drizzle.config.ts` 和内容同步服务提供索引与持久化基础。
- `Progressive web app`：`public/site.webmanifest`、Share Target 和 Console 安装入口定义 PWA 边界。
- `Web demo`：`web-demo:build` 生成复用正式路由的 mock-only、build-time Demo，不连接真实 API 或模型。
- `Playwright e2e`：`playwright.config.ts`、`tests/e2e/` 和 E2E workflows 承担浏览器验收。
- `Storybook component QA`：`.storybook/` 与 `tests/storybook/` 承担可复用组件状态和交互验证。
- `Dockerized dev`：`Dockerfile`、`docker-compose.yml` 和 gateway/build scripts 定义容器运行边界。
- `Worktree bootstrap`：`scripts/setup.sh`、`scripts/worktree-bootstrap.sh` 和 `bun run worktree:bootstrap` 恢复依赖、环境、端口和开发数据。
- `Manual version release delivery`、`Release failure notification`：`.github/release-contract.json` 与对应 workflows 定义发布身份、双产品产物和失败通知边界。

## 文档地图

- [Product vision and goals](PRODUCT.md)：产品定位、用户、目标、边界、能力基础和成功标准。
- [Context](CONTEXT.md) 与 [Glossary](GLOSSARY.md)：领域语言、内容身份、搜索和公开运行面的稳定术语。
- [Specs index](docs/specs/README.md)：专题 `SPEC.md`、实现状态和生命周期的目录。
- [Remote MCP Spec](docs/specs/remote-mcp/SPEC.md)：Agent 工具、鉴权和内容操作边界。
- [Search Spec](docs/specs/search-relevance/SPEC.md)：AI 搜索模式、关键词保全、降级和覆盖范围。
- [Memo clipping Spec](docs/specs/memo-clipping/SPEC.md)：资料剪藏、摘要、译文、讨论和公开性边界。
- [Style Playbook integration](docs/specs/style-playbook-integration/SPEC.md)：Playbook 公开快照、版本、同步和搜索边界。
- [Architecture decisions](docs/adr/)：不可逆技术决策和取舍。
- [Runbooks](docs/runbooks/)：发布、部署、同步和恢复操作。
- [Quality gates](.github/quality-gates.json)：required checks、分支策略和门禁声明。
- [MIT License](LICENSE)：项目许可证。

## 技术结构

- `site/`：Astro public site，输出静态访客页面。
- `apps/admin/`：Vite/React admin SPA，提供内容和运行管理。
- `src/server/`：Bun gateway、HTTP API、tRPC、MCP 和内容服务。
- `src/lib/`：共享模型、搜索、Playbook、版本和运行时库。
- `drizzle/`：SQLite migrations 和数据库配置。
- `tests/e2e/`、`tests/storybook/`：浏览器流程和组件交互验证。
- `docs/`：专题规格、ADR、实现证据和运维手册。

## 本地开发

仓库使用 Bun `^1.0.0`。Web Demo 的 Astro CLI 需要 Node.js 22.12 或更新版本。首次 checkout 或新 worktree 先运行：

```bash
bun run setup
```

`setup` 安装依赖和 hooks，创建 `.env.local`，租用 worktree-local ports，并准备开发数据。启动完整开发栈：

```bash
bun run dev-sync:trigger
bun run dev
```

`dev` 同时启动 Astro、admin SPA 和 Bun gateway。应用只读取配置的本地内容根目录；当前运行时不启动远程内容源服务。

常用本地环境：

```bash
DB_PATH=./dev-data/sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/local
CONTENT_SOURCES=local
PORT=<leased gateway port>
SITE_PORT=<leased site port>
ADMIN_PORT=<leased admin port>
```

`.env.local` 是推荐入口，`bun run setup` 会在缺失时创建。不要直接抢用其他 worktree 的端口；需要手动恢复时运行：

```bash
bun run worktree:bootstrap -- --force
```

## Web Demo

Web Demo 是正式 Web 应用的 build-time 运行产物，复用正式页面和路由，并用确定性 fixture、mock API 和内存状态演示产品行为。它不需要登录、模型调用或 live gateway；Demo 写入只更新内存中的 mock model，不能写入真实服务。

构建并预览：

```bash
bun run web-demo:build
bun run web-demo:preview
```

该命令生成 public、console 和 admin Demo artifacts，不替换 `site-dist/` 或 `admin-dist/`。公共 Demo 的官方入口是 `/memos/`；admin Demo 的入口是 `/admin/dashboard`。共享 Inspector 提供 scene、persona、network、data、simulated actions、share state 和 reset 控制。Demo 行为不能通过 query string 或 browser storage 注入 live artifact。

需要交互开发时使用 `bun run web-demo:site`；构建后的 public SSR artifact 使用 `bun run web-demo:start`。Demo 预览必须使用独立的 `WEB_DEMO_PORT`、`SITE_PORT` 或 `ADMIN_PORT`。

## 搜索与资料剪藏

公开搜索支持 `keyword`、`rewrite` 和 `rag` 三种模式。关键词命中会被保全；AI 模式不可用时直接回退到关键词搜索。SQLite FTS5 和嵌入式 Tantivy 是可维护的索引投影，索引不替代本地 Markdown 权威内容。搜索的完整边界、可见性和修复命令见 [Search implementation](docs/specs/search-relevance/IMPLEMENTATION.md)。

Memo 使用 `#剪藏` 和一个 HTTP(S) 目标链接触发资料剪藏。系统保存作者内容，异步生成摘要和简体中文译文，并把原文、译文和私有讨论保持在 Memo 的权限边界内。剪藏不自动发布，也不递归抓取链接。运维路径见 [Memo clipping implementation](docs/specs/memo-clipping/IMPLEMENTATION.md)。

## 常用命令

```bash
bun run build
bun run start

bun run check
bun run fix
bun run test
bun run test:e2e
bun run test:storybook-boundary

bun run migrate
bun run seed
bun run dev-db:reset
bun run test-env:reset
bun run test:worktree-bootstrap
```

完整 Playwright 套件是 `bun run test:e2e`；它覆盖 guest、admin、user 和 mcp projects。页面级 Demo 证据使用正式 Web Demo route，Storybook 只承担可复用组件的状态和交互覆盖。

## 数据与发布

开发数据库位于 `./dev-data/sqlite.db`，测试数据库位于 `./test-data/sqlite.db`，开发和测试内容根分别为 `./dev-data/local` 与 `./test-data/local`。Docker 默认使用 `/app/data/sqlite.db`；数据库、索引和缓存都是从本地内容源派生的运行数据。

产品发布使用 Manual Product Release：它为 static frontend 和 full-feature Docker image 分配同一个 release identity，冻结输入并在受保护的 `VERSION`-only PR 后发布。稳定版和预发布版的差异、恢复步骤及失败通知见 [manual version release runbook](docs/runbooks/manual-version-release.md)。完整平台验证和真实 alpha 验收仍不能从单个绿色 workflow 推断完成。

## 验证原则

公共站、admin、gateway、MCP 和 release 不是一个单独 build 可以代表的交付面。修改跨越这些边界时，至少运行与变更相关的 `bun run check`、单元测试、对应 Playwright project、Web Demo 或 Storybook 验证，并检查 [quality gates](.github/quality-gates.json) 和受影响的专题 Spec。
