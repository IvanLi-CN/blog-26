import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

const EMAIL_HEADER_NAME = process.env.SSO_EMAIL_HEADER_NAME ?? "Remote-Email";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const DB_PATH = path.resolve(
  process.env.DB_PATH ?? path.join(process.cwd(), "test-data/sqlite.db")
);

function resetLlmSettingsAndSeedEmbeddingIndex() {
  execFileSync(
    "python3",
    [
      "-c",
      `import sqlite3, struct, time\nconn = sqlite3.connect(${JSON.stringify(DB_PATH)})\ncur = conn.cursor()\ncur.execute("DELETE FROM llm_settings")\ncur.execute("DELETE FROM post_embeddings")\nrow = cur.execute("SELECT id, slug, type, content_hash FROM posts WHERE type IN ('post', 'memo') LIMIT 1").fetchone()\nif row is None:\n    raise SystemExit('seed post missing')\npost_id, slug, type_name, content_hash = row\nnow = int(time.time() * 1000)\nvector = sqlite3.Binary(struct.pack('f', 0.0))\ncur.execute("INSERT INTO post_embeddings (id, post_id, slug, type, model_name, dim, content_hash, chunk_index, vector, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)", ('seed-embedding-e2e', post_id, slug, type_name, 'BAAI/bge-m3', 1, content_hash, -1, vector, now, now))\nconn.commit()\nconn.close()`,
    ],
    { stdio: "pipe" }
  );
}

test.describe("admin llm settings", () => {
  test.beforeEach(() => {
    resetLlmSettingsAndSeedEmbeddingIndex();
  });

  test("supports model picker filters, saves settings, and shows reindex warning", async ({
    page,
  }) => {
    await page.route("**/api/admin/llm-settings/test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tier: "chat",
          ok: true,
          model: "gpt-4o-mini",
          baseUrl: "https://chat.example.test/v1",
          summary: "对话模型测试通过",
          details: ["模型：gpt-4o-mini", "返回内容：pong"],
        }),
      });
    });

    const response = await page.goto("/admin/llm-settings", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "LLM 设置" })).toBeVisible();
    await expect(page.getByText("环境变量只作为缺省值")).toBeVisible();
    await expect(page.getByLabel("嵌入模型 baseURL")).toHaveCount(0);

    await page.getByRole("button", { name: "测试对话模型" }).click();
    await expect(page.getByText("对话模型测试通过")).toBeVisible();
    await expect(page.getByText("返回内容：pong")).toBeVisible();

    await page.getByRole("button", { name: "选择嵌入模型" }).click();
    const pickerDialog = page.getByRole("dialog", { name: "选择嵌入模型" });
    await expect(pickerDialog.getByRole("heading", { name: "选择嵌入模型" })).toBeVisible();
    await pickerDialog.getByRole("button", { name: /^embeddings$/ }).click();
    await pickerDialog
      .getByRole("button", { name: /text-embedding-3-small/i })
      .first()
      .click();

    await expect(
      page.locator('input[value="openai/text-embedding-3-small"]').first()
    ).toBeVisible();

    await page.getByRole("switch", { name: "嵌入模型 高级设置" }).click();
    await page.getByLabel("嵌入模型 baseURL").fill("https://embed.example.test");
    await page.getByLabel("嵌入模型 API Key").fill("sk-embed-e2e-abcdef");

    const chatBaseUrlInput = page.getByLabel("对话模型 baseURL");
    await chatBaseUrlInput.fill("https://chat.example.test");

    const chatApiKeyInput = page.getByLabel("对话模型 API Key");
    await chatApiKeyInput.fill("sk-chat-e2e-abcdef");

    await page.getByRole("button", { name: "保存设置" }).click();

    await expect(page.getByText("LLM 设置已保存")).toBeVisible();
    await expect(page.getByText("当前向量索引基于")).toBeVisible();
    await expect(page.getByText(/重新全量向量化/)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(
      page.locator('input[value="openai/text-embedding-3-small"]').first()
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: "嵌入模型 高级设置" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await expect(page.getByLabel("嵌入模型 baseURL")).toHaveValue("https://embed.example.test/v1");
    await expect(chatApiKeyInput).toHaveAttribute("placeholder", "•".repeat(18));
    await expect(page.getByText("当前向量索引基于")).toBeVisible();

    await page.getByRole("button", { name: "清除已保存的 API Key" }).first().click();
    await chatApiKeyInput.fill("sk-chat-e2e-xyz1234");
    await page.getByRole("button", { name: "保存设置" }).click();

    await expect(page.getByText("LLM 设置已保存")).toBeVisible();
    await expect(chatApiKeyInput).toHaveAttribute("placeholder", "•".repeat(19));

    const sessionRes = await page.request.get("/api/admin/llm-settings", {
      headers: {
        [EMAIL_HEADER_NAME]: ADMIN_EMAIL,
      },
    });
    expect(sessionRes.ok()).toBeTruthy();
    const payload = await sessionRes.json();
    expect(payload.settings.chat.apiKey.maskedValue).toBe("•".repeat(19));
    expect(payload.settings.chat.apiKey.maskedValue).not.toContain("sk-chat-e2e-xyz1234");
  });
});
