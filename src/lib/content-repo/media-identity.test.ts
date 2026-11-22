import { describe, expect, test } from "bun:test";
import { decideMediaIdentity } from "./media-identity";

describe("media identity", () => {
  test("adopts an attachment that has no recorded identity", () => {
    expect(decideMediaIdentity(null, "sha-a")).toBe("record");
    expect(decideMediaIdentity(undefined, "sha-a")).toBe("record");
  });

  test("accepts an attachment whose bytes still match", () => {
    expect(decideMediaIdentity("sha-a", "sha-a")).toBe("unchanged");
  });

  test("reports divergence instead of overwriting the record", () => {
    expect(decideMediaIdentity("sha-a", "sha-b")).toBe("mismatch");
  });
});
