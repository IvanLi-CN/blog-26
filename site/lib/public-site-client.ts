/** Public presentation helpers shared by the server and browser. */
import { SITE } from "@/config/site";
import { isExternalImageUrl } from "@/lib/post-cover";
import { getPublicMediaCardFallbackUrl, isPublishedPublicAssetUrl } from "@/lib/public-media";
import { getPublicApiBaseUrl, getPublicSiteUrl, toPublicSitePath } from "@/lib/public-runtime-url";

export function getSiteUrl() {
  return getPublicSiteUrl() || SITE.url;
}
export function getSiteOrigin() {
  const siteUrl = getSiteUrl();
  try {
    return new URL(siteUrl).origin;
  } catch {
    return siteUrl.replace(/\/+$/, "");
  }
}
export function getCanonicalUrl(pathname = "/") {
  if (/^https?:\/\//.test(pathname)) return pathname;
  return new URL(
    toPublicSitePath(pathname) ?? pathname,
    `${getSiteUrl().replace(/\/+$/, "")}/`
  ).toString();
}
export function toAbsoluteSiteUrl(pathname: string) {
  return getCanonicalUrl(pathname);
}

function getInternalPublicOrigins() {
  const origins = new Set<string>([getSiteOrigin()]);
  try {
    origins.add(new URL(SITE.url).origin);
  } catch {
    // Keep the resolved public site origin when the static site config is malformed.
  }
  const apiBaseUrl = getPublicApiBaseUrl();
  if (apiBaseUrl) {
    try {
      origins.add(new URL(apiBaseUrl).origin);
    } catch {
      // Ignore malformed optional runtime configuration.
    }
  }
  return origins;
}

export function getPublicSiteCardFallbackUrl(candidate: string) {
  if (isPublishedPublicAssetUrl(candidate)) {
    return getPublicMediaCardFallbackUrl(candidate);
  }
  if (!isExternalImageUrl(candidate)) return null;

  try {
    const parsed = new URL(candidate);
    if (!getInternalPublicOrigins().has(parsed.origin)) return candidate;
    if (!isPublishedPublicAssetUrl(parsed.pathname)) return candidate;
    const fallbackPath = getPublicMediaCardFallbackUrl(
      `${parsed.pathname}${parsed.search}${parsed.hash}`
    );
    return `${parsed.origin}${fallbackPath}`;
  } catch {
    return candidate;
  }
}

export function appendPublicAssetVersion(
  url: string | null | undefined,
  version: string | null | undefined
) {
  if (!url) return url ?? null;
  if (!version) return url;
  try {
    const parsed = new URL(url, "https://public.invalid");
    if (!parsed.pathname.startsWith("/api/public/assets/")) return url;
    parsed.searchParams.set("v", version);
    return url.startsWith("/")
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : parsed.toString();
  } catch {
    return url;
  }
}

export function pickTagIconSvg(
  tag: string,
  iconMap: Record<string, string | null>,
  iconSvgMap: Record<string, string | null>
) {
  const iconId = iconMap[tag] ?? "tabler:hash";
  return { iconId, iconSvg: iconSvgMap[iconId] ?? iconSvgMap["tabler:hash"] ?? null };
}
