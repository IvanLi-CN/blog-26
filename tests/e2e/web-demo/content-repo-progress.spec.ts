import { expect, test } from "@playwright/test";

test.describe("Content repository task progress Web Demo", () => {
  test("shows a partial task with skips, failures and retry", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-repo-partial");
    const card = page.getByTestId("content-task-progress");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-status", "failed");
    await expect(page.getByTestId("content-task-status")).toContainText("失败");
    await page.getByTestId("content-task-toggle-all").click();
    await page.getByTestId("content-task-filter-all").click();
    await expect(page.getByTestId("content-task-items")).toContainText("blog/content-repo-sync.md");
    await expect(page.getByTestId("content-task-items")).toContainText("blog/merge-demo.md");
    await page.getByTestId("content-task-filter-skipped").click();
    await expect(page.getByTestId("content-task-items")).toContainText("附件已变化");
    await page.getByTestId("content-task-filter-all").click();
    await expect(page.getByTestId("content-task-retry")).toBeVisible();
    await page.getByTestId("content-task-retry").click();
    await expect(card).toHaveAttribute("data-status", "running");
  });

  test("cancels a running push and retains completed work", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-repo-running-push");
    const card = page.getByTestId("content-task-progress");
    await expect(card).toHaveAttribute("data-status", "running");
    await expect(page.getByTestId("content-task-progress-bar")).toBeVisible();
    await page.getByTestId("content-task-cancel").click();
    await expect(card).toHaveAttribute("data-status", "cancelled");
    await page.getByTestId("content-task-toggle-all").click();
    await page.getByTestId("content-task-filter-all").click();
    await expect(page.getByTestId("content-task-items")).toContainText("blog/content-repo-sync.md");
  });

  test("shows the legacy task note when item records are absent", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-repo-legacy");
    await expect(page.getByTestId("content-task-progress")).toBeVisible();
    await expect(page.getByTestId("content-task-items-empty")).toContainText("逐项进度上线之前");
  });

  test("selects eligible merge files and exposes batch actions", async ({ page }) => {
    await page.goto("/admin/content-merge?d_scene=admin-merge-batch");
    const toolbar = page.getByTestId("content-merge-batch-toolbar");
    await expect(toolbar).toBeVisible();
    await page.getByTestId("content-merge-select-push").click();
    await expect(page.getByTestId("content-merge-push-selected")).toBeEnabled();
    await page.getByTestId("content-merge-clear").click();
    await expect(page.getByTestId("content-merge-push-selected")).toBeDisabled();
    await page.getByTestId("file-card-select-blog/content-repo-sync.md").click();
    await expect(page.getByTestId("content-merge-push-selected")).toBeEnabled();
  });

  test("keeps the task and batch surfaces within a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/admin/content-sync?d_scene=admin-repo-partial");
    await expect(page.getByTestId("content-task-progress")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.goto("/admin/content-merge?d_scene=admin-merge-batch");
    await expect(page.getByTestId("content-merge-batch-toolbar")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
});
