import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  parseRerankResponse as parseRerankResponseType,
  rerank as rerankType,
} from "./rerank";

const resolvedConfig = {
  rerank: {
    model: "BAAI/bge-reranker-v2-m3",
    baseUrl: "https://llm.example.test/v1",
    apiKey: "test-secret-key",
  },
};

mock.module("@/server/services/llm-settings", () => ({
  getResolvedLlmConfig: mock(async () => resolvedConfig),
}));

const { parseRerankResponse, rerank } = (await import("./rerank")) as {
  parseRerankResponse: typeof parseRerankResponseType;
  rerank: typeof rerankType;
};

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

describe("rerank response parsing", () => {
  test("parses OpenAI-like data score responses", () => {
    const parsed = parseRerankResponse({
      data: [
        { index: 1, document: "B", score: 0.8 },
        { index: 0, document: "A", score: 0.2 },
      ],
    });

    expect(parsed.rawItemCount).toBe(2);
    expect(parsed.items).toEqual([
      { index: 1, document: "B", score: 0.8 },
      { index: 0, document: "A", score: 0.2 },
    ]);
  });

  test("parses Jina and SiliconFlow relevance score responses", () => {
    const parsed = parseRerankResponse({
      results: [
        { index: 0, document: null, relevance_score: 0.999 },
        { index: 2, relevance_score: 0.123 },
      ],
    });

    expect(parsed.rawItemCount).toBe(2);
    expect(parsed.items).toEqual([
      { index: 0, document: "", score: 0.999 },
      { index: 2, document: "", score: 0.123 },
    ]);
  });

  test("filters unusable scores", () => {
    const parsed = parseRerankResponse({
      results: [
        { index: 0, relevance_score: "0.5" },
        { index: 1, score: Number.NaN },
        { index: 2, score: 0.7 },
      ],
    });

    expect(parsed.rawItemCount).toBe(3);
    expect(parsed.items).toEqual([{ index: 2, document: "", score: 0.7 }]);
  });
});

describe("rerank client", () => {
  beforeEach(() => {
    console.warn = mock(() => undefined) as unknown as typeof console.warn;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  test("returns parsed Jina scores from the configured upstream", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        results: [
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.1 },
        ],
      })
    ) as unknown as typeof fetch;

    const items = await rerank("React", ["React docs", "Fruit"], { topN: 2 });

    expect(items).toEqual([
      { index: 0, document: "", score: 0.9 },
      { index: 1, document: "", score: 0.1 },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("throws and logs a redacted upstream failure", async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        { error: "upstream failed", apiKey: "should-not-log", documents: ["private"] },
        { status: 500 }
      )
    ) as unknown as typeof fetch;

    await expect(rerank("React", ["React docs"], { topN: 1 })).rejects.toMatchObject({
      code: "RERANKER_UNAVAILABLE",
    });

    expect(console.warn).toHaveBeenCalledTimes(1);
    const [, context] = (console.warn as ReturnType<typeof mock>).mock.calls[0] ?? [];
    expect(context).toMatchObject({
      message: "upstream returned non-ok response",
      model: "BAAI/bge-reranker-v2-m3",
      baseHost: "llm.example.test",
      status: 500,
    });
    expect(JSON.stringify(context)).not.toContain("test-secret-key");
    expect(JSON.stringify(context)).not.toContain("should-not-log");
    expect(JSON.stringify(context)).not.toContain("private");
  });

  test("throws when the upstream response has no usable scores", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ results: [{ index: 0, relevance_score: null }] })
    ) as unknown as typeof fetch;

    await expect(rerank("React", ["React docs"], { topN: 1 })).rejects.toMatchObject({
      code: "RERANKER_UNAVAILABLE",
    });

    expect(console.warn).toHaveBeenCalledWith(
      "[rerank]",
      expect.objectContaining({
        message: "upstream response did not contain usable rerank items",
        resultCount: 1,
        validItemCount: 0,
      })
    );
  });
});
