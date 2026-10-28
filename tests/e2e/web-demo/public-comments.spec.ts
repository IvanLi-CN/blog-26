import { expect, test } from "@playwright/test";

const articlePath = "/posts/hello-world/";
const stationAdminAvatar = "/site-assets/avatar.jpg";
const defaultAvatar = "/site-assets/default-avatar.svg";

async function openComments(page: import("@playwright/test").Page, path: string, persona: string) {
  await page.goto(`${path}?d_persona=${persona}&d_delay=normal`, {
    waitUntil: "domcontentloaded",
  });
  const section = page.locator(".comment-section");
  await expect(section).toHaveCount(1);
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "评论" })).toBeVisible();
  await expect(section).not.toContainText("Conversation");
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
    for (const width of [320, 639, 640, 1279, 1280, 1440]) {
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
          borderTop: panelStyle.borderTopWidth,
          borderBottom: panelStyle.borderBottomWidth,
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
          borderTop: "0px",
          borderBottom: "0px",
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

  test("distinguishes valid empty, unavailable, and offline comment states", async ({ page }) => {
    await page.goto(`${articlePath}?d_data=empty&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const empty = page.locator(".comment-section");
    await expect(empty.getByTestId("comments-empty")).toBeVisible();
    await expect(empty.locator(".comment-empty.nature-empty")).toHaveCount(0);

    await page.goto(`${articlePath}?d_scene=comments-target-unavailable&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const unavailable = page.locator(".comment-section");
    await expect(unavailable.getByTestId("comment-target-unavailable")).toBeVisible();
    await expect(unavailable).not.toContainText("暂无评论");
    await expect(unavailable.getByLabel("评论内容")).toHaveCount(0);
    await expect(unavailable.getByRole("button", { name: "GitHub 登录" })).toHaveCount(0);

    await page.goto(`${articlePath}?d_connection=offline&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const offline = page.locator(".comment-section");
    await expect(offline.getByTestId("comment-load-error")).toBeVisible();
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("d_connection", "online");
      window.history.replaceState({}, "", url);
    });
    await offline.getByTestId("comment-retry").click();
    await expect(offline).toContainText("这篇内容的边界整理得很清楚。");
  });

  test("keeps target-unavailable state consistent across public routes", async ({ page }) => {
    for (const path of [
      articlePath,
      "/memos/memo-web-demo-1181/",
      "/projects/codex-vibe-monitor/",
    ]) {
      await page.goto(`${path}?d_scene=comments-target-unavailable&d_delay=normal`, {
        waitUntil: "domcontentloaded",
      });
      const section = page.locator(".comment-section");
      await expect(section).toHaveCount(1);
      await expect(section.getByTestId("comment-target-unavailable")).toBeVisible();
      await expect(section.getByLabel("评论内容")).toHaveCount(0);
      await expect(section.getByRole("button", { name: "GitHub 登录" })).toHaveCount(0);
      await expect(section).not.toContainText("暂无评论");
    }
  });

  test("keeps empty, offline, and avatar states consistent across public targets", async ({
    page,
  }) => {
    for (const path of [
      articlePath,
      "/memos/memo-web-demo-1181/",
      "/projects/codex-vibe-monitor/",
    ]) {
      await page.goto(`${path}?d_data=empty&d_connection=online&d_delay=normal`, {
        waitUntil: "domcontentloaded",
      });
      const empty = page.locator(".comment-section");
      await expect(empty).toHaveCount(1);
      await expect(empty.getByTestId("comments-empty")).toBeVisible();

      await page.goto(`${path}?d_connection=offline&d_delay=normal`, {
        waitUntil: "domcontentloaded",
      });
      const offline = page.locator(".comment-section");
      await expect(offline).toHaveCount(1);
      await expect(offline.getByTestId("comment-load-error")).toBeVisible();
      await page.evaluate(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("d_connection", "online");
        window.history.replaceState({}, "", url);
      });
      await offline.getByTestId("comment-retry").click();
      await expect(offline).toContainText("这篇内容的边界整理得很清楚。");

      await page.goto(
        `${path}?d_scene=comments-avatar-failure&d_persona=user&d_connection=online&d_delay=normal`,
        {
          waitUntil: "domcontentloaded",
        }
      );
      const avatarFailure = page.locator(".comment-section");
      await expect(avatarFailure).toHaveCount(1);
      await expect(avatarFailure).toContainText("这篇内容的边界整理得很清楚。");
      await expect(
        avatarFailure.locator('.comment-form img[src="/site-assets/default-avatar.svg"]')
      ).toHaveCount(1, { timeout: 15000 });
      const authorAvatars = avatarFailure.locator(
        '.comment-item__avatar img[src="/site-assets/default-avatar.svg"]'
      );
      await expect(authorAvatars).not.toHaveCount(0);
      await expect
        .poll(() =>
          avatarFailure
            .locator(".comment-item__avatar img")
            .evaluateAll(
              (images, allowedAvatars) =>
                images.length > 0 &&
                images.every((image) => allowedAvatars.includes(image.getAttribute("src"))),
              [defaultAvatar, stationAdminAvatar]
            )
        )
        .toBe(true);
    }
  });

  test("normalizes empty avatar URLs across public targets", async ({ page }) => {
    for (const path of [
      articlePath,
      "/memos/memo-web-demo-1181/",
      "/projects/codex-vibe-monitor/",
    ]) {
      await page.goto(`${path}?d_persona=user&d_connection=online&d_delay=normal`, {
        waitUntil: "domcontentloaded",
      });
      const section = page.locator(".comment-section");
      await expect(section).toHaveCount(1);
      await expect(section).toContainText("这篇内容的边界整理得很清楚。");
      await expect(section.locator(".comment-form img")).toHaveAttribute(
        "src",
        "/site-assets/default-avatar.svg"
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
    }
  });

  test("falls back to the local avatar after the author and reader URLs fail", async ({ page }) => {
    await page.goto(
      `${articlePath}?d_scene=comments-avatar-failure&d_persona=user&d_delay=normal`,
      {
        waitUntil: "domcontentloaded",
      }
    );
    const section = page.locator(".comment-section");
    await expect(section).toHaveCount(1);
    await expect(section).toContainText("这篇内容的边界整理得很清楚。");
    await expect(section.locator(".comment-form img")).toHaveAttribute(
      "src",
      "/site-assets/default-avatar.svg",
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
  });
});
