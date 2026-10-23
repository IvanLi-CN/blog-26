import { expect, test } from "@playwright/test";

const memoPath = "/memos/console-demo-public-weekly-notes/";
const clippingPath = "/memos/console-demo-clipping-durable-workflows/";

async function openComments(page: import("@playwright/test").Page, persona: string) {
  await page.goto(`${memoPath}?d_persona=${persona}&d_delay=normal`, {
    waitUntil: "domcontentloaded",
  });
  const section = page.locator(".comment-section");
  await expect.poll(() => page.locator(".comment-section:visible").count()).toBe(1);
  await expect(section.last()).toBeVisible();
  await expect(section.last()).toContainText("这篇内容的边界整理得很清楚。");
  return section.last();
}

test.describe("Console comments Web Demo", () => {
  test("keeps reader editing unavailable and lets admin approve from more actions", async ({
    page,
  }) => {
    const user = await openComments(page, "user");
    await expect(user).toContainText("这条评论用于演示待审核状态。");
    await expect(user.locator('[aria-label="更多评论操作"]')).toHaveCount(0);
    await expect(user.getByText("编辑", { exact: true })).toHaveCount(0);

    const admin = await openComments(page, "admin");
    const pending = admin.locator(".comment-item--root").filter({
      hasText: "这条评论用于演示待审核状态。",
    });
    await pending.locator('[aria-label="更多评论操作"]').click();
    await expect(page.getByRole("menuitem", { name: "批准" })).toBeVisible();
    await page.getByRole("menuitem", { name: "批准" }).click();
    await expect(pending.getByText("待审核", { exact: true })).toHaveCount(0);
  });

  test("supports keyboard switching between comments and private article chat", async ({
    page,
  }) => {
    await page.goto(`${clippingPath}?d_persona=admin&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator('[data-testid="clipping-detail"]:visible').last()).toBeVisible();
    const isMobileViewport = await page.evaluate(() => window.innerWidth < 1024);
    test.skip(isMobileViewport, "Mobile clipping details use the article chat bottom sheet");
    const commentsTab = page.getByRole("tab", { name: "评论" });
    const chatTab = page.getByRole("tab", { name: "文章对话" });
    await commentsTab.focus();
    await commentsTab.press("ArrowRight");
    await expect(chatTab).toHaveAttribute("aria-selected", "true");
    await expect(commentsTab).toHaveAttribute("aria-selected", "false");
    const commentsPanelId = await commentsTab.getAttribute("aria-controls");
    const aiPanelId = await chatTab.getAttribute("aria-controls");
    if (!commentsPanelId || !aiPanelId) throw new Error("Reader tabs must expose their panels");
    await expect(page.locator(`[id="${commentsPanelId}"]`)).toHaveCount(1);
    await expect(page.locator(`[id="${aiPanelId}"]`)).toHaveCount(1);
    await expect(page.locator(`#${commentsPanelId}`)).toBeHidden();
    await expect(page.locator(`#${aiPanelId}`)).toBeVisible();
    await chatTab.press("Home");
    await expect(commentsTab).toHaveAttribute("aria-selected", "true");
    await expect(chatTab).toHaveAttribute("aria-selected", "false");
    await expect(page.locator(`#${commentsPanelId}`)).toBeVisible();
    await expect(page.locator(`#${aiPanelId}`)).toBeHidden();
  });
});
