import { describe, expect, it } from "bun:test";
import {
  hasApiFilesReference,
  normalizePersistedLink,
  rewriteApiFilesUrlsToRelative,
  toRuntimeFileApiUrl,
} from "../persisted-paths";

describe("persisted-paths", () => {
  describe("normalizePersistedLink", () => {
    it("keeps already normalized relative paths", () => {
      expect(normalizePersistedLink("./assets/a.png", "blog/hello-world.md")).toBe(
        "./assets/a.png"
      );
      expect(normalizePersistedLink("../shared/a.png", "blog/hello-world.md")).toBe(
        "../shared/a.png"
      );
    });

    it("normalizes assets/ shorthand and bare filenames", () => {
      expect(normalizePersistedLink("assets/a.png", "blog/hello-world.md")).toBe("./assets/a.png");
      expect(normalizePersistedLink("a.png", "blog/hello-world.md")).toBe("./a.png");
    });

    it("converts site-absolute paths to markdown-relative", () => {
      expect(normalizePersistedLink("/assets/shared/logo.png", "blog/hello-world.md")).toBe(
        "../assets/shared/logo.png"
      );
    });

    it("converts Files API urls to markdown-relative", () => {
      expect(
        normalizePersistedLink("/api/files/webdav/blog/assets/a.png", "blog/hello-world.md")
      ).toBe("./assets/a.png");
      expect(
        normalizePersistedLink("/api/files/local/assets/shared/logo.png", "blog/hello-world.md")
      ).toBe("../assets/shared/logo.png");
    });

    it("preserves query/hash suffixes", () => {
      expect(
        normalizePersistedLink(
          "/api/files/webdav/blog/assets/a.png?x=1#frag",
          "blog/hello-world.md"
        )
      ).toBe("./assets/a.png?x=1#frag");
    });
  });

  describe("toRuntimeFileApiUrl", () => {
    it("maps persisted relative paths to /api/files/<source>/... urls", () => {
      expect(toRuntimeFileApiUrl("./assets/a.png", "local", "blog/hello-world.md")).toBe(
        "/api/files/local/blog/assets/a.png"
      );
      expect(toRuntimeFileApiUrl("../assets/shared/logo.png", "local", "blog/hello-world.md")).toBe(
        "/api/files/local/assets/shared/logo.png"
      );
    });

    it("rejects paths that escape content root", () => {
      expect(toRuntimeFileApiUrl("../../x.png", "local", "blog/hello-world.md")).toBeNull();
    });
  });

  describe("rewriteApiFilesUrlsToRelative", () => {
    it("rewrites /api/files urls inside markdown content", () => {
      const input = "![a](/api/files/webdav/blog/assets/a.png)";
      const { content, changed } = rewriteApiFilesUrlsToRelative(input, "blog/hello-world.md");
      expect(changed).toBeTruthy();
      expect(content).toBe("![a](./assets/a.png)");
    });
  });

  describe("hasApiFilesReference", () => {
    it("detects /api/files usage", () => {
      expect(hasApiFilesReference("ok")).toBeFalse();
      expect(hasApiFilesReference("/api/files/webdav/x")).toBeTrue();
    });
  });
});
