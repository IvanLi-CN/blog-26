import { describe, expect, test } from "bun:test";
import { extractProjectToc } from "../../site/lib/project-content-utils";
import {
  getProjectCardEntries,
  getProjectPublicEntries,
  projectCatalog,
} from "../../site/lib/projects";

describe("project content contracts", () => {
  test("card shortcuts use site, official docs, then repository precedence", () => {
    const project = projectCatalog.find((item) => item.slug === "codex-vibe-monitor");
    expect(project).toBeDefined();
    if (!project) throw new Error("Codex Vibe Monitor catalog entry is missing");
    expect(getProjectCardEntries(project)).toEqual([
      {
        kind: "demo",
        label: "Demo",
        href: "https://ivanli-cn.github.io/codex-vibe-monitor/storybook.html",
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
      "demo",
      "officialDocs",
      "repository",
    ]);
  });

  test("TOC requires three headings and nests H3", () => {
    expect(extractProjectToc("## One\n\n### Child\n\n## Two")).toEqual([
      { depth: 2, text: "One", slug: "one" },
      { depth: 3, text: "Child", slug: "child" },
      { depth: 2, text: "Two", slug: "two" },
    ]);
    expect(extractProjectToc("## One\n\n## Two")).toEqual([]);
  });
});
