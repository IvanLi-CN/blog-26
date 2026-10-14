import { expect, test } from "@playwright/test";

test.describe("Content sync RAG coverage Web Demo", () => {
  test("chips select one coverage scope and reset the Playbook edition", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-sync-partial&d_theme=dark");
    const scope = page.getByRole("group", { name: "RAG 范围" });
    const coverage = page.getByTestId("rag-coverage").first();
    await expect(scope.getByRole("button", { name: "全部", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(coverage.locator("dd").first()).toHaveText("379");
    await scope.getByRole("button", { name: "博客", exact: true }).click();
    await expect(coverage.locator("dd").first()).toHaveText("299");
    await scope.getByRole("button", { name: "Playbook", exact: true }).click();
    await expect(coverage.locator("dd").first()).toHaveText("80");
    await page.getByLabel("Playbook 版本").selectOption("previous");
    await expect(page.getByRole("button", { name: "补建缺失 / 过时 / 失败" })).toBeDisabled();
    await scope.getByRole("button", { name: "全部", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Playbook 版本")).toHaveCount(0);
    await scope.getByRole("button", { name: "Playbook", exact: true }).click();
    await expect(page.getByLabel("Playbook 版本")).toHaveValue("current");
    await expect(scope.locator('[aria-pressed="true"]')).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });

  test("repair starts a source task and cancellation retains its completed work", async ({
    page,
  }) => {
    await page.goto("/admin/content-sync?d_scene=admin-sync-partial");
    await page
      .getByRole("group", { name: "RAG 范围" })
      .getByRole("button", { name: "Playbook", exact: true })
      .click();
    await page.getByRole("button", { name: "补建缺失 / 过时 / 失败" }).click();
    const task = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "任务与历史" }) });
    await expect(task).toContainText("playbook · RAG 索引");
    await expect(task).toContainText("144/240");
    await page.getByRole("button", { name: "取消此任务" }).click();
    await expect(task).toContainText("cancelled");
    await expect(task).toContainText("144/240");
    await expect(page.getByRole("button", { name: "取消此任务" })).toHaveCount(0);
  });

  test("unconfigured coverage stays unknown and disables projection actions", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-sync-unconfigured&d_theme=light");
    await expect(page.getByText("Embedding 未配置；覆盖状态不可得。")).toBeVisible();
    const values = page.getByTestId("rag-coverage").first().locator("dd");
    await expect(values).toHaveText(["379", "—", "—", "—", "—", "—"]);
    await expect(page.getByRole("button", { name: "补建缺失 / 过时 / 失败" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "重建所选来源全部分块" })).toBeDisabled();
  });

  test("zero coverage and disabled cached sources preserve distinct counts", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-sync-unindexed");
    await expect(page.getByTestId("rag-coverage").first().locator("dd")).toHaveText([
      "379",
      "0",
      "379",
      "0",
      "0",
      "0.0%",
    ]);
    await page.goto("/admin/content-sync?d_scene=admin-sync-disabled");
    const sourceCard = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "内容源状态" }) });
    await expect(sourceCard).toContainText("80");
    await expect(sourceCard).toContainText("同步停用");
    await expect(page.getByTestId("rag-coverage").first().locator("dd").first()).toHaveText("379");
  });
});
