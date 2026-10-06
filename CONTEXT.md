# Public Project Showcase

This context covers the public reading and project-presentation concepts that help readers move from chronological discovery into focused content and project cases.

## Language

**项目展墙**:
A public overview surface where readers scan several projects and choose one to explore.
_Avoid_: 项目橱窗

**项目详情**:
A focused public view for one project that brings together its identity, context, visual material, and entry points.
_Avoid_: 详情页

**项目分类标签**:
An English classification term attached to a curated project, identifying its technology stack, key engineering approach, or a relevant discovery subject such as AI, Agent, or Harness.
_Avoid_: 功能清单, 描述性徽章

**原生标签**:
A classification identity shared by the blog's article, Memo, and curated-project discovery surfaces.
_Avoid_: 独立项目标签体系, Style Playbook Topic

**标签详情**:
The focused discovery surface for one 原生标签, bringing together the associated public articles, Memos, and curated projects.
_Avoid_: 项目专用标签页

**标签分组**:
A browsing category that organizes several 原生标签. It is distinct from the identity of an individual tag and from a project's product domain.
_Avoid_: 项目领域, 标签本体

**项目索引卡**:
A compact project record on the 项目展墙. It contains a poster, title, one-line summary, and only the quick entries the project actually provides.
_Avoid_: 列表卡片

**快捷入口**:
An icon-only external link placed beside a 项目索引卡 title. It represents an online project, documentation, or source repository, and remains absent when that destination does not exist.
_Avoid_: 外链按钮

**在线入口**:
The one public-use destination selected for a 项目索引卡. A formal project site takes precedence; a demo is used only when no formal site exists.
_Avoid_: Site / Demo 并列入口

**文档入口**:
The documentation quick entry on a 项目索引卡, shown with a document icon and linked to the project's official documentation when available.
_Avoid_: 文档站按钮

**公开入口优先级**:
The semantic order applied to project destinations. 项目索引卡 selects formal site before demo, and official documentation before a documentation site. 项目资料侧栏 shows every available destination in this order: formal site, demo, official documentation, documentation site, source repository.
_Avoid_: 链接数组顺序

**索引卡快捷入口状态**:
The visibility treatment for 快捷入口 on a 项目索引卡. It is subdued at rest and reaches normal contrast while the card is hovered or contains keyboard focus; touch devices retain a recognizable, operable state without hover.
_Avoid_: 悬浮后才出现

**项目索引摘要**:
A concise, project-specific statement of purpose used only on a 项目索引卡. It has a one-line visual budget, while its complete text remains available through hover and keyboard focus.
_Avoid_: 项目简介

**项目正文**:
The project-specific content of 项目详情. Its composition follows the available engineering material and is not constrained to a fixed set or order of cards.
_Avoid_: 详情正文卡片模板

**项目 MDX 正文**:
An MDX-authored 项目正文 that combines project-specific narrative with the presentation blocks appropriate to that project.
_Avoid_: 固定正文模板

**项目正文源文件**:
A repository-owned MDX file at `site/content/projects/<slug>.mdx`. It is published with the static site and remains outside the local notes source and admin content synchronization.
_Avoid_: 博客文章

**项目正文素材**:
Project-specific screenshots, diagrams, and photographs kept beside their 项目 MDX 正文 at `site/content/projects/<slug>/assets/`. Astro processes them during the site build; they do not replace 项目海报 or 社交预览图.
_Avoid_: 海报素材

**项目内容组件**:
A reviewed, site-owned set of MDX blocks for project-specific presentation. Project MDX may use these blocks and standard Markdown, but does not directly import arbitrary site components.
_Avoid_: 任意组件导入

**连续项目正文**:
The default reading presentation for 项目 MDX 正文. Headings and paragraphs flow as one document; an inset or panel appears only when an author intentionally groups information.
_Avoid_: 每章一张卡

**项目内容块**:
A semantic element available to 项目 MDX 正文: `ProjectFigure`, `ProjectCallout`, `ProjectFacts`, or `ProjectComparison`. New blocks are introduced only after at least two projects share the same presentational need.
_Avoid_: 通用装饰卡片

**项目资料侧栏**:
The supporting column of 项目详情. It always presents 公开入口 and adds in-page navigation when the 项目 MDX 正文 has at least three total H2/H3 headings. It remains visible beside the body on desktop and is placed after the Hero before the body on narrow screens.
_Avoid_: 重复 Hero 入口

**本页内容导航**:
The in-page navigation in 项目资料侧栏. It lists H2 MDX headings and nests their H3 headings; deeper headings stay within the document only.
_Avoid_: 完整标题树

**延伸阅读**:
An optional, end-of-document collection of project-related public posts and memos. It appears only when relevant entries exist and does not occupy 项目资料侧栏.
_Avoid_: 固定相关实践卡

