import { afterEach, describe, expect, test } from "bun:test";
import { setupAdminDemoApiMocks } from "../../../apps/admin/src/demo/mock-admin-api";
import {
  type AdminLlmSettingsUpdateInput,
  adminLlmSettingsPayloadSchema,
  adminLlmSettingsTestResponseSchema,
} from "../llm-settings";

type DemoWindow = {
  location: URL;
  fetch: typeof fetch;
  __adminDemoApiMockInstalled?: boolean;
};

const originalWindow = (globalThis as typeof globalThis & { window?: DemoWindow }).window;

function installDemoWindow() {
  const demoWindow: DemoWindow = {
    location: new URL("http://localhost/admin/llm-settings?demo=true"),
    fetch: globalThis.fetch.bind(globalThis),
    __adminDemoApiMockInstalled: false,
  };

  (globalThis as typeof globalThis & { window?: DemoWindow }).window = demoWindow;
  return demoWindow;
}

afterEach(() => {
  (globalThis as typeof globalThis & { window?: DemoWindow }).window = originalWindow;
});

describe("admin demo LLM settings", () => {
  test("returns the current admin settings contract for reads and updates", async () => {
    const demoWindow = installDemoWindow();
    setupAdminDemoApiMocks();

    const readResponse = await demoWindow.fetch("http://localhost/api/admin/llm-settings");
    expect(readResponse.ok).toBe(true);
    const initial = adminLlmSettingsPayloadSchema.parse(await readResponse.json());
    expect(initial.settings.chat.model).toBe("openai/gpt-4.1-mini");

    const update: AdminLlmSettingsUpdateInput = {
      chat: {
        model: "anthropic/claude-3.5-haiku",
        baseUrl: "https://openrouter.ai/api/v1",
      },
      embedding: {
        model: "text-embedding-3-small",
        useCustomProvider: false,
        baseUrlMode: "inherit",
        baseUrl: "",
        apiKeyMode: "inherit",
      },
      rerank: {
        model: "cohere/rerank-3.5",
        useCustomProvider: true,
        baseUrlMode: "custom",
        baseUrl: "https://api.cohere.com/v2",
        apiKeyMode: "custom",
      },
    };
    const updateResponse = await demoWindow.fetch("http://localhost/api/admin/llm-settings", {
      method: "PUT",
      body: JSON.stringify(update),
    });
    expect(updateResponse.ok).toBe(true);
    const updated = adminLlmSettingsPayloadSchema.parse(await updateResponse.json());
    expect(updated.settings.chat.model).toBe("anthropic/claude-3.5-haiku");
    expect(updated.settings.rerank.useCustomProvider).toBe(true);
    expect(updated.settings.rerank.apiKey.hasValue).toBe(false);
    expect(updated.settings.rerank.apiKey.source).toBe("missing");

    const customRerankUpdate = {
      ...update,
      rerank: { ...update.rerank, apiKeyInput: "sk-rerank-demo" },
    };
    const customRerankResponse = await demoWindow.fetch("http://localhost/api/admin/llm-settings", {
      method: "PUT",
      body: JSON.stringify(customRerankUpdate),
    });
    const customRerankSettings = adminLlmSettingsPayloadSchema.parse(
      await customRerankResponse.json()
    );
    expect(customRerankSettings.settings.rerank.apiKey.hasValue).toBe(true);

    const inheritedRerankUpdate = {
      ...customRerankUpdate,
      rerank: {
        ...customRerankUpdate.rerank,
        useCustomProvider: false,
        baseUrlMode: "inherit" as const,
        baseUrl: "",
        apiKeyMode: "inherit" as const,
        apiKeyInput: undefined,
      },
    };
    const reinheritRerankSettingsResponse = await demoWindow.fetch(
      "http://localhost/api/admin/llm-settings",
      { method: "PUT", body: JSON.stringify(inheritedRerankUpdate) }
    );
    const inheritedRerankSettings = adminLlmSettingsPayloadSchema.parse(
      await reinheritRerankSettingsResponse.json()
    );
    expect(inheritedRerankSettings.settings.rerank.apiKey.source).toBe("inherited");
    expect(inheritedRerankSettings.settings.rerank.useCustomProvider).toBe(false);
    expect(inheritedRerankSettings.settings.rerank.baseUrl).toBe("https://api.cohere.com/v2");
    expect(inheritedRerankSettings.resolved.rerank.baseUrl).toBe("https://openrouter.ai/api/v1");

    const reenabledRerankResponse = await demoWindow.fetch(
      "http://localhost/api/admin/llm-settings",
      {
        method: "PUT",
        body: JSON.stringify({
          ...inheritedRerankUpdate,
          rerank: {
            ...inheritedRerankUpdate.rerank,
            useCustomProvider: true,
            baseUrlMode: "custom",
            baseUrl: inheritedRerankSettings.settings.rerank.baseUrl,
            apiKeyMode: "custom",
          },
        }),
      }
    );
    const reenabledRerankSettings = adminLlmSettingsPayloadSchema.parse(
      await reenabledRerankResponse.json()
    );
    expect(reenabledRerankSettings.settings.rerank.apiKey.hasValue).toBe(true);
    expect(reenabledRerankSettings.settings.rerank.apiKey.source).toBe("db");
    expect(reenabledRerankSettings.settings.rerank.baseUrl).toBe("https://api.cohere.com/v2");
    expect(reenabledRerankSettings.resolved.rerank.baseUrl).toBe("https://api.cohere.com/v2");

    const testResponse = await demoWindow.fetch("http://localhost/api/admin/llm-settings/test", {
      method: "POST",
      body: JSON.stringify({ tier: "rerank", settings: update }),
    });
    expect(testResponse.ok).toBe(true);
    const testResult = adminLlmSettingsTestResponseSchema.parse(await testResponse.json());
    expect(testResult).toMatchObject({
      tier: "rerank",
      ok: true,
      model: "cohere/rerank-3.5",
    });

    const inheritedTestResponse = await demoWindow.fetch(
      "http://localhost/api/admin/llm-settings/test",
      {
        method: "POST",
        body: JSON.stringify({
          tier: "embedding",
          settings: {
            ...update,
            chat: { ...update.chat, baseUrl: "https://chat-current.example/v1" },
            rerank: { ...update.rerank, baseUrlMode: "inherit", baseUrl: "" },
          },
        }),
      }
    );
    const inheritedTestResult = adminLlmSettingsTestResponseSchema.parse(
      await inheritedTestResponse.json()
    );
    expect(inheritedTestResult.baseUrl).toBe("https://chat-current.example/v1");

    const inheritedRerankResponse = await demoWindow.fetch(
      "http://localhost/api/admin/llm-settings/test",
      {
        method: "POST",
        body: JSON.stringify({
          tier: "rerank",
          settings: {
            ...update,
            chat: { ...update.chat, baseUrl: "https://chat-current.example/v1" },
            embedding: { ...update.embedding, baseUrlMode: "inherit", baseUrl: "" },
            rerank: {
              ...update.rerank,
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
            },
          },
        }),
      }
    );
    const inheritedRerankResult = adminLlmSettingsTestResponseSchema.parse(
      await inheritedRerankResponse.json()
    );
    expect(inheritedRerankResult.baseUrl).toBe("https://chat-current.example/v1");

    const clearedParentResponse = await demoWindow.fetch(
      "http://localhost/api/admin/llm-settings",
      {
        method: "PUT",
        body: JSON.stringify({
          ...update,
          chat: { ...update.chat, clearApiKey: true },
          embedding: { ...update.embedding, useCustomProvider: false },
          rerank: { ...update.rerank, useCustomProvider: false },
        }),
      }
    );
    const clearedParentSettings = adminLlmSettingsPayloadSchema.parse(
      await clearedParentResponse.json()
    );
    expect(clearedParentSettings.settings.embedding.apiKey.source).toBe("missing");
    expect(clearedParentSettings.settings.rerank.apiKey.source).toBe("missing");
    expect(clearedParentSettings.resolved.embedding.sources.apiKey).toBe("missing");
    expect(clearedParentSettings.resolved.rerank.sources.apiKey).toBe("missing");
  });
});
