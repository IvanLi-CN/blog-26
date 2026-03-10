import { DEFAULT_LOCAL_MEMO_ROOT_PATH, isMemoContentPath } from "@/lib/memo-paths";

/**
 * 统一的路径配置管理
 *
 * 提供系统级别的路径常量配置，消除重复配置和不一致问题
 * 支持多路径配置，环境变量中使用逗号分隔多个路径值
 */

// ============================================================================
// 路径解析工具
// ============================================================================

/**
 * 解析环境变量中的路径配置
 * 支持逗号分隔的多个路径，正确处理包含空格的路径（用引号包裹）
 *
 * @param envValue 环境变量值
 * @returns 解析后的路径数组
 *
 * @example
 * parsePathsFromEnv("/blog") → ["/blog"]
 * parsePathsFromEnv("/blog,/articles") → ["/blog", "/articles"]
 * parsePathsFromEnv("/blog, '/my posts' , /articles") → ["/blog", "/my posts", "/articles"]
 */
export function parsePathsFromEnv(envValue: string): string[] {
  if (!envValue || typeof envValue !== "string") {
    return [];
  }

  const trimmedValue = envValue.trim();
  if (trimmedValue.length === 0) {
    return [];
  }

  const paths: string[] = [];
  let currentPath = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < envValue.length; i++) {
    const char = envValue[i];

    if (!inQuotes && (char === '"' || char === "'")) {
      // 开始引号
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      // 结束引号
      inQuotes = false;
      quoteChar = "";
    } else if (!inQuotes && char === ",") {
      // 路径分隔符
      const trimmedPath = currentPath.trim();
      if (trimmedPath) {
        paths.push(trimmedPath);
      }
      currentPath = "";
    } else {
      // 普通字符
      currentPath += char;
    }
  }

  // 处理最后一个路径
  const trimmedPath = currentPath.trim();
  if (trimmedPath) {
    paths.push(trimmedPath);
  }

  // 验证和清理路径
  const validPaths = paths
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .map((path) => {
      // 确保路径以 / 开头
      if (!path.startsWith("/")) {
        throw new Error(`路径必须以 '/' 开头: ${path}`);
      }
      return path;
    });

  return validPaths.length > 0 ? validPaths : [];
}

// ============================================================================
// 环境变量配置
// ============================================================================

/**
 * WebDAV 路径配置
 * 支持多路径配置，每个内容类型可以有多个搜索路径
 */
export const WEBDAV_PATHS = {
  /** 博客文章路径 */
  posts: parsePathsFromEnv(process.env.WEBDAV_BLOG_PATH || "/blog"),
  /** 项目文档路径 */
  projects: parsePathsFromEnv(process.env.WEBDAV_PROJECTS_PATH || "/projects"),
  /** 闪念内容路径 */
  memos: parsePathsFromEnv(process.env.WEBDAV_MEMOS_PATH || "/memos"),
} as const;

/**
 * 本地内容路径配置
 * 支持多路径配置，每个内容类型可以有多个搜索路径
 */
const rawLocalBasePath = process.env.LOCAL_CONTENT_BASE_PATH;
const normalizedLocalBasePath =
  typeof rawLocalBasePath === "string" && rawLocalBasePath.trim().length > 0
    ? rawLocalBasePath.trim()
    : null;

export const LOCAL_PATHS = {
  /** 本地内容基础路径 */
  basePath: normalizedLocalBasePath,
  /** 博客文章路径 */
  posts: parsePathsFromEnv(process.env.LOCAL_BLOG_PATH || "/blog"),
  /** 项目文档路径 */
  projects: parsePathsFromEnv(process.env.LOCAL_PROJECTS_PATH || "/projects"),
  /** 闪念内容路径 */
  memos: parsePathsFromEnv(process.env.LOCAL_MEMOS_PATH || DEFAULT_LOCAL_MEMO_ROOT_PATH),
} as const;

// ============================================================================
// 路径映射配置
// ============================================================================

/**
 * WebDAV 路径映射配置对象
 * 用于 WebDAV 内容源配置
 */
export const WEBDAV_PATH_MAPPINGS = {
  posts: WEBDAV_PATHS.posts,
  projects: WEBDAV_PATHS.projects,
  memos: WEBDAV_PATHS.memos,
} as const;

