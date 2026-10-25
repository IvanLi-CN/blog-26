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
      `/api/public/assets/post/posts-cover-fallback/${expectedHash}/wm-b-v4/content.webp`
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
      `/api/public/assets/memo/demo-memo/${expectedHash}/wm-b-v4/content.webp`
    );
    expect(img.properties?.["data-original-src"]).toBe(
      `/api/public/assets/memo/demo-memo/${expectedHash}/wm-b-v4/content.webp`
    );
  });

  it("keeps legacy facade URLs when the snapshot has no responsive presentations", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: { src: "./assets/legacy.png" },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      articlePath: "blog/legacy-post.md",
      contentSource: "local",
      publicMediaContext: {
        kind: "post",
        slug: "legacy-post",
        filePath: "blog/legacy-post.md",
        supportsResponsiveWatermark: false,
      },
    });

    plugin(tree, { path: "blog/legacy-post.md" } as any);

    const img = tree.children[0] as Element;
    expect(img.properties?.src).toContain("/api/public/assets/post/legacy-post/");
    expect(img.properties?.src).toContain("/content.webp");
    expect(img.properties?.src).not.toContain("/wm-");
    expect(img.properties?.["data-watermark-a"]).toBeUndefined();
    expect(img.properties?.["data-watermark-b"]).toBeUndefined();
  });

  it("restores finite renditions for versioned facade urls in rewritten snapshots", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: "/api/public/assets/post/demo-post/abcd1234/wm-b-v2/content.webp",
          },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      publicMediaContext: {
        kind: "post",
        slug: "demo-post",
        filePath: "blog/demo-post.md",
      },
    });

    plugin(tree, { path: "blog/demo-post.md" } as any);

    const img = tree.children[0] as Element;
    expect(img.properties?.["data-watermark-a"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-a-v2/content.webp"
    );
    expect(img.properties?.["data-watermark-b"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-b-v2/content.webp"
    );
    expect(img.properties?.["data-watermark-full-a"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-a-v2/full.webp"
    );
    expect(img.properties?.["data-watermark-full-b"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-b-v2/full.webp"
    );
  });

  it("preserves the v1 candidate family for legacy snapshots", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: "/api/public/assets/post/demo-post/abcd1234/wm-b-v1/content.webp",
          },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      publicMediaContext: {
        kind: "post",
        slug: "demo-post",
        filePath: "blog/demo-post.md",
      },
    });

    plugin(tree, { path: "blog/demo-post.md" } as any);

    const img = tree.children[0] as Element;
    expect(img.properties?.["data-watermark-a"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-a-v1/content.webp"
    );
    expect(img.properties?.["data-watermark-b"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-b-v1/content.webp"
    );
    expect(img.properties?.["data-watermark-full-a"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-a-v1/full.webp"
    );
    expect(img.properties?.["data-watermark-full-b"]).toBe(
      "/api/public/assets/post/demo-post/abcd1234/wm-b-v1/full.webp"
    );
  });

  it("keeps packaged static asset urls stable during public hydration", () => {
    const staticAsset =
      "/_content/assets/post/demo-post/abcd1234/wm-b-v2/content.webp?v=snapshot-1";
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: { src: staticAsset },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      publicMediaContext: {
        kind: "post",
        slug: "demo-post",
        filePath: "blog/demo-post.md",
      },
    });

    plugin(tree, { path: "blog/demo-post.md" } as any);

    const img = tree.children[0] as Element;
    expect(img.properties?.src).toBe(staticAsset);
    expect(img.properties?.["data-original-src"]).toBe(staticAsset);
    expect(img.properties?.["data-watermark-a"]).toBe(
      "/_content/assets/post/demo-post/abcd1234/wm-a-v2/content.webp?v=snapshot-1"
    );
    expect(img.properties?.["data-watermark-b"]).toBe(staticAsset);
    expect(img.properties?.["data-watermark-full-a"]).toBe(
      "/_content/assets/post/demo-post/abcd1234/wm-a-v2/full.webp?v=snapshot-1"
    );
    expect(img.properties?.["data-watermark-full-b"]).toBe(
      "/_content/assets/post/demo-post/abcd1234/wm-b-v2/full.webp?v=snapshot-1"
    );
  });

  it("adds finite A/B poster candidates for public videos", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "video",
          properties: {
            poster: "./assets/preview.jpg",
          },
          children: [],
        } as Element,
      ],
    };

    const plugin = rehypeImageOptimization({
      articlePath: "blog/demo-post.md",
      contentSource: "local",
      publicMediaContext: {
        kind: "post",
        slug: "demo-post",
        filePath: "blog/demo-post.md",
      },
      publicAssetVersion: "snapshot-1",
    });

    plugin(tree, { path: "blog/demo-post.md" } as any);

    const video = tree.children[0] as Element;
    const expectedHash = buildPublicMediaHash("blog/assets/preview.jpg", "content");
    expect(video.properties?.poster).toBe(
      `/api/public/assets/post/demo-post/${expectedHash}/wm-b-v4/content.webp?v=snapshot-1`
    );
    expect(video.properties?.["data-watermark-poster-a"]).toBe(
      `/api/public/assets/post/demo-post/${expectedHash}/wm-a-v4/content.webp?v=snapshot-1`
    );
    expect(video.properties?.["data-watermark-poster-b"]).toBe(
      `/api/public/assets/post/demo-post/${expectedHash}/wm-b-v4/content.webp?v=snapshot-1`
    );
  });

  it("maps version-relative clipping media before generic public media optimization", () => {
    const filename = `${"a".repeat(64)}.png`;
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: `./assets/${filename}`,
            srcSet: `./assets/${filename} 1x`,
          },
          children: [],
        } as Element,
        {
          type: "element",
          tagName: "video",
          properties: { poster: `./assets/${filename}` },
          children: [
            {
              type: "element",
              tagName: "source",
              properties: { src: `./assets/${filename}` },
              children: [],
            } as Element,
          ],
        } as Element,
        {
          type: "element",
          tagName: "audio",
          properties: { src: `./assets/${filename}` },
          children: [],
        } as Element,
      ],
    };
    const resourceBaseUrl = "/api/public/memos/clip/clipping/assets/version-1/";

    rehypeImageOptimization({
      articlePath: "Memos/clip.md",
      contentSource: "local",
      publicMediaContext: {
        kind: "memo",
        slug: "clip",
        filePath: "Memos/clip.md",
      },
      mapContentUrl: (url) =>
        url.startsWith("./assets/") ? `${resourceBaseUrl}${url.slice("./assets/".length)}` : url,
    })(tree, { path: "Memos/clip.md" } as any);

    const image = tree.children[0] as Element;
    const video = tree.children[1] as Element;
    const source = video.children[0] as Element;
    const audio = tree.children[2] as Element;
    expect(image.properties?.src).toBe(`${resourceBaseUrl}${filename}`);
    expect(image.properties?.srcSet).toBe(`${resourceBaseUrl}${filename} 1x`);
    expect(video.properties?.poster).toBe(`${resourceBaseUrl}${filename}`);
    expect(source.properties?.src).toBe(`${resourceBaseUrl}${filename}`);
    expect(audio.properties?.src).toBe(`${resourceBaseUrl}${filename}`);
  });
});
