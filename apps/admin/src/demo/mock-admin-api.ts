import type {
  AdminPost,
  ContentSyncSourceStatus,
  DashboardStats,
  DataSourceInfo,
  FileItem,
  JobOverview,
  JobRun,
  PersonalAccessTokenListRow,
  SyncHistoryEntry,
  SyncLog,
  SyncProgress,
} from "@/lib/admin-api-client";
import type { AdminLlmSettingsPayload } from "@/lib/llm-settings";
import type { TagGroup } from "@/types/tag-groups";
import type { TagSummary } from "@/types/tags";

const now = Date.now();

const postBodies = {
  hooks: `# React Hooks 深度解析

React Hooks 改变了我们编写 React 组件的方式，尤其适合把状态、外部同步和复用逻辑收束在一个清晰的组件边界里。

## 基础 Hooks

\`useState\` 管理局部状态，\`useEffect\` 同步外部系统。

- 状态更新必须围绕用户动作组织。
- Effect 只同步外部系统，不承担派生状态计算。

> 依赖数组不是优化开关，它描述 Effect 读取到的响应式输入。

## 代码示例

\`\`\`tsx
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = \`Count: \${count}\`;
  }, [count]);

  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
\`\`\`

## 作者工作流

这篇文章记录 Hook 使用边界、重构策略和常见排错路径。`,
  redis: `# Redis 缓存策略与坑位

缓存不是简单地把查询结果放进 Redis。它需要明确过期、回源、击穿保护和可观测性。

## 失效策略

短 TTL 适合热读数据，主动失效适合编辑后台。`,
  graphql: `# GraphQL API Best Practices

GraphQL schema should describe product concepts, not database tables.

## Boundaries

Keep resolver cost visible and avoid hidden fan-out in list fields.`,
  kubernetes: `# Kubernetes 集群管理备忘

记录节点维护、证书轮换、备份恢复和排障路径。

## 操作边界

所有高风险操作先确认影响面，再执行。`,
};

let posts: AdminPost[] = [
  createPost("post-1", "react-hooks-deep-dive", "React Hooks 深度解析", postBodies.hooks, {
    source: "local",
    filePath: "content/posts/react-hooks-deep-dive.md",
    tags: "React,Hooks,Frontend",
    category: "frontend",
    vectorizationStatus: "indexed",
  }),
  createPost("post-2", "redis-caching-strategies", "Redis 缓存策略与坑位", postBodies.redis, {
    source: "local",
    filePath: "content/posts/redis-caching-strategies.md",
    tags: "Redis,Backend",
    category: "backend",
    vectorizationStatus: "outdated",
  }),
  createPost(
    "post-3",
    "graphql-api-best-practices",
    "GraphQL API Best Practices",
    postBodies.graphql,
    {
      source: "local",
      filePath: "content/posts/graphql-api-best-practices.md",
      tags: "GraphQL,API",
      category: "backend",
      vectorizationStatus: "unindexed",
    }
  ),
  createPost(
    "post-4",
    "kubernetes-cluster-management",
    "Kubernetes 集群管理备忘",
    postBodies.kubernetes,
    {
      draft: true,
      public: false,
      source: "local",
      filePath: "content/drafts/kubernetes-cluster-management.md",
      tags: "Kubernetes,Ops",
      category: "ops",
      vectorizationStatus: "unindexed",
    }
  ),
];

const fileContents = new Map<string, string>(
  posts.map((post) => [`${post.source}:${post.filePath}`, post.body])
);
const directoryPaths = new Set<string>();
for (const key of fileContents.keys()) {
  addParentDirectoriesFromKey(key);
}

const comments = [
  {
    id: "comment-1",
    content: "Hooks 章节的依赖数组解释很清楚。",
    postSlug: "react-hooks-deep-dive",
    authorName: "Ming",
    authorEmail: "ming@example.com",
    parentId: null,
    status: "approved" as const,
    createdAt: now - 86_400_000,
  },
  {
    id: "comment-2",
    content: "想看 Redis 热 key 的后续案例。",
    postSlug: "redis-caching-strategies",
    authorName: "Rui",
    authorEmail: "rui@example.com",
    parentId: null,
    status: "pending" as const,
    createdAt: now - 7_200_000,
  },
];

