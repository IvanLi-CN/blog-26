const TRAILING_SLASH = /\/+$/;
const ABSOLUTE_OR_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const PROTOCOL_RELATIVE_RE = /^\/\//;
const SITE_PATH_BYPASS_PREFIXES = ["/api", "/admin", "/_astro"];
const PUBLIC_FILE_PATH_RE =
  /\.(?:avif|bmp|css|csv|gif|htm|html|ico|jpeg|jpg|js|json|map|mjs|pdf|png|svg|txt|webmanifest|webp|woff2?|xml)$/i;

function readWindowOrigin() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "";
  }
  return normalizeBaseUrl(window.location.origin);
}

function normalizeBaseUrl(raw: string | undefined | null) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return value.replace(TRAILING_SLASH, "");
}

function normalizeBasePath(raw: string | undefined | null) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value === "/") return "";

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const normalized = withLeadingSlash.replace(TRAILING_SLASH, "");
  return normalized === "/" ? "" : normalized;
}

function readPublicSiteUrlValue() {
  const importMetaEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
      : undefined;

  const fromImportMeta = importMetaEnv?.PUBLIC_SITE_URL || "";
  if (typeof fromImportMeta === "string" && fromImportMeta.trim()) {
    return fromImportMeta.trim();
  }

  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env.PUBLIC_SITE_URL || "" : "";
  return typeof fromProcess === "string" ? fromProcess.trim() : "";
}

function readPublicSiteBasePathValue() {
  const importMetaEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
      : undefined;

  const fromImportMeta = importMetaEnv?.PUBLIC_SITE_BASE_PATH || "";
  if (typeof fromImportMeta === "string" && fromImportMeta.trim()) {
    return fromImportMeta.trim();
  }

  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env.PUBLIC_SITE_BASE_PATH || "" : "";
  return typeof fromProcess === "string" ? fromProcess.trim() : "";
}

function readPublicApiBaseUrlValue() {
  const importMetaEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
      : undefined;

  const fromImportMeta = importMetaEnv?.PUBLIC_API_BASE_URL || "";
  if (typeof fromImportMeta === "string" && fromImportMeta.trim()) {
    return fromImportMeta.trim();
  }

  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env.PUBLIC_API_BASE_URL || "" : "";
  return typeof fromProcess === "string" ? fromProcess.trim() : "";
}

function deriveBasePathFromSiteUrl(rawSiteUrl: string) {
  if (!rawSiteUrl) return "";
  try {
    return normalizeBasePath(new URL(rawSiteUrl).pathname);
  } catch {
    return "";
  }
}

function splitPathSuffix(pathname: string) {
  const match = /^([^?#]*)(.*)$/u.exec(pathname);
  return {
    path: match?.[1] ?? pathname,
    suffix: match?.[2] ?? "",
  };
}

function shouldBypassSitePathPrefix(pathname: string) {
  return SITE_PATH_BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function shouldPreserveSitePath(pathname: string) {
  return pathname === "/" || pathname.endsWith("/") || PUBLIC_FILE_PATH_RE.test(pathname);
}

function withTrailingSlash(pathname: string) {
  return shouldPreserveSitePath(pathname) ? pathname : `${pathname}/`;
}

export function getPublicSiteUrl() {
  return normalizeBaseUrl(readPublicSiteUrlValue());
}

export function getPublicSiteBasePath() {
  const explicit = normalizeBasePath(readPublicSiteBasePathValue());
  if (explicit) return explicit;
  return deriveBasePathFromSiteUrl(getPublicSiteUrl());
}

export function getPublicApiBaseUrl() {
  const windowOrigin = readWindowOrigin();
  if (windowOrigin) {
    return windowOrigin;
  }
  return normalizeBaseUrl(readPublicApiBaseUrlValue());
}

export function toPublicApiUrl(pathname: string) {
  const baseUrl = getPublicApiBaseUrl();
  if (!pathname.startsWith("/")) {
    return pathname;
  }
  return baseUrl ? `${baseUrl}${pathname}` : pathname;
}

export function toPublicAssetUrl(pathname: string | null | undefined) {
  if (!pathname) return pathname ?? null;
  if (/^https?:\/\//.test(pathname)) return pathname;
  if (!pathname.startsWith("/")) return pathname;
  return toPublicApiUrl(pathname);
}

export function toPublicSitePath(pathname: string | null | undefined) {
  if (pathname == null) return pathname ?? null;
  if (!pathname) return "";
  if (PROTOCOL_RELATIVE_RE.test(pathname) || ABSOLUTE_OR_SCHEME_RE.test(pathname)) {
    return pathname;
  }
  if (pathname.startsWith("#") || pathname.startsWith("?")) {
    return pathname;
  }
  if (!pathname.startsWith("/")) {
    return pathname;
  }

  const { path, suffix } = splitPathSuffix(pathname);
  if (shouldBypassSitePathPrefix(path)) {
    return pathname;
  }

  const normalizedPath = withTrailingSlash(path);
  const basePath = getPublicSiteBasePath();
  if (!basePath) {
    return `${normalizedPath}${suffix}`;
  }
  if (path === basePath || path.startsWith(`${basePath}/`)) {
    return `${normalizedPath}${suffix}`;
  }

  const resolvedPath = path === "/" ? `${basePath}/` : `${basePath}${normalizedPath}`;
  return `${resolvedPath}${suffix}`;
}
