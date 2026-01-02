import { describe, expect, it } from "bun:test";
import { normalizeTagPath } from "../../components/tag-icons/normalize-tag-path";

describe("normalizeTagPath", () => {
  it("normalizes repeated slashes and leading hashes", () => {
    expect(normalizeTagPath("#DevOps//Network")).toBe("DevOps/Network");
  });

  it("trims segments and drops empties", () => {
    expect(normalizeTagPath("  Geek / SMS  ")).toBe("Geek/SMS");
  });
});