const tagGroups: TagGroup[] = [
  { key: "frontend", title: "Frontend", tags: ["React", "Hooks"] },
  { key: "backend", title: "Backend", tags: ["Redis", "GraphQL", "API"] },
  { key: "ops", title: "Operations", tags: ["Kubernetes", "Ops"] },
];

const tagSummaries: TagSummary[] = [
  { name: "React", count: 1 },
  { name: "Redis", count: 1 },
  { name: "GraphQL", count: 1 },
  { name: "Kubernetes", count: 1 },
];

let pats: PersonalAccessTokenListRow[] = [
  createPat("pat-1", "CI deploy token", now - 8 * 86_400_000, null),
  createPat("pat-2", "Local automation", now - 18 * 86_400_000, now - 2 * 86_400_000),
];

let llmSettings: AdminLlmSettingsPayload = {
  chat: {
    provider: "openrouter",
    model: "openai/gpt-4.1-mini",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: { source: "db", masked: "sk-live-••••••••••••" },
  },
  embedding: {
    provider: "openai-compatible",
    model: "text-embedding-3-small",
    baseUrl: "https://api.openai.com/v1",
    apiKey: { source: "env", masked: null },
  },
  tagging: {
    provider: "openrouter",
    model: "anthropic/claude-3.5-haiku",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: { source: "db", masked: "sk-live-••••••••••••" },
  },
};

class DemoApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DemoApiError";
    this.status = status;
  }
}

export function setupAdminDemoApiMocks() {
  if (window.__adminDemoApiMockInstalled) return;
  window.__adminDemoApiMockInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const request = normalizeRequest(input, init);
    if (!request) return originalFetch(input, init);

    const { url, method } = request;
    if (url.origin !== window.location.origin) return originalFetch(input, init);

    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdminRequest(url, method, init);
    }

    if (url.pathname.startsWith("/api/files/")) {
      return handleFileAssetRequest(url);
    }

    return originalFetch(input, init);
  };
}

declare global {
  interface Window {
    __adminDemoApiMockInstalled?: boolean;
  }
}

function normalizeRequest(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const url =
      typeof input === "string" || input instanceof URL
        ? new URL(input, window.location.origin)
        : new URL(input.url, window.location.origin);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    return { url, method };
  } catch {
    return null;
  }
}

