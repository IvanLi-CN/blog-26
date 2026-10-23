import { publicResourceFixture } from "./resource-fixture";
import type { PlaybookPublicCatalog, PlaybookSearchPayload } from "./types";

const project = {
  slug: "blog-26",
  name: "Ivan's Blog 2026",
  description:
    "一个由 Astro 公共站点、管理端 SPA 与 Bun 网关组成的自托管内容系统。公开内容使用本地 Markdown 快照生成，SQLite 负责应用数据与同步状态，发布流程把构建、内容版本和失败恢复放在同一条可追溯链路上。",
  source: "https://github.com/IvanLi-CN/blog-26",
  tags: ["Astro", "Bun", "Playwright", "SQLite", "本地内容源"],
  snapshot_exists: true,
  catalog_visibility: "public" as const,
  source_visibility: "public" as const,
  created_at: "2026-01-08T00:00:00Z",
  updated_at: "2026-10-13T00:00:00Z",
};

const topicRefs = [{ slug: project.slug, name: project.name }];

const topics = [
  {
    slug: "astro-site",
    token: "Astro 公共站点",
    description: "用静态优先的 Astro 页面承载公开阅读体验，把内容快照与渲染边界保持清楚。",
    categories: ["前端", "内容交付"],
    project_count: 1,
    related_projects: topicRefs,
    catalog_visibility: "public" as const,
  },
  {
    slug: "playwright-e2e",
    token: "Playwright E2E",
    description: "为公开页面、管理端和关键发布路径保留可重复的浏览器验收入口。",
    categories: ["测试", "质量门禁"],
    project_count: 1,
    related_projects: topicRefs,
    catalog_visibility: "public" as const,
  },
  {
    slug: "local-content-source",
    token: "本地内容源",
    description: "将内容文件、数据库和导出快照限定在本地边界内，减少运行时依赖和环境差异。",
    categories: ["内容", "运行时"],
    project_count: 1,
    related_projects: topicRefs,
    catalog_visibility: "public" as const,
  },
  {
    slug: "worktree-bootstrap",
    token: "Worktree bootstrap",
    description: "新 worktree 进入开发前自动准备环境、端口和本地数据，缩短从检出到可验证的距离。",
    categories: ["工程效率", "开发环境"],
    project_count: 1,
    related_projects: topicRefs,
    catalog_visibility: "public" as const,
  },
  {
    slug: "delivery",
    token: "可靠交付",
    description: "把固定输入、产物校验、发布指针和失败恢复视为同一项交付能力。",
    categories: ["Release", "可恢复性"],
    project_count: 1,
    related_projects: topicRefs,
    catalog_visibility: "public" as const,
  },
];

