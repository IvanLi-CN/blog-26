import { createHash } from "node:crypto";
import { Feed, type Item as FeedItemDef, type FeedOptions } from "feed";

import { SITE } from "@/config/site";
import { extractTextSummary } from "./markdown-utils";
import { toMsTimestamp } from "./utils";

export type FeedMeta = {
  title: string;
  description: string;
  id: string; // site id/home url
  link: string; // site home url
  language?: string;
  image?: string; // site image
  favicon?: string;
  author: { name: string; email?: string; link?: string };
  feedLinks?: { rss2?: string; atom1?: string; json1?: string };
};

export type FeedCategory = string;

export type FeedItem = {
  id: string; // stable guid (usually permalink)
  title: string;
  link: string;
  description?: string;
  content?: string;
  authorName?: string;
  authorEmail?: string;
  categories?: FeedCategory[];
  image?: string; // absolute URL for cover image
  // date fields (either is fine); values can be ms or seconds since epoch
  publishedAt?: number | Date;
  updatedAt?: number | Date;
  // Optional media enclosure (basic image support)
  enclosureUrl?: string;
  enclosureType?: string; // e.g. image/jpeg, audio/mpeg
};

type FeedItemWithEnclosure = FeedItemDef & {
  enclosure?: {
    url: string;
    type?: string;
    length?: number;
  };
};

export type BuiltFeed = {
  rss: string;
  atom?: string;
  json?: string;
  etag: string;
  lastModified: Date;
};

export const defaultBaseUrl =
  process.env.NEXT_PUBLIC_SITE_URL || SITE.url || "http://localhost:25090";

export function toAbsoluteUrl(urlOrPath?: string | null): string | undefined {
  if (!urlOrPath) return undefined;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const base = defaultBaseUrl.replace(/\/$/, "");
  const path = String(urlOrPath).startsWith("/") ? String(urlOrPath) : `/${urlOrPath}`;
  return `${base}${path}`;
}

export function sanitizeLimit(value: unknown, fallback = 30, max = 50): number {
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  const clamped = Math.max(1, Math.min(Math.floor(n), max));
  return clamped;
}

export function inferImageContentType(url?: string): string | undefined {
  if (!url) return undefined;
  const lower = url.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.startsWith("data:image/")) {
    // data:image/png;base64,...
    const match = /^data:(image\/[a-z0-9.+-]+);/i.exec(lower);
    return match?.[1];
  }
  return undefined;
}

export function getItemDate(item: FeedItem): Date | undefined {
  const getDate = (v?: number | Date) => (typeof v === "number" ? new Date(toMsTimestamp(v)) : v);
  // Prefer updatedAt then publishedAt
  return getDate(item.updatedAt) || getDate(item.publishedAt);
}

export function computeLastModified(items: FeedItem[]): Date {
  const dates: number[] = [];
  for (const it of items) {
    const d = getItemDate(it);
    if (d?.getTime && Number.isFinite(d.getTime())) dates.push(d.getTime());
  }
  // When no items, return a fixed epoch to keep ETag stable
  if (dates.length === 0) return new Date(0);
  return new Date(Math.max(...dates));
}

export function etagFromString(content: string): string {
  const hash = createHash("sha1").update(content).digest("hex");
  // Use weak ETag to be lenient across environments
  return `W/"${hash}"`;
}

export function shouldReturnNotModified(
  request: Request,
  etag: string,
  lastModified: Date
): boolean {
  const inm = request.headers.get("if-none-match");
  if (inm && inm === etag) return true;
  const ims = request.headers.get("if-modified-since");
  if (ims) {
    const since = new Date(ims).getTime();
    if (Number.isFinite(since) && lastModified.getTime() <= since) return true;
  }
  return false;
}

export function buildFeed(
  meta: FeedMeta,
  items: FeedItem[],
  opts?: { formats?: { rss?: boolean; atom?: boolean; json?: boolean } }
): BuiltFeed {
  const formats = { rss: true, atom: false, json: false, ...(opts?.formats || {}) };

  const feedOptions: FeedOptions = {
    title: meta.title,
    description: meta.description,
    id: meta.id,
    link: meta.link,
    language: meta.language || "zh-CN",
    image: meta.image,
    favicon: meta.favicon || toAbsoluteUrl(SITE.images.favicon),
    updated: computeLastModified(items),
    feedLinks: meta.feedLinks,
    author: meta.author,
    generator: "blog-nextjs (feed)",
    copyright: `${new Date().getFullYear()} ${SITE.owner}`,
  };

  const feed = new Feed(feedOptions);

  for (const it of items) {
    const authors = it.authorName
      ? [{ name: it.authorName, email: it.authorEmail }]
      : meta.author
        ? [{ name: meta.author.name, email: meta.author.email }]
        : undefined;
    const img = it.image ? toAbsoluteUrl(it.image) : undefined;
    const date = getItemDate(it) || new Date();
    const description =
      it.description || (it.content ? extractTextSummary(it.content, 180) : undefined);
    const enclosureType = it.enclosureType || inferImageContentType(it.enclosureUrl);

    const publishedDate =
      it.publishedAt && typeof it.publishedAt === "number"
        ? new Date(toMsTimestamp(it.publishedAt))
        : (it.publishedAt as Date | undefined);

    const itemDef: FeedItemWithEnclosure = {
      title: it.title,
      id: it.id,
      link: it.link,
      description,
      content: it.content || description,
      author: authors,
      date,
      published: publishedDate,
      image: img,
      category: (it.categories || []).map((c) => ({ name: c })),
    };

    // Minimal enclosure support (non-standard across formats but supported by feed for RSS)
    if (it.enclosureUrl) {
      itemDef.enclosure = {
        url: toAbsoluteUrl(it.enclosureUrl),
        type: enclosureType,
      };
    }

    feed.addItem(itemDef);
  }

  const rss = formats.rss ? feed.rss2() : "";
  const atom = formats.atom ? feed.atom1() : undefined;
  const json = formats.json ? feed.json1() : undefined;

  const lastModified = feedOptions.updated || new Date();
  const etag = etagFromString(rss || atom || json || "");

  return { rss, atom, json, etag, lastModified };
}
