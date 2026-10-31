import type { UnifiedContentSyncStatus } from "@/server/services/content-sync-status";

export type { UnifiedContentSyncStatus };

export type PlaybookSyncState =
  | "unconfigured"
  | "current"
  | "checking"
  | "stale"
  | "failed"
  | "invalid"
  | "unavailable";

import type {
  AdminLlmCatalogResponse,
  AdminLlmSettingsPayload,
  AdminLlmSettingsTestResponse,
  AdminLlmSettingsUpdateInput,
  LlmTier,
} from "@/lib/llm-settings";
import type { ClippingReading } from "@/lib/memo-clipping";
import type {
  ProjectStatusHistoryResponse,
  ProjectStatusOverviewResponse,
  ProjectStatusTriggerResponse,
} from "@/lib/project-status";
import type { TagGroup } from "@/types/tag-groups";
import type { TagSummary } from "@/types/tags";
import type { LlmModelOption, LlmModelSource } from "./llm-models";
import type {
  PlaybookAdminCatalog,
  PlaybookEditionIdentity,
  PlaybookSearchDocument,
} from "./playbook/types";
import type { PublicMediaCollection } from "./public-media";
import type {
  AdminSearchSettings,
  AiSearchMode,
  SearchPolicy,
  SearchValidationRun,
} from "./search/settings";
import { getWebDemoRequestSignal, isWebDemoAbortError } from "./web-demo-runtime";

export interface AdminUser {
  id: string;
  nickname: string;
  email: string;
  avatarUrl?: string;
}

export interface AdminSession {
  user: AdminUser | null;
  isAdmin: boolean;
}

export type {
  ProjectStatusHistoryResponse,
  ProjectStatusOverviewResponse,
  ProjectStatusTriggerResponse,
};

export interface AdminPlaybookBrowseResponse {
  source: PlaybookEditionIdentity["source"];
  edition: string;
  supplementAvailable: boolean;
  catalog: {
    index: PlaybookAdminCatalog["snapshot"]["index"];
    projects: PlaybookAdminCatalog["snapshot"]["projects"];
    topics: PlaybookAdminCatalog["snapshot"]["topics"];
    private_source_metadata: PlaybookAdminCatalog["private_source_metadata"];
    relation_edges: PlaybookAdminCatalog["relation_edges"];
  };
  project?: PlaybookAdminCatalog["project_details"][number];
  topic?: PlaybookAdminCatalog["topic_details"][number];
  results: Array<{ document: PlaybookSearchDocument; score: number }>;
}

export interface AdminApiErrorShape {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface AdminValidationIssue {
  code?: string;
  message?: string;
  path?: Array<string | number>;
  minimum?: number;
  inclusive?: boolean;
  origin?: string;
}

export class AdminApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function describeValidationIssue(issue: AdminValidationIssue): string | null {
  const message = issue.message?.trim();
  if (message) {
    return message;
  }

  const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
  if (path === "body") {
    return "内容不能为空";
  }

