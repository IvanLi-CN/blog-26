import { expect, test } from "@playwright/test";

const articlePath = "/posts/hello-world/";

async function openComments(page: import("@playwright/test").Page, path: string, persona: string) {
  await page.goto(`${path}?d_persona=${persona}&d_delay=normal`, {
    waitUntil: "domcontentloaded",
  });
  const section = page.locator(".comment-section");
  await expect(section).toBeVisible();
  await expect(section).toContainText("这篇内容的边界整理得很清楚。");
  return section;
}

test.describe("Public comments Web Demo", () => {
  test("keeps pending comments private and exposes moderation only to admin", async ({ page }) => {
    const guest = await openComments(page, articlePath, "guest");
    await expect(guest.getByRole("button", { name: "GitHub 登录" })).toBeVisible();
    await expect(guest).not.toContainText("这条评论用于演示待审核状态。");
    await expect(guest.locator('[aria-label="更多评论操作"]')).toHaveCount(0);

    const user = await openComments(page, articlePath, "user");
    await expect(user).toContainText("这条评论用于演示待审核状态。");
    await expect(user.getByText("待审核", { exact: true })).toBeVisible();
    await expect(user.locator('[aria-label="更多评论操作"]')).toHaveCount(0);
    await expect(user.getByText("编辑", { exact: true })).toHaveCount(0);

    const admin = await openComments(page, articlePath, "admin");
    const pending = admin.locator(".comment-item--root").filter({
      hasText: "这条评论用于演示待审核状态。",
    });
    await pending.locator('[aria-label="更多评论操作"]').click();
    await expect(page.getByRole("menuitem", { name: "批准" })).toBeVisible();
    await page.getByRole("menuitem", { name: "批准" }).click();
    await expect(pending.getByText("待审核", { exact: true })).toHaveCount(0);
  });

  test("keeps the comment column and mobile card rule at responsive boundaries", async ({
    page,
  }) => {
    const section = await openComments(page, articlePath, "guest");
    for (const width of [639, 640, 1279, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.evaluate(() => {
        const layout = document.querySelector<HTMLElement>(".post-detail-layout");
        const comments = document.querySelector<HTMLElement>(".post-detail-comments");
        const panel = document.querySelector<HTMLElement>(".comment-panel");
        if (!layout || !comments || !panel) return null;
        const layoutStyle = getComputedStyle(layout);
        const panelStyle = getComputedStyle(panel);
        return {
          columns: layoutStyle.gridTemplateColumns.split(" ").length,
          position: getComputedStyle(comments).position,
          borderLeft: panelStyle.borderLeftWidth,
          borderRight: panelStyle.borderRightWidth,
          radius: panelStyle.borderRadius,
          shadow: panelStyle.boxShadow,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      expect(geometry, `${width}px comment geometry`).not.toBeNull();
      expect(geometry?.overflow, `${width}px no horizontal overflow`).toBe(false);
      if (width < 640) {
        expect(geometry).toMatchObject({
          columns: 1,
          position: "static",
          borderLeft: "0px",
          borderRight: "0px",
          radius: "0px",
          shadow: "none",
        });
      } else if (width < 1280) {
        expect(geometry).toMatchObject({ columns: 1, position: "static" });
      } else {
        expect(geometry).toMatchObject({ columns: 2, position: "sticky" });
      }
      await expect(section).toBeVisible();
    }
  });

  test("uses the shared lifecycle for memo and project targets", async ({ page }) => {
    for (const path of ["/memos/memo-web-demo-1181/", "/projects/codex-vibe-monitor/"]) {
      const section = await openComments(page, path, "guest");
      await expect(section.getByRole("button", { name: "GitHub 登录" })).toBeVisible();
      await expect(section).toContainText("评论会在审核通过后公开显示。");
    }
  });
});
