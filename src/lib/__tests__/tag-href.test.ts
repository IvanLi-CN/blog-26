import { describe, expect, it } from "bun:test";
import { buildTagHref, readTagRoutePath } from "../tag-href";

describe("buildTagHref", () => {
  it("builds hierarchical tag hrefs without encoding slashes", () => {
    expect(buildTagHref("Geek/SMS")).toBe("/tags/Geek/SMS");
  });

  it("encodes each segment (non-ASCII)", () => {
    expect(buildTagHref("中文/标签")).toBe("/tags/%E4%B8%AD%E6%96%87/%E6%A0%87%E7%AD%BE");
  });

  it("strips a leading # prefix", () => {
    expect(buildTagHref("#DevOps/Network")).toBe("/tags/DevOps/Network");
  });

  it("normalizes whitespace and repeated slashes", () => {
    expect(buildTagHref("  Geek//SMS  ")).toBe("/tags/Geek/SMS");
  });

  it("returns /tags for empty-ish inputs", () => {
    expect(buildTagHref("")).toBe("/tags");
    expect(buildTagHref("   ")).toBe("/tags");
    expect(buildTagHref("////")).toBe("/tags");
    expect(buildTagHref("#")).toBe("/tags");
  });
});

describe("readTagRoutePath", () => {
  it("round-trips spaces, plus, superscripts and reserved characters once", () => {
    for (const tag of ["USB-C PD + PPS", "I²C", "Rust no_std", "Literal %2B", "A?B/C#D"]) {
      expect(readTagRoutePath(`${buildTagHref(tag)}/`)).toBe(tag);
      expect(readTagRoutePath(`/blog${buildTagHref(tag)}/feed.xml`, "/blog/tags", true)).toBe(tag);
    }
  });

  it("rejects unrelated paths and malformed escapes", () => {
    expect(readTagRoutePath("/projects/React")).toBe("");
    expect(readTagRoutePath("/tags/%zz")).toBe("");
  });
});
