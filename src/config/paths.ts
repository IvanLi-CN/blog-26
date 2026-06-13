import { inferContentTypeFromConfiguredPaths } from "@/lib/content-path-mappings";
import {
  DEFAULT_LOCAL_MEMO_ROOT_PATH,
  getConfiguredClientLocalMemoRootPath,
  getServerLocalMemoRootPath,
  getServerLocalMemoRootPaths,
  isMemoContentPath,
  parseMemoRootsFromEnv,
} from "@/lib/memo-paths";
import { parsePathsFromEnv } from "@/lib/path-config";

export { parsePathsFromEnv } from "@/lib/path-config";

const rawLocalBasePath = process.env.LOCAL_CONTENT_BASE_PATH;
const normalizedLocalBasePath =
  typeof rawLocalBasePath === "string" && rawLocalBasePath.trim().length > 0
    ? rawLocalBasePath.trim()
    : null;

function parseEnabledSourcePaths(envValue: string | undefined, fallback: string): string[] {
  return parsePathsFromEnv(envValue || fallback);
}

export const LOCAL_PATHS = {
  basePath: normalizedLocalBasePath,
  posts: parseEnabledSourcePaths(process.env.LOCAL_BLOG_PATH, "/blog"),
  projects: parseEnabledSourcePaths(process.env.LOCAL_PROJECTS_PATH, "/projects"),
  memos: normalizedLocalBasePath
    ? getServerLocalMemoRootPaths()
    : parseMemoRootsFromEnv(undefined, DEFAULT_LOCAL_MEMO_ROOT_PATH),
} as const;

export const LOCAL_PATH_MAPPINGS = {
  posts: LOCAL_PATHS.posts,
  projects: LOCAL_PATHS.projects,
  memos: LOCAL_PATHS.memos,
} as const;

export function validatePathConfig(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const localMemoRootConsistencyError = getLocalMemoRootConsistencyError();
  if (localMemoRootConsistencyError) {
    errors.push(localMemoRootConsistencyError);
  }

  if (normalizedLocalBasePath) {
    Object.entries(LOCAL_PATHS).forEach(([key, pathOrPaths]) => {
      if (key === "basePath") {
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
  } else {
    errors.push("未启用本地内容源：请配置 LOCAL_CONTENT_BASE_PATH");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function getActiveLocalBasePath(): string | null {
  const envBasePath = process.env.LOCAL_CONTENT_BASE_PATH?.trim();
  if (envBasePath) return envBasePath;
  return LOCAL_PATHS.basePath;
}

export function getActiveLocalPathMappings() {
  const localEnabled = hasLocalBasePath() && isContentSourceAllowed("local");

  return {
    posts: parseEnabledSourcePaths(process.env.LOCAL_BLOG_PATH, "/blog", localEnabled),
    projects: parseEnabledSourcePaths(process.env.LOCAL_PROJECTS_PATH, "/projects", localEnabled),
    memos: localEnabled
      ? getServerLocalMemoRootPaths()
      : parseMemoRootsFromEnv(undefined, DEFAULT_LOCAL_MEMO_ROOT_PATH),
  } as const;
}

function hasLocalBasePath(): boolean {
  const basePath = getActiveLocalBasePath();
  return typeof basePath === "string" && basePath.length > 0;
}

export function isLocalContentEnabled(): boolean {
  return hasLocalBasePath();
}

export function parseContentSourcesFromEnv(envValue: string | undefined): Set<"local"> | null {
  if (!envValue) return null;
  const trimmed = envValue.trim();
  if (trimmed.length === 0) return null;

  const set = new Set<"local">();
  for (const raw of trimmed.split(",")) {
    if (raw.trim() === "local") {
      set.add("local");
    }
  }
  return set.size > 0 ? set : null;
}

export function isContentSourceAllowed(source: "local"): boolean {
  const allowed = parseContentSourcesFromEnv(process.env.CONTENT_SOURCES);
  if (!allowed) return true;
  return allowed.has(source);
}

export function getLocalMemoRootConsistencyError(): string | null {
  if (!hasLocalBasePath() || !isContentSourceAllowed("local")) {
    return null;
  }

  const serverMemoRoot = getServerLocalMemoRootPath();
  const clientMemoRoot = getConfiguredClientLocalMemoRootPath();

  if (serverMemoRoot === clientMemoRoot) {
    return null;
  }

  return [
    "本地 memo 根目录配置不一致：",
    `LOCAL_MEMOS_PATH 解析为 ${serverMemoRoot}，`,
    `PUBLIC_LOCAL_MEMOS_PATH 解析为 ${clientMemoRoot}。`,
    `请将 PUBLIC_LOCAL_MEMOS_PATH 设置为 ${serverMemoRoot}，或移除 LOCAL_MEMOS_PATH 覆盖。`,
  ].join("");
}

const localMemoRootConsistencyError = getLocalMemoRootConsistencyError();
if (localMemoRootConsistencyError) {
  throw new Error(localMemoRootConsistencyError);
}

const supportedSources: Array<"local"> = [];
if (isLocalContentEnabled()) {
  supportedSources.push("local");
}

export function getLocalPath(relativePath: string = ""): string {
  const basePath = getActiveLocalBasePath();
  const cleanPath = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;
  return `${basePath}/${cleanPath}`.replace(/\/+/g, "/");
}

export type ContentType = "post" | "project" | "memo";

export function inferContentType(filePath: string): ContentType | null {
  const configuredType = inferContentTypeFromConfiguredPaths(filePath, {
    posts: [...LOCAL_PATHS.posts],
    projects: [...LOCAL_PATHS.projects],
    memos: [...LOCAL_PATHS.memos],
  });
  if (configuredType) {
    return configuredType;
  }

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

const CONTENT_TYPE_TO_PATH_KEY = {
  post: "posts",
  project: "projects",
  memo: "memos",
} as const;

export function getLocalPathsForType(contentType: ContentType): string[] {
  const pathKey = CONTENT_TYPE_TO_PATH_KEY[contentType];
  return LOCAL_PATHS[pathKey];
}

export function getLocalPathForType(contentType: ContentType): string {
  const pathKey = CONTENT_TYPE_TO_PATH_KEY[contentType];
  const paths = LOCAL_PATHS[pathKey];
  return paths.length > 0 ? paths[0] : "";
}

export const SYSTEM_CONFIG = {
  local: {
    basePath: LOCAL_PATHS.basePath,
    paths: LOCAL_PATHS,
    pathMappings: LOCAL_PATH_MAPPINGS,
  },
  supportedSources,
} as const;

export type LocalPaths = typeof LOCAL_PATHS;
export type LocalPathMappings = typeof LOCAL_PATH_MAPPINGS;
export type SystemConfig = typeof SYSTEM_CONFIG;
