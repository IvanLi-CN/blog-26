import type {
  AdminLlmCatalogResponse,
  AdminLlmSettingsPayload,
  AdminLlmSettingsTestResponse,
  AdminLlmSettingsUpdateInput,
  LlmTier,
} from "@/lib/llm-settings";
import type { TagGroup } from "@/types/tag-groups";
import type { TagSummary } from "@/types/tags";
import type { LlmModelOption, LlmModelSource } from "./llm-models";

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

export interface AdminApiErrorShape {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
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
  authorEmail: string;
  parentId: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface AdminCommentsListResponse {
  comments: AdminComment[];
  pagination: Pagination;
}

export interface DataSourceInfo {
  name: string;
  type: "webdav" | "local";
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
  image?: string | null;
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
  filePath?: string | null;
  source?: string | null;
  createdAt: string;
  publishedAt?: string;
  updatedAt: string;
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
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers,
    });
  } catch (error) {
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
    const message = data?.error?.message || response.statusText || "请求失败";
    throw new AdminApiError(message, response.status, data?.error?.code, data?.error?.details);
  }

  return data as T;
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
    status?: "all" | "approved" | "pending" | "rejected";
    sortBy?: "createdAt" | "authorName";
    sortOrder?: "asc" | "desc";
  }) => adminRequest<AdminCommentsListResponse>(`/api/admin/comments${buildSearch(params)}`),
  updateComment: (id: string, input: Record<string, unknown>) =>
    adminRequest<{ success: boolean; message: string }>(
      `/api/admin/comments/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      }
    ),
  deleteComment: (id: string) =>
    adminRequest<{ success: boolean; message: string }>(
      `/api/admin/comments/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      }
    ),
  batchUpdateComments: (input: {
    ids: string[];
    action: "approve" | "reject" | "pending" | "delete";
  }) =>
    adminRequest<{ success: boolean; message: string; affectedCount: number }>(
      "/api/admin/comments/batch",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),
  getContentSyncSystemConfig: () =>
    adminRequest<Record<string, unknown>>("/api/admin/content-sync/system-config"),
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
    adminRequest<Record<string, unknown>>("/api/admin/content-sync/vectorization-stats"),
  triggerContentSync: (input: Record<string, unknown> = {}) =>
    adminRequest<Record<string, unknown>>("/api/admin/content-sync/trigger", {
      method: "POST",
      body: JSON.stringify(input),
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
    adminRequest<Record<string, unknown>>("/api/admin/files/rename", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
