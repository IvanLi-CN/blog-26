import { describe, expect, test } from "bun:test";
import { parseSearchQuery, renderFts5Query, SEARCH_COLUMNS, SEARCH_QUERY_LIMITS } from "./query";

describe("search query parser", () => {
  test("joins ordinary whitespace-separated terms with AND", () => {
    const plan = parseSearchQuery("  SQLite   guide ");

    expect(plan.mode).toBe("simple");
    expect(plan.literalTerms).toEqual(["SQLite", "guide"]);
    expect(renderFts5Query(plan.ast)).toBe('("SQLite" AND "guide")');
  });

  test("uses AND precedence before OR", () => {
    const plan = parseSearchQuery("alpha OR beta gamma");

    expect(plan.mode).toBe("advanced-valid");
    expect(renderFts5Query(plan.ast)).toBe('("alpha" OR ("beta" AND "gamma"))');
  });

  test("keeps parentheses as the explicit precedence override", () => {
    const plan = parseSearchQuery("(alpha OR beta) AND gamma");

    expect(plan.mode).toBe("advanced-valid");
    expect(renderFts5Query(plan.ast)).toBe('(("alpha" OR "beta") AND "gamma")');
  });

  test("supports the controlled advanced syntax", () => {
    expect(parseSearchQuery('"SQLite Guide"').mode).toBe("advanced-valid");
    expect(parseSearchQuery("title:SQLite").mode).toBe("advanced-valid");
    expect(parseSearchQuery("sqlite*").mode).toBe("advanced-valid");
    expect(parseSearchQuery("NEAR(sqlite guide, 5)").mode).toBe("advanced-valid");
  });

  test("does not treat operators inside a phrase as syntax", () => {
    const plan = parseSearchQuery('"alpha OR beta"');

    expect(plan.mode).toBe("advanced-valid");
    expect(plan.literalTerms).toEqual(["alpha OR beta"]);
    expect(renderFts5Query(plan.ast)).toBe('"alpha OR beta"');
  });

  test("retries malformed advanced syntax as literal AND terms", () => {
    const cases = ["alpha AND", "unknown:alpha", '"unclosed', "(alpha OR beta", "alpha*beta"];

    for (const query of cases) {
      const plan = parseSearchQuery(query);
      expect(plan.mode).toBe("advanced-invalid");
      expect(plan.literalTerms.length).toBeGreaterThan(0);
      expect(plan.ftsQuery).toBeTruthy();
    }
  });

  test("treats reserved words as literals after an invalid operator position", () => {
    const plan = parseSearchQuery("OR");

    expect(plan.mode).toBe("advanced-invalid");
    expect(plan.literalTerms).toEqual(["OR"]);
    expect(renderFts5Query(plan.ast)).toBe('"OR"');
  });

  test("does not turn syntax-only invalid input into an unfiltered query", () => {
    const plan = parseSearchQuery("*");

    expect(plan.mode).toBe("advanced-invalid");
    expect(plan.ast).toBeNull();
    expect(plan.literalTerms).toEqual([]);
  });

  test("routes short leaves to the short-text execution path", () => {
    expect(parseSearchQuery("搜索").hasShortLeaf).toBe(true);
    expect(parseSearchQuery("博客").hasShortLeaf).toBe(true);
    expect(parseSearchQuery("sqlite").hasShortLeaf).toBe(false);
  });

  test("rejects short NEAR operands instead of silently changing NEAR semantics", () => {
    const plan = parseSearchQuery("NEAR(foo AI, 5)");

    expect(plan.mode).toBe("advanced-invalid");
    expect(plan.error).toContain("NEAR operands");
  });

  test("rejects over-budget input without literal retry", () => {
    const plan = parseSearchQuery(
      Array.from({ length: SEARCH_QUERY_LIMITS.maxTokens + 1 }, () => "term").join(" ")
    );

    expect(plan.limitExceeded).toBe(true);
    expect(plan.ast).toBeNull();
    expect(plan.literalTerms).toEqual([]);
  });

  test("rejects excessive length, nesting, and short-leaf SQL cost", () => {
    const longPlan = parseSearchQuery("x".repeat(SEARCH_QUERY_LIMITS.maxCodePoints + 1));
    const nestedQuery =
      "(".repeat(SEARCH_QUERY_LIMITS.maxAstDepth + 1) +
      "term" +
      ")".repeat(SEARCH_QUERY_LIMITS.maxAstDepth + 1);
    const nestedPlan = parseSearchQuery(nestedQuery);
    const shortPlan = parseSearchQuery(
      Array.from(
        { length: Math.floor(SEARCH_QUERY_LIMITS.maxSqlParameters / SEARCH_COLUMNS.length) + 1 },
        () => "搜索"
      ).join(" ")
    );

    expect(longPlan.limitExceeded).toBe(true);
    expect(nestedPlan.limitExceeded).toBe(true);
    expect(shortPlan.limitExceeded).toBe(true);
  });

  test("rechecks SQL parameter cost for invalid literal retries", () => {
    const query = `${Array.from(
      { length: 127 },
      (_, index) => `${String.fromCodePoint(0x4e00 + index)}x`
    ).join(" ")} AND`;
    const plan = parseSearchQuery(query);

    expect(plan.mode).toBe("advanced-invalid");
    expect(plan.limitExceeded).toBe(true);
    expect(plan.ast).toBeNull();
    expect(plan.literalTerms).toEqual([]);
  });
});
