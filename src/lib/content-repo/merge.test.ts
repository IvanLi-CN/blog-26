import { describe, expect, test } from "bun:test";
import { mergeBody, mergeFrontmatter, mergeRegions } from "./merge";

describe("body merge", () => {
  test("takes independent changes from both sides", () => {
    const result = mergeBody(
      ["one", "two", "three"],
      ["ONE", "two", "three"],
      ["one", "two", "THREE"]
    );
    expect(result.clean).toBe(true);
    expect(result.lines).toEqual(["ONE", "two", "THREE"]);
  });

  test("accepts an identical change made on both sides", () => {
    const result = mergeBody(["a", "b"], ["a", "B"], ["a", "B"]);
    expect(result.clean).toBe(true);
    expect(result.lines).toEqual(["a", "B"]);
  });

  test("reports a conflict when both sides change the same line differently", () => {
    const result = mergeBody(["a", "b"], ["a", "local"], ["a", "remote"]);
    expect(result.clean).toBe(false);
    expect(result.conflicts).toBe(1);
    expect(result.lines).toContain("local");
  });

  test("keeps the local text when a conflict is reported", () => {
    const result = mergeBody(["x"], ["local"], ["remote"]);
    expect(result.lines).toEqual(["local"]);
  });
});

describe("frontmatter merge", () => {
  test("merges independent field changes", () => {
    const result = mergeFrontmatter(
      { title: "a", draft: false, tags: ["x"] },
      { title: "A", draft: false, tags: ["x"] },
      { title: "a", draft: false, tags: ["x", "y"] }
    );
    expect(result.conflicts).toEqual([]);
    expect(result.value).toMatchObject({ title: "A", draft: false, tags: ["x", "y"] });
  });

  test("reports the same field changed on both sides", () => {
    const result = mergeFrontmatter({ title: "a" }, { title: "local" }, { title: "remote" });
    expect(result.conflicts).toEqual(["title"]);
  });

  test("takes an identical change made on both sides", () => {
    const result = mergeFrontmatter({ title: "a" }, { title: "same" }, { title: "same" });
    expect(result.conflicts).toEqual([]);
    expect(result.value.title).toBe("same");
  });
});

describe("merge regions", () => {
  test("marks clean regions and exposes all three sides for conflicts", () => {
    const regions = mergeRegions(["a", "b"], ["a", "local"], ["a", "remote"]);
    expect(regions.some((region) => region.kind === "conflict")).toBe(true);
    const conflict = regions.find((region) => region.kind === "conflict");
    expect(conflict).toMatchObject({ base: "b", local: "local", remote: "remote" });
  });

  test("keeps a clean merge as stable regions", () => {
    const regions = mergeRegions(["a", "b"], ["A", "b"], ["a", "b"]);
    expect(regions.every((region) => region.kind === "stable")).toBe(true);
    expect(
      regions.map((region) => (region.kind === "stable" ? region.text : "")).join("\n")
    ).toContain("A");
  });
});
