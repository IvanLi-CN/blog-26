import { describe, expect, test } from "bun:test";
import { contentSearchInputSchema } from "./content-search";

describe("content search input compatibility", () => {
  test("ignores malformed legacy Playbook identity before validation", () => {
    const parsed = contentSearchInputSchema.parse({
      q: "release",
      mode: "rag",
      source: "playbook",
      type: "policy",
      edition: "not-a-digest",
      sourceReleaseId: "-1",
      sourceTag: "unknown",
    });

    expect(parsed).not.toHaveProperty("edition");
    expect(parsed).not.toHaveProperty("sourceReleaseId");
    expect(parsed).not.toHaveProperty("sourceTag");
    expect(parsed).toMatchObject({ q: "release", mode: "rag", source: "playbook", type: "policy" });
  });
});
