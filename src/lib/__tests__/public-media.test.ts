import { describe, expect, it } from "bun:test";
import {
  buildPublicMediaAssetUrl,
  buildPublicMediaPresentations,
  resolveContentMediaPath,
  rewritePublicContentMediaUrls,
  supportsPublicMediaPresentations,
} from "@/lib/public-media";

describe("public-media", () => {
  describe("resolveContentMediaPath", () => {
    it("decodes encoded path segments before resolving local media paths", () => {
      expect(
        resolveContentMediaPath(
          "assets/SW2303+INA138%20实现高侧检流的原理图_9fee4a4e-8bd7-4eab-811d-45a1f83d8f86.png",
          "Hardware/造一个支持隔离、PD 供电的全速 USB-C HUB Rev.2.md"
        )
      ).toBe(
        "Hardware/assets/SW2303+INA138 实现高侧检流的原理图_9fee4a4e-8bd7-4eab-811d-45a1f83d8f86.png"
      );
    });

    it("preserves undecodable segments instead of throwing", () => {
      expect(resolveContentMediaPath("./assets/100%bad.png", "blog/post.md")).toBe(
        "blog/assets/100%bad.png"
      );
    });

    it("rejects encoded forward slashes before they can become traversal separators", () => {
      expect(resolveContentMediaPath("assets%2f..%2f..%2fsecret.png", "blog/post.md")).toBeNull();
    });

    it("rejects encoded backslashes before they can become traversal separators", () => {
      expect(resolveContentMediaPath("assets%5C..%5Csecret.png", "blog/post.md")).toBeNull();
    });

    it("rejects encoded dot segments before they can become traversal operators", () => {
      expect(resolveContentMediaPath("assets/%2e%2e/%2e%2e/secret.png", "blog/post.md")).toBeNull();
      expect(resolveContentMediaPath("assets/.%2E/secret.png", "blog/post.md")).toBeNull();
    });

    it("collapses plain dot segments while rejecting traversal above the content root", () => {
      expect(resolveContentMediaPath("assets/../secret.png", "blog/post.md")).toBe(
        "blog/secret.png"
      );
      expect(resolveContentMediaPath("../../secret.png", "blog/post.md")).toBeNull();
      expect(resolveContentMediaPath("/../secret.png", "blog/post.md")).toBeNull();
    });

    it("treats legacy /api/files paths as content-root-relative media paths", () => {
      expect(
        resolveContentMediaPath("/api/files/webdav/Memos/assets/inline-123.png", "Memos/demo.md")
      ).toBe("Memos/assets/inline-123.png");
    });
  });

  describe("rewritePublicContentMediaUrls", () => {
    it("rewrites legacy files-api markdown images to facade urls", () => {
      const content = "![inline](/api/files/webdav/Memos/assets/inline-123.png)";
      const rewritten = rewritePublicContentMediaUrls(content, {
        kind: "memo",
        slug: "demo-memo",
        filePath: "Memos/demo.md",
      });

      expect(rewritten).toContain("/api/public/assets/memo/demo-memo/");
      expect(rewritten).not.toContain("/api/files/");
    });

    it("rewrites legacy files-api html video and poster urls to facade urls", () => {
      const content =
        '<video controls src="/api/files/webdav/Memos/assets/clip.mp4" poster="/api/files/webdav/Memos/assets/poster.png"></video>';
      const rewritten = rewritePublicContentMediaUrls(content, {
        kind: "memo",
        slug: "demo-memo",
        filePath: "Memos/demo.md",
      });

      expect(rewritten).toContain("/api/public/assets/memo/demo-memo/");
      expect(rewritten).not.toContain("/api/files/");
      expect(rewritten).toContain("/play.mp4");
      expect(rewritten).toContain("/content.webp");
    });

    it("rewrites markdown media links to indexed facade urls", () => {
      const content = ["[photo](./assets/photo.png)", '[clip](./assets/clip.mp4 "Demo clip")'].join(
        "\n"
      );
      const rewritten = rewritePublicContentMediaUrls(content, {
        kind: "post",
        slug: "demo-post",
        filePath: "blog/demo-post.md",
      });

      expect(rewritten).toContain("/api/public/assets/post/demo-post/");
      expect(rewritten).toContain("/content.webp");
      expect(rewritten).toContain("/play.mp4");
      expect(rewritten).not.toContain("./assets/photo.png");
      expect(rewritten).not.toContain("./assets/clip.mp4");
    });

    it("rewrites admin preview markdown media links to the admin preview assets facade", () => {
      const content = "![photo](./assets/photo.png)";
      const rewritten = rewritePublicContentMediaUrls(content, {
        kind: "post",
        slug: "demo-post",
        filePath: "blog/demo-post.md",
        assetScope: "admin-preview",
      });

      expect(rewritten).toContain("/api/admin/preview/assets/post/demo-post/");
      expect(rewritten).not.toContain("/api/public/assets/post/demo-post/");
    });

    it("rewrites html anchor media links to indexed facade urls", () => {
      const content = [
        '<a href="./assets/photo.png">Photo</a>',
        '<a href="./assets/clip.mp4#watch">Clip</a>',
      ].join("\n");
      const rewritten = rewritePublicContentMediaUrls(content, {
        kind: "memo",
        slug: "demo-memo",
        filePath: "Memos/demo.md",
      });

      expect(rewritten).toContain("/api/public/assets/memo/demo-memo/");
      expect(rewritten).toContain("/content.webp");
      expect(rewritten).toContain("/play.mp4");
      expect(rewritten).not.toContain("./assets/photo.png");
      expect(rewritten).not.toContain("./assets/clip.mp4#watch");
    });
  });

  describe("watermark presentations", () => {
    const context = {
      kind: "post" as const,
      slug: "demo-post",
      filePath: "blog/demo-post.md",
    };

    it("uses A for cards and B for larger usage defaults", () => {
      expect(
        buildPublicMediaAssetUrl({
          context,
          mediaPath: "./assets/photo.png",
          role: "content",
          variant: "card",
        })
      ).toContain("/wm-a-v2/card.webp");
      expect(
        buildPublicMediaAssetUrl({
          context,
          mediaPath: "./assets/photo.png",
          role: "content",
          variant: "content",
        })
      ).toContain("/wm-b-v2/content.webp");
    });

    it("enumerates A/B candidates from an already normalized source path", () => {
      const presentations = buildPublicMediaPresentations({
        context,
        mediaPath: "blog/assets/photo.png",
        sourcePath: "blog/assets/photo.png",
        role: "content",
        variant: "content",
      });

      expect(presentations).toEqual({
        a: expect.stringContaining("/demo-post/"),
        b: expect.stringContaining("/demo-post/"),
      });
      expect(presentations?.a).toContain("/wm-a-v2/content.webp");
      expect(presentations?.b).toContain("/wm-b-v2/content.webp");
      expect(presentations?.a).not.toContain("/blog/blog/");
    });

    it("keeps admin defaults on the legacy path while accepting explicit candidates", () => {
      const adminContext = { ...context, assetScope: "admin-preview" as const };
      expect(
        buildPublicMediaAssetUrl({
          context: adminContext,
          mediaPath: "./assets/photo.png",
          role: "content",
          variant: "content",
        })
      ).toContain("/content.webp");
      expect(
        buildPublicMediaAssetUrl({
          context: adminContext,
          mediaPath: "./assets/photo.png",
          role: "content",
          variant: "content",
        })
      ).not.toContain("/wm-");
      expect(
        buildPublicMediaAssetUrl({
          context: adminContext,
          mediaPath: "./assets/photo.png",
          role: "content",
          variant: "content",
          renderId: "wm-b-v1",
        })
      ).toContain("/wm-b-v1/content.webp");
    });

    it("keeps a legacy snapshot on the base facade path", () => {
      expect(
        buildPublicMediaAssetUrl({
          context: { ...context, supportsResponsiveWatermark: false },
          mediaPath: "./assets/photo.png",
          role: "content",
          variant: "content",
        })
      ).toContain("/content.webp");
      expect(
        buildPublicMediaAssetUrl({
          context: { ...context, supportsResponsiveWatermark: false },
          mediaPath: "./assets/photo.png",
          role: "content",
          variant: "content",
        })
      ).not.toContain("/wm-");
    });

    it("does not treat legacy v1 candidates as current responsive support", () => {
      const item = {
        hash: "abc123",
        kind: "image" as const,
        role: "content" as const,
        alt: null,
        sourcePath: "blog/assets/photo.png",
        variants: {},
        presentations: {
          content: {
            a: "/api/public/assets/post/demo-post/abc123/wm-a-v1/content.webp",
            b: "/api/public/assets/post/demo-post/abc123/wm-b-v1/content.webp",
          },
          full: {
            a: "/api/public/assets/post/demo-post/abc123/wm-a-v1/full.webp",
            b: "/api/public/assets/post/demo-post/abc123/wm-b-v1/full.webp",
          },
        },
        poster: null,
        playback: null,
        sources: [],
      };

      expect(
        supportsPublicMediaPresentations({
          primary: null,
          cover: null,
          content: [item],
          attachments: [],
        })
      ).toBe(false);
    });

    it("accepts complete current v2 candidates", () => {
      const item = {
        hash: "abc123",
        kind: "image" as const,
        role: "content" as const,
        alt: null,
        sourcePath: "blog/assets/photo.png",
        variants: {},
        presentations: {
          content: {
            a: "/api/public/assets/post/demo-post/abc123/wm-a-v2/content.webp",
            b: "/api/public/assets/post/demo-post/abc123/wm-b-v2/content.webp",
          },
          full: {
            a: "/api/public/assets/post/demo-post/abc123/wm-a-v2/full.webp",
            b: "/api/public/assets/post/demo-post/abc123/wm-b-v2/full.webp",
          },
        },
        poster: null,
        playback: null,
        sources: [],
      };

      expect(
        supportsPublicMediaPresentations({
          primary: null,
          cover: null,
          content: [item],
          attachments: [],
        })
      ).toBe(true);
    });
  });
});