const projectSections = [
  {
    id: "purpose",
    title: "项目目的",
    markdown:
      "这不是一个只负责渲染文章的静态模板，而是一套把公开阅读、内容同步和后台操作放在同一个仓库里的小型产品。**Astro** 负责读者可访问的页面，`apps/admin` 提供管理端界面，`src/server` 提供网关和 API；三者共享类型、样式和本地数据契约。\n\n公开页面只消费已经准备好的内容快照。这样，文章、搜索索引和 Playbook 数据可以随同一次构建一起校验和发布，避免读者在同一页面中看到不同版本的内容。",
  },
  {
    id: "repository-map",
    title: "仓库边界",
    markdown:
      "仓库按运行边界组织，而不是按页面把逻辑散落到各处：\n\n- `site/`：Astro 公共站点与服务端渲染入口。\n- `apps/admin/`：Vite + React 管理端 SPA。\n- `src/components/`：跨站点复用的界面组件。\n- `src/lib/`：内容、Playbook、搜索与运行时契约。\n- `src/server/`：Bun 网关、API 和后台任务。\n- `tests/e2e/`：浏览器验收与 Web Demo 检查。\n\n页面代码不直接读取工作区文件。内容通过本地同步和公开快照进入读取边界，构建脚本再把确定的输入交给 Astro。",
  },
  {
    id: "runtime-and-delivery",
    title: "运行与交付",
    markdown:
      "开发环境由 Bun 统一驱动，`bun run dev` 同时启动 Astro、Admin 和 Gateway。应用数据写入 SQLite，Drizzle 负责 schema 与迁移；公开内容限定在 `CONTENT_SOURCES=local`，路径由 `LOCAL_CONTENT_BASE_PATH` 明确指定。\n\n交付流程先生成内容快照，再构建公共站点、管理端和 Playbook edition。GitHub Actions 中的 `ci.yml`、`e2e.yml`、`product-release.yml` 与内容更新工作流分别承担检查、浏览器验收、应用发布和内容发布。每次发布都保留来源提交、内容摘要和渲染器提交，失败时可以回到上一份已验证产物。",
  },
  {
    id: "architecture-notes",
    title: "架构取舍",
    markdown:
      "公共站点采用静态优先的 Astro 页面，减少读者请求对后台服务的依赖；需要交互的搜索、目录和管理功能再由 React islands 或独立 Admin SPA 承担。内容同步与页面构建之间使用明确的 JSON 契约，避免把数据库内部字段直接暴露给公开页面。\n\n本地 SQLite 适合这个项目的单节点运行模型：迁移可审计，开发和 Web Demo 都可以使用隔离的 `DB_PATH`，恢复时不需要依赖另一套远程内容服务。代价是多节点写入和高并发查询不属于当前边界，需要在规模变化前重新评估。",
  },
  {
    id: "workflow-and-quality-gates",
    title: "工作流与质量门禁",
    markdown:
      "提交前由 Lefthook 运行 Biome、提交信息检查和受影响的测试。合并后的 CI 会重新执行类型检查、单元测试、公共页面约束检查和 Playwright 路径。Web Demo 使用固定数据目录构建，不依赖开发者机器上的文章或数据库状态。\n\n关键门禁有三层：代码层检查格式与类型，数据层检查公开快照关系和摘要，浏览器层检查导航、响应式布局和可访问交互。任一层失败都不会替换现有的公开版本。",
  },
  {
    id: "reusable-decisions",
    title: "可复用决定",
    markdown:
      "**固定输入再构建**：构建过程不临时抓取远程内容，所有页面和搜索文档来自同一份已校验快照。\n\n**公开边界显式化**：公开目录只包含匿名访客能够访问的项目、主题、规则和资源，内部同步字段在导出前被过滤。\n\n**状态变更可回退**：发布指针只在完整产物校验通过后切换，失败继续提供上一版内容；回滚使用不可变版本目录，而不是覆盖原文件。",
  },
  {
    id: "risks-and-open-questions",
    title: "风险与后续问题",
    markdown:
      "当前最需要关注的是内容规模增长后的构建时间、SQLite 在多实例场景下的写入边界，以及公开快照与应用代码不同步时的兼容策略。它们都不是首个版本要提前抽象的理由，但应该由真实指标触发下一次设计。\n\n发布失败时，恢复链路依赖上一版公开产物仍然可读；因此清理旧版本前必须先确认至少保留一份可回退版本。管理端的高权限操作也继续沿用现有认证边界，不通过 Web Demo 绕过授权。",
  },
  {
    id: "evidence-index",
    title: "验证入口",
    markdown:
      "可以从这些入口复核项目边界：\n\n- `package.json`：脚本、运行依赖和开发依赖。\n- `astro.config.mjs`：公共站点的构建入口。\n- `src/lib/playbook/`：公开 Playbook 的 schema、bundle 和页面数据。\n- `scripts/build-web-demo.ts`：固定数据与 Web Demo 构建流程。\n- `tests/e2e/web-demo/`：官方路由的浏览器验收。\n\n本页是基于当前仓库事实整理的公开预览数据，技术栈中的长列表保留真实项目的数量级，并通过标签、分组和折叠保持可扫描。",
  },
];

const stack = {
  markers_present: [
    "bun_lock",
    "astro",
    "github_actions",
    "docker_compose",
    "package_json",
    "playwright",
    "sqlite",
    "drizzle",
  ],
  ci_workflows: [
    "ci.yml",
    "e2e.yml",
    "enable-recovery-auto-merge.yml",
    "manual-product-release.yml",
    "notify-release-failure.yml",
    "playbook-content-rollback.yml",
    "playbook-content-update.yml",
    "product-release.yml",
    "recover-published-release.yml",
    "recover-release-ledger.yml",
    "release-merge-followup.yml",
  ],
  runtime: { frontend: "Astro", admin: "Vite + React", gateway: "Bun", database: "SQLite" },
  language: ["TypeScript", "SQL", "Markdown"],
  deployment: {
    public_site: "static/server output",
    web_demo: "local artifact",
    content_source: "local filesystem",
  },
  package_json: {
    deps_prod: [
      "@astrojs/markdown-remark",
      "@astrojs/mdx",
      "@astrojs/node",
      "@codemirror/view",
      "drizzle-orm",
      "@modelcontextprotocol/sdk",
      "@playwright/test",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@trpc/client",
      "@trpc/server",
      "drizzle-orm",
      "gray-matter",
      "jsdom",
      "lucide-react",
      "minisearch",
      "openai",
      "react",
      "react-dom",
      "react-markdown",
      "zod",
    ],
    deps_dev: [
      "@astrojs/react",
      "@biomejs/biome",
      "@commitlint/cli",
      "@commitlint/config-conventional",
      "@happy-dom/global-registrator",
      "@playwright/test",
      "@storybook/react-vite",
      "@tailwindcss/vite",
      "@testing-library/react",
      "@types/bun",
      "@types/react",
      "@vitejs/plugin-react",
      "astro",
      "concurrently",
      "lefthook",
      "playwright",
      "storybook",
      "tailwindcss",
      "typescript",
      "vite",
    ],
  },
  configs_root: [
    "astro.config.mjs",
    "biome.jsonc",
    "bunfig.toml",
    "docker-compose.yml",
    "lefthook.yml",
    "package.json",
    "playwright.config.ts",
    "postcss.config.mjs",
    "tailwind.config.ts",
    "tsconfig.json",
  ],
  scripts: [
    "dev",
    "build",
    "check",
    "check:public-no-daisy",
    "test",
    "test:e2e",
    "test:e2e:web-demo",
    "test:storybook-boundary",
    "dev-data:generate",
    "dev-sync:trigger",
    "migrate",
    "seed",
    "public:export",
    "playbook:prepare",
    "generate:public-pwa",
    "generate:project-posters",
    "generate:project-social-previews",
    "backend:dist",
    "admin:build",
    "console:build",
    "search:index",
  ],
  testing: {
    unit: "Bun test",
    browser: "Playwright",
    component: "Storybook interactions",
    data: "public bundle contract checks",
  },
  quality: ["Biome", "Commitlint", "Lefthook", "TypeScript", "Playwright"],
};

