const TRAILING_SLASH = /\/+$/;

function normalizeBaseUrl(raw: string | undefined | null) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return value.replace(TRAILING_SLASH, "");
}

export function getPublicApiBaseUrl() {
  const fromProcess =
    typeof process !== "undefined" && process.env
      ? process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL
      : "";

  const fromImportMeta =
    typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.PUBLIC_API_BASE_URL ||
        (import.meta as ImportMeta & { env?: Record<string, string> }).env
          ?.NEXT_PUBLIC_API_BASE_URL ||
        ""
      : "";

  return normalizeBaseUrl(fromImportMeta || fromProcess);
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
