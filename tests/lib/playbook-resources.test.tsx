import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import PlaybookResourceBrowser from "@/components/playbook/PlaybookResourceBrowser";
import { publicResourceFixture } from "@/lib/playbook/resource-fixture";
import {
  createPlaybookFileTree,
  parsePlaybookMarkdownFile,
  playbookFileLanguage,
  resolvePlaybookFileLink,
} from "@/lib/playbook/resources";

const parse = (html: string) => {
  const doc = new Window().document;
  doc.body.innerHTML = html;
  return doc;
};

describe("public Skill file previews", () => {
  test("separates YAML and JSON frontmatter from Markdown while preserving exact source", () => {
    const files = [
      {
        path: "SKILL.md",
        kind: "markdown",
        content:
          '---\n{"name":"Safe Release","description":"<script>alert(1)</script>","visibility":"public"}\n---\n\n# 发布规则\n\n规则正文。\n',
      },
      {
        path: "references/guide.md",
        kind: "reference",
        content:
          "\uFEFF---\r\nname: YAML Guide\r\ndescription: |\r\n  第一行\r\n  第二行\r\ndate: 2026-09-01\r\nenabled: false\r\ntags: [release, stable]\r\nowner:\r\n  team: public\r\n...\r\n# 发布规则\r\n\r\n规则正文。\r\n",
      },
    ];
    const doc = parse(
      renderToStaticMarkup(
        <PlaybookResourceBrowser
          id="frontmatter-files"
          files={files}
          resourceHref={(path) => `/fixed-edition/${path}`}
        />
      )
    );
    const panels = doc.querySelectorAll("[data-playbook-file-panel]");
    files.forEach((file, index) => {
      const panel = panels[index];
      const reading = panel.querySelector("[data-playbook-file-reading]");
      expect(reading?.querySelector("h1")?.textContent).toBe("发布规则");
      expect(reading?.querySelectorAll("h2, hr")).toHaveLength(0);
      expect(panel.querySelector("[data-playbook-file-source] code")?.textContent).toBe(
        file.content
      );
      expect(panel.querySelector("a[download]")?.getAttribute("href")).toBe(
        `/fixed-edition/${file.path}`
      );
    });
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    const metadata = panels[1].querySelector('[aria-label="文件元数据"]');
    const values = Object.fromEntries(
      Array.from(metadata?.querySelectorAll("div") ?? []).map((row) => [
        row.querySelector("dt")?.textContent,
        row.querySelector("dd")?.textContent,
      ])
    );
    expect(values.name).toBe("YAML Guide");
    expect(values.description).toBe("第一行\n第二行\n");
    expect(values.date).toBe("2026-09-01");
    expect(values.enabled).toBe("false");
    expect(JSON.parse(values.tags ?? "null")).toEqual(["release", "stable"]);
    expect(JSON.parse(values.owner ?? "null")).toEqual({ team: "public" });
  });

  test("keeps malformed or unsupported frontmatter readable without executing it", () => {
    for (const frontmatter of [
      "name: [broken",
      "name: first\nname: second",
      `run: !!js/function 'function () { throw new Error("executed"); }'`,
      "cycle: &self [*self]",
      "- sequence instead of metadata",
    ]) {
      const content = `---\n${frontmatter}\n---\n\n# 正文保留\n`;
      const doc = parse(
        renderToStaticMarkup(
          <PlaybookResourceBrowser
            id="invalid-frontmatter"
            files={[{ path: "invalid.md", kind: "markdown", content }]}
            resourceHref={(path) => `/fixed/${path}`}
          />
        )
      );
      const reading = doc.querySelector("[data-playbook-file-reading]");
      expect(reading?.textContent).toContain("文件元数据无法解析，已保留原文。");
      expect(reading?.querySelector(".playbook-file-frontmatter-raw")?.textContent).toContain(
        frontmatter
      );
      expect(reading?.querySelector("h1")?.textContent).toBe("正文保留");
      expect(doc.querySelector("[data-playbook-file-source] code")?.textContent).toBe(content);
      expect(doc.querySelectorAll("script")).toHaveLength(0);
    }
  });

  test("only recognizes a complete frontmatter block at the start of a file", () => {
    for (const body of [
      "# 标题\n\n---\n\n正文。\n",
      "正文\n\n---\nname: Body content\n---\n",
      "```yaml\n---\nname: Example\n---\n```\n",
      "---\nname: No closing delimiter\n",
    ]) {
      expect(parsePlaybookMarkdownFile(body).body).toBe(body);
      expect(parsePlaybookMarkdownFile(body).metadata).toEqual([]);
    }
    for (const frontmatter of ["", "# Only a metadata comment\n", "null\n"]) {
      const empty = parsePlaybookMarkdownFile(`---\n${frontmatter}---\n# 正文\n`);
      expect(empty.body).toBe("# 正文\n");
      expect(empty.metadata).toEqual([]);
      expect(empty.unparsedFrontmatter).toBeUndefined();
    }
  });

  test("renders highlighted exact source in SSR without executing or parsing source as HTML", () => {
    const content =
      'const html = "<script>alert(1)</script><br>";\nconst escaped = "\\\\_\\\\#";\n// ``` not a Markdown fence\n';
    const html = renderToStaticMarkup(
      <PlaybookResourceBrowser
        id="safe-files"
        files={[{ path: "sample.js", kind: "script", content }]}
        resourceHref={(path) => `/fixed-edition/${path}`}
      />
    );
    const doc = parse(html);
    expect(doc.querySelector("pre code")?.textContent).toBe(content);
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(doc.querySelectorAll(".hljs-keyword").length).toBeGreaterThan(0);
    expect(doc.querySelector("a[download]")?.getAttribute("href")).toBe("/fixed-edition/sample.js");
    expect(doc.querySelector("[data-playbook-file-panel]")?.hasAttribute("open")).toBe(true);
  });

  test("keeps every public file readable without JavaScript and preserves plaintext", () => {
    const html = renderToStaticMarkup(
      <PlaybookResourceBrowser
        id="all-files"
        files={publicResourceFixture}
        resourceHref={(path) => `/fixed/${path}`}
      />
    );
    const doc = parse(html);
    expect(doc.querySelectorAll("[data-playbook-file-panel]")).toHaveLength(
      publicResourceFixture.length
    );
    expect(
      Array.from(doc.querySelectorAll(".playbook-file-fallback-summary")).map(
        (node) => node.textContent
      )
    ).toEqual(publicResourceFixture.map((file) => file.path));
    expect(doc.querySelector(".language-text")?.textContent).toBe(
      publicResourceFixture.find((file) => file.path === "NOTICE")?.content
    );
    expect(doc.querySelectorAll(".language-json .hljs-attr").length).toBeGreaterThan(0);
    expect(doc.querySelector("[data-playbook-file-reading] h1")?.textContent).toBe("发布核对");
  });

  test("resolves nested references only to actual files inside this Skill", () => {
    expect(
      resolvePlaybookFileLink(
        "references/release-guide.md",
        "../scripts/verify.sh",
        publicResourceFixture
      )
    ).toBe(0);
    expect(
      resolvePlaybookFileLink(
        "references/advanced/recovery.md",
        "../release-guide.md",
        publicResourceFixture
      )
    ).toBe(1);
    for (const url of [
      "../../outside.md",
      "../private.md",
      "https://example.com/file.md",
      "javascript:alert(1)",
    ])
      expect(
        resolvePlaybookFileLink("references/release-guide.md", url, publicResourceFixture)
      ).toBeUndefined();
    expect(playbookFileLanguage("NOTICE")).toBe("text");
    expect(playbookFileLanguage("scripts/verify.sh")).toBe("bash");
    const tree = createPlaybookFileTree(publicResourceFixture);
    expect(
      tree
        .find((node) => node.name === "references")
        ?.children?.some((node) => node.name === "advanced")
    ).toBe(true);
  });
});
