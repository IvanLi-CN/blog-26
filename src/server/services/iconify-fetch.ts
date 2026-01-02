import type { ExtendedIconifyIcon, IconifyJSON } from "@iconify/types";
import { getIconData, iconToSVG } from "@iconify/utils";
import { getAllowedPrefixes, isValidIconId } from "@/lib/icons/aliases";

type IconifyIconSetResponse = IconifyJSON & {
  not_found?: string[];
};

type CacheEntry = { value: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

// In practice, URL length limits vary across proxies and browsers.
// Keep this conservative to avoid hitting edge limits in SSR environments.
const DEFAULT_MAX_URL_LENGTH = 1800;

// Avoid building huge Iconify batch URLs and responses. This is a soft limit and can be tuned via options.
const DEFAULT_MAX_ICONS_PER_REQUEST = 50;

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h

export type FetchIconifySsrSvgOptions = {
  allowedPrefixes?: readonly string[];
  iconifyBaseUrl?: string;
  maxIconsPerRequest?: number;
  maxUrlLength?: number;
  svgHeight?: string;
  ttlSeconds?: number;
};

export function invalidateIconifySsrSvgCache(iconId?: string): void {
  if (iconId) cache.delete(iconId);
  else cache.clear();
}

export async function fetchIconifySsrSvgs(
  iconIds: readonly string[],
  options: FetchIconifySsrSvgOptions = {}
): Promise<Record<string, string | null>> {
  const allowedPrefixes = options.allowedPrefixes ?? getAllowedPrefixes();
  const iconifyBaseUrl = normalizeBaseUrl(
    options.iconifyBaseUrl ?? process.env.ICONIFY_BASE ?? "https://api.iconify.design"
  );
  const maxIconsPerRequest = options.maxIconsPerRequest ?? DEFAULT_MAX_ICONS_PER_REQUEST;
  const maxUrlLength = options.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH;
  const svgHeight = options.svgHeight ?? "1em";
  const envTtlSeconds = Number(process.env.ICONIFY_SSR_TTL);
  const rawTtlSeconds = options.ttlSeconds ?? envTtlSeconds;
  const ttlSeconds =
    Number.isFinite(rawTtlSeconds) && rawTtlSeconds >= 0 ? rawTtlSeconds : DEFAULT_TTL_SECONDS;
  const ttlMs = ttlSeconds * 1000;

  const now = Date.now();
  const result: Record<string, string | null> = {};
  const pendingByPrefix = new Map<string, string[]>();

  const seen = new Set<string>();
  for (const iconId of iconIds) {
    if (seen.has(iconId)) continue;
    seen.add(iconId);

    if (!isValidIconId(iconId)) {
      result[iconId] = null;
      continue;
    }

    const [prefix, name] = splitIconId(iconId);
    if (!allowedPrefixes.includes(prefix)) {
      result[iconId] = null;
      continue;
    }

    const cached = getCachedValue(iconId, now);
    if (cached !== undefined) {
      result[iconId] = cached;
      continue;
    }

    const bucket = pendingByPrefix.get(prefix) ?? [];
    bucket.push(name);
    pendingByPrefix.set(prefix, bucket);
  }

  for (const [prefix, names] of pendingByPrefix) {
    const uniqueNames = Array.from(new Set(names));
    const chunks = splitIconNames(prefix, uniqueNames, {
      iconifyBaseUrl,
      maxIconsPerRequest,
      maxUrlLength,
    });

    for (const chunk of chunks) {
      const iconSet = await fetchIconifyIconSet(prefix, chunk, iconifyBaseUrl);
      if (!iconSet) {
        for (const name of chunk) {
          result[`${prefix}:${name}`] = null;
        }
        continue;
      }

      const notFound = new Set(iconSet.not_found ?? []);
      for (const name of chunk) {
        const iconId = `${prefix}:${name}`;
        if (notFound.has(name)) {
          result[iconId] = null;
          setCachedValue(iconId, null, now, ttlMs);
          continue;
        }

        const iconData = resolveIconData(iconSet, name);
        if (!iconData) {
          result[iconId] = null;
          setCachedValue(iconId, null, now, ttlMs);
          continue;
        }

        const svg = iconDataToSvg(iconData, { height: svgHeight });
        result[iconId] = svg;
        setCachedValue(iconId, svg, now, ttlMs);
      }
    }
  }

  return result;
}

function normalizeBaseUrl(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function splitIconId(iconId: string): [prefix: string, name: string] {
  const idx = iconId.indexOf(":");
  return [iconId.slice(0, idx), iconId.slice(idx + 1)];
}

function getCachedValue(iconId: string, now: number): string | null | undefined {
  const hit = cache.get(iconId);
  if (!hit) return undefined;
  if (hit.expiresAt < now) {
    cache.delete(iconId);
    return undefined;
  }
  return hit.value;
}

function setCachedValue(iconId: string, value: string | null, now: number, ttlMs: number): void {
  cache.set(iconId, { value, expiresAt: now + ttlMs });
}

function splitIconNames(
  prefix: string,
  names: readonly string[],
  {
    iconifyBaseUrl,
    maxIconsPerRequest,
    maxUrlLength,
  }: {
    iconifyBaseUrl: string;
    maxIconsPerRequest: number;
    maxUrlLength: number;
  }
): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];

  for (const name of names) {
    const next = [...current, name];
    const nextUrl = buildBatchIconSetUrl(prefix, next, iconifyBaseUrl);
    const exceedsCount = next.length > maxIconsPerRequest;
    const exceedsUrl = nextUrl.length > maxUrlLength;

    if (current.length > 0 && (exceedsCount || exceedsUrl)) {
      chunks.push(current);
      current = [name];
      continue;
    }

    current = next;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function buildBatchIconSetUrl(
  prefix: string,
  names: readonly string[],
  iconifyBaseUrl: string
): string {
  const url = new URL(`${iconifyBaseUrl}/${prefix}.json`);
  url.searchParams.set("icons", names.join(","));
  return url.toString();
}

async function fetchIconifyIconSet(
  prefix: string,
  names: readonly string[],
  iconifyBaseUrl: string
): Promise<IconifyIconSetResponse | null> {
  try {
    const url = buildBatchIconSetUrl(prefix, names, iconifyBaseUrl);
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as IconifyIconSetResponse;
  } catch {
    return null;
  }
}

function resolveIconData(
  iconSet: IconifyIconSetResponse,
  name: string
): ExtendedIconifyIcon | null {
  return getIconData(iconSet, name);
}

function iconDataToSvg(icon: ExtendedIconifyIcon, customisations: { height: string }): string {
  const { attributes, body } = iconToSVG(icon, customisations);
  return `<svg ${serialiseSvgAttributes({
    xmlns: "http://www.w3.org/2000/svg",
    ...attributes,
    fill: "currentColor",
    "aria-hidden": "true",
    focusable: "false",
  })}>${body}</svg>`;
}

function serialiseSvgAttributes(attributes: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    parts.push(`${key}="${escapeSvgAttribute(String(value))}"`);
  }
  return parts.join(" ");
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