async function handleAdminRequest(url: URL, method: string, init?: RequestInit) {
  const path = url.pathname;
  const body = await readJsonBody(init);

  if (path === "/api/admin/session") {
    return json({
      user: { id: "demo-user", nickname: "Ivan", email: "author@example.com" },
      isAdmin: true,
    });
  }
  if (path === "/api/admin/dashboard/stats") return json(dashboardStats());
  if (path === "/api/admin/dashboard/recent-activity") return json(recentActivity());
  if (path === "/api/admin/posts" && method === "GET") return json(listPosts(url));
  if (path === "/api/admin/posts" && method === "POST") return json(createPostFromBody(body));
  if (path.startsWith("/api/admin/posts/by-slug/")) {
    return json(findPostBySlug(decodeURIComponent(path.split("/").at(-1) ?? "")));
  }
  if (path.startsWith("/api/admin/posts/") && method === "GET") {
    return json(findPostById(decodeURIComponent(path.split("/").at(-1) ?? "")));
  }
  if (path.startsWith("/api/admin/posts/") && method === "PATCH") {
    return json(updatePostFromBody(decodeURIComponent(path.split("/").at(-1) ?? ""), body));
  }
  if (path === "/api/admin/posts/batch")
    return json({ success: true, message: "已更新文章", affectedCount: bodyIds(body).length });
  if (path === "/api/admin/posts/vectorize") return json({ success: true, queued: true });
  if (path === "/api/admin/comments")
    return json({ comments, pagination: pagination(comments.length) });
  if (path.startsWith("/api/admin/comments/"))
    return json({ success: true, message: "评论状态已更新" });
  if (path === "/api/admin/content-sync/manager-stats")
    return json({ registeredSources: 2, enabledSources: 2, activeJobs: 1 });
  if (path === "/api/admin/content-sync/content-stats")
    return json({ posts: posts.length, memos: 2, tags: tagSummaries.length });
  if (path === "/api/admin/content-sync/sources-status") return json(sourceStatuses());
  if (path === "/api/admin/content-sync/progress") return json(syncProgress());
  if (path === "/api/admin/content-sync/logs") return json(syncLogs());
  if (path === "/api/admin/content-sync/history") return json(syncHistory());
  if (path === "/api/admin/content-sync/vectorization-stats")
    return json({ indexed: 2, outdated: 1, unindexed: 1 });
  if (path.startsWith("/api/admin/content-sync/"))
    return json({ success: true, message: "任务已加入队列" });
  if (path === "/api/admin/jobs") return json(jobs());
  if (path === "/api/admin/jobs/runs") return json(jobRuns());
  if (path.startsWith("/api/admin/jobs/runs/") && path.endsWith("/log")) {
    return json({
      exists: true,
      content: "demo job started\ncontent sync completed\nvector index refreshed",
    });
  }
  if (path.startsWith("/api/admin/jobs/runs/")) return json(jobRuns()[0]);
  if (path === "/api/admin/jobs/trigger") return json({ success: true, message: "任务已触发" });
  if (path === "/api/admin/pats" && method === "GET") return json(pats);
  if (path === "/api/admin/pats" && method === "POST") return json(createPatFromBody(body));
  if (path.includes("/revoke")) return json({ success: true });
  if (path === "/api/admin/tags/overview")
    return json({
      groups: tagGroups,
      tagSummaries,
      tagIcons: {},
      categoryIcons: {},
      initialModel: "openai/gpt-4.1-mini",
    });
  if (path === "/api/admin/tags/organize")
    return json({
      success: true,
      data: { groups: tagGroups, notes: "已按内容主题整理", model: "openai/gpt-4.1-mini" },
    });
  if (path === "/api/admin/tag-icons/overview")
    return json({
      groups: [
        {
          key: "frontend",
          title: "Frontend",
          tags: [{ name: "React", lastSegment: "React", count: 1 }],
        },
      ],
      iconsMap: {},
      categoryIcons: {},
    });
  if (path.startsWith("/api/admin/tag-icons/")) return json({ success: true });
  if (path === "/api/admin/llm-settings") {
    if (method === "PUT")
      llmSettings = { ...llmSettings, ...(body as Partial<AdminLlmSettingsPayload>) };
    return json(llmSettings);
  }
  if (path === "/api/admin/llm-settings/test")
    return json({ success: true, message: "连接成功", latencyMs: 184 });
  if (path === "/api/admin/llm/models")
    return json({ source: url.searchParams.get("source") ?? "upstream", models: llmModels() });
  if (path === "/api/admin/files/sources") return json(fileSources());
  if (path === "/api/admin/files/tree")
    return json({
      source: sourceParam(url),
      path: pathParam(url),
      items: listDirectory(sourceParam(url), pathParam(url)),
    });
  if (path === "/api/admin/files/read") return json(readFile(sourceParam(url), pathParam(url)));
  if (path === "/api/admin/files/write") return json(writeFile(body));
  if (path === "/api/admin/files/create-directory") return json(createDirectory(body));
  if (path === "/api/admin/files/rename") return json(renameFile(body));
  if (path === "/api/admin/files/move") return handleFileMutation(() => moveEntries(body));
  if (path === "/api/admin/files/copy") return handleFileMutation(() => copyEntries(body));
  if (path === "/api/admin/files/delete") return handleFileMutation(() => deleteEntries(body));

  return json({ error: { message: `未实现的 demo API: ${path}` } }, 404);
}