  return null;
}

function getFriendlyErrorMessage(data: AdminApiErrorShape, fallback: string) {
  const issues = Array.isArray(data?.error?.details)
    ? (data.error?.details as AdminValidationIssue[])
    : null;

  if (issues?.length) {
    const firstMessage = describeValidationIssue(issues[0]);
    if (firstMessage) {
      return firstMessage;
    }
  }

  return data?.error?.message || fallback;
}

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type DashboardStats = {
  posts: { total: number; published: number; draft: number };
  comments: { total: number; approved: number; pending: number };
  users: { total: number };
  activity: { verificationCodes: number };
};

export type ActivityItem = {
  type: "post" | "memo" | "comment" | "reaction" | "user";
  id: string;
  title?: string;
  content?: string;
  createdAt: string | number | null;
  action?: string;
  status?: string;
  timestamp?: number;
};

export type VectorizationStatus = "indexed" | "unindexed" | "outdated";

export interface VectorizationStats {
  indexed: number | null;
  outdated: number | null;
  unindexed: number | null;
  lastIndexedAt: number | string | null;
  model: string;
  dim: number | null;
}

export interface AdminPost {
  id: string;
  slug: string;
  type: string;
  title: string;
  excerpt: string | null;
  body: string;
  publishDate: number;
  updateDate: number | null;
  draft: boolean;
  public: boolean;
  category: string | null;
  tags: string | null;
  author: string | null;
  image: string | null;
  metadata: string | null;
  dataSource: string | null;
  contentHash: string;
  lastModified: number;
  source: string;
  filePath: string;
  vectorizationStatus?: VectorizationStatus;
}

export interface AdminPostsListResponse {
  posts: AdminPost[];
  pagination: Pagination;
}

export interface AdminComment {
  id: string;
  content: string;
  postSlug: string;
  authorName: string;
  authorEmail: string | null;
  authorRole?: "reader" | "admin";
  parentId: string | null;
  status: "pending" | "approved" | "rejected";
  targetType?: "article" | "memo" | "project";
  targetKey?: string;
  readerId?: string | null;
  deletedAt?: number | null;
  deleted?: boolean;
  revision?: number;
  createdAt: number;
}

export interface AdminCommentsListResponse {
  comments: AdminComment[];
  pagination: Pagination;
}

export interface AdminGithubBindingResponse {
  binding: {
    id: string;
    adminUserId: string;
    githubId: string;
    githubLogin: string;
    displayName: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
    createdAt: number;
    updatedAt: number;
  } | null;
  lastEvent: {
    id: string;
    adminUserId: string;
    githubId: string | null;
    action: "bind" | "unbind";
    result: "success" | "cancelled" | "conflict" | "failure";
    errorCode: string | null;
    createdAt: number;
  } | null;
}

export interface DataSourceInfo {
  name: string;
  type: "local";
  enabled: boolean;
  description?: string;
}

export interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  lastModified?: string | number;
  extension?: string;
  contentKind?: "markdown" | "text" | "unsupported";
  count?: number;
}

export interface FileTreeResponse {
  source: string;
  path: string;
  items: FileItem[];
}

export interface FileReadResponse {
  source: string;
  path: string;
  content: string;
  size?: number;
  contentKind?: "markdown" | "text";
}

export interface FileBatchResult {
  path: string;
  nextPath?: string;
  type: "file" | "directory";
}

export interface FileMoveResponse {
  success: boolean;
  source: string;
  destinationPath: string;
  moved: FileBatchResult[];
}

export interface FileCopyResponse {
  success: boolean;
  source: string;
  destinationPath: string;
  copied: FileBatchResult[];
}

export interface FileDeleteResponse {
  success: boolean;
  source: string;
  deleted: FileBatchResult[];
}

export interface ContentSyncSourceStatus {
  name: string;
  type: string;
  priority: number;
  enabled: boolean;
  online: boolean;
  totalItems: number;
  lastSync?: number;
  error?: string;
  metadata?: unknown;
}

export interface PlaybookContentSyncStatus {
  name: "playbook";
  type: "playbook";
  adopted: boolean;
  current: {
    edition: string;
    sourceReleaseId: string;
    sourceTag: string;
    generatedAt: string;
  } | null;
  previous: {
    edition: string;
    sourceReleaseId: string;
    sourceTag: string;
    generatedAt: string;
  } | null;
  lexical: { status: string; count: number };
  semantic: {
    model: string;
    total: number;
    ready: number;
    pending: number;
    failed: number;
    lastError?: string;
  };
  history: Array<{
    id: string;
    status: string;
    operation: string;
    message: string;
    data: unknown;
    createdAt: number;
  }>;
  editions: Array<{
    edition: string;
    sourceReleaseId: string;
    sourceTag: string;
    generatedAt: string;
  }>;
}

export interface ContentSyncTriggerResponse {
  success?: boolean;
  queued?: boolean;
  taskId?: string | null;
  status?: UnifiedContentSyncStatus | null;
  message?: string;
  [key: string]: unknown;
}

export interface SyncProgress {
  status: string;
  progress: number;
  currentStep: string;
  processedItems: number;
  totalItems: number;
  startTime: number;
  estimatedTimeRemaining?: number;
  error?: string;
}

