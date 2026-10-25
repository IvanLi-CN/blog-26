import { expect, test } from "@playwright/test";

test.describe("Content sync RAG coverage Web Demo", () => {
  test("shows the Playbook state machine and admin-only source identity", async ({ page }) => {
    const states = [
      ["admin-dashboard", "当前"],
      ["admin-sync-unindexed", "当前"],
      ["admin-sync-outdated", "过时"],
      ["admin-sync-failed", "失败"],
      ["admin-sync-failed&d_data=empty", "无效快照"],
      ["admin-sync-disabled", "不可用"],
      ["admin-sync-unconfigured", "未配置"],
    ] as const;

    for (const [query, label] of states) {
      await page.goto(`/admin/content-sync?d_scene=${query}`);
      const status = page.getByTestId("playbook-sync-status");
      await expect(status.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByTestId("playbook-source-identity")).toContainText(
        "IvanLi-CN/style-playbook-skills"
      );
      await expect(status).toContainText("当前 commit");
      await expect(status).toContainText("当前 content hash");
      await expect(status).toContainText("上一快照");
    }
  });

  test("shows RAG coverage insufficiency as a separate admin state", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-sync-partial&d_theme=dark");
    await expect(page.getByTestId("rag-incomplete")).toContainText("RAG 覆盖不足");
    await expect(page.getByTestId("rag-incomplete")).toContainText("blog");
    await expect(page.getByTestId("rag-incomplete")).toContainText("playbook");
  });

  test("keeps Playbook operational identity out of the public API", async ({ page }) => {
    await page.goto("/admin/content-sync?d_scene=admin-sync-partial");
    const response = await page.evaluate(async () => {
      const result = await fetch("/api/public/page?path=%2F");
      return { status: result.status, body: await result.text() };
    });
    expect(response.status).toBe(200);
    expect(response.body).not.toContain("IvanLi-CN/style-playbook-skills");
    expect(response.body).not.toContain("sourceStatus");
    expect(response.body).not.toContain("taskId");
  });

  test("keeps admin sync status behind the admin boundary", async ({ page }) => {
    await page.goto("/admin/content-sync?d_persona=guest");
    const response = await page.evaluate(async () => {
      const result = await fetch("/api/admin/content-sync/status");
      return { status: result.status, body: await result.text() };
    });
    expect(response.status).toBe(403);
    expect(response.body).toContain("管理员权限");
  });

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
    await expect(
      page
        .getByTestId("playbook-sync-status")
        .locator("span")
        .filter({ hasText: /^pending$/ })
    ).toBeVisible();
    await expect(page.getByTestId("playbook-semantic-projection")).toContainText("48");
    await expect(page.getByTestId("playbook-semantic-projection")).toContainText("24");
    await expect(page.getByTestId("playbook-semantic-projection")).toContainText("0");
    await scope.getByRole("button", { name: "博客", exact: true }).click();
    await expect(
      page
        .getByTestId("playbook-sync-status")
        .locator("span")
        .filter({ hasText: /^pending$/ })
    ).toBeVisible();
    await expect(page.getByTestId("playbook-semantic-projection")).toContainText("48");
    await expect(page.getByTestId("playbook-semantic-projection")).toContainText("24");
    await expect(page.getByTestId("playbook-semantic-projection")).toContainText("0");
    await scope.getByRole("button", { name: "Playbook", exact: true }).click();
    const edition = page.getByRole("combobox", { name: "Playbook 版本" });
    await edition.click();
    await page.getByRole("option", { name: "上一版详情" }).click();
    await expect(page.getByRole("button", { name: "补建缺失 / 过时 / 失败" })).toBeDisabled();
    await scope.getByRole("button", { name: "全部", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Playbook 版本")).toHaveCount(0);
    await scope.getByRole("button", { name: "Playbook", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Playbook 版本" })).toHaveText("当前版");
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
    const values = page.getByTestId("rag-coverage").first().locator("dd");
    await expect(values.first()).toHaveText("379");
    await expect(page.getByText("Embedding 未配置；覆盖状态不可得。")).toBeVisible();
    await expect(values).toHaveText(["379", "—", "—", "—", "—", "—"]);
    await expect(page.getByRole("button", { name: "补建缺失 / 过时 / 失败" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "重建所选来源全部分块" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "刷新 Playbook" })).toBeDisabled();
    const incomplete = page.getByTestId("rag-incomplete");
    await expect(incomplete).toContainText("blog");
    await expect(incomplete).toContainText("playbook");
    await page
      .getByRole("group", { name: "RAG 范围" })
      .getByRole("button", { name: "博客", exact: true })
      .click();
    await expect(incomplete).toContainText("blog");
    await expect(incomplete).not.toContainText("playbook");
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

  test("Playbook refresh returns an async task and exposes its checking state", async ({
    page,
  }) => {
    await page.goto("/admin/content-sync?d_scene=admin-dashboard");
    await page.getByRole("button", { name: "刷新 Playbook" }).click();
    await expect(page.getByTestId("content-sync-queued")).toBeVisible();
    await expect(page.getByTestId("playbook-sync-status")).toContainText("检查中");
    await expect(page.getByTestId("playbook-sync-task")).toContainText("running");
    await expect(page.getByRole("button", { name: "刷新 Playbook" })).toBeDisabled();
  });
});
