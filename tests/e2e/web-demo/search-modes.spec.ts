import { expect, test } from "@playwright/test";

async function hideInspector(page: import("@playwright/test").Page) {
  const collapse = page.getByRole("button", { name: "收起 Web Demo 控制面板" });
  if (await collapse.isVisible()) await collapse.click();
}
test("mode selection survives refresh and history and shows genuine mode-specific results", async ({
  page,
}) => {
  await page.goto("/search/?q=SQLite&d_delay=normal");
  await hideInspector(page);
  const results = page.getByRole("region", { name: "搜索结果" });
  await expect(page.getByRole("button", { name: "关闭", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(results).toContainText("开发工具阅读清单");
  await page.getByRole("button", { name: "RAG", exact: true }).click();
  await expect(page).toHaveURL(/mode=rag/);
  await expect(results).toContainText("SQLite3：嵌入式数据库实践");
  await page.reload();
  await expect(page.getByRole("button", { name: "RAG", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "AI 改写", exact: true }).click();
  await expect(page).toHaveURL(/mode=rewrite/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "RAG", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(results).not.toContainText(/相关度|\d+%/);
});
test("RAG shows keyword results before the AI supplement arrives", async ({ page }) => {
  await page.goto("/search/?q=SQLite&mode=rag&d_scene=search-ready&d_delay=slow");
  await hideInspector(page);
  const results = page.getByRole("region", { name: "搜索结果" });
  await expect(results).toContainText("开发工具阅读清单");
  await expect(page.getByRole("region", { name: "建议搜索词" })).toHaveCount(0);
  await expect(results.locator('[data-search-ai-phase="waiting"]')).toContainText(
    "全文结果已到，正在等待 AI 补充"
  );
  await expect(results.getByRole("img", { name: "AI 补充结果" })).toHaveCount(0);
  await expect(results).toContainText("SQLite3：嵌入式数据库实践", { timeout: 10_000 });
  await expect(results.getByRole("img", { name: "AI 补充结果" })).toHaveCount(1, {
    timeout: 10_000,
  });
  await expect(results.locator('[data-search-ai-phase="complete"]')).toHaveCount(0);
});
test("rewrite shows keyword results before the rewritten supplement arrives", async ({ page }) => {
  await page.goto(
    "/search/?q=SQLite&mode=rewrite&d_scene=search-rewrite-ready&d_data=dense&d_delay=slow"
  );
  await hideInspector(page);
  const results = page.getByRole("region", { name: "搜索结果" });
  await expect(results).toContainText("开发工具阅读清单");
  await expect(results.locator('[data-search-ai-phase="waiting"]')).toContainText(
    "正在等待 AI 改写查询补充"
  );
  await expect(results.getByRole("img", { name: "AI 补充结果" })).toHaveCount(0);
  await expect(results).toContainText("SQLite 性能调优清单");
  await expect(results.getByRole("img", { name: "AI 补充结果" })).toHaveCount(5, {
    timeout: 10_000,
  });
  await expect(results.locator('[data-search-ai-phase="complete"]')).toHaveCount(0);
  const cards = results.locator("[data-search-result-card]");
  const origins = await cards.evaluateAll((elements) =>
    elements.map((element) =>
      element.querySelector('[aria-label="AI 补充结果"]') ? "ai" : "keyword"
    )
  );
  const firstAi = origins.indexOf("ai");
  expect(firstAi).toBeGreaterThan(0);
  expect(
    origins.some((origin, index) => origin === "ai" && origins.slice(index + 1).includes("keyword"))
  ).toBe(true);
});
test("switching the Web Demo scene reloads the search behavior", async ({ page }) => {
  await page.goto("/search/?q=SQLite&mode=rag&d_scene=search-ready&d_delay=normal");
  const scene = page.getByTestId("web-demo-inspector-scene-select");
  await expect(scene).toContainText("搜索 · RAG 补充");
  await scene.click();
  await page.getByRole("option", { name: "搜索 · AI 不可用" }).click();
  await expect(page).toHaveURL(/d_scene=search-ai-unavailable/);
  await expect(page.locator("[data-search-fallback]")).toContainText("原始关键词");
  await expect(page.getByRole("region", { name: "搜索结果" })).not.toContainText(
    "SQLite3：嵌入式数据库实践"
  );
});
test("AI failure preserves the chosen mode while an index failure is not a successful empty list", async ({
  page,
}) => {
  await page.goto("/search/?q=SQLite&mode=rag&d_scene=search-ai-unavailable&d_delay=normal");
  await hideInspector(page);
  await expect(page.locator("[data-search-fallback]")).toContainText("原始关键词");
  await expect(page.getByRole("button", { name: "RAG", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("region", { name: "搜索结果" })).toContainText("开发工具阅读清单");
  await expect(page.getByRole("region", { name: "搜索结果" })).not.toContainText(
    "SQLite3：嵌入式数据库实践"
  );
  await page.goto("/search/?q=SQLite&mode=keyword&d_scene=search-index-unavailable&d_delay=normal");
  await hideInspector(page);
  await expect(page.getByRole("alert")).toContainText("索引暂不可用");
});
test("delayed obsolete searches cannot overwrite the latest mode", async ({ page }) => {
  await page.goto("/search/?q=SQLite&mode=rag&d_delay=custom&d_delay_ms=800");
  await hideInspector(page);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByRole("button", { name: "关闭", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const results = page.getByRole("region", { name: "搜索结果" });
  await expect(results).toContainText("开发工具阅读清单");
  await expect(results).not.toContainText("SQLite3：嵌入式数据库实践");
  expect(new URL(page.url()).searchParams.get("mode")).toBe("keyword");
});
test("mobile mode controls remain keyboard accessible without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/search/?q=SQLite&mode=keyword&d_theme=dark&d_delay=normal");
  await hideInspector(page);
  const button = page.getByRole("button", { name: "RAG", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "搜索结果" })).toContainText(
    "SQLite3：嵌入式数据库实践"
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const size = await button.boundingBox();
  expect(size?.height).toBeGreaterThanOrEqual(44);
});
test("the official model page saves independent policy and validates only saved configuration", async ({
  page,
}) => {
  await page.goto("/admin/llm-settings?d_persona=admin&d_delay=normal");
  await hideInspector(page);
  const panel = page.getByRole("region", { name: "搜索模式设置" });
  await expect(panel).toBeVisible();
  const enabled = page.getByRole("switch", { name: "启用AI 检索（RAG）", exact: true });
  const track = await enabled.boundingBox();
  const thumb = await enabled.locator("span").boundingBox();
  expect(track).not.toBeNull();
  expect(thumb).not.toBeNull();
  if (!track || !thumb) throw new Error("Switch geometry was unavailable");
  expect(thumb.x + thumb.width).toBeLessThanOrEqual(track.x + track.width);
  await page.getByRole("switch", { name: "启用AI 改写", exact: true }).click();
  await expect(panel.getByRole("button", { name: "验证已保存配置" }).first()).toBeDisabled();
  await panel.getByRole("button", { name: "保存搜索设置" }).click();
  await expect(panel).toContainText("搜索设置已保存");
  await panel.getByRole("button", { name: "验证已保存配置" }).first().click();
  await expect(panel).toContainText("固定样例验证通过");
  await expect(page.getByRole("switch", { name: "启用AI 改写", exact: true })).toHaveAttribute(
    "aria-checked",
    "false"
  );
});
