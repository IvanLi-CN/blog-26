import { describe, expect, test } from "bun:test";
import {
  assembleLocalResult,
  type MergeRegion,
  undecidedConflicts,
} from "./content-three-way-result";

const regions: MergeRegion[] = [
  { kind: "stable", text: "共同开头" },
  { kind: "conflict", base: "基线段落", local: "本地段落", remote: "远端段落" },
  { kind: "stable", text: "共同结尾" },
];

describe("three-way local result", () => {
  test("defaults a conflict to its local text", () => {
    expect(assembleLocalResult(regions, {})).toBe("共同开头\n本地段落\n共同结尾");
  });

  test("uses the text chosen in the local pane", () => {
    expect(assembleLocalResult(regions, { 1: "远端段落" })).toBe("共同开头\n远端段落\n共同结尾");
  });

  test("lists conflicts that still need a decision", () => {
    expect(undecidedConflicts(regions, {})).toEqual([1]);
    expect(undecidedConflicts(regions, { 1: true })).toEqual([]);
  });
});