export interface SyncLog {
  id: string;
  sourceType: string;
  sourceName: string;
  operation: string;
  status: string;
  message: string;
  filePath?: string | null;
  data?: unknown;
  createdAt: number;
}

export interface SyncHistoryEntry {
  success: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  sources: string[];
  stats: Record<string, unknown>;
  errorCount: number;
}

export interface JobOverview {
  key: string;
  name: string;
  scheduleText: string;
  lastRunAt: number | null;
  nextRunAt: number | null;
  running: boolean;
}

export interface JobRun {
  id: string;
  jobKey: string;
  jobName: string;
  status: "running" | "success" | "error";
  triggeredBy: "scheduler" | "manual";
  attempt: number;
  startedAt: number;
  finishedAt: number | null;
  logPath: string;
  logDeleted: boolean;
  errorMessage: string | null;
}

export interface PersonalAccessTokenListRow {
  token: {
    id: string;
    userId: string;
    label: string | null;
    createdAt: number;
    updatedAt: number;
    revokedAt: number | null;
    lastUsedAt: number | null;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: number;
  };
}

export interface TagsOverviewResponse {
  groups: TagGroup[];
  tagSummaries: TagSummary[];
  tagIcons: Record<string, string | null>;
  categoryIcons: Record<string, string | null>;
  initialModel: string | null;
}

export interface LlmModelsResponse {
  source: LlmModelSource;
  models: LlmModelOption[];
}

export interface TagIconOverviewGroup {
  key: string;
  title: string;
  tags: Array<{ name: string; lastSegment: string; count: number }>;
}

export interface TagIconsOverviewResponse {
  groups: TagIconOverviewGroup[];
  iconsMap: Record<string, string | null>;
  categoryIcons: Record<string, string | null>;
}

export interface AdminPreviewPost {
  kind: "post";
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt?: string | null;
  tags?: string[];
  category?: string | null;
  author?: string | null;
  publishDate?: string | number | null;
  updateDate?: string | number | null;
  image?: string | null;
  media?: PublicMediaCollection | null;
  draft?: boolean;
  public?: boolean;
  filePath?: string | null;
  source?: string | null;
  metadata?: unknown;
}

export interface AdminPreviewMemo {
  kind: "memo";
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  isPublic: boolean;
  tags?: string[];
  attachments?: Array<{ filename?: string; path: string; isImage?: boolean }>;
  image?: string | null;
  media?: PublicMediaCollection | null;
  filePath?: string | null;
  source?: string | null;
  createdAt: string;
  publishedAt?: string;
  updatedAt: string;
  clipping?: ClippingReading;
  authoredContent?: string;
  authoredTitle?: string;
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }
  if (init?.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    const requestSignal = combineAbortSignals(init?.signal, getWebDemoRequestSignal());
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers,
      ...(requestSignal ? { signal: requestSignal } : {}),
    });
  } catch (error) {
    if (isWebDemoAbortError(error)) throw error;
    throw new AdminApiError(
      "网络请求失败，请检查连接后重试",
      0,
      "NETWORK_ERROR",
      error instanceof Error ? { name: error.name } : undefined
    );
  }

  const text = await response.text();
  let data = {} as T & AdminApiErrorShape;
  if (text) {
    try {
      data = JSON.parse(text) as T & AdminApiErrorShape;
    } catch {
      throw new AdminApiError(
        response.ok ? "服务器返回了无法解析的响应" : "服务器返回了异常响应，请稍后重试",
        response.status,
        "INVALID_JSON_RESPONSE"
      );
    }
  }

  if (!response.ok) {
    const message = getFriendlyErrorMessage(data, response.statusText || "请求失败");
    throw new AdminApiError(message, response.status, data?.error?.code, data?.error?.details);
  }

  return data as T;
}

function combineAbortSignals(...signals: Array<AbortSignal | null | undefined>) {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length <= 1) return activeSignals[0];
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return (
      AbortSignal as typeof AbortSignal & { any: (signals: AbortSignal[]) => AbortSignal }
    ).any(activeSignals);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