const policy = {
  summary: {
    slug: "safe-release",
    name: "Safe Release",
    description:
      "发布前固定输入、校验公开产物和来源身份；失败时保留上一份已验证版本，并在恢复后整体切换。",
    primary_topic: "delivery",
    policy_dependencies: [],
  },
  frontmatter: {
    name: "Safe Release",
    description: "Deterministic release checks and recovery for public content artifacts.",
    visibility: "public",
  },
  instruction_markdown:
    "# 发布规则\n\n先校验固定输入、来源身份和公开文件摘要，再构建页面与搜索数据。只有完整产物通过检查后，才切换公开指针。\n\n如果构建或部署失败，继续提供最后一个已验证版本；恢复时重新核对来源，不直接覆盖旧目录。",
  resources: publicResourceFixture,
};

const topicDetails = topics.map((item) => ({
  item,
  doc_metadata: [
    { key: "验证状态", value: "基于当前仓库结构整理" },
    { key: "关联项目", value: project.name },
  ],
  preamble: "",
  sections: [
    {
      id: "context",
      title: "实践背景",
      markdown: `${item.description}\n\n这项实践在 **${project.name}** 中与公共站点、管理端和本地内容同步共同工作，页面构建使用同一份固定输入。`,
    },
    {
      id: "checks",
      title: "检查重点",
      markdown:
        "先确认输入和边界，再确认页面行为。对应的检查会落到代码检查、公开 bundle contract 和 Playwright Web Demo 路由，避免只凭单个开发环境的结果判断发布成功。",
    },
  ],
  policy_skills: item.slug === "delivery" ? [policy] : [],
}));

export const webDemoCatalog: PlaybookPublicCatalog = {
  snapshot: {
    index: { generated_at: "2026-10-13T00:00:00Z", project_count: 1, topic_count: topics.length },
    projects: [project],
    topics,
  },
  project_details: [
    {
      item: project,
      title: "Ivan's Blog 2026 实践快照",
      doc_metadata: [
        { key: "快照来源", value: "当前工作区 Web Demo" },
        { key: "内容边界", value: "本地 Markdown + SQLite" },
        { key: "构建方式", value: "Bun + Astro + Vite" },
      ],
      stack,
      preamble: "",
      sections: projectSections,
    },
  ],
  topic_details: topicDetails,
};

export const webDemoSearch: PlaybookSearchPayload = {
  generated_at: "2026-10-13T00:00:00Z",
  documents: [
    {
      id: "project:blog-26",
      kind: "page",
      title: project.name,
      subtitle: "项目实践",
      body: `${project.description} ${projectSections.map((section) => section.markdown).join(" ")}`,
      route: "/projects/blog-26",
      section_id: null,
      keywords: project.tags,
      command_id: null,
    },
    ...topicDetails.flatMap((detail) => [
      {
        id: `topic:${detail.item.slug}`,
        kind: "page" as const,
        title: detail.item.token,
        subtitle: "实践主题",
        body: `${detail.item.description} ${detail.sections.map((section) => section.markdown).join(" ")}`,
        route: `/topics/${detail.item.slug}`,
        section_id: null,
        keywords: detail.item.categories,
        command_id: null,
      },
      ...detail.sections.map((section) => ({
        id: `section:${detail.item.slug}:${section.id}`,
        kind: "section" as const,
        title: section.title,
        subtitle: detail.item.token,
        body: section.markdown,
        route: `/topics/${detail.item.slug}`,
        section_id: section.id,
        keywords: detail.item.categories,
        command_id: null,
      })),
    ]),
    ...projectSections.map((section) => ({
      id: `section:blog-26:${section.id}`,
      kind: "section" as const,
      title: section.title,
      subtitle: project.name,
      body: section.markdown,
      route: "/projects/blog-26",
      section_id: section.id,
      keywords: project.tags,
      command_id: null,
    })),
  ],
};