**项目海报**:
A vertical project identity visual used to make a project recognizable during discovery and at the start of its focused view.
_Avoid_: 项目封面

**项目视觉槽位**:
The fixed 4:5 visual region of a 项目索引卡 occupied by either its 项目海报 or its 项目运行数据面板. The title, summary, and shortcuts belong to the card outside this region.
_Avoid_: 卡片总高度, 聚合指标卡片整体

**项目运行数据面板**:
A public aggregate-data surface occupying the 项目视觉槽位 of a selected 项目索引卡 in place of its 项目海报. Its approved content consists of project metrics and activity graphics, separate from operational status or diagnostic details.
_Avoid_: 海报数据浮层, 运行状态卡

**运行数据 Mock**:
A development-only static dataset extracted from actual aggregate runtime values and sanitized before it is used to validate the 项目运行数据面板. It represents the normal loaded state, preserves the approved metric relationships, and is not connected to live project instances; it is not a product-facing concept.
_Avoid_: 模拟前景层, 假实时数据

**脱敏运行数据样本**:
A 运行数据 Mock source containing only the approved aggregate metrics. It excludes raw requests, prompts, search content, repository names, account or user identifiers, API keys, IP addresses, URLs, error details, and other identifying records.
_Avoid_: 生产数据副本, 原始运行日志

**仓库刷新新鲜度活动图**:
The OctoRill activity graphic with one ordered status cell per deduplicated repository. Each cell belongs to one of five refresh-age categories: within 4 hours, 4-12 hours, 12-24 hours, over 24 hours, or no successful record.
_Avoid_: 五段活动分桶图

**积分总量**:
The aggregate quota limit currently available from the eligible Tavily Hikari key pool. It is displayed separately from today's and this month's consumed credits and does not mean historical cumulative consumption.
_Avoid_: 累计消耗积分, 剩余积分

**社交预览图**:
A horizontal project visual that gives readers a quick view of the project's interface and capabilities.
_Avoid_: 社交图

**主题素材对**:
A light and dark version of the same project visual, kept as a matched pair so the visual remains appropriate across reader themes.
_Avoid_: 两套图片

**内容时间线**:
A public chronological overview that combines article and Memo events into one reading path.
_Avoid_: 文章列表

**实时 Memo**:
The author's current saved Memo, including public and private entries, available for management before the next public-site publication.
_Avoid_: 已发布 Memo, 公开时间线

**公开 Memo 时间线**:
The reader-facing sequence of Memo snapshots in the published public site. It may lag behind 实时 Memo until the next publication.
_Avoid_: 实时 Memo 列表, 管理列表

**控制台公开 Memo 列表**:
The public-only Memo sequence rendered by `console.ivanli.cc` from the live database. It is an operational view and may be newer than the published 公开 Memo 时间线 on `ivanli.cc`.
_Avoid_: 公开 Memo 时间线, 静态快照列表

**公开静态站点**:
The visitor-facing `ivanli.cc` deployment. It serves a build-time public snapshot from EdgeOne Makers and never exposes administrator-only controls or unpublished Memos.
_Avoid_: 公开服务端页面, 管理前台

**管理控制台**:
The `console.ivanli.cc` deployment as one self-contained application containing the visitor frontend, administrator frontend, and server runtime. Its first document request is server-rendered with the current authorization and content; later same-origin navigation may use the client navigation layer. Visitors without administrator privileges receive the public view, while administrators receive the management view. The same application owns its page, authentication, content operation, and persistence boundaries.
_Avoid_: 静态管理页, 管理员列表页

**客户端页面交换**:
The management console's post-entry navigation model: the browser keeps the shared shell and uses the client navigation layer to request and swap the next server-rendered page, while each response still applies the current authorization boundary.
_Avoid_: 完整 SPA, 客户端拼装页面

**管理 Memo 列表**:
The single Memo reading surface shown to an administrator. It uses the public Memo card presentation, adds preview and edit actions, and includes current unpublished Memos without rendering a second public timeline beside it.
_Avoid_: 实时 Memo 列表 + 公开时间线, 管理卡片列表

**Memo 创作区**:
The administrator-only authoring surface on the console Memos page. It remains separate from the 管理 Memo 列表 and does not count as another list.
_Avoid_: 编辑器列表, 管理列表

**移动内容流**:
The narrow-screen presentation of 内容时间线. It keeps chronological order and item metadata while removing the decorative rail, nodes, and connectors so each event reads like a compact content entry.
_Avoid_: 移动时间轴

**时间线节点**:
A desktop-only decorative structural marker for one 内容时间线 event. It gives every event the same chronological position and does not encode content priority or an interaction level.
_Avoid_: 类型图标, 操作入口

