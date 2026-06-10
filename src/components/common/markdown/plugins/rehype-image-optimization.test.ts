import { describe, expect, it } from "bun:test";
import type { Element, Root } from "hast";
import { buildPublicMediaHash } from "@/lib/public-media";
import { rehypeImageOptimization } from "./rehype-image-optimization";

describe("rehypeImageOptimization", () => {
  it("should resolve WebDAV blog images relative to markdown file path", () => {
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
      contentSource: "webdav",
    });

    // 第二个参数只在插件内部用于兜底获取路径，这里提供最小的兼容对象即可
    plugin(tree, { path: "blog/06-svg-image-test.md" } as any);

    const img = tree.children[0] as Element;
    expect(img.properties?.src).toBe("/api/files/webdav/blog/assets/svg-test-diagram.svg");
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
});
