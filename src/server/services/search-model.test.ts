import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { callSearchModel, embedSearchQuery, type SearchModelError } from "./search-model";

const originalFetch = globalThis.fetch;
const output = z.object({ ok: z.boolean() });
const chat = {
  apiKey: "test-key",
  baseUrl: "https://llm.example.test/v1",
  model: "deepseek-v4-flash",
} as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("search model request contract", () => {
  test("disables DeepSeek thinking for bounded JSON search decisions", async () => {
    let request: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      request = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
      });
    }) as typeof fetch;

    await callSearchModel(
      chat,
      { timeoutMs: 1000, maxInputTokens: 256, maxOutputTokens: 128 },
      "JSON",
      {},
      output
    );

    expect(request).toMatchObject({
      thinking: { type: "disabled" },
      reasoning_effort: "none",
    });
  });

  test("does not send provider-specific reasoning fields to other models", async () => {
    let request: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      request = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
      });
    }) as typeof fetch;

    await callSearchModel(
      { ...chat, model: "gpt-compatible" },
      { timeoutMs: 1000, maxInputTokens: 256, maxOutputTokens: 128 },
      "JSON",
      {},
      output
    );

    expect(request).not.toHaveProperty("thinking");
    expect(request).not.toHaveProperty("reasoning_effort");
  });

  test("does not confuse UTF-8 bytes with the provider token budget", async () => {
    let called = false;
    let request: { messages: Array<{ content: string }> } | undefined;
    globalThis.fetch = (async (_input, init) => {
      called = true;
      request = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
      });
    }) as typeof fetch;

    await callSearchModel(
      chat,
      { timeoutMs: 1000, maxInputTokens: 256, maxOutputTokens: 128 },
      "JSON",
      { content: "发".repeat(2048) },
      output
    );

    expect(called).toBe(true);
    expect(Array.from(JSON.parse(request?.messages[1].content).content)).toHaveLength(2048);
  });

  test("keeps provider-reported token overages as a budget failure", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 257, completion_tokens: 1 },
      })) as typeof fetch;

    await expect(
      callSearchModel(
        chat,
        { timeoutMs: 1000, maxInputTokens: 256, maxOutputTokens: 128 },
        "JSON",
        {},
        output
      )
    ).rejects.toMatchObject({ reason: "budget-exceeded" } satisfies Partial<SearchModelError>);
  });

  test("bounds embedding input before contacting the provider", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ data: [{ embedding: [1] }] });
    }) as typeof fetch;

    await expect(embedSearchQuery(chat, "x".repeat(64 * 1024 + 1))).rejects.toMatchObject({
      reason: "budget-exceeded",
    } satisfies Partial<SearchModelError>);
    expect(called).toBe(false);
  });
});