function handleFileAssetRequest(url: URL) {
  return json({ url: url.pathname });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function handleFileMutation(handler: () => unknown) {
  try {
    return json(handler());
  } catch (error) {
    if (error instanceof DemoApiError) {
      return json({ error: { message: error.message } }, error.status);
    }

    return json(
      {
        error: {
          message: error instanceof Error ? error.message : "文件操作失败",
        },
      },
      500
    );
  }
}

async function readJsonBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function createPost(
  id: string,
  slug: string,
  title: string,
  body: string,
  overrides: Partial<AdminPost> = {}
): AdminPost {
  return {
    id,
    slug,
    type: "post",
    title,
    excerpt: body.replaceAll("#", "").slice(0, 84),
    body,
    publishDate: now - 7 * 86_400_000,
    updateDate: now - 900_000,
    draft: false,
    public: true,
    category: "notes",
    tags: "Blog",
    author: "Ivan",
    image: null,
    metadata: null,
    dataSource: overrides.source ?? "local",
    contentHash: `${id}-hash`,
    lastModified: now - 900_000,
    source: "local",
    filePath: `content/posts/${slug}.md`,
    ...overrides,
  };
}

function listPosts(url: URL) {
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search")?.toLowerCase() ?? "";
  let visible = [...posts];
  if (status === "draft") visible = visible.filter((post) => post.draft);
  if (status === "published") visible = visible.filter((post) => !post.draft && post.public);
  if (search) {
    visible = visible.filter((post) => `${post.title} ${post.slug}`.toLowerCase().includes(search));
  }
  return { posts: visible, pagination: pagination(visible.length) };
}

function findPostById(id: string) {
  const post = posts.find((item) => item.id === id);
  if (!post) return { error: { message: "文章不存在" } };
  return post;
}

function findPostBySlug(slug: string) {
  const post = posts.find((item) => item.slug === slug);
  if (!post) return { error: { message: "文章不存在" } };
  return post;
}

function createPostFromBody(body: Record<string, unknown>) {
  const title = String(body.title ?? "未命名文章");
  const slug = String(body.slug ?? title.toLowerCase().replace(/\s+/g, "-"));
  const post = createPost(`post-${posts.length + 1}`, slug, title, String(body.body ?? ""));
  posts = [post, ...posts];
  fileContents.set(`${post.source}:${post.filePath}`, post.body);
  return { success: true, message: "文章已创建", post };
}

function updatePostFromBody(id: string, body: Record<string, unknown>) {
  posts = posts.map((post) =>
    post.id === id
      ? {
          ...post,
          title: String(body.title ?? post.title),
          body: String(body.body ?? post.body),
          excerpt: String(body.excerpt ?? post.excerpt ?? ""),
          draft: Boolean(body.draft ?? post.draft),
          public: Boolean(body.public ?? post.public),
          updateDate: Date.now(),
        }
      : post
  );
  return { success: true, message: "文章已保存" };
}

function bodyIds(body: Record<string, unknown>) {
  return Array.isArray(body.ids) ? body.ids : [];
}

function pagination(total: number) {
  return { page: 1, limit: 20, total, totalPages: 1 };
}

function dashboardStats(): DashboardStats {
  return {
    posts: {
      total: posts.length,
      published: posts.filter((post) => post.public && !post.draft).length,
      draft: posts.filter((post) => post.draft).length,
    },
    comments: { total: comments.length, approved: 1, pending: 1 },
    users: { total: 1 },
    activity: { verificationCodes: 0 },
  };
}

function recentActivity() {
  return [
    {
      type: "post",
      id: "activity-1",
      title: "React Hooks 深度解析",
      action: "updated",
      status: "published",
      createdAt: now - 900_000,
    },
    {
      type: "comment",
      id: "activity-2",
      content: "新评论等待审核",
      action: "created",
      status: "pending",
      createdAt: now - 7_200_000,
    },
    {
      type: "memo",
      id: "activity-3",
      title: "weekly-retro.md",
      action: "synced",
      status: "success",
      createdAt: now - 14_400_000,
    },
  ];
}

function fileSources(): DataSourceInfo[] {
  return [{ name: "local", type: "local", enabled: true, description: "本地内容目录" }];
}

function listDirectory(source: string, path: string): FileItem[] {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const prefix = normalized ? `${source}:${normalized}/` : `${source}:`;
  const children = new Map<string, FileItem>();
  for (const key of directoryPaths) {
    if (!key.startsWith(prefix)) continue;
    const relative = key.slice(prefix.length);
    const [name] = relative.split("/");
    if (!name || children.has(name)) continue;
    const childPath = normalized ? `${normalized}/${name}` : name;
    children.set(name, {
      name,
      path: childPath,
      type: "directory",
      count: countImmediateChildren(source, childPath),
      lastModified: now - 900_000,
    });
  }
  for (const key of fileContents.keys()) {
    if (!key.startsWith(prefix)) continue;
    const relative = key.slice(prefix.length);
    const [name] = relative.split("/");
    if (!name) continue;
    const childPath = normalized ? `${normalized}/${name}` : name;
    const isDirectory = relative.includes("/");
    children.set(name, {
      name,
      path: childPath,
      type: isDirectory ? "directory" : "file",
      count: isDirectory ? countImmediateChildren(source, childPath) : undefined,
      extension: isDirectory ? undefined : name.split(".").pop(),
      lastModified: now - 900_000,
    });
  }
  return [...children.values()];
}

function countImmediateChildren(source: string, path: string) {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const prefix = normalized ? `${source}:${normalized}/` : `${source}:`;
  const children = new Set<string>();

  for (const key of directoryPaths) {
    if (!key.startsWith(prefix)) continue;
    const [name] = key.slice(prefix.length).split("/");
    if (name) children.add(name);
  }

  for (const key of fileContents.keys()) {
    if (!key.startsWith(prefix)) continue;
    const [name] = key.slice(prefix.length).split("/");
    if (name) children.add(name);
  }

  return children.size;
}

function addParentDirectoriesFromKey(key: string) {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex < 0) return;
  const source = key.slice(0, separatorIndex);
  const path = key.slice(separatorIndex + 1);
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    directoryPaths.add(`${source}:${current}`);
  }
}

