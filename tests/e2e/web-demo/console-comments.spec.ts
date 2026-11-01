import { expect, test } from "@playwright/test";

const memoPath = "/memos/console-demo-public-weekly-notes/";
const clippingPath = "/memos/console-demo-clipping-durable-workflows/";
const stationAdminAvatar = "/site-assets/avatar.jpg";
const defaultAvatar = "/site-assets/default-avatar.svg";

async function openComments(page: import("@playwright/test").Page, persona: string) {
  await page.goto(`${memoPath}?d_persona=${persona}&d_delay=normal`, {
    waitUntil: "domcontentloaded",
  });
  const section = page.locator(".comment-section");
  await expect.poll(() => page.locator(".comment-section:visible").count()).toBe(1);
  await expect(section).toHaveCount(1);
  await expect(section.last()).toBeVisible();
  await expect(section.last().getByRole("heading", { name: "评论" })).toBeVisible();
  await expect(section.last()).not.toContainText("Conversation");
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

  test("keeps the public comment surface flat in the Console memo route", async ({ page }) => {
    await page.goto(`${memoPath}?d_data=empty&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const section = page.locator(".comment-section:visible").last();
    await expect(section).toBeVisible();
    await expect(section.getByTestId("comments-empty")).toBeVisible();
    await expect(section.locator(".comment-empty.nature-empty")).toHaveCount(0);
  });

  test("hides the composer when the Console memo target is unavailable", async ({ page }) => {
    await page.goto(`${memoPath}?d_scene=comments-target-unavailable&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const section = page.locator(".comment-section:visible").last();
    await expect(section.getByTestId("comment-target-unavailable")).toBeVisible();
    await expect(section.getByLabel("评论内容")).toHaveCount(0);
    await expect(section.getByRole("button", { name: "GitHub 登录" })).toHaveCount(0);
    await expect(section).not.toContainText("暂无评论");
  });

  test("recovers Console memo comments through the retry control", async ({ page }) => {
    await page.goto(`${memoPath}?d_connection=online&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const section = page.locator(".comment-section:visible").last();
    await expect(section).toContainText("这篇内容的边界整理得很清楚。");
    await page.getByTestId("web-demo-inspector-trigger").click();
    await page.getByTestId("web-demo-connection-offline").click();
    const offline = page.locator(".comment-section:visible").last();
    await expect(offline.getByTestId("comment-retry")).toBeVisible();
    await page.getByRole("button", { name: "收起 Web Demo 控制面板" }).click();
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("d_connection", "online");
      window.history.replaceState({}, "", url);
    });
    await offline.getByTestId("comment-retry").click();
    await expect(offline).toContainText("这篇内容的边界整理得很清楚。");
  });

  test("keeps an empty comment state in the Console clipping route", async ({ page }) => {
    await page.goto(`${clippingPath}?d_data=empty&d_persona=admin&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator('[data-testid="clipping-detail"]:visible').last()).toBeVisible();
    const section = page.locator(".comment-section:visible").last();
    await expect(section).toBeVisible();
    await expect(section.getByTestId("comments-empty")).toBeVisible();
    await expect(section.locator(".comment-empty.nature-empty")).toHaveCount(0);
  });

  test("hides the composer when the Console clipping target is unavailable", async ({ page }) => {
    await page.goto(`${clippingPath}?d_scene=comments-target-unavailable&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator('[data-testid="clipping-detail"]:visible').last()).toBeVisible();
    const section = page.locator(".comment-section:visible").last();
    await expect(section.getByTestId("comment-target-unavailable")).toBeVisible();
    await expect(section.getByLabel("评论内容")).toHaveCount(0);
    await expect(section.getByRole("button", { name: "GitHub 登录" })).toHaveCount(0);
    await expect(section).not.toContainText("暂无评论");
  });

  test("recovers Console clipping comments through the retry control", async ({ page }) => {
    await page.goto(`${clippingPath}?d_connection=online&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const section = page.locator(".comment-section:visible").last();
    await expect(section).toContainText("这篇内容的边界整理得很清楚。");
    await page.getByTestId("web-demo-inspector-trigger").click();
    await page.getByTestId("web-demo-connection-offline").click();
    const offline = page.locator(".comment-section:visible").last();
    await expect(offline.getByTestId("comment-retry")).toBeVisible();
    await page.getByRole("button", { name: "收起 Web Demo 控制面板" }).click();
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("d_connection", "online");
      window.history.replaceState({}, "", url);
    });
    await offline.getByTestId("comment-retry").click();
    await expect(offline).toContainText("这篇内容的边界整理得很清楚。");
  });

  test("uses the avatar fallback in the Console clipping route", async ({ page }) => {
    await page.goto(
      `${clippingPath}?d_scene=comments-avatar-failure&d_persona=admin&d_github_binding=bound&d_delay=normal`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.locator('[data-testid="clipping-detail"]:visible').last()).toBeVisible();
    await expect(page.locator(".comment-section")).toHaveCount(1);
    const isMobileViewport = await page.evaluate(() => window.innerWidth < 1024);
    if (isMobileViewport) {
      const sections = page.locator(".clipping-comments-below .comment-section:visible");
      await expect(sections).toHaveCount(1);
      const section = sections.last();
      await expect(section).toBeVisible();
      await expect(section.getByRole("heading", { name: "评论" })).toBeVisible();
      await expect(section).not.toContainText("Conversation");
      await expect(section).toContainText("这篇内容的边界整理得很清楚。");
      await expect(section.locator(".comment-form img")).toHaveAttribute(
        "src",
        stationAdminAvatar,
        { timeout: 15000 }
      );
      const authorAvatars = section.locator(".comment-item__avatar img");
      await expect(authorAvatars).not.toHaveCount(0);
      await expect
        .poll(() =>
          authorAvatars.evaluateAll(
            (images, allowedAvatars) =>
              images.every((image) => allowedAvatars.includes(image.getAttribute("src"))),
            [defaultAvatar, stationAdminAvatar]
          )
        )
        .toBe(true);
      await expect(
        section
          .locator(".comment-item--root")
          .filter({ hasText: "管理员身份绑定后的评论会直接公开，并保留作者标记。" })
          .locator(".comment-item__avatar img")
      ).toHaveAttribute("src", stationAdminAvatar);
      return;
    }
    const commentsTab = page.getByRole("tab", { name: "评论" });
    await commentsTab.click();
    const panelId = await commentsTab.getAttribute("aria-controls");
    if (!panelId) throw new Error("Comments tab must expose its panel");
    const section = page.locator(`#${panelId} .comment-section`);
    await expect(section).toHaveCount(1);
    await expect(section).toContainText("这篇内容的边界整理得很清楚。");
    await expect(section.locator(".comment-form img")).toHaveAttribute("src", stationAdminAvatar, {
      timeout: 15000,
    });
    const authorAvatars = section.locator(".comment-item__avatar img");
    await expect(authorAvatars).not.toHaveCount(0);
    await expect
      .poll(() =>
        authorAvatars.evaluateAll(
          (images, allowedAvatars) =>
            images.every((image) => allowedAvatars.includes(image.getAttribute("src"))),
          [defaultAvatar, stationAdminAvatar]
        )
      )
      .toBe(true);
    await expect(
      section
        .locator(".comment-item--root")
        .filter({ hasText: "管理员身份绑定后的评论会直接公开，并保留作者标记。" })
        .locator(".comment-item__avatar img")
    ).toHaveAttribute("src", stationAdminAvatar);
  });

  test("normalizes empty avatar URLs in the Console clipping route", async ({ page }) => {
    await page.goto(`${clippingPath}?d_persona=admin&d_github_binding=bound&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator('[data-testid="clipping-detail"]:visible').last()).toBeVisible();
    await expect(page.locator(".comment-section")).toHaveCount(1);
    const isMobileViewport = await page.evaluate(() => window.innerWidth < 1024);
    let section = page.locator(".comment-section").last();
    if (isMobileViewport) {
      section = page.locator(".clipping-comments-below .comment-section:visible").last();
    } else {
      const commentsTab = page.getByRole("tab", { name: "评论" });
      await commentsTab.click();
      const panelId = await commentsTab.getAttribute("aria-controls");
      if (!panelId) throw new Error("Comments tab must expose its panel");
      section = page.locator(`#${panelId} .comment-section`);
    }
    await expect(section).toBeVisible();
    await expect(section).toContainText("这篇内容的边界整理得很清楚。");
    await expect(section.locator(".comment-form img")).toHaveAttribute("src", stationAdminAvatar);
    const authorAvatars = section.locator(".comment-item__avatar img");
    await expect(authorAvatars).not.toHaveCount(0);
    await expect
      .poll(() =>
        authorAvatars.evaluateAll(
          (images, allowedAvatars) =>
            images.every((image) => allowedAvatars.includes(image.getAttribute("src"))),
          [defaultAvatar, stationAdminAvatar]
        )
      )
      .toBe(true);
    await expect(
      section
        .locator(".comment-item--root")
        .filter({ hasText: "管理员身份绑定后的评论会直接公开，并保留作者标记。" })
        .locator(".comment-item__avatar img")
    ).toHaveAttribute("src", stationAdminAvatar);
  });
});
