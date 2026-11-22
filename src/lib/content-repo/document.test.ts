import { describe, expect, test } from "bun:test";
import { buildCanonicalDocument } from "./canonical";
import { parseRemoteDocument, RemoteDocumentInvalidError, toDocumentUpdate } from "./document";

const encoder = new TextEncoder();

function canonicalBody() {
  const document = buildCanonicalDocument({
    id: "blog/hello.md",
    type: "post",
    slug: "hello",
    title: "Hello",
    excerpt: null,
    body: "第一段\n\n第二段",
    draft: false,
    public: true,
    category: "notes",
    tags: JSON.stringify(["alpha"]),
    author: "Ivan",
    image: null,
    publishDate: Date.UTC(2026, 0, 2),
    updateDate: null,
    filePath: "blog/hello.md",
    metadata: null,
  });
  return new TextDecoder().decode(document.bytes);
}

describe("remote document parsing", () => {
  test("round-trips the canonical form", () => {
    const parsed = parseRemoteDocument(encoder.encode(canonicalBody()));
    const update = toDocumentUpdate(parsed);
    expect(update).toMatchObject({
      slug: "hello",
      title: "Hello",
      draft: false,
      public: true,
      category: "notes",
      tags: ["alpha"],
      author: "Ivan",
      body: "第一段\n\n第二段",
    });
    expect(new Date(update.publishDate).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  test("rejects a document without frontmatter", () => {
    expect(() => parseRemoteDocument(encoder.encode("just a body"))).toThrow(
      RemoteDocumentInvalidError
    );
  });

  test("rejects a document missing required fields", () => {
    const text = "---\ntitle: Hello\ndraft: false\npublic: true\ndate: 2026-01-02\n---\nbody\n";
    expect(() => toDocumentUpdate(parseRemoteDocument(encoder.encode(text)))).toThrow(
      /missing slug/u
    );
  });

  test("rejects non-boolean visibility", () => {
    const text =
      "---\ntitle: Hello\nslug: hello\ndraft: no\npublic: yes\ndate: 2026-01-02\n---\nbody\n";
    expect(() => toDocumentUpdate(parseRemoteDocument(encoder.encode(text)))).toThrow(
      /not a boolean/u
    );
  });
});
