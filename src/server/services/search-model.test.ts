import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { callSearchModel } from "./search-model";

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
});