function readFile(source: string, path: string) {
  const content = fileContents.get(`${source}:${path}`);
  if (content === undefined) return { error: { message: "文件不存在" } };
  return { source, path, content };
}

function writeFile(body: Record<string, unknown>) {
  const source = String(body.source ?? "local");
  const path = String(body.path ?? "content/posts/untitled.md");
  const content = String(body.content ?? "");
  fileContents.set(`${source}:${path}`, content);
  addParentDirectoriesFromKey(`${source}:${path}`);
  return { success: true, message: "文件已保存", path };
}

function createDirectory(body: Record<string, unknown>) {
  const source = String(body.source ?? "local");
  const path = normalizeDemoPath(String(body.path ?? "content/posts/new-folder"));
  directoryPaths.add(`${source}:${path}`);
  addParentDirectoriesFromKey(`${source}:${path}/.keep`);
  return { success: true, source, path };
}

function renameFile(body: Record<string, unknown>) {
  const source = String(body.source ?? "local");
  const oldPath = normalizeDemoPath(String(body.oldPath ?? ""));
  const newName = String(body.newName ?? "").trim();
  const parent = oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/")) : "";
  const newPath = parent ? `${parent}/${newName}` : newName;
  const oldKey = `${source}:${oldPath}`;
  const newKey = `${source}:${newPath}`;

  if (fileContents.has(oldKey)) {
    const content = fileContents.get(oldKey) ?? "";
    fileContents.delete(oldKey);
    fileContents.set(newKey, content);
    addParentDirectoriesFromKey(newKey);
    return { success: true, source, oldPath, newName };
  }

  if (directoryPaths.has(oldKey)) {
    const movedDirectories = new Map<string, string>();
    for (const key of directoryPaths) {
      if (key === oldKey || key.startsWith(`${oldKey}/`)) {
        movedDirectories.set(key, `${newKey}${key.slice(oldKey.length)}`);
      }
    }
    for (const key of movedDirectories.keys()) directoryPaths.delete(key);
    for (const key of movedDirectories.values()) directoryPaths.add(key);

    const movedFiles = new Map<string, string>();
    for (const key of fileContents.keys()) {
      if (key.startsWith(`${oldKey}/`)) {
        movedFiles.set(key, `${newKey}${key.slice(oldKey.length)}`);
      }
    }
    for (const [from, to] of movedFiles) {
      const content = fileContents.get(from) ?? "";
      fileContents.delete(from);
      fileContents.set(to, content);
    }
    addParentDirectoriesFromKey(`${newKey}/.keep`);
    return { success: true, source, oldPath, newName };
  }

  return { success: false, source, oldPath, newName };
}

function moveEntries(body: Record<string, unknown>) {
  const source = String(body.source ?? "local");
  const destinationPath = normalizeDemoPath(String(body.destinationPath ?? ""));
  const paths = parseDemoPathList(body.paths);
  const normalizedPaths = assertNoNestedDemoSelection(paths);
  const operations = normalizedPaths.map((currentPath) =>
    planDemoRelocation(source, currentPath, destinationPath, "move")
  );
  assertUniqueTargets(
    operations.map((operation) => operation.nextPath),
    "批量移动目标存在重名冲突"
  );

  for (const operation of operations) {
    applyRelocation(source, operation.path, operation.nextPath, "move");
  }

  return {
    success: true,
    source,
    destinationPath,
    moved: operations.map(({ path, nextPath, type }) => ({ path, nextPath, type })),
  };
}

