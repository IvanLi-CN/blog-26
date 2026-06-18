import { describe, expect, it } from "bun:test";
import { resolveContentMediaPath } from "@/lib/public-media";

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
  });
});
