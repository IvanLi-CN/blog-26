import { expect, test } from "@playwright/test";

async function hideInspector(page: import("@playwright/test").Page) {
  const collapse = page.getByRole("button", { name: "收起 Web Demo 控制面板" });
  if (await collapse.isVisible()) await collapse.click();
}

test.describe("AI usage admin Web Demo", () => {
  test("renders overview filters, accessible trend table, retention state, and policy controls", async ({
    page,
  }) => {
    await page.goto("/admin/ai-usage?d_persona=admin&d_delay=normal");
    await hideInspector(page);

    await expect(page.getByRole("heading", { name: "AI 用量运营" })).toBeVisible();
    await expect(page.getByText("最近七日（含今天）")).toBeVisible();
    await expect(page.getByRole("table", { name: "每日 AI 用量同值表格" })).toBeVisible();
    await expect(page.getByRole("img", { name: "每日 AI Token 消耗趋势" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "全局个人助手额度" })).toBeVisible();

    await page.getByRole("combobox", { name: "时间范围" }).click();
    await page.getByRole("option", { name: "最近三十日" }).click();
    await expect(page.getByRole("combobox", { name: "时间范围" })).toHaveText("最近三十日");
    await expect(
      page.getByRole("table", { name: "每日 AI 用量同值表格" }).locator("tbody tr")
    ).toHaveCount(30);
    await page.getByRole("combobox", { name: "时间范围" }).click();
    await page.getByRole("option", { name: "自定义范围" }).click();
    const endDate = await page.getByLabel("结束日期").inputValue();
    const startDate = new Date(`${endDate}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 2);
    const customStart = startDate.toISOString().slice(0, 10);
    const thirtyDayToday = await page
      .getByRole("table", { name: "每日 AI 用量同值表格" })
      .locator("tbody tr")
      .last()
      .innerText();
    await page.getByLabel("开始日期").fill(customStart);
    await expect(page.getByLabel("开始日期")).toHaveValue(customStart);
    await expect(
      page.getByRole("table", { name: "每日 AI 用量同值表格" }).locator("tbody tr")
    ).toHaveCount(3);
    const customRangeToday = await page
      .getByRole("table", { name: "每日 AI 用量同值表格" })
      .locator("tbody tr")
      .last()
      .innerText();
    expect(customRangeToday.replace(/\s+/gu, " ").trim()).toBe(
      thirtyDayToday.replace(/\s+/gu, " ").trim()
    );

    await page.getByRole("combobox", { name: "分组方式" }).click();
    await page.getByRole("option", { name: "按用户" }).click();
    await expect(page.getByRole("heading", { name: "分组汇总" })).toBeVisible();
    await expect(page.getByText("Rui Reader")).toBeVisible();

    await page.getByRole("combobox", { name: "结果" }).click();
    await page.getByRole("option", { name: "缺失" }).click();
    await expect(page.getByRole("table", { name: "AI 调用明细" })).toContainText("missing");
    await expect(page.getByRole("table", { name: "AI 用量分组汇总" })).toContainText("缺失");

    const tokenHourly = page.getByLabel("Token / 小时");
    await tokenHourly.fill("1200000");
    await page.getByRole("button", { name: "保存全局策略" }).click();
    await expect(page.getByText("全局配额策略已保存")).toBeVisible();
  });

  test("lists users and resets only one user's demo quota cycle", async ({ page }) => {
    await page.goto("/admin/users?d_persona=admin&d_delay=normal");
    await hideInspector(page);

    await expect(page.getByRole("heading", { name: "后台用户" })).toBeVisible();
    const otherUserRow = page.getByTestId("admin-user-row-demo-user-rui");
    await expect(otherUserRow).toContainText("估算");
    const otherUserQuota = await otherUserRow.locator("td").nth(4).innerText();
    const exhaustedRow = page.getByTestId("admin-user-row-demo-user-ming");
    await expect(exhaustedRow).toContainText("需要恢复");
    await exhaustedRow.getByRole("button", { name: "恢复额度" }).click();
    await expect(page.getByRole("dialog", { name: "恢复单用户额度" })).toBeVisible();
    await page
      .getByRole("dialog", { name: "恢复单用户额度" })
      .getByRole("button", { name: "恢复额度" })
      .click();
    await expect(exhaustedRow).toContainText("额度正常");
    expect((await otherUserRow.locator("td").nth(4).innerText()).replace(/\s+/gu, " ")).toBe(
      otherUserQuota.replace(/\s+/gu, " ")
    );
    await expect(page.getByText("Ming Reader")).toBeVisible();
  });
});
