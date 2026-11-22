import { describe, expect, test } from "bun:test";
import { applyFrontmatterChoice, pickFrontmatterValue } from "./content-merge-fields";

const document = [
  "---",
  "title: 发布流程",
  "slug: merge-demo",
  "date: 2026-01-02",
  "draft: false",
  "tags:",
  "  - alpha",
  "---",
  "正文第一行",
  "",
].join("\n");

describe("frontmatter choices", () => {
  test("rewrites a single key and keeps the body", () => {
    const next = applyFrontmatterChoice(document, "title", "发布流程（远端）");
    expect(next).toContain("title: 发布流程（远端）");
    expect(next).toContain("slug: merge-demo");
    expect(next).toContain("正文第一行");
    expect(next.startsWith("---\n")).toBe(true);
  });

  test("keeps other keys and their order", () => {
    const next = applyFrontmatterChoice(document, "draft", true);
    const keys = ["title", "slug", "date", "draft", "tags"];
    const positions = keys.map((key) => next.indexOf(`${key}:`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    expect(next).toContain("draft: true");
  });

  test("returns the document unchanged when it has no frontmatter", () => {
    expect(applyFrontmatterChoice("just a body", "title", "x")).toBe("just a body");
  });

  test("picks the chosen side", () => {
    const field = { base: "base", local: "local", remote: "remote" };
    expect(pickFrontmatterValue(field, "base")).toBe("base");
    expect(pickFrontmatterValue(field, "local")).toBe("local");
    expect(pickFrontmatterValue(field, "remote")).toBe("remote");
  });
});
