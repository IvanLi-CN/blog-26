import { describe, expect, it } from "bun:test";
import type { PublicPostRecord } from "@/public-site/snapshot";
import {
  extractPostCoverCandidate,
  normalizeWikiImageTarget,
  resolvePostCoverImageSrc,
  resolveRelativeAssetPath,
} from "../../../site/lib/post-cover";

function makePost(overrides: Partial<PublicPostRecord> = {}): PublicPostRecord {
  return {
    id: "blog/posts-cover-fallback-local.md",
    slug: "posts-cover-fallback-local",
    title: "文章列表封面回退测试",
    excerpt: "测试正文首图封面回退。",
    body: "",
    publishDate: "2026-02-10T08:00:00.000Z",
    updateDate: null,
    category: "测试",
    tags: ["测试", "封面"],
    author: "Ivan Li",
    image: null,
    dataSource: "local",
    filePath: "blog/posts-cover-fallback-local.md",
    metadata: {},
    ...overrides,
  };
}

describe("post cover helper", () => {
  it("prefers frontmatter image over metadata and body images", () => {
    const candidate = extractPostCoverCandidate(
      makePost({
        image: "./assets/frontmatter-cover.jpg",
        metadata: { images: ["./assets/metadata-cover.jpg"] },
        body: "![Body cover](./assets/body-cover.jpg)\n![[./assets/wiki-cover.jpg]]",
      })
    );

    expect(candidate).toEqual(
      expect.objectContaining({
        raw: "./assets/frontmatter-cover.jpg",
        source: "frontmatter",
      })
    );
  });

  it("falls back to metadata images when frontmatter image is empty", () => {
    const candidate = extractPostCoverCandidate(
      makePost({
        image: "   ",
        metadata: {
          images: [null, "", "./assets/metadata-cover.jpg"],
        } as unknown as Record<string, unknown>,
      })
    );

    expect(candidate).toEqual(
      expect.objectContaining({
        raw: "./assets/metadata-cover.jpg",
        source: "metadata",
      })
    );
  });

  it("falls back to the first markdown image and resolves a local API src", () => {
    const imageSrc = resolvePostCoverImageSrc(
      makePost({
        body: "![Body cover](./assets/body-cover.jpg)\n\n![Second cover](./assets/second-cover.jpg)",
      }),
      { allowExternal: true }
    );

    expect(imageSrc).toBe("/api/files/local/blog/assets/body-cover.jpg");
  });

  it("normalizes Obsidian wiki image paths before resolving", () => {
    const candidate = extractPostCoverCandidate(
      makePost({
        body: "![[。/assets/wiki-cover.png|封面图]]",
      })
    );

    expect(normalizeWikiImageTarget("。/assets/wiki-cover.png|封面图")).toBe(
      "./assets/wiki-cover.png"
    );
    expect(candidate).toEqual(
      expect.objectContaining({
        raw: "./assets/wiki-cover.png",
        source: "wiki",
      })
    );
  });

  it("allows external cover fallbacks only when explicitly enabled", () => {
    const record = makePost({
      body: "![External cover](https://example.com/cover.webp)",
      dataSource: "webdav",
      filePath: "/Hardware/posts-cover-fallback-local.md",
    });

    expect(resolvePostCoverImageSrc(record, { allowExternal: false })).toBeNull();
    expect(resolvePostCoverImageSrc(record, { allowExternal: true })).toBe(
      "https://example.com/cover.webp"
    );
  });

  it("resolves relative asset paths against the markdown file directory", () => {
    expect(
      resolveRelativeAssetPath("./assets/cover.jpg", "blog/posts-cover-fallback-local.md")
    ).toBe("blog/assets/cover.jpg");
    expect(resolveRelativeAssetPath("assets/cover.jpg", "blog/posts-cover-fallback-local.md")).toBe(
      "blog/assets/cover.jpg"
    );
    expect(resolveRelativeAssetPath("../shared/cover.jpg", "blog/nested/post.md")).toBe(
      "blog/shared/cover.jpg"
    );
  });
});
