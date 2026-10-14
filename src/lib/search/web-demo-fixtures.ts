/** Fixed, authored documents shared by the separate Web Demo build and its search mock. */
export const SEARCH_DEMO_DOCUMENTS = [
  {
    slug: "search-sqlite3-handbook",
    title: "SQLite3：嵌入式数据库实践",
    excerpt: "事务、SQL 查询和数据库持久化的完整示例。",
    body: "SQLite3 is an embedded SQL database. This handbook covers transactions, SQL queries, and persistence.",
    type: "post" as const,
  },
  {
    slug: "search-reading-list",
    title: "开发工具阅读清单",
    excerpt: "记录 SQLite、Git 与编辑器的学习资料。",
    body: "A reading list mentioning SQLite, Git, and editors.",
    type: "post" as const,
  },
  {
    slug: "search-node-runtime",
    title: "Node 运行时与 npm",
    excerpt: "JavaScript 服务端程序的开发记录。",
    body: "Use the Node JavaScript runtime for server applications and npm packages.",
    type: "post" as const,
  },
  {
    slug: "search-graph-node",
    title: "图中的 node 与边",
    excerpt: "图论中的顶点、边和连通性。",
    body: "A graph node is a vertex in a mathematical network. It does not discuss JavaScript runtimes.",
    type: "post" as const,
  },
  {
    slug: "search-writing",
    title: "文章的组织与写作",
    excerpt: "这篇文章介绍如何整理段落与论点。",
    body: "这篇文章介绍写作与段落组织。",
    type: "post" as const,
  },
];

/** Larger authored set for inspecting ranking, provenance, and progressive loading. */
export const SEARCH_DEMO_DENSE_DOCUMENTS = [
  {
    slug: "search-sqlite-migrations",
    title: "SQLite 迁移与版本管理",
    excerpt: "用小步迁移保持本地数据库结构可回滚、可追踪。",
    body: "SQLite schema migrations should be small, reversible, and recorded with an explicit version.",
    type: "post" as const,
  },
  {
    slug: "search-sqlite-performance",
    title: "SQLite 性能调优清单",
    excerpt: "从查询计划、索引覆盖到批量写入的实践记录。",
    body: "SQLite performance work starts with query plans, covering indexes, and bounded batch writes.",
    type: "post" as const,
  },
  {
    slug: "search-transaction-patterns",
    title: "事务边界与持久化实践",
    excerpt: "整理事务边界、重试策略和崩溃恢复之间的关系。",
    body: "Notes on transaction boundaries, retry policy, and crash recovery for embedded storage.",
    type: "post" as const,
  },
  {
    slug: "search-embedded-storage",
    title: "嵌入式存储选型笔记",
    excerpt: "比较嵌入式数据库在单机应用中的部署和维护成本。",
    body: "A comparison of embedded database deployment, maintenance cost, and operational trade-offs.",
    type: "post" as const,
  },
  {
    slug: "search-query-indexing",
    title: "查询索引与全文检索",
    excerpt: "记录查询规划、全文索引和结果排序的设计取舍。",
    body: "Query planning, full-text indexing, and ranking strategies for content search.",
    type: "post" as const,
  },
  {
    slug: "search-database-testing",
    title: "数据库测试夹具设计",
    excerpt: "为持久化代码准备稳定的边界、回滚和并发测试数据。",
    body: "Fixtures for persistence tests cover boundaries, rollback, concurrency, and recovery.",
    type: "memo" as const,
  },
] as const;

const playbookDemoBase =
  process.env.PUBLIC_WEB_DEMO_PLAYBOOK_BASE ||
  "/playbook/editions/v3.0.0/100/16a8b0657c998acc8e7c6371b4a74983a52dd1da61da4ceb9d31e7124d88fdce";

/** Version-bound Playbook rows used by the official Web Demo search flow. */
export const PLAYBOOK_SEARCH_DEMO_DOCUMENTS = [
  {
    slug: "delivery",
    title: "交付工作流",
    excerpt: "把实现、验证、审查与发布组织成可追踪的交付流程。",
    body: "交付工作流要求先锁定范围，再完成验证、审查和可回滚发布。",
    type: "topic" as const,
    href: `${playbookDemoBase}/topics/delivery`,
    sections: [
      {
        href: `${playbookDemoBase}/topics/delivery#section-release`,
        title: "发布与回滚",
        snippet: "发布必须保留验证证据与回滚入口。",
        score: 14,
        order: 1,
        kind: "section" as const,
      },
    ],
  },
  {
    slug: "safe-release",
    title: "安全发布 Policy Skill",
    excerpt: "发布前检查权限、版本身份和恢复路径。",
    body: "安全发布要求检查权限、版本身份、恢复路径和审查证据。",
    type: "policy" as const,
    href: `${playbookDemoBase}/policies/safe-release`,
    sections: [
      {
        href: `${playbookDemoBase}/policies/safe-release#policy-safe-release-resources-file-1`,
        title: "references/release-checklist.md",
        snippet: "发布检查清单：权限、版本、验证和恢复。",
        score: 16,
        order: 1,
        kind: "resource" as const,
        resourcePath: "references/release-checklist.md",
      },
    ],
  },
] as const;
