import { expect, test } from "@playwright/test";

test.describe("Project status Web Demo", () => {
  test("shows the admin problem list and compact project-by-link-group matrix", async ({
    page,
  }) => {
    await page.goto("/admin/project-status?d_persona=admin&d_delay=normal");

    await expect(page.getByRole("heading", { name: "项目状态", exact: true })).toBeVisible();
    const problemTable = page.getByRole("table", { name: "项目入口问题列表" });
    await expect(problemTable).toBeVisible();
    await expect(problemTable.getByRole("row")).toHaveCount(5);

    const matrix = page.getByRole("table", {
      name: "项目与链接分组状态一览表（异常项目优先）",
    });
    await expect(matrix).toBeVisible();
    await expect(matrix.getByRole("columnheader")).toHaveText([
      "项目",
      "项目站点",
      "Demo",
      "官方文档",
      "文档",
      "开源仓库",
    ]);
    await expect(matrix.locator("tbody > tr")).toHaveCount(16);
    await page.getByRole("combobox", { name: "筛选项目分类" }).click();
    await expect(page.getByRole("option", { name: "开发工具" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "检查历史", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });

  test("shows the checking state after a manual trigger", async ({ page }) => {
    await page.goto("/admin/project-status?d_persona=admin&d_delay=normal");
    await page.getByRole("button", { name: "手动检查", exact: true }).click();
    await expect(page.getByRole("button", { name: "检查中", exact: true })).toBeDisabled();
    await expect(page.getByText(/批次正在运行/)).toBeVisible();
    await expect(page.getByRole("button", { name: "手动检查", exact: true })).toBeEnabled({
      timeout: 10_000,
    });
    await expect(page.getByRole("cell", { name: "手动", exact: true })).toHaveCount(2);
    const historyTable = page.locator("table").last();
    await expect(
      historyTable.locator("tbody > tr").first().getByText("手动", { exact: true })
    ).toBeVisible();
  });
});