**内容类型标识**:
The restrained icon and tint that distinguish an article from a Memo. In a 移动内容流, the icon sits immediately before the date and carries the compact type cue; desktop mixed-content surfaces may retain a text label when extra clarification helps.
_Avoid_: 节点样式

**主要行动**:
The single reader-facing action that advances the primary path on a public surface, such as entering articles from the homepage.
_Avoid_: 强调色按钮

**环境背景层**:
A full-viewport visual layer that gives the public shell its quiet wind-and-leaf atmosphere while remaining separate from page content.
_Avoid_: 背景动画, 装饰层

**阅读承载层**:
A theme-aware surface beneath the public site's primary reading content. It separates text from the 环境背景层 while allowing a continuous content stream to read as one unit.
_Avoid_: 页面背景, 单条卡片

**模拟前景层**:
A deterministic benchmark surface that approximates the visible project-wall content placed above the 环境背景层 so renderer cost can be compared with realistic page density.
_Avoid_: Mock 内容, 测试卡片

**渲染器基准用例**:
One measured combination of a background renderer and the 模拟前景层 visibility state.
_Avoid_: 单次测试, 性能截图

**浏览器 GPU 代理指标**:
Trace, compositor, raster, frame-interval, and backing-buffer observations used to compare browser rendering behavior; they are not system GPU utilization, power, or battery measurements.
_Avoid_: GPU 占用率, 功耗指标

## Style Playbook

**Style Playbook**:
The blog-native reading collection of published Style Playbook knowledge, with shared blog navigation and search.
_Avoid_: 上游管理站, 技能仓库镜像

**Topic**:
A reusable engineering topic that gathers guidance, trade-offs, and evidence from project experience. It can relate to several 项目实践快照 and Policy Skills.
_Avoid_: 博客标签, 博客文章, 单项目说明

**项目实践快照**:
A Style Playbook account of a project's engineering choices and evidence. It is distinct from the blog's curated 项目详情 and may describe projects absent from the 项目展墙.
_Avoid_: 项目详情, 项目正文, 实时仓库状态

**Policy Skill**:
A reusable, installable project policy associated with a Topic. Reading its published instructions does not apply the policy to a reader's project.
_Avoid_: Topic Skill, 已安装策略

**已发布Playbook快照**:
A public edition of the Style Playbook that has successfully reached the blog's readers. Its version identifies the Topic, 项目实践快照, and Policy Skill content that belong together; console follows this edition and may temporarily retain the previous successful edition.
_Avoid_: 上游最新内容, 未发布目录, 实时仓库状态

## CI 与发布

**依赖新鲜度漂移**:
Registry exposes a newer package version than the version currently declared or resolved by the repository; it does not mean the dependency installation is unreproducible.
_Avoid_: 锁文件漂移, 安全漏洞

**锁文件漂移**:
The package manifest and `bun.lock` no longer satisfy the repository's reproducible-installation contract; in CI this is represented by `bun install --frozen-lockfile` failing.
_Avoid_: 依赖版本过期

**安全漏洞门禁**:
A quality gate based on known vulnerability findings. It is a separate concern from dependency freshness and lockfile consistency.
_Avoid_: 过期依赖检查

**发布意图**:
The validated combination of PR `type:*`, `channel:*`, and `release:*` labels that selects whether and what the release workflow may publish.
_Avoid_: CI 通过, 发布成功

**清退（依赖新鲜度检查）**:
Removing the `bun outdated` freshness check from CI entirely. It does not delete dependency declarations, lockfiles, versions, tags, releases, or deployments.
_Avoid_: 撤回版本, 删除 release

**稳定前端补发**:
Publishing a stable frontend release from the current `main` head after the release path was previously skipped, including the unified image and stable frontend deployment effects defined by the release workflow.
_Avoid_: 回滚, 重建已发布版本

## Local Development Workspaces

**主工作区**:
The canonical Git worktree that anchors local environment inheritance for the repository. It is identified by Git worktree topology rather than by the name of its checked-out branch.
_Avoid_: main 分支工作区

**目标 linked worktree**:
A non-primary Git worktree being prepared for local development. It owns its local environment after that environment exists.
_Avoid_: 临时分支目录

**worktree-local 覆盖**:
A target worktree's deliberate local environment choice that bootstrap preserves once the target environment exists.
_Avoid_: 主工作区同步值

**本地环境继承**:
The one-time filling of a missing target environment from the primary worktree, rather than ongoing synchronization or merging.
_Avoid_: 配置中心同步

**端口隔离**:
The rule that each worktree receives its own local service port block so independent worktrees do not reuse one another's listeners.
_Avoid_: 端口共享
