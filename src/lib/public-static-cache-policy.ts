export const PUBLIC_HTML_CACHE_CONTROL = "public, max-age=60, must-revalidate";
export const VERSIONED_PUBLIC_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATED_PUBLIC_ASSET_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export function getPublicStaticCacheControl(
  pathname: string,
  filePath: string,
  status = 200
): string | null {
  if (
    status !== 200 ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    return null;
  }

  if (filePath.endsWith(".html")) return PUBLIC_HTML_CACHE_CONTROL;

  if (
    /(?:^|\/)_(?:astro)\//.test(pathname) ||
    /(?:^|\/)_(?:content\/assets)\//.test(pathname) ||
    /(?:^|\/)pwa\/[a-f0-9]{16}\//.test(pathname)
  ) {
    return VERSIONED_PUBLIC_ASSET_CACHE_CONTROL;
  }

  return REVALIDATED_PUBLIC_ASSET_CACHE_CONTROL;
}
