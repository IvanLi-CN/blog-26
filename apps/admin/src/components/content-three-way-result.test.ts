import { describe, expect, test } from "bun:test";
import {
  assembleMergeResult,
  type MergeRegion,
  pendingConflicts,
} from "./content-three-way-result";

const regions: MergeRegion[] = [
  { kind: "stable", text: "共同开头" },
  { kind: "conflict", base: "基线段落", local: "本地段落", remote: "远端段落" },
  { kind: "stable", text: "共同结尾" },
];

describe("assembleMergeResult", () => {
  test("keeps stable content and drops unresolved conflicts", () => {
    expect(assembleMergeResult(regions, {})).toBe("共同开头\n共同结尾");
  });

  test("inserts the resolved side in region order", () => {
    expect(assembleMergeResult(regions, { 1: { side: "remote", text: "远端段落" } })).toBe(
      "共同开头\n远端段落\n共同结尾"
    );
  });

  test("keeps hand-written region text", () => {
    expect(assembleMergeResult(regions, { 1: { side: "custom", text: "人工合并段落" } })).toBe(
      "共同开头\n人工合并段落\n共同结尾"
    );
  });

  test("counts conflicts that still need a decision", () => {
    expect(pendingConflicts(regions, {})).toBe(1);
    expect(pendingConflicts(regions, { 1: { side: "local", text: "本地段落" } })).toBe(0);
  });
});
