import { splitPathCandidates } from "./path-config";

const FALLBACK_LOCAL_MEMO_ROOT_PATH = "/Memos";

type NormalizeMemoRootOptions = {
  strict?: boolean;
};

function normalizeMemoRoot(
  input: string | undefined,
  options: NormalizeMemoRootOptions = {}
): string {
  const { strict = true } = options;
  const trimmed = input?.trim();
  if (!trimmed) {
    return FALLBACK_LOCAL_MEMO_ROOT_PATH;
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\\/g, "/").replace(/\/+/g, "/");
  const withoutTrailingSlash = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  const memoRoot = withoutTrailingSlash || FALLBACK_LOCAL_MEMO_ROOT_PATH;
  const segments = memoRoot.replace(/^\/+/, "").split("/");

  if (segments.some((segment) => segment === "." || segment === "..")) {
    if (!strict) {
      return FALLBACK_LOCAL_MEMO_ROOT_PATH;
    }
    throw new Error(`memo 根目录不能包含 '.' 或 '..' 段: ${trimmed}`);
  }

  return memoRoot;
}

function readProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

const DEFAULT_LOCAL_MEMO_ROOT_PATH = normalizeMemoRoot(readProcessEnv("PUBLIC_LOCAL_MEMOS_PATH"), {
  strict: false,
});

export { DEFAULT_LOCAL_MEMO_ROOT_PATH };

export function getConfiguredClientLocalMemoRootPath(): string {
  return normalizeMemoRoot(readProcessEnv("PUBLIC_LOCAL_MEMOS_PATH"));
}

type ResolveClientMemoRootOptions = {
  localSourceEnabled?: boolean;
  memoRoot?: string;
};

export function resolveClientMemoRootPath(options: ResolveClientMemoRootOptions = {}): string {
  const { localSourceEnabled = true, memoRoot } = options;

  if (!localSourceEnabled) {
    return FALLBACK_LOCAL_MEMO_ROOT_PATH;
  }

  if (memoRoot) {
    return getMemoRootPath(memoRoot);
  }

  return getConfiguredClientLocalMemoRootPath();
}

export function getMemoEditorContentSource(localSourceEnabled = true): "local" | "webdav" {
  return localSourceEnabled ? "local" : "webdav";
}

export function parseMemoRootsFromEnv(
  envValue: string | undefined,
  fallback: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string[] {
  const candidates = splitPathCandidates(envValue);
  const normalizedRoots = (candidates.length > 0 ? candidates : [fallback]).map((candidate) =>
    normalizeMemoRoot(candidate)
  );

  return normalizedRoots.filter((root, index) => normalizedRoots.indexOf(root) === index);
}

export function getServerLocalMemoRootPaths(): string[] {
  return parseMemoRootsFromEnv(
    readProcessEnv("LOCAL_MEMOS_PATH"),
    readProcessEnv("PUBLIC_LOCAL_MEMOS_PATH") || FALLBACK_LOCAL_MEMO_ROOT_PATH
  );
}

export function getServerLocalMemoRootPath(): string {
  return getServerLocalMemoRootPaths()[0] || FALLBACK_LOCAL_MEMO_ROOT_PATH;
}

export function getServerLocalMemoRootDir(): string {
  return getMemoRootDir(getServerLocalMemoRootPath());
}

export function getMemoRootPath(
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  return normalizeMemoRoot(memoRoot);
}

export function getMemoRootDir(
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  return getMemoRootPath(memoRoot).replace(/^\/+/, "");
}

export function buildMemoRelativePath(
  fileName: string,
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  const cleanFileName = fileName.replace(/^\/+/, "");
  return `${getMemoRootDir(memoRoot)}/${cleanFileName}`.replace(/\/+/g, "/");
}

export function buildMemoRootPath(
  fileName: string,
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  const cleanFileName = fileName.replace(/^\/+/, "");
  return `${getMemoRootPath(memoRoot)}/${cleanFileName}`.replace(/\/+/g, "/");
}

export function getMemoAssetsDir(
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  return `${getMemoRootDir(memoRoot)}/assets`;
}

export function buildMemoAssetPath(
  fileName: string,
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  const cleanFileName = fileName.replace(/^\/+/, "");
  return `${getMemoAssetsDir(memoRoot)}/${cleanFileName}`.replace(/\/+/g, "/");
}

export function getMemoDraftPath(
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  return buildMemoRootPath("__draft__.md", memoRoot);
}

export function getMemoNewPath(
  memoRoot: string | undefined = DEFAULT_LOCAL_MEMO_ROOT_PATH
): string {
  return buildMemoRootPath("__new__.md", memoRoot);
}

export function isMemoContentPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  return normalized.includes("/memos/") || normalized.startsWith("memos/");
}
