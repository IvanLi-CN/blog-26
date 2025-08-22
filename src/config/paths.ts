/**
 * 统一的路径配置管理
 *
 * 提供系统级别的路径常量配置，消除重复配置和不一致问题
 */

// ============================================================================
// 环境变量配置
// ============================================================================

/**
 * WebDAV 路径配置
 */
export const WEBDAV_PATHS = {
  /** 博客文章路径 */
  posts: process.env.WEBDAV_BLOG_PATH || "/blog",
  /** 项目文档路径 */
  projects: process.env.WEBDAV_PROJECTS_PATH || "/projects",
  /** 闪念内容路径 - 统一使用小写 */
  memos: process.env.WEBDAV_MEMOS_PATH || "/memos",
} as const;

/**
 * 本地内容路径配置
 */
export const LOCAL_PATHS = {
  /** 本地内容基础路径 */
  basePath: process.env.LOCAL_CONTENT_BASE_PATH || "./src/content",
  /** 博客文章路径 */
  posts: "/blog",
  /** 项目文档路径 */
  projects: "/projects",
  /** 闪念内容路径 */
  memos: "/memos",
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
 */
export function validatePathConfig(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 检查必要的环境变量
  if (!process.env.WEBDAV_URL && process.env.NODE_ENV !== "test") {
    errors.push("WEBDAV_URL 环境变量未设置");
  }

  // 检查路径格式
  Object.entries(WEBDAV_PATHS).forEach(([key, path]) => {
    if (!path.startsWith("/")) {
      errors.push(`WebDAV 路径 ${key} 必须以 '/' 开头: ${path}`);
    }
  });

  Object.entries(LOCAL_PATHS).forEach(([key, path]) => {
    if (key !== "basePath" && !path.startsWith("/")) {
      errors.push(`本地路径 ${key} 必须以 '/' 开头: ${path}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 获取完整的 WebDAV URL
 */
export function getWebDAVUrl(path: string = ""): string {
  const baseUrl = process.env.WEBDAV_URL || "http://localhost:8080";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/$/, "")}${cleanPath}`;
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
// 路径解析工具
// ============================================================================

/**
 * 内容类型枚举
 */
export type ContentType = "posts" | "projects" | "memos";

/**
 * 根据文件路径推断内容类型
 */
export function inferContentType(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.includes("/blog/") || normalizedPath.includes("posts/")) {
    return "posts";
  }

  if (normalizedPath.includes("/projects/")) {
    return "projects";
  }

  if (normalizedPath.includes("/memos/")) {
    return "memos";
  }

  return null;
}

/**
 * 获取指定内容类型的 WebDAV 路径
 */
export function getWebDAVPathForType(contentType: ContentType): string {
  return WEBDAV_PATHS[contentType];
}

/**
 * 获取指定内容类型的本地路径
 */
export function getLocalPathForType(contentType: ContentType): string {
  return LOCAL_PATHS[contentType];
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
  supportedSources: ["local", "webdav"] as const,
} as const;

// ============================================================================
// 类型导出
// ============================================================================

export type WebDAVPaths = typeof WEBDAV_PATHS;
export type LocalPaths = typeof LOCAL_PATHS;
export type WebDAVPathMappings = typeof WEBDAV_PATH_MAPPINGS;
export type LocalPathMappings = typeof LOCAL_PATH_MAPPINGS;
export type SystemConfig = typeof SYSTEM_CONFIG;
