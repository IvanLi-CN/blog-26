import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlaybookTechStack from "../../src/components/playbook/PlaybookTechStack";
import {
  formatTechStackRaw,
  parsePlaybookTechStack,
  shouldCollapseTechStackList,
  techStackArrayMode,
} from "../../src/lib/playbook/tech-stack";

describe("playbook technology stack presentation", () => {
  test("groups known fields and preserves unknown fields with readable labels", () => {
    const groups = parsePlaybookTechStack({
      markers_present: ["bun_lock"],
      package_json: { deps_dev: ["Astro"], scripts: ["site:build"] },
      configs_root: ["package.json"],
      releaseChannel: "stable",
      cargo: null,
      empty: [],
      status: "current",
      routing: { group: "public" },
      primary_projects: ["internal-project"],
      release_tag: "v1.2.3",
    });

    expect(groups.map((group) => group.label)).toEqual([
      "运行与交付",
      "依赖与工具",
      "配置与质量",
      "其他信息",
    ]);
    expect(groups[0]?.entries[0]?.label).toBe("能力标记");
    expect(groups[1]?.entries[0]?.label).toBe("package.json");
    expect(groups[3]?.entries[0]?.label).toBe("发布渠道");
    expect(JSON.stringify(groups)).not.toContain("cargo");
    expect(JSON.stringify(groups)).not.toContain("empty");
  });

  test("recursively parses stringified JSON", () => {
    const groups = parsePlaybookTechStack('{"framework":"Astro","flags":["static"]}');
    const framework = groups.find((group) => group.id === "runtime")?.entries[0];
    const flags = groups.find((group) => group.id === "other")?.entries[0];
    expect(framework?.label).toBe("框架");
    expect(framework?.value.kind).toBe("scalar");
    expect(flags?.value.kind).toBe("list");
  });

  test("selects horizontal chips for scalar arrays and lists for nested values", () => {
    const groups = parsePlaybookTechStack({
      dependencies: ["react", "@astrojs/react"],
      ci_workflows: ["ci.yml", "release.yml"],
    });
    const dependencies = groups.find((group) => group.id === "dependencies")?.entries[0]?.value;
    const workflows = groups.find((group) => group.id === "runtime")?.entries[0]?.value;
    expect(dependencies?.kind).toBe("list");
    expect(workflows?.kind).toBe("list");
    if (dependencies?.kind === "list") expect(techStackArrayMode(dependencies.items)).toBe("chips");
    if (workflows?.kind === "list") expect(techStackArrayMode(workflows.items)).toBe("chips");
    expect(shouldCollapseTechStackList("ci_workflows", 5)).toBe(false);
    expect(shouldCollapseTechStackList("frameworks", 5)).toBe(false);
    expect(shouldCollapseTechStackList("frameworks", 9)).toBe(true);
  });

  test("formats raw values without losing their original structure", () => {
    expect(formatTechStackRaw({ framework: "Astro" })).toBe('{\n  "framework": "Astro"\n}');
    expect(formatTechStackRaw({ framework: "Astro", cargo: null, status: "current" })).toBe(
      '{\n  "framework": "Astro"\n}'
    );
  });

  test("does not render an empty or maintenance-only stack", () => {
    const html = renderToStaticMarkup(
      createElement(PlaybookTechStack, {
        value: { cargo: null, empty: [], status: "current", routing: { group: "public" } },
      })
    );
    expect(html).toBe("");
  });

  test("filters project relationships and release identity from the visitor view", () => {
    const groups = parsePlaybookTechStack({
      framework: "Astro",
      primary_projects: ["internal-project"],
      release_tag: "v1.2.3",
      edition_digest: "digest",
      source_commit: "commit",
    });
    expect(JSON.stringify(groups)).toContain("Astro");
    expect(JSON.stringify(groups)).not.toContain("internal-project");
    expect(JSON.stringify(groups)).not.toContain("v1.2.3");
    expect(JSON.stringify(groups)).not.toContain("digest");
    expect(JSON.stringify(groups)).not.toContain("commit");
  });

  test("renders grouped values by default and keeps raw JSON as a secondary disclosure", () => {
    const html = renderToStaticMarkup(
      createElement(PlaybookTechStack, {
        value: {
          framework: "Astro",
          markers_present: ["bun_lock", "package_json", "tsconfig", "astro", "tests"],
          deps_dev: Array.from({ length: 9 }, (_, index) => `tool-${index}`),
          cargo: null,
        },
      })
    );
    expect(html).toContain("运行与交付");
    expect(html).toContain("框架");
    expect(html).toContain("共 9 项");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("查看原始数据");
    expect(html).toContain("复制原始数据");
    expect(html).toContain("全屏查看原始数据");
    expect(html).toContain("var(--nature-code-function)");
    expect(html).toContain('aria-label="原始技术栈 JSON"');
    expect(html).not.toContain("cargo");
    expect(html).not.toContain("暂无可展示的公开字段");
    expect(html).not.toContain("sm:grid-cols-2");
    expect(html).not.toContain("nature-surface-inset");
    expect(html).not.toContain("nature-chip-info");
  });
});
