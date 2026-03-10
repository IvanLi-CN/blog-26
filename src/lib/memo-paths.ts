import { splitPathCandidates } from "./path-config";

const FALLBACK_LOCAL_MEMO_ROOT_PATH = "/Memos";

function normalizeMemoRoot(input: string | undefined): string {
  const trimmed = input?.trim();
  if (!trimmed) {
    return FALLBACK_LOCAL_MEMO_ROOT_PATH;
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\\/g, "/").replace(/\/+/g, "/");
  const withoutTrailingSlash = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  return withoutTrailingSlash || FALLBACK_LOCAL_MEMO_ROOT_PATH;
}

const DEFAULT_LOCAL_MEMO_ROOT_PATH = normalizeMemoRoot(process.env.NEXT_PUBLIC_LOCAL_MEMOS_PATH);

export { DEFAULT_LOCAL_MEMO_ROOT_PATH };

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
    process.env.LOCAL_MEMOS_PATH,
    process.env.NEXT_PUBLIC_LOCAL_MEMOS_PATH || FALLBACK_LOCAL_MEMO_ROOT_PATH
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
