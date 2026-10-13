import { describe, expect, test } from "bun:test";
import { assertPublicCatalog, searchSchema } from "../../src/lib/playbook/schema";
import { parsePlaybookTechStack } from "../../src/lib/playbook/tech-stack";
import { webDemoCatalog, webDemoSearch } from "../../src/lib/playbook/web-demo-fixture";

describe("Playbook Web Demo fixture", () => {
  test("describes the current repository with complete project context", () => {
    expect(() => assertPublicCatalog(webDemoCatalog)).not.toThrow();
    searchSchema.parse(webDemoSearch);

    const detail = webDemoCatalog.project_details.find((entry) => entry.item.slug === "blog-26");
    expect(detail?.item.source).toBe("https://github.com/IvanLi-CN/blog-26");
    expect(detail?.sections.length).toBeGreaterThanOrEqual(6);
    expect(detail?.sections.map((section) => section.id)).toContain("workflow-and-quality-gates");
    expect(webDemoCatalog.snapshot.topics.map((topic) => topic.slug)).toEqual(
      expect.arrayContaining(["astro-site", "playwright-e2e", "delivery"])
    );
  });

  test("keeps real-sized lists while leaving presentation to the stack parser", () => {
    const detail = webDemoCatalog.project_details[0];
    const groups = parsePlaybookTechStack(detail.stack);
    const runtime = groups.find((group) => group.id === "runtime");
    const ci = runtime?.entries.find((entry) => entry.key === "ci_workflows");
    const scripts = groups
      .find((group) => group.id === "quality")
      ?.entries.find((entry) => entry.key === "scripts");

    expect(ci?.value.kind).toBe("list");
    expect(scripts?.value.kind).toBe("list");
    if (ci?.value.kind === "list") expect(ci.value.items.length).toBeGreaterThan(8);
    if (scripts?.value.kind === "list") expect(scripts.value.items.length).toBeGreaterThan(8);
    expect(JSON.stringify(detail.stack)).not.toContain("Sample Project");
  });
});
