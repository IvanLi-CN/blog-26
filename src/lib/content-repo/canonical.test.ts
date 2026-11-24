import { describe, expect, test } from "bun:test";
import {
  buildCanonicalDocument,
  type ContentRecord,
  canonicalContentPath,
  normalizeContentBody,
} from "./canonical";

function record(overrides: Partial<ContentRecord> = {}): ContentRecord {
  return {
    id: "blog/hello.md",
    type: "post",
    slug: "hello",
    title: "Hello World",
    excerpt: null,
    body: "Body text",
    draft: false,
    public: true,
    category: "notes",
    tags: JSON.stringify(["alpha", "beta"]),
    author: "Ivan",
    image: null,
    publishDate: Date.UTC(2026, 0, 2),
    updateDate: null,
    filePath: "blog/hello.md",
    metadata: null,
    ...overrides,
  };
}

describe("canonical content form", () => {
  test("orders frontmatter deterministically and omits empty values", () => {
    const document = buildCanonicalDocument(record({ category: null, author: null, tags: "[]" }));
    const text = new TextDecoder().decode(document.bytes);
    const order = ["title:", "slug:", "date:", "draft:", "public:"].map((key) => {
      const index = text.indexOf(key);
      expect(index).toBeGreaterThan(-1);
      return index;
    });
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(text).not.toContain("category:");
    expect(text).not.toContain("author:");
    expect(text).not.toContain("tags:");
    expect(text).not.toContain("updateDate:");
  });

  test("normalizes line endings and trailing whitespace", () => {
    expect(normalizeContentBody("a  \r\nb\t\r\n\r\n")).toBe("a\nb");
  });

  test("rewrites media references to repository-relative targets", () => {
    const document = buildCanonicalDocument(
      record({
        body: "![one](/api/files/local/blog/assets/a.png)\n![two](./assets/b.png)\n![web](https://x.test/c.png)",
      })
    );
    const text = new TextDecoder().decode(document.bytes);
    expect(text).toContain("![one](./assets/a.png)");
    expect(text).toContain("![two](./assets/b.png)");
    expect(text).toContain("![web](https://x.test/c.png)");
    expect(document.media).toEqual(["blog/assets/a.png", "blog/assets/b.png"]);

    const withSheet = buildCanonicalDocument(record({ body: "![x](./assets/calc.xlsx)" }));
    expect(withSheet.media).toEqual(["blog/assets/calc.xlsx"]);
  });

  test("keeps page links and malformed links out of the media list", () => {
    const document = buildCanonicalDocument(
      record({
        body: [
          "[first version](../usb-hub-for-electronic-lovers)",
          "[driver](./(https:/github.com/IvanLi-CN/bq769x0-async-rs))",
          "![cover](./assets/cover.png)",
        ].join("\n"),
        image: "./assets/cover.png",
      })
    );
    const text = new TextDecoder().decode(document.bytes);
    expect(text).toContain("[first version](../usb-hub-for-electronic-lovers)");
    expect(text).toContain("[driver](./(https:/github.com/IvanLi-CN/bq769x0-async-rs))");
    expect(document.media).toEqual(["blog/assets/cover.png"]);
  });

  test("keeps the content path stable and rejects traversal", () => {
    expect(canonicalContentPath({ type: "post", slug: "hi", filePath: "" })).toBe("blog/hi.md");
    expect(canonicalContentPath({ type: "post", slug: "hi", filePath: "Hardware/旧笔记.md" })).toBe(
      "blog/hi.md"
    );
    expect(canonicalContentPath({ type: "memo", slug: "m", filePath: "Memos/m.md" })).toBe(
      "Memos/m.md"
    );
    expect(() => canonicalContentPath({ type: "post", slug: "..", filePath: "x.md" })).toThrow();
  });

  test("produces a stable content hash for identical input", () => {
    const first = buildCanonicalDocument(record());
    const second = buildCanonicalDocument(record({ body: "Body text  \n" }));
    expect(first.contentHash).toBe(second.contentHash);
  });
});
