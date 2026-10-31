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
  (typeof process !== "undefined" ? process.env.PUBLIC_WEB_DEMO_PLAYBOOK_BASE : undefined) ||
  "/playbook/editions/v3.0.0/100/16a8b0657c998acc8e7c6371b4a74983a52dd1da61da4ceb9d31e7124d88fdce";

/** Version-bound Playbook rows used by the official Web Demo search flow. */
export const PLAYBOOK_SEARCH_DEMO_DOCUMENTS = [
  {
    slug: "delivery",
    title: "交付工作流",
    excerpt:
      "Release 交付要把实现、验证、审查、版本身份、构建产物与可回滚发布组织成一条可追踪记录；发布前固定 source SHA 和 manifest，完成权限检查与部署验证，并保留能在异常时快速恢复的入口，同时明确负责人、触发条件、验证结果和最终状态。",
    body: "Release 交付流程要求先锁定范围和 source SHA，再检查 manifest、构建产物、权限、部署验证与回滚入口。每个环节都应留下可追踪证据，避免发布结果只停留在页面上一行状态。",
    type: "topic" as const,
    href: `${playbookDemoBase}/topics/delivery`,
    sections: [
      {
        href: `${playbookDemoBase}/topics/delivery#section-release`,
        title: "发布与回滚",
        snippet:
          "Release 发布必须保留 source SHA、manifest、验证证据和回滚入口；当 release target、构建产物或部署环境发生变化时，重新确认版本身份，再把恢复路径写进同一条交付记录，并记录负责人、触发条件与恢复后的验证结果。",
        score: 14,
        order: 1,
        kind: "section" as const,
      },
      {
        href: `${playbookDemoBase}/topics/delivery#section-identity`,
        title: "验证与版本身份",
        snippet:
          "验证完成后对照版本身份、构建产物和部署结果，确认当前 release 使用的内容、配置与权限都来自同一份已审查输入，避免旧版本或错误环境被误发布，并让审查者能够复现这次发布的判断依据。",
        score: 13,
        order: 2,
        kind: "section" as const,
      },
      {
        href: `${playbookDemoBase}/topics/delivery#section-recovery`,
        title: "恢复路径",
        snippet:
          "回滚不是发布失败后的临时补丁，而是 release 设计的一部分；记录可执行的恢复命令、触发条件和验证结果，才能在异常时快速回到已知可用状态，并确认恢复后的版本身份仍然可追踪。",
        score: 12,
        order: 3,
        kind: "section" as const,
      },
    ],
  },
  {
    slug: "safe-release",
    title: "安全发布 Policy Skill",
    excerpt:
      "Release 前检查权限、版本身份、构建产物、部署环境和恢复路径，把审查证据与最终结果绑定在同一条可追踪记录中；任何身份不一致都应在发布前阻断，而不是上线后再靠人工排查，并明确谁批准、谁执行以及如何验证恢复。",
    body: "安全 Release 要求检查权限、版本身份、构建产物、恢复路径和审查证据，并确认最终部署环境与已验证输入一致。",
    type: "policy" as const,
    href: `${playbookDemoBase}/policies/safe-release`,
    sections: [
      {
        href: `${playbookDemoBase}/policies/safe-release#policy-safe-release-resources-file-1`,
        title: "references/release-checklist.md",
        snippet:
          "Release 发布检查清单覆盖权限、版本、验证和恢复：先确认执行者能够发布，再核对 source SHA、manifest 与构建产物，最后记录部署结果和回滚入口，同时留下审批人、执行人和恢复验证结果。",
        score: 16,
        order: 1,
        kind: "resource" as const,
        resourcePath: "references/release-checklist.md",
      },
      {
        href: `${playbookDemoBase}/policies/safe-release#policy-safe-release-identity`,
        title: "版本与权限",
        snippet:
          "版本身份与权限必须在同一份 Release 记录中核对；如果 source SHA、目标环境或执行者发生变化，就要重新完成审查和验证，不能沿用上一轮发布的结论，并应保留变化原因和新的批准记录。",
        score: 15,
        order: 2,
        kind: "section" as const,
      },
      {
        href: `${playbookDemoBase}/policies/safe-release#policy-safe-release-recovery`,
        title: "恢复证据",
        snippet:
          "恢复路径应包含触发条件、可执行命令、预期状态和验证证据；这样 Release 失败时可以快速回到已知可用版本，而不是临时猜测哪个产物仍然可信，并能在恢复后继续追踪责任和后续修复。",
        score: 14,
        order: 3,
        kind: "section" as const,
      },
    ],
  },
] as const;
