import { describe, expect, it } from "bun:test";
import type { Element, Root } from "hast";
import { buildPublicMediaHash } from "@/lib/public-media";
import { rehypeImageOptimization } from "./rehype-image-optimization";

describe("rehypeImageOptimization", () => {
  it("should resolve local blog images relative to markdown file path", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: "./assets/svg-test-diagram.svg",
          },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      articlePath: "blog/06-svg-image-test.md",
      contentSource: "local",
    });

    // 第二个参数只在插件内部用于兜底获取路径，这里提供最小的兼容对象即可
    plugin(tree, { path: "blog/06-svg-image-test.md" } as any);

    const img = tree.children[0] as Element;
    expect(img.properties?.src).toBe("/api/files/local/blog/assets/svg-test-diagram.svg");
  });

  it("builds facade urls from the original relative media path in public mode", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: "./assets/hello-world.jpg",
          },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      articlePath: "blog/06-posts-cover-fallback.md",
      contentSource: "local",
      publicMediaContext: {
        kind: "post",
        slug: "posts-cover-fallback",
        filePath: "blog/06-posts-cover-fallback.md",
      },
    });

    plugin(tree, { path: "blog/06-posts-cover-fallback.md" } as any);

    const img = tree.children[0] as Element;
    const expectedHash = buildPublicMediaHash("blog/assets/hello-world.jpg", "content");
    expect(img.properties?.src).toBe(
      `/api/public/assets/post/posts-cover-fallback/${expectedHash}/content.webp`
    );
  });

  it("rewrites legacy files-api image urls to public facade urls in public mode", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: "/api/files/webdav/Memos/assets/inline-123.png",
          },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      articlePath: "Memos/demo.md",
      contentSource: "local",
      publicMediaContext: {
        kind: "memo",
        slug: "demo-memo",
        filePath: "Memos/demo.md",
      },
    });

    plugin(tree, { path: "Memos/demo.md" } as any);

    const img = tree.children[0] as Element;
    const expectedHash = buildPublicMediaHash("Memos/assets/inline-123.png", "content");
    expect(img.properties?.src).toBe(
      `/api/public/assets/memo/demo-memo/${expectedHash}/content.webp`
    );
    expect(img.properties?.["data-original-src"]).toBe(
      `/api/public/assets/memo/demo-memo/${expectedHash}/content.webp`
    );
  });
});