function copyEntries(body: Record<string, unknown>) {
  const source = String(body.source ?? "local");
  const destinationPath = normalizeDemoPath(String(body.destinationPath ?? ""));
  const paths = parseDemoPathList(body.paths);
  const normalizedPaths = assertNoNestedDemoSelection(paths);
  const operations = normalizedPaths.map((currentPath) =>
    planDemoRelocation(source, currentPath, destinationPath, "copy")
  );
  assertUniqueTargets(
    operations.map((operation) => operation.nextPath),
    "批量复制目标存在重名冲突"
  );

  for (const operation of operations) {
    applyRelocation(source, operation.path, operation.nextPath, "copy");
  }

  return {
    success: true,
    source,
    destinationPath,
    copied: operations.map(({ path, nextPath, type }) => ({ path, nextPath, type })),
  };
}

function deleteEntries(body: Record<string, unknown>) {
  const source = String(body.source ?? "local");
  const entries = Array.isArray(body.entries)
    ? body.entries.map((entry) => ({
        path: normalizeDemoPath(String((entry as Record<string, unknown>).path ?? "")),
        type:
          (entry as Record<string, unknown>).type === "directory" ? "directory" : ("file" as const),
      }))
    : [];

  if (entries.length === 0) {
    throw new DemoApiError("至少选择一个删除目标");
  }

  const normalizedPaths = assertNoNestedDemoSelection(entries.map((entry) => entry.path));
  const deleted = normalizedPaths.map((currentPath) => {
    const declaredType =
      entries.find((entry) => normalizeDemoPath(entry.path) === currentPath)?.type ?? "file";
    const actualType = getDemoEntryType(source, currentPath);
    if (!actualType) {
      throw new DemoApiError(`源路径不存在: ${currentPath}`, 404);
    }
    if (declaredType !== actualType) {
      throw new DemoApiError("删除目标类型与实际文件系统类型不一致");
    }
    if (actualType === "directory" && hasDemoDescendants(source, currentPath)) {
      throw new DemoApiError(`目录不为空，无法删除: ${currentPath}`);
    }

    removeDemoEntry(source, currentPath, actualType);
    return { path: currentPath, type: actualType };
  });

  return {
    success: true,
    source,
    deleted,
  };
}

function parseDemoPathList(value: unknown) {
  const paths = Array.isArray(value)
    ? value.map((item) => normalizeDemoPath(String(item ?? ""))).filter(Boolean)
    : [];
  if (paths.length === 0) {
    throw new DemoApiError("至少选择一个目标");
  }
  return paths;
}

