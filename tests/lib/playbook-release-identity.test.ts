import { describe, expect, test } from "bun:test";
import { assertPublishedSourceIdentity } from "../../src/lib/playbook/release";
import { makePublicBundle } from "./playbook-fixture";

describe("published Playbook release identity", () => {
  test("accepts normalized published file records while rejecting source drift", () => {
    const bundle = makePublicBundle();
    const normalizedPointer = {
      ...bundle.edition.edition,
      files: bundle.edition.edition.files.map((file) =>
        file.path === "catalog.json" ? { ...file, size: file.size + 1 } : file
      ),
    };
    expect(() => assertPublishedSourceIdentity(normalizedPointer, bundle.manifest)).not.toThrow();
    expect(() =>
      assertPublishedSourceIdentity(
        { ...normalizedPointer, source: { ...normalizedPointer.source, tag: "v9.9.9" } },
        bundle.manifest
      )
    ).toThrow("does not match its source release");
  });
});
