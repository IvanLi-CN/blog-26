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