function normalizeDemoPath(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

function assertNoNestedDemoSelection(paths: string[]) {
  const normalizedPaths = Array.from(new Set(paths.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );

  for (let index = 0; index < normalizedPaths.length; index += 1) {
    for (let nestedIndex = index + 1; nestedIndex < normalizedPaths.length; nestedIndex += 1) {
      if (isDemoPathAncestor(normalizedPaths[index], normalizedPaths[nestedIndex])) {
        throw new DemoApiError("不能同时操作父目录与其子项");
      }
    }
  }

  return normalizedPaths;
}

function isDemoPathAncestor(path: string, targetPath: string) {
  return Boolean(path && targetPath && path !== targetPath && targetPath.startsWith(`${path}/`));
}

function getDemoEntryType(source: string, path: string): "file" | "directory" | null {
  const normalizedPath = normalizeDemoPath(path);
  if (!normalizedPath) return null;

  if (fileContents.has(`${source}:${normalizedPath}`)) {
    return "file";
  }

  if (directoryPaths.has(`${source}:${normalizedPath}`)) {
    return "directory";
  }

  const prefix = `${source}:${normalizedPath}/`;
  for (const key of directoryPaths) {
    if (key.startsWith(prefix)) return "directory";
  }
  for (const key of fileContents.keys()) {
    if (key.startsWith(prefix)) return "directory";
  }

  return null;
}

function hasDemoDescendants(source: string, path: string) {
  const normalizedPath = normalizeDemoPath(path);
  const prefix = `${source}:${normalizedPath}/`;
  for (const key of directoryPaths) {
    if (key.startsWith(prefix)) return true;
  }
  for (const key of fileContents.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

function demoEntryExists(source: string, path: string) {
  return getDemoEntryType(source, path) !== null;
}

function assertDemoDirectoryTargetExists(source: string, path: string) {
  const normalizedPath = normalizeDemoPath(path);
  if (!normalizedPath) return;

  const targetType = getDemoEntryType(source, normalizedPath);
  if (targetType === null) {
    throw new DemoApiError("目标目录不存在", 404);
  }
  if (targetType !== "directory") {
    throw new DemoApiError("目标路径不是目录");
  }
}

function planDemoRelocation(
  source: string,
  currentPath: string,
  destinationPath: string,
  mode: "move" | "copy"
) {
  const normalizedPath = normalizeDemoPath(currentPath);
  const normalizedDestinationPath = normalizeDemoPath(destinationPath);
  const type = getDemoEntryType(source, normalizedPath);
  if (!type) {
    throw new DemoApiError(`源路径不存在: ${normalizedPath}`, 404);
  }

  assertDemoDirectoryTargetExists(source, normalizedDestinationPath);

  if (type === "directory" && isDemoPathAncestor(normalizedPath, normalizedDestinationPath)) {
    throw new DemoApiError(
      mode === "move" ? "不能将目录移动到其自身或后代目录内" : "不能将目录复制到其自身或后代目录内"
    );
  }

  const itemName = normalizedPath.split("/").pop() ?? normalizedPath;
  const nextPath = normalizeDemoPath(
    normalizedDestinationPath ? `${normalizedDestinationPath}/${itemName}` : itemName
  );

  if (mode === "move" && nextPath === normalizedPath) {
    throw new DemoApiError("目标目录与原目录相同");
  }

  if (demoEntryExists(source, nextPath)) {
    throw new DemoApiError(`目标已存在: ${nextPath}`, 409);
  }

  return {
    path: normalizedPath,
    nextPath,
    type,
  };
}

function assertUniqueTargets(paths: string[], message: string) {
  const seen = new Set<string>();
  for (const path of paths) {
    if (seen.has(path)) {
      throw new DemoApiError(message, 409);
    }
    seen.add(path);
  }
}

function applyRelocation(source: string, fromPath: string, toPath: string, mode: "move" | "copy") {
  const normalizedFromPath = normalizeDemoPath(fromPath);
  const normalizedToPath = normalizeDemoPath(toPath);
  const type = getDemoEntryType(source, normalizedFromPath);
  if (!type) {
    throw new DemoApiError(`源路径不存在: ${normalizedFromPath}`, 404);
  }

  if (type === "file") {
    const fromKey = `${source}:${normalizedFromPath}`;
    const toKey = `${source}:${normalizedToPath}`;
    const content = fileContents.get(fromKey);
    if (content === undefined) {
      throw new DemoApiError(`源路径不存在: ${normalizedFromPath}`, 404);
    }

    fileContents.set(toKey, content);
    addParentDirectoriesFromKey(toKey);
    if (mode === "move") {
      fileContents.delete(fromKey);
    }
    return;
  }

  const directoryMappings = collectDirectoryMappings(source, normalizedFromPath, normalizedToPath);
  const fileMappings = collectFileMappings(source, normalizedFromPath, normalizedToPath);

  for (const { toKey } of directoryMappings) {
    directoryPaths.add(toKey);
  }
  for (const { fromKey, toKey } of fileMappings) {
    const content = fileContents.get(fromKey);
    if (content !== undefined) {
      fileContents.set(toKey, content);
      addParentDirectoriesFromKey(toKey);
    }
  }

  if (mode === "move") {
    for (const { fromKey } of directoryMappings) {
      directoryPaths.delete(fromKey);
    }
    for (const { fromKey } of fileMappings) {
      fileContents.delete(fromKey);
    }
  }
}

function collectDirectoryMappings(source: string, fromPath: string, toPath: string) {
  const fromKey = `${source}:${fromPath}`;
  const prefix = `${fromKey}/`;
  const candidates = Array.from(directoryPaths)
    .filter((key) => key === fromKey || key.startsWith(prefix))
    .sort((left, right) => left.localeCompare(right));

  if (candidates.length === 0) {
    candidates.push(fromKey);
  }

  return candidates.map((currentKey) => ({
    fromKey: currentKey,
    toKey: `${source}:${toPath}${currentKey.slice(fromKey.length)}`,
  }));
}

function collectFileMappings(source: string, fromPath: string, toPath: string) {
  const fromKey = `${source}:${fromPath}`;
  const prefix = `${fromKey}/`;
  return Array.from(fileContents.keys())
    .filter((key) => key.startsWith(prefix))
    .sort((left, right) => left.localeCompare(right))
    .map((currentKey) => ({
      fromKey: currentKey,
      toKey: `${source}:${toPath}${currentKey.slice(fromKey.length)}`,
    }));
}

function removeDemoEntry(source: string, path: string, type: "file" | "directory") {
  const normalizedPath = normalizeDemoPath(path);
  if (type === "file") {
    fileContents.delete(`${source}:${normalizedPath}`);
    return;
  }

  directoryPaths.delete(`${source}:${normalizedPath}`);
}

function sourceParam(url: URL) {
  return url.searchParams.get("source") ?? "local";
}

function pathParam(url: URL) {
  return url.searchParams.get("path") ?? "";
}

function sourceStatuses(): ContentSyncSourceStatus[] {
  return [
    {
      name: "local",
      type: "local",
      priority: 10,
      enabled: true,
      online: true,
      totalItems: 128,
      lastSync: now - 900_000,
    },
  ];
}

function syncProgress(): SyncProgress {
  return {
    status: "idle",
    progress: 100,
    currentStep: "等待下一次同步",
    processedItems: 174,
    totalItems: 174,
    startTime: now - 1_800_000,
  };
}

function syncLogs(): SyncLog[] {
  return [
    {
      id: "log-1",
      sourceType: "local",
      sourceName: "local",
      operation: "scan",
      status: "success",
      message: "扫描 128 个 Markdown 文件",
      createdAt: now - 900_000,
    },
  ];
}

function syncHistory(): SyncHistoryEntry[] {
  return [
    {
      success: true,
      startTime: now - 3_600_000,
      endTime: now - 3_540_000,
      duration: 60_000,
      sources: ["local"],
      stats: { posts: 4 },
      errorCount: 0,
    },
  ];
}

function jobs(): JobOverview[] {
  return [
    {
      key: "content-sync",
      name: "内容同步",
      scheduleText: "每 30 分钟",
      lastRunAt: now - 3_600_000,
      nextRunAt: now + 1_800_000,
      running: false,
    },
    {
      key: "vectorize",
      name: "向量索引",
      scheduleText: "每天 03:00",
      lastRunAt: now - 12 * 3_600_000,
      nextRunAt: now + 9 * 3_600_000,
      running: false,
    },
  ];
}

function jobRuns(): JobRun[] {
  return [
    {
      id: "run-1",
      jobKey: "content-sync",
      jobName: "内容同步",
      status: "success",
      triggeredBy: "scheduler",
      attempt: 1,
      startedAt: now - 3_600_000,
      finishedAt: now - 3_540_000,
      logPath: "/tmp/demo.log",
      logDeleted: false,
      errorMessage: null,
    },
  ];
}

function createPat(
  id: string,
  label: string,
  createdAt: number,
  revokedAt: number | null
): PersonalAccessTokenListRow {
  return {
    token: {
      id,
      userId: "demo-user",
      label,
      createdAt,
      updatedAt: createdAt,
      revokedAt,
      lastUsedAt: revokedAt ? null : now - 600_000,
    },
    user: {
      id: "demo-user",
      email: "author@example.com",
      name: "Ivan",
      createdAt: now - 30 * 86_400_000,
    },
  };
}

function createPatFromBody(body: Record<string, unknown>) {
  const row = createPat(
    `pat-${pats.length + 1}`,
    String(body.label ?? "Demo token"),
    Date.now(),
    null
  );
  pats = [row, ...pats];
  return { token: "blog_demo_pat_once_visible_token", record: row.token };
}

function llmModels() {
  return [
    { id: "openai/gpt-4.1-mini", name: "GPT-4.1 mini", provider: "OpenAI", capabilities: ["chat"] },
    {
      id: "anthropic/claude-3.5-haiku",
      name: "Claude 3.5 Haiku",
      provider: "Anthropic",
      capabilities: ["chat"],
    },
    {
      id: "text-embedding-3-small",
      name: "text-embedding-3-small",
      provider: "OpenAI",
      capabilities: ["embedding"],
    },
  ];
}
