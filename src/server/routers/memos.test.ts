import { describe, expect, it } from "bun:test";
import { buildSafeMemoResponse, type MemoRow } from "./memos";

const baseMemo: MemoRow = {
  id: "/memos/memo-1.md",
  slug: "memo-1",
  type: "memo",
  title: "base title",
  excerpt: "base excerpt",
  body: "base body",
  publishDate: Date.now(),
  updateDate: null,
  draft: false,
  public: true,
  category: null,
  tags: JSON.stringify(["t1"]),
  author: "admin@example.com",
  image: null,
  metadata: JSON.stringify({
    attachments: [{ filename: "old.png", path: "/old.png", isImage: true }],
  }),
  dataSource: "webdav",
  contentHash: "hash",
  lastModified: Date.now(),
  source: "webdav",
  filePath: "/memos/memo-1.md",
};

describe("buildSafeMemoResponse", () => {
  it("falls back to input attachments and tags when metadata parsing fails", () => {
    const memo: MemoRow = {
      ...baseMemo,
      metadata: "{not-json",
      tags: "{bad json",
    };
    const now = new Date("2025-01-02T03:04:05.000Z");
    const attachments = [{ filename: "new.png", path: "/api/files/webdav/new.png", isImage: true }];

    const res = buildSafeMemoResponse(memo, {
      inputAttachments: attachments,
      inputTags: ["fallback-tag"],
      fallbackContent: "fallback content",
      fallbackTitle: "fallback title",
      now,
    });

    expect(res.attachments).toEqual(attachments);
    expect(res.tags).toEqual(["fallback-tag"]);
    expect(res.publishedAt).toBeTruthy();
    expect(res.updatedAt).toBeTruthy();
  });

  it("returns degraded timestamps when forced and keeps memo content", () => {
    const memo: MemoRow = {
      ...baseMemo,
      publishDate: null,
      updateDate: null,
      lastModified: null as unknown as number,
    };
    const now = new Date("2025-05-06T07:08:09.000Z");

    const res = buildSafeMemoResponse(memo, {
      inputAttachments: [],
      inputTags: [],
      fallbackContent: "degrade content",
      fallbackTitle: "degrade title",
      faultDegrade: true,
      now,
    });

    expect(res.publishedAt).toBe(now.toISOString());
    expect(res.updatedAt).toBe(now.toISOString());
    expect(res.timeDisplaySource).toBe("unknown");
    expect(res.content).toBe(baseMemo.body);
  });
});
