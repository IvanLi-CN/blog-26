import { describe, expect, it } from "bun:test";
import {
  hasApiFilesReference,
  normalizePersistedLink,
  rebasePersistedLocalLinks,
  rebasePersistedLocalReferences,
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
        normalizePersistedLink("/api/files/local/blog/assets/a.png", "blog/hello-world.md")
      ).toBe("./assets/a.png");
      expect(
        normalizePersistedLink("/api/files/local/assets/shared/logo.png", "blog/hello-world.md")
      ).toBe("../assets/shared/logo.png");
    });

    it("preserves query/hash suffixes", () => {
      expect(
        normalizePersistedLink("/api/files/local/blog/assets/a.png?x=1#frag", "blog/hello-world.md")
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

    it("keeps site-absolute links unchanged", () => {
      expect(toRuntimeFileApiUrl("/blog/assets/a.png", "local", "blog/hello-world.md")).toBe(
        "/blog/assets/a.png"
      );
      expect(toRuntimeFileApiUrl("/search", "local", "blog/hello-world.md")).toBe("/search");
      expect(toRuntimeFileApiUrl("/posts/hello-world/", "local", "blog/hello-world.md")).toBe(
        "/posts/hello-world/"
      );
      expect(toRuntimeFileApiUrl("/feed.xml", "local", "blog/hello-world.md")).toBe("/feed.xml");
    });

    it("rejects paths that escape content root", () => {
      expect(toRuntimeFileApiUrl("../../x.png", "local", "blog/hello-world.md")).toBeNull();
    });
  });

  describe("rewriteApiFilesUrlsToRelative", () => {
    it("rewrites /api/files urls inside markdown content", () => {
      const input = "![a](/api/files/local/blog/assets/a.png)";
      const { content, changed } = rewriteApiFilesUrlsToRelative(input, "blog/hello-world.md");
      expect(changed).toBeTruthy();
      expect(content).toBe("![a](./assets/a.png)");
    });

    it("rewrites /api/files urls with parentheses in filenames", () => {
      const input = "![a](/api/files/local/blog/assets/photo%20(1).png)";
      const { content, changed } = rewriteApiFilesUrlsToRelative(input, "blog/hello-world.md");
      expect(changed).toBeTruthy();
      expect(content).toBe("![a](./assets/photo%20(1).png)");
    });
  });

  describe("rebasePersistedLocalLinks", () => {
    it("keeps markdown-relative assets pointing to the same runtime file after moving", () => {
      const input = [
        "---",
        "image: ./assets/cover.png",
        "---",
        "",
        "![cover](./assets/cover.png)",
        "![photo](./assets/photo%20(1).png)",
        "![ref][cover-ref]",
        '[cover-ref]: ./assets/reference.png "Reference title"',
        '<img src="./assets/html.png" srcset="./assets/html-small.png 1x, ./assets/html-large.png 2x">',
        '<a href="../shared/spec.pdf">Spec</a>',
        "![absolute](/blog/docs/assets/absolute.png)",
        "[search](/search)",
        '<a href="/posts/hello-world/">Post</a>',
        '<a href="/feed.xml">Feed</a>',
        '<a href="/downloads/manual.pdf">Manual</a>',
        "![shared](../shared/logo.png)",
        "![[./assets/wiki.png|1200]]",
        "![remote](https://example.com/a.png)",
      ].join("\n");

      const { content, changed } = rebasePersistedLocalLinks(
        input,
        "blog/docs/post.md",
        "blog/archive/post.md"
      );

      expect(changed).toBeTrue();
      expect(content).toContain("image: ../docs/assets/cover.png");
      expect(content).toContain("![cover](../docs/assets/cover.png)");
      expect(content).toContain("![photo](../docs/assets/photo%20(1).png)");
      expect(content).toContain('[cover-ref]: ../docs/assets/reference.png "Reference title"');
      expect(content).toContain(
        '<img src="../docs/assets/html.png" srcset="../docs/assets/html-small.png 1x, ../docs/assets/html-large.png 2x">'
      );
      expect(content).toContain('<a href="../shared/spec.pdf">Spec</a>');
      expect(content).toContain("![absolute](../docs/assets/absolute.png)");
      expect(content).toContain("[search](/search)");
      expect(content).toContain('<a href="/posts/hello-world/">Post</a>');
      expect(content).toContain('<a href="/feed.xml">Feed</a>');
      expect(content).toContain('<a href="/downloads/manual.pdf">Manual</a>');
      expect(content).toContain("![shared](../shared/logo.png)");
      expect(content).toContain("![[../docs/assets/wiki.png|1200]]");
      expect(content).toContain("![remote](https://example.com/a.png)");
    });
  });

  describe("rebasePersistedLocalReferences", () => {
    it("updates links that point at a moved local file", () => {
      const input = [
        "---",
        "image: ./assets/cover.png?v=2",
        "---",
        "",
        "![cover](./assets/cover.png#hero)",
        "![photo](./assets/photo%20(1).png)",
        "![ref][cover-ref]",
        '[cover-ref]: ./assets/reference.png "Reference title"',
        '<img src="./assets/html.png" srcset="./assets/html-small.png 1x, ./assets/html-large.png 2x">',
        '<a href="https://example.com/file.pdf">External</a>',
        "![[./assets/wiki.png|1200]]",
      ].join("\n");

      const { content, changed } = rebasePersistedLocalReferences(
        input,
        "blog/post.md",
        "blog/assets",
        "blog/archive/assets"
      );

      expect(changed).toBeTrue();
      expect(content).toContain("image: ./archive/assets/cover.png?v=2");
      expect(content).toContain("![cover](./archive/assets/cover.png#hero)");
      expect(content).toContain("![photo](./archive/assets/photo%20(1).png)");
      expect(content).toContain('[cover-ref]: ./archive/assets/reference.png "Reference title"');
      expect(content).toContain(
        '<img src="./archive/assets/html.png" srcset="./archive/assets/html-small.png 1x, ./archive/assets/html-large.png 2x">'
      );
      expect(content).toContain('<a href="https://example.com/file.pdf">External</a>');
      expect(content).toContain("![[./archive/assets/wiki.png|1200]]");
    });

    it("updates supported content-root absolute asset links", () => {
      const input = [
        "---",
        "image: /blog/assets/cover.png",
        "---",
        "",
        "![cover](/blog/assets/cover.png)",
        '<img src="/blog/assets/html.png" srcset="/blog/assets/html-small.png 1x, /blog/assets/html-large.png 2x">',
        "![[/blog/assets/wiki.png|1200]]",
        "[search](/search)",
        '<a href="/posts/hello-world/">Post</a>',
        '<a href="/feed.xml">Feed</a>',
        '<a href="/downloads/manual.pdf">Manual</a>',
      ].join("\n");

      const { content, changed } = rebasePersistedLocalReferences(
        input,
        "blog/post.md",
        "blog/assets",
        "blog/archive/assets"
      );

      expect(changed).toBeTrue();
      expect(content).toContain("image: ./archive/assets/cover.png");
      expect(content).toContain("![cover](./archive/assets/cover.png)");
      expect(content).toContain(
        '<img src="./archive/assets/html.png" srcset="./archive/assets/html-small.png 1x, ./archive/assets/html-large.png 2x">'
      );
      expect(content).toContain("![[./archive/assets/wiki.png|1200]]");
      expect(content).toContain("[search](/search)");
      expect(content).toContain('<a href="/posts/hello-world/">Post</a>');
      expect(content).toContain('<a href="/feed.xml">Feed</a>');
      expect(content).toContain('<a href="/downloads/manual.pdf">Manual</a>');
    });
  });

  describe("hasApiFilesReference", () => {
    it("detects /api/files usage", () => {
      expect(hasApiFilesReference("ok")).toBeFalse();
      expect(hasApiFilesReference("/api/files/local/x")).toBeTrue();
    });
  });
});
