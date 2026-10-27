import { expect, test } from "@playwright/test";

async function hideInspector(page: import("@playwright/test").Page) {
  const collapse = page.getByRole("button", { name: "收起 Web Demo 控制面板" });
  if (await collapse.isVisible()) await collapse.click();
}

test.describe("Admin dashboard AI usage Web Demo", () => {
  test("renders the seven-day usage cards, stacked trend, and same-value table", async ({
    page,
  }) => {
    await page.goto("/admin/dashboard?d_persona=admin&d_delay=normal");
    await hideInspector(page);

    await expect(page.getByRole("heading", { name: "管理员仪表盘" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "最近七日 AI 用量" })).toBeVisible();
    await expect(page.getByText("统计时区 Asia/Shanghai")).toBeVisible();
    await expect(page.getByText("输入 Token")).toBeVisible();
    await expect(page.getByText("缓存命中 Token")).toBeVisible();
    await expect(page.getByText("输出 Token")).toBeVisible();
    await expect(page.getByText("调用次数")).toBeVisible();
    await expect(page.getByRole("img", { name: "最近七日 AI Token 消耗趋势" })).toBeVisible();
    await expect(page.getByRole("table", { name: "最近七日 AI 用量同值表格" })).toBeVisible();
    await expect(
      page.getByRole("table", { name: "最近七日 AI 用量同值表格" }).locator("tbody tr")
    ).toHaveCount(7);
  });
});
