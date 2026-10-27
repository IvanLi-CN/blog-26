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
    const table = page.getByRole("table", { name: "最近七日 AI 用量同值表格" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "失败" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "中止" })).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(7);

    const usage = await page.evaluate(async () => {
      const response = await fetch("/api/admin/dashboard/ai-usage");
      return response.json();
    });
    const formatCount = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

    await expect(
      page.getByText(
        `成功 ${formatCount(usage.metric.successCallCount)} · 失败 ${formatCount(usage.metric.failureCallCount)} · 中止 ${formatCount(usage.metric.cancelledCallCount)} · 缺失 ${formatCount(usage.metric.missingCallCount)} · 估算 ${formatCount(usage.metric.estimatedCallCount)}`
      )
    ).toBeVisible();

    for (const item of usage.trend) {
      const row = table.locator("tbody tr").filter({ hasText: item.day });
      await expect(row).toHaveCount(1);
      const cells = row.locator("td");
      await expect(cells.nth(4)).toHaveText(formatCount(item.callCount));
      await expect(cells.nth(5)).toHaveText(formatCount(item.failureCallCount));
      await expect(cells.nth(6)).toHaveText(formatCount(item.cancelledCallCount));
      await expect(cells.nth(7)).toHaveText(
        `${formatCount(item.missingCallCount)} / ${formatCount(item.estimatedCallCount)}`
      );
    }
  });
});
