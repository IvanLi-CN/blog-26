import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractProjectToc,
  resolveProjectBody,
  resolveProjectDetailBody,
  validateProjectMdxImports,
} from "../../site/lib/project-content-utils";
import {
  getProjectCardEntries,
  getProjectPublicEntries,
  projectCatalog,
} from "../../site/lib/projects";
import { catalogOnlyProjectSlugs, migratedProjectSlugs } from "../fixtures/project-content";

describe("project content contracts", () => {
  test("migrated projects have slug-bound MDX bodies", () => {
    const contentDir = join(process.cwd(), "site/content/projects");
    const catalogSlugs = projectCatalog.map((project) => project.slug).sort();
    const classifiedSlugs = [...migratedProjectSlugs, ...catalogOnlyProjectSlugs].sort();
    expect(classifiedSlugs).toEqual(catalogSlugs);

    const mdxSlugs = readdirSync(contentDir)
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => file.replace(/\.mdx$/, ""))
      .sort();
    expect(mdxSlugs).toEqual([...migratedProjectSlugs].sort());

    for (const slug of migratedProjectSlugs) {
      const source = readFileSync(join(contentDir, `${slug}.mdx`), "utf8");
      expect(source).toMatch(new RegExp(`^---\\nslug: ${slug}\\n---\\n`));
      expect(source).toMatch(/^## /m);
      expect(source).not.toContain("项目是什么");
    }
  });

  test("missing project bodies preserve catalog-only fallback", () => {
    const compiledBodies = {
      "../content/projects/migrated.mdx": { default: "compiled body" },
    };
    const sourceBodies = {
      "../content/projects/migrated.mdx": "## One\n\n## Two\n\n## Three",
    };

    expect(resolveProjectBody("not-yet-migrated", compiledBodies, sourceBodies)).toBeNull();
    expect(resolveProjectBody("migrated", compiledBodies, sourceBodies)).toEqual({
      Content: "compiled body",
      toc: [
        { depth: 2, text: "One", slug: "one" },
        { depth: 2, text: "Two", slug: "two" },
        { depth: 2, text: "Three", slug: "three" },
      ],
    });

    expect(
      resolveProjectDetailBody(null, {
        description: "目录描述",
        highlights: ["亮点一", "亮点二"],
      })
    ).toEqual({
      kind: "catalog",
      description: "目录描述",
      highlights: ["亮点一", "亮点二"],
    });

    const detailSource = readFileSync(
      join(process.cwd(), "site/pages/projects/[slug].astro"),
      "utf8"
    );
    expect(detailSource).toContain("project-catalog-fallback");
  });

  test("card shortcuts use site, official docs, then repository precedence", () => {
    const project = projectCatalog.find((item) => item.slug === "codex-vibe-monitor");
    expect(project).toBeDefined();
    if (!project) throw new Error("Codex Vibe Monitor catalog entry is missing");
    expect(getProjectCardEntries(project)).toEqual([
      {
        kind: "site",
        label: "项目站点",
        href: "https://vibe-code.ivanli.cc/",
      },
      {
        kind: "officialDocs",
        label: "官方文档",
        href: "https://ivanli-cn.github.io/codex-vibe-monitor/",
      },
      {
        kind: "repository",
        label: "开源仓库",
        href: "https://github.com/IvanLi-CN/codex-vibe-monitor",
      },
    ]);
  });

  test("detail entries keep all available positions", () => {
    const project = projectCatalog.find((item) => item.slug === "codex-vibe-monitor");
    expect(project).toBeDefined();
    if (!project) throw new Error("Codex Vibe Monitor catalog entry is missing");
    expect(getProjectPublicEntries(project).map((entry) => entry.kind)).toEqual([
      "site",
      "demo",
      "officialDocs",
      "repository",
    ]);
  });

  test("confirmed production and demo destinations stay in the catalog", () => {
    const expected = {
      "tavily-hikari": {
        site: "https://tavily.ivanli.cc/",
      },
      "octo-rill": {
        site: "https://octo-rill.ivanli.cc/",
        demo: "https://ivanli-cn.github.io/octo-rill/demo/",
      },
      "blog-26": {
        site: "https://ivanli.cc/",
      },
      "flux-purr": {
        site: "https://flux-purr.ivanli.cc/",
        demo: "https://flux-purr-demo.ivanli.cc/",
      },
      "iso-usb-hub": {
        site: "https://isolarail.ivanli.cc/",
        officialDocs: "https://isolarail.ivanli.cc/docs/",
        repository: "https://github.com/IvanLi-CN/isolarail",
      },
      xp: {
        site: "https://xp.ivanli.cc/",
      },
      dockrev: {
        site: "https://dockrev.ivanli.cc/",
        demo: "https://ivanli-cn.github.io/dockrev/demo/",
      },
    } as const;

    for (const [slug, destinations] of Object.entries(expected)) {
      const project = projectCatalog.find((item) => item.slug === slug);
      expect(project).toBeDefined();
      if (!project) throw new Error(`${slug} catalog entry is missing`);

      const entries = getProjectPublicEntries(project);
      for (const [kind, href] of Object.entries(destinations)) {
        const entryKind = kind === "officialDocs" ? "officialDocs" : kind;
        expect(entries.find((entry) => entry.kind === entryKind)?.href).toBe(href);
      }
    }
  });

  test("KaisouMail uses the confirmed production site", () => {
    const project = projectCatalog.find((item) => item.slug === "kaisoumail");
    expect(project).toBeDefined();
    if (!project) throw new Error("KaisouMail catalog entry is missing");

    expect(getProjectCardEntries(project)[0]).toEqual({
      kind: "site",
      label: "项目站点",
      href: "https://km.707979.xyz/",
    });
    expect(getProjectPublicEntries(project).map((entry) => entry.href)).not.toContain(
      "https://cfm.707979.xyz/"
    );
  });

  test("TOC requires three headings and nests H3", () => {
    expect(extractProjectToc("## One\n\n### Child\n\n## Two")).toEqual([
      { depth: 2, text: "One", slug: "one" },
      { depth: 3, text: "Child", slug: "child" },
      { depth: 2, text: "Two", slug: "two" },
    ]);
    expect(extractProjectToc("## One\n\n## Two")).toEqual([]);
  });

  test("TOC follows Astro heading IDs and ignores fenced code", () => {
    expect(
      extractProjectToc(
        "## 设计取舍：保留证据\n\n```md\n## 伪标题\n```\n\n## 设计取舍：保留证据\n\n### 子项"
      )
    ).toEqual([
      { depth: 2, text: "设计取舍：保留证据", slug: "设计取舍保留证据" },
      { depth: 2, text: "设计取舍：保留证据", slug: "设计取舍保留证据-1" },
      { depth: 3, text: "子项", slug: "子项" },
    ]);
  });

  test("TOC uses rendered text for inline Markdown links", () => {
    expect(extractProjectToc("## [API docs](https://example.com)\n\n## Two\n\n## Three")).toEqual([
      { depth: 2, text: "API docs", slug: "api-docs" },
      { depth: 2, text: "Two", slug: "two" },
      { depth: 2, text: "Three", slug: "three" },
    ]);
  });

  test("MDX component imports stay within the reviewed allowlist", () => {
    expect(() =>
      validateProjectMdxImports(
        'import { ProjectFacts } from "../../../src/components/project-content-blocks";',
        "codex-vibe-monitor.mdx"
      )
    ).not.toThrow();
    expect(() =>
      validateProjectMdxImports(
        'import Button from "../../../src/components/ui/Button";',
        "example.mdx"
      )
    ).toThrow(/unsupported site component/);
    expect(() =>
      validateProjectMdxImports(
        'import {\n  Button\n} from "../../../src/components/ui/Button";',
        "example.mdx"
      )
    ).toThrow(/unsupported site component/);
    expect(() =>
      validateProjectMdxImports(
        'import { Button } from "../../../src/components/ui/Button"; // trailing comment',
        "example.mdx"
      )
    ).toThrow(/unsupported site component/);
    expect(() =>
      validateProjectMdxImports(
        'import { Button } from "../../../src/components/ui/Button"; /*\n  trailing comment\n*/',
        "example.mdx"
      )
    ).toThrow(/unsupported site component/);
  });
});