function buildSearch(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const adminApi = {
  session: () => adminRequest<AdminSession>("/api/admin/session"),
  getPlaybook: (
    params: {
      q?: string;
      kind?: "all" | "project" | "topic" | "search";
      slug?: string;
      limit?: number;
    } = {}
  ) => adminRequest<AdminPlaybookBrowseResponse>(`/api/admin/playbook${buildSearch(params)}`),
  previewPost: (slug: string) =>
    adminRequest<AdminPreviewPost>(`/api/admin/preview/posts/${encodeURIComponent(slug)}`),
  previewMemo: (slug: string) =>
    adminRequest<AdminPreviewMemo>(`/api/admin/preview/memos/${encodeURIComponent(slug)}`),
  dashboardStats: () => adminRequest<DashboardStats>("/api/admin/dashboard/stats"),
  dashboardRecentActivity: (limit = 10) =>
    adminRequest<ActivityItem[]>(`/api/admin/dashboard/recent-activity${buildSearch({ limit })}`),
  listPosts: (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: "all" | "published" | "draft";
    sortBy?: "publishDate" | "updateDate" | "title";
    sortOrder?: "asc" | "desc";
  }) => adminRequest<AdminPostsListResponse>(`/api/admin/posts${buildSearch(params)}`),
  getPost: (id: string) => adminRequest<AdminPost>(`/api/admin/posts/${encodeURIComponent(id)}`),
  getPostBySlug: (slug: string) =>
    adminRequest<AdminPost>(`/api/admin/posts/by-slug/${encodeURIComponent(slug)}`),
  createPost: (input: Record<string, unknown>) =>
    adminRequest<{ success: boolean; message: string; post: AdminPost }>("/api/admin/posts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePost: (id: string, input: Record<string, unknown>) =>
    adminRequest<{ success: boolean; message: string }>(
      `/api/admin/posts/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      }
    ),
  deletePost: (id: string) =>
    adminRequest<{ success: boolean; message: string }>(
      `/api/admin/posts/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      }
    ),
  batchUpdatePosts: (input: { ids: string[]; action: "publish" | "unpublish" | "delete" }) =>
    adminRequest<{ success: boolean; message: string; affectedCount: number }>(
      "/api/admin/posts/batch",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),
  vectorizePostBySlug: (slug: string) =>
    adminRequest<unknown>("/api/admin/posts/vectorize", {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),
  listComments: (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: "all" | "approved" | "pending" | "rejected" | "deleted";
    targetType?: "article" | "memo" | "project";
    sortBy?: "createdAt" | "authorName";
    sortOrder?: "asc" | "desc";
  }) => adminRequest<AdminCommentsListResponse>(`/api/admin/comments${buildSearch(params)}`),
  getGithubBinding: () => adminRequest<AdminGithubBindingResponse>("/api/admin/github-binding"),
  simulateGithubBinding: () =>
    adminRequest<{ success: boolean; message: string }>("/api/admin/github-binding/simulate", {
      method: "POST",
    }),
  unbindGithubBinding: () =>
    adminRequest<{ success: boolean; message: string }>("/api/admin/github-binding/unbind", {
      method: "POST",
    }),
  updateComment: (id: string, input: Record<string, unknown>) =>
    adminRequest<{ success: boolean; message: string }>(
      `/api/admin/comments/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      }
    ),
  deleteComment: (id: string, expectedRevision?: number) =>
    adminRequest<{ success: boolean; message: string }>(
      `/api/admin/comments/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision }),
      }
    ),
  batchUpdateComments: (input: {
    ids: string[];
    action: "approve" | "reject" | "pending" | "delete" | "restore";
    expectedRevisions?: Record<string, number>;
  }) =>
    adminRequest<{
      success: boolean;
      message?: string;
      results?: Array<{ id: string; result: string }>;
    }>("/api/admin/comments/batch", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getContentSyncSystemConfig: () =>
    adminRequest<Record<string, unknown>>("/api/admin/content-sync/system-config"),
  getContentSyncStatus: (
    params: {
      source?: "all" | "blog" | "playbook";
      type?: "all" | "post" | "memo" | "clipping" | "topic" | "experience" | "policy";
      edition?: "current" | "previous";
    } = {}
  ) =>
    adminRequest<UnifiedContentSyncStatus>(`/api/admin/content-sync/status${buildSearch(params)}`),
  triggerRagIndex: (source: "all" | "blog" | "playbook", mode: "repair" | "rebuild") =>
    adminRequest<{
      taskIds: string[];
      results: { source: string; taskId?: string; error?: string }[];
    }>("/api/admin/content-sync/rag/trigger", {
      method: "POST",
      body: JSON.stringify({ source, mode }),
    }),
  cancelContentTask: (taskId: string) =>
    adminRequest(`/api/admin/content-sync/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
    }),
  getContentSyncManagerStats: () =>
    adminRequest<Record<string, unknown>>("/api/admin/content-sync/manager-stats"),
  getContentSyncContentStats: () =>
    adminRequest<Record<string, unknown>>("/api/admin/content-sync/content-stats"),
  getContentSyncSourcesStatus: () =>
    adminRequest<ContentSyncSourceStatus[]>("/api/admin/content-sync/sources-status"),
  getContentSyncProgress: () =>
    adminRequest<SyncProgress | null>("/api/admin/content-sync/progress"),
  getContentSyncLogs: (params: { limit?: number; offset?: number }) =>
    adminRequest<SyncLog[]>(`/api/admin/content-sync/logs${buildSearch(params)}`),
  getContentSyncHistory: (params: { limit?: number }) =>
    adminRequest<SyncHistoryEntry[]>(`/api/admin/content-sync/history${buildSearch(params)}`),
  getVectorizationStats: () =>
    adminRequest<VectorizationStats>("/api/admin/content-sync/vectorization-stats"),
  triggerContentSync: (input: Record<string, unknown> = {}) =>
    adminRequest<ContentSyncTriggerResponse>("/api/admin/content-sync/trigger", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  triggerPlaybookSync: () =>
    adminRequest<ContentSyncTriggerResponse>("/api/admin/content-sync/playbook/trigger", {
      method: "POST",
    }),
  cancelContentSync: () =>
    adminRequest<{ success: boolean; message: string }>("/api/admin/content-sync/cancel", {
      method: "POST",
    }),
  triggerVectorizeAll: (input: { isFull?: boolean; model?: string; chunking?: boolean } = {}) =>
    adminRequest<Record<string, unknown>>("/api/admin/content-sync/vectorize", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listJobs: () => adminRequest<JobOverview[]>("/api/admin/jobs"),
  triggerJob: (key: string) =>
    adminRequest<Record<string, unknown>>("/api/admin/jobs/trigger", {
      method: "POST",
      body: JSON.stringify({ key }),
    }),
  listJobRuns: (params: { key?: string; limit?: number }) =>
    adminRequest<JobRun[]>(`/api/admin/jobs/runs${buildSearch(params)}`),
  getJobRun: (id: string) => adminRequest<JobRun>(`/api/admin/jobs/runs/${encodeURIComponent(id)}`),
  getJobRunLog: (id: string) =>
    adminRequest<{ exists: boolean; content: string }>(
      `/api/admin/jobs/runs/${encodeURIComponent(id)}/log`
    ),
  getProjectStatusOverview: () =>
    adminRequest<ProjectStatusOverviewResponse>("/api/admin/project-status/overview"),
  getProjectStatusHistory: (limit = 200) =>
    adminRequest<ProjectStatusHistoryResponse>(
      `/api/admin/project-status/history${buildSearch({ limit })}`
    ),
  triggerProjectStatusCheck: () =>
    adminRequest<ProjectStatusTriggerResponse>("/api/admin/project-status/trigger", {
      method: "POST",
    }),
  listPersonalAccessTokens: (includeRevoked = false) =>
    adminRequest<PersonalAccessTokenListRow[]>(`/api/admin/pats${buildSearch({ includeRevoked })}`),
  createPersonalAccessToken: (label?: string) =>
    adminRequest<{ token: string; record: Record<string, unknown> }>("/api/admin/pats", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
  revokePersonalAccessToken: (tokenId: string) =>
    adminRequest<{ success: boolean }>(`/api/admin/pats/${encodeURIComponent(tokenId)}/revoke`, {
      method: "POST",
    }),
  getTagsOverview: () => adminRequest<TagsOverviewResponse>("/api/admin/tags/overview"),
  getLlmModels: (source: LlmModelSource = "upstream", tier?: LlmTier) =>
    adminRequest<LlmModelsResponse>(`/api/admin/llm/models${buildSearch({ source, tier })}`),
  organizeTags: (input: Record<string, unknown>) =>
    adminRequest<{
      success: boolean;
      data?: { groups: TagGroup[]; notes?: string; model?: string; summaryTitle?: string };
    }>("/api/admin/tags/organize", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  saveTagGroups: (groups: TagGroup[]) =>
    adminRequest<{ success: boolean }>("/api/admin/tags/organize", {
      method: "PUT",
      body: JSON.stringify({ groups }),
    }),
  getTagIconsOverview: () =>
    adminRequest<TagIconsOverviewResponse>("/api/admin/tag-icons/overview"),
  getSearchSettings: () => adminRequest<AdminSearchSettings>("/api/admin/search-settings"),
  updateSearchSettings: (policy: SearchPolicy) =>
    adminRequest<AdminSearchSettings>("/api/admin/search-settings", {
      method: "PUT",
      body: JSON.stringify(policy),
    }),
  validateSearchSettings: (mode: AiSearchMode) =>
    adminRequest<SearchValidationRun>("/api/admin/search-settings/validate", {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
  getSearchValidation: (id: string) =>
    adminRequest<SearchValidationRun>(
      `/api/admin/search-settings/validation/${encodeURIComponent(id)}`
    ),
  getLlmSettings: () => adminRequest<AdminLlmSettingsPayload>("/api/admin/llm-settings"),
  updateLlmSettings: (input: AdminLlmSettingsUpdateInput) =>
    adminRequest<AdminLlmSettingsPayload>("/api/admin/llm-settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  getLlmCatalog: (tier?: LlmTier) =>
    adminRequest<AdminLlmCatalogResponse>(
      `/api/admin/llm-settings/catalog${buildSearch({ tier })}`
    ),
  testLlmSettings: (tier: LlmTier, settings: AdminLlmSettingsUpdateInput) =>
    adminRequest<AdminLlmSettingsTestResponse>("/api/admin/llm-settings/test", {
      method: "POST",
      body: JSON.stringify({ tier, settings }),
    }),
  suggestTagIcon: (input: {
    type: "tag" | "category";
    name?: string;
    key?: string;
    title?: string;
  }) =>
    adminRequest<Record<string, unknown>>("/api/admin/tag-icons/suggest", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  assignTagIcon: (input: {
    type: "tag" | "category";
    name?: string;
    key?: string;
    icon?: string;
  }) =>
    adminRequest<Record<string, unknown>>("/api/admin/tag-icons/assign", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getFileSources: () => adminRequest<DataSourceInfo[]>("/api/admin/files/sources"),
  listDirectory: (source: string, path = "") =>
    adminRequest<FileTreeResponse>(`/api/admin/files/tree${buildSearch({ source, path })}`),
  readFile: (source: string, path: string) =>
    adminRequest<FileReadResponse>(`/api/admin/files/read${buildSearch({ source, path })}`),
  writeFile: (input: { source: string; path: string; content: string }) =>
    adminRequest<{ success: boolean; message: string; path: string }>("/api/admin/files/write", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  renameFile: (input: { source: string; oldPath: string; newName: string }) =>
    adminRequest<{
      success: boolean;
      source: string;
      oldPath: string;
      newName: string;
    }>("/api/admin/files/rename", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createDirectory: (input: { source: string; path: string }) =>
    adminRequest<{ success: boolean; source: string; path: string }>(
      "/api/admin/files/create-directory",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),
  moveEntries: (input: { source: string; paths: string[]; destinationPath: string }) =>
    adminRequest<FileMoveResponse>("/api/admin/files/move", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  copyEntries: (input: { source: string; paths: string[]; destinationPath: string }) =>
    adminRequest<FileCopyResponse>("/api/admin/files/copy", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteEntries: (input: {
    source: string;
    entries: Array<{ path: string; type: "file" | "directory" }>;
  }) =>
    adminRequest<FileDeleteResponse>("/api/admin/files/delete", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
