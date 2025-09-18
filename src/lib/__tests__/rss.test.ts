import { describe, expect, it } from "bun:test";
import {
  buildFeed,
  computeLastModified,
  etagFromString,
  type FeedItem,
  sanitizeLimit,
} from "@/lib/rss";

describe("rss utils", () => {
  it("sanitizeLimit clamps and defaults", () => {
    expect(sanitizeLimit(undefined)).toBe(30);
    expect(sanitizeLimit("10")).toBe(10);
    expect(sanitizeLimit(-5)).toBe(1);
    expect(sanitizeLimit(100)).toBe(50);
  });

  it("etagFromString is stable for same content", () => {
    const a = etagFromString("hello");
    const b = etagFromString("hello");
    const c = etagFromString("world");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("computeLastModified picks the latest date", () => {
    const now = Date.now();
    const items: FeedItem[] = [
      { id: "1", title: "a", link: "#", publishedAt: now - 1000 },
      { id: "2", title: "b", link: "#", updatedAt: new Date(now - 500) },
      { id: "3", title: "c", link: "#", publishedAt: now - 2000 },
    ];
    const lm = computeLastModified(items);
    expect(lm.getTime()).toBeGreaterThan(now - 600);
  });

  it("buildFeed produces RSS with items", () => {
    const base = "http://example.com";
    const items: FeedItem[] = [
      { id: `${base}/p/1`, title: "Post 1", link: `${base}/p/1`, publishedAt: Date.now() - 1000 },
    ];
    const built = buildFeed(
      {
        title: "Site",
        description: "Desc",
        id: base,
        link: base,
        author: { name: "Tester", email: "t@example.com" },
        feedLinks: { rss2: `${base}/feed.xml` },
      },
      items
    );
    expect(built.rss).toContain("<rss");
    expect(built.rss).toContain("Post 1");
    expect(built.etag).toMatch(/^W/);
  });
});
