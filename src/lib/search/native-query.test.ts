import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentSearchError, planNativeQuery } from "./native-query";
import { parseSearchQuery } from "./query";

describe("new content query contract", () => {
  test("recognizes controlled errors across the Console and SSR bundle boundary", async () => {
    const directory = mkdtempSync(join(tmpdir(), "search-error-bundle-"));
    try {
      const build = await Bun.build({
        entrypoints: [new URL("./native-query.ts", import.meta.url).pathname],
        target: "bun",
        outdir: directory,
      });
      expect(build.success).toBe(true);
      const module = await import(build.outputs[0].path);
      const error = new module.ContentSearchError(
        "SERVICE_UNAVAILABLE",
        "search-index-unavailable"
      );
      expect(error instanceof ContentSearchError).toBe(true);
      expect(new Error("search-index-unavailable") instanceof ContentSearchError).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test("keeps definite aliases and Node literal independently of AI", () => {
    expect(planNativeQuery("Node").ast).toEqual({
      kind: "or",
      children: [
        { kind: "term", value: "Node" },
        { kind: "term", value: "NodeJS" },
      ],
    });
    expect(planNativeQuery("NodeJS").ast).toEqual(planNativeQuery("node.js").ast);
  });
  test("explicit expressions and malformed literal retries do not expand aliases", () => {
    expect(planNativeQuery("title:NodeJS").ast).toEqual(parseSearchQuery("title:NodeJS").ast);
    expect(planNativeQuery("NodeJS OR").ast).toEqual(parseSearchQuery("NodeJS OR").ast);
  });
  test("rejects recognizable NEAR including malformed syntax, preserving legacy parser", () => {
    for (const q of ["NEAR(alpha beta, 3)", "NEAR(", "title:NEAR(alpha"])
      expect(() => planNativeQuery(q)).toThrow("unsupported-query");
    expect(planNativeQuery("NEAR").ast).toEqual({ kind: "term", value: "NEAR" });
    expect(planNativeQuery('"NEAR(alpha beta, 3)"').mode).toBe("advanced-valid");
    expect(parseSearchQuery("NEAR(alpha beta, 3)").mode).toBe("advanced-valid");
  });
});