/**
 * 本地路径映射配置对象
 * 用于本地内容源配置
 */
export const LOCAL_PATH_MAPPINGS = {
  posts: LOCAL_PATHS.posts,
  projects: LOCAL_PATHS.projects,
  memos: LOCAL_PATHS.memos,
} as const;

// ============================================================================
// 配置验证和工具函数
// ============================================================================

/**
 * 验证路径配置的一致性
 * 支持数组格式的路径验证
 */
export function validatePathConfig(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 内容源白名单（可选）：未设置则视为不限制
  const allowedSources = parseContentSourcesFromEnv(process.env.CONTENT_SOURCES);
  const allowLocal = allowedSources ? allowedSources.has("local") : true;
  const allowWebDAV = allowedSources ? allowedSources.has("webdav") : true;

  const localEnabled = allowLocal && hasLocalBasePath();
  const webdavEnabled =
    allowWebDAV &&
    typeof process.env.WEBDAV_URL === "string" &&
    process.env.WEBDAV_URL.trim().length > 0;

  // 检查 WebDAV 路径格式
  if (webdavEnabled) {
    Object.entries(WEBDAV_PATHS).forEach(([key, paths]) => {
      if (!Array.isArray(paths) || paths.length === 0) {
        errors.push(`WebDAV 路径 ${key} 不能为空`);
        return;
      }

      paths.forEach((path, index) => {
        if (!path.startsWith("/")) {
          errors.push(`WebDAV 路径 ${key}[${index}] 必须以 '/' 开头: ${path}`);
        }
      });
    });
  }

  // 检查本地路径格式
  if (localEnabled) {
    Object.entries(LOCAL_PATHS).forEach(([key, pathOrPaths]) => {
      if (key === "basePath") {
        // basePath 是字符串，不是数组
        return;
      }

      const paths = pathOrPaths as string[];
      if (!Array.isArray(paths) || paths.length === 0) {
        errors.push(`本地路径 ${key} 不能为空`);
        return;
      }

      paths.forEach((path, index) => {
        if (!path.startsWith("/")) {
          errors.push(`本地路径 ${key}[${index}] 必须以 '/' 开头: ${path}`);
        }
      });
    });
  }

  // 至少启用一个内容源
  const enabledSources: string[] = [];
  if (localEnabled) enabledSources.push("local");
  if (webdavEnabled) enabledSources.push("webdav");
  if (enabledSources.length === 0) {
    // Provide a more actionable error that matches CONTENT_SOURCES expectations.
    if (allowLocal && allowWebDAV) {
      errors.push(
        "未启用任何内容源：请配置 LOCAL_CONTENT_BASE_PATH 或 WEBDAV_URL（或调整 CONTENT_SOURCES）"
      );
    } else if (allowLocal) {
      errors.push("未启用任何内容源：请配置 LOCAL_CONTENT_BASE_PATH（CONTENT_SOURCES=local）");
    } else if (allowWebDAV) {
      errors.push("未启用任何内容源：请配置 WEBDAV_URL（CONTENT_SOURCES=webdav）");
    } else {
      errors.push("未启用任何内容源：CONTENT_SOURCES 未包含任何受支持的 source（local/webdav）");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 获取完整的 WebDAV URL
 */
export function getWebDAVUrl(path: string = ""): string {
  const baseUrl = process.env.WEBDAV_URL;
  if (!baseUrl) {
    throw new Error("WEBDAV_URL 环境变量未设置");
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/$/, "")}${cleanPath}`;
}

function hasLocalBasePath(): boolean {
  return typeof LOCAL_PATHS.basePath === "string" && LOCAL_PATHS.basePath.length > 0;
}

/**
 * 判断是否启用本地内容源
 */
export function isLocalContentEnabled(): boolean {
  return hasLocalBasePath() && isContentSourceAllowed("local");
}

export function parseContentSourcesFromEnv(
  envValue: string | undefined
): Set<"local" | "webdav"> | null {
  if (!envValue) return null;
  const trimmed = envValue.trim();
  if (trimmed.length === 0) return null;

  const set = new Set<"local" | "webdav">();
  for (const raw of trimmed.split(",")) {
    const value = raw.trim();
    if (value === "local" || value === "webdav") {
      set.add(value);
    }
  }
  return set.size > 0 ? set : null;
}

export function isContentSourceAllowed(source: "local" | "webdav"): boolean {
  const allowed = parseContentSourcesFromEnv(process.env.CONTENT_SOURCES);
  if (!allowed) return true;
  return allowed.has(source);
}

const supportedSources: Array<"local" | "webdav"> = [];
if (isLocalContentEnabled()) {
  supportedSources.push("local");
}
if (process.env.WEBDAV_URL && isContentSourceAllowed("webdav")) {
  supportedSources.push("webdav");
}

/**
 * 获取完整的本地文件路径
 */
export function getLocalPath(relativePath: string = ""): string {
  const basePath = LOCAL_PATHS.basePath;
  const cleanPath = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;
  return `${basePath}/${cleanPath}`.replace(/\/+/g, "/");
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 内容类型枚举
 * 统一使用复数形式，与路径配置保持一致
 */
export type ContentType = "post" | "project" | "memo";

/**
 * 根据文件路径推断内容类型
 */
export function inferContentType(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");

  if (
    normalizedPath.includes("/blog/") ||
    normalizedPath.startsWith("blog/") ||
    normalizedPath.startsWith("posts/")
  ) {
    return "post";
  }

  if (normalizedPath.includes("/projects/") || normalizedPath.startsWith("projects/")) {
    return "project";
  }

  if (isMemoContentPath(filePath)) {
    return "memo";
  }

  return null;
}

/**
 * 内容类型到路径键的映射
 */
const CONTENT_TYPE_TO_PATH_KEY = {
  post: "posts",
  project: "projects",
  memo: "memos",
} as const;

/**
 * 获取指定内容类型的 WebDAV 路径数组
 * @param contentType 内容类型
 * @returns 路径数组，支持多路径配置
 */
export function getWebDAVPathsForType(contentType: ContentType): string[] {
  const pathKey = CONTENT_TYPE_TO_PATH_KEY[contentType];
  return WEBDAV_PATHS[pathKey];
}

/**
 * 获取指定内容类型的本地路径数组
 * @param contentType 内容类型
 * @returns 路径数组，支持多路径配置
 */
export function getLocalPathsForType(contentType: ContentType): string[] {
  const pathKey = CONTENT_TYPE_TO_PATH_KEY[contentType];
  return LOCAL_PATHS[pathKey];
}

/**
 * 获取指定内容类型的第一个 WebDAV 路径（向后兼容）
 * @param contentType 内容类型
 * @returns 第一个路径，如果没有路径则返回空字符串
 */
export function getWebDAVPathForType(contentType: ContentType): string {
  const pathKey = CONTENT_TYPE_TO_PATH_KEY[contentType];
  const paths = WEBDAV_PATHS[pathKey];
  return paths.length > 0 ? paths[0] : "";
}

/**
 * 获取指定内容类型的第一个本地路径（向后兼容）
 * @param contentType 内容类型
 * @returns 第一个路径，如果没有路径则返回空字符串
 */
export function getLocalPathForType(contentType: ContentType): string {
  const pathKey = CONTENT_TYPE_TO_PATH_KEY[contentType];
  const paths = LOCAL_PATHS[pathKey];
  return paths.length > 0 ? paths[0] : "";
}

// ============================================================================
// 配置导出
// ============================================================================

/**
 * 系统配置对象
 * 用于管理后台和其他需要完整配置信息的地方
 */
export const SYSTEM_CONFIG = {
  webdav: {
    enabled: !!process.env.WEBDAV_URL,
    url: process.env.WEBDAV_URL || null,
    paths: WEBDAV_PATHS,
    pathMappings: WEBDAV_PATH_MAPPINGS,
  },
  local: {
    basePath: LOCAL_PATHS.basePath,
    paths: LOCAL_PATHS,
    pathMappings: LOCAL_PATH_MAPPINGS,
  },
  supportedSources,
} as const;

// ============================================================================
// 类型导出
// ============================================================================

export type WebDAVPaths = typeof WEBDAV_PATHS;
export type LocalPaths = typeof LOCAL_PATHS;
export type WebDAVPathMappings = typeof WEBDAV_PATH_MAPPINGS;
export type LocalPathMappings = typeof LOCAL_PATH_MAPPINGS;
export type SystemConfig = typeof SYSTEM_CONFIG;
