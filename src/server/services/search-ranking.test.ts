import { expect, test } from "bun:test";
import { reciprocalRanks, searchContext } from "./search-ranking";

test("rank fusion rewards independent retrieval agreement without using raw scores", () => {
  const ranks = reciprocalRanks(
    [
      ["a", "b"],
      ["b", "c"],
    ],
    (id) => id
  );
  expect((ranks.get("b") ?? 0) > (ranks.get("a") ?? 0)).toBe(true);
  expect((ranks.get("a") ?? 0) > (ranks.get("c") ?? 0)).toBe(true);
});
test("RAG context reaches late literal evidence and respects Unicode code point budget", () => {
  const context = searchContext("Node", { body: `${"🌿".repeat(4000)}Node runtime evidence` }, 128);
  expect(context).toContain("Node runtime evidence");
  expect(Array.from(context).length).toBeLessThanOrEqual(128);
});
test("semantic context samples the middle and end rather than only the introduction", () => {
  const body = `${"a".repeat(300)}MIDDLE${"b".repeat(300)}END`;
  const context = searchContext("database", { body }, 128);
  expect(context).toContain("MIDDLE");
  expect(context).toContain("END");
  expect(Array.from(context).length).toBeLessThanOrEqual(128);
});
