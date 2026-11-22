import { describe, expect, test } from "bun:test";
import { diffRegions, mergeBody, mergeFrontmatter } from "./merge";

describe("diff regions", () => {
  test("returns no region for identical input", () => {
    expect(diffRegions(["a", "b"], ["a", "b"])).toEqual([]);
  });

  test("locates a single replaced line", () => {
    expect(diffRegions(["a", "b", "c"], ["a", "B", "c"])).toEqual([
      { start: 1, end: 2, replacement: ["B"] },
    ]);
  });

  test("locates an insertion", () => {
    expect(diffRegions(["a", "c"], ["a", "b", "c"])).toEqual([
      { start: 1, end: 1, replacement: ["b"] },
    ]);
  });

  test("locates a deletion", () => {
    expect(diffRegions(["a", "b", "c"], ["a", "c"])).toEqual([
      { start: 1, end: 2, replacement: [] },
    ]);
  });
});

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
