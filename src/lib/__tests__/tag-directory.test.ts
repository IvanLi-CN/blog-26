import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { projectCatalog } from "@/lib/project-catalog";
import { buildTagDirectory, matchesTag, normalizeTagPath } from "@/lib/tag-directory";

describe("unified tag directory", () => {
  it("counts each typed entity once at every ancestor", () => {
    const summaries = buildTagDirectory([
      { type: "post", id: "same", tags: [" # Web / React / ", "Web/React/hooks", "Web/React"] },
      { type: "post", id: "same", tags: ["Web/React/hooks"] },
      { type: "memo", id: "same", tags: ["Web/React"] },
      { type: "project", id: "same", tags: ["Web/React"] },
    ]);
    expect(summaries.find((tag) => tag.name === "Web")).toEqual({
      name: "Web",
      segments: ["Web"],
      lastSegment: "Web",
      count: 3,
      postCount: 1,
      memoCount: 1,
      projectCount: 1,
    });
    expect(summaries.find((tag) => tag.name === "Web/React/hooks")?.count).toBe(1);
  });
  it("preserves meaningful spelling while normalizing path boundaries", () => {
    expect(normalizeTagPath(" ## / Cafe\u0301 // I²C / ")).toBe("Café/I²C");
    expect(matchesTag("I²C", ["I2C"])).toBe(false);
    expect(matchesTag("Rust no_std", ["Rust noXstd"])).toBe(false);
    expect(matchesTag("React", ["react"])).toBe(false);
    expect(matchesTag("USB-C PD + PPS", ["USB-C PD + PPS"])).toBe(true);
    expect(matchesTag("Web", ["Webby", "Webster/foo"])).toBe(false);
  });
  it("implements the accepted 15 project assignments, without inferred additions", () => {
    const adr = readFileSync("docs/adr/0013-native-project-tag-discovery.md", "utf8");
    expect(projectCatalog).toHaveLength(15);
    for (const project of projectCatalog) {
      const row = adr.split("\n").find((line) => line.startsWith(`| ${project.title} | `));
      expect(row).toBeDefined();
      expect(project.techTags).toEqual(row?.split("|")[2].trim().split(", "));
      expect(project.featuredTags?.length ?? 0).toBeLessThanOrEqual(2);
      for (const tag of project.featuredTags ?? []) expect(project.techTags).toContain(tag);
      for (const tag of project.techTags) expect(tag).not.toMatch(/[\u4e00-\u9fff/]/);
    }
    const summaries = buildTagDirectory([
      ...projectCatalog.map((project) => ({
        type: "project" as const,
        id: project.slug,
        tags: project.techTags,
      })),
      { type: "post", id: "react-post", tags: ["React"] },
      { type: "memo", id: "react-memo", tags: ["React"] },
    ]);
    expect(summaries.find((tag) => tag.name === "React")).toMatchObject({
      count: 12,
      projectCount: 10,
      postCount: 1,
      memoCount: 1,
    });
  });
});
