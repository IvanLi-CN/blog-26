import { expect, test } from "@playwright/test";

const articlePath = "/posts/hello-world/";
const seededAdminComment = "管理员身份绑定后的评论会直接公开，并保留作者标记。";
const viewport =
  process.env.WEB_DEMO_VIEWPORT === "mobile"
    ? { width: 393, height: 852 }
    : { width: 1440, height: 1000 };

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
}

async function waitForWebDemoInspectorHydration(
  page: import("@playwright/test").Page,
  app: "public" | "admin"
) {
  await expect(page.locator(`body[data-web-demo-inspector-app="${app}"]`)).toHaveAttribute(
    "data-web-demo-inspector-open",
    /^(true|false)$/
  );
}

async function openComments(
  page: import("@playwright/test").Page,
  persona: "user" | "admin",
  binding: "unbound" | "bound"
) {
  await page.goto(
    `${articlePath}?d_persona=${persona}&d_github_binding=${binding}&d_delay=normal`,
    { waitUntil: "domcontentloaded" }
  );
  const section = page.locator(".comment-section");
  await expect(section).toBeVisible();
  await expect(section).toContainText("这篇内容的边界整理得很清楚。");
  return section;
}

test.describe("GitHub admin binding Web Demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(viewport);
  });

  test("keeps ordinary readers review-gated and bound admins directly publish", async ({
    page,
  }) => {
    const reader = await openComments(page, "user", "unbound");
    await expect(reader.getByText("GitHub 读者", { exact: true })).toBeVisible();
    await expect(reader.getByRole("button", { name: "提交审核" })).toBeVisible();
    await expect(reader.getByRole("button", { name: "提交审核" })).toBeDisabled();

    await reader.getByRole("textbox", { name: "评论内容" }).fill("普通读者的新评论仍需审核。");
    await reader.getByRole("button", { name: "提交审核" }).click();
    await expect(reader.getByRole("alert")).toContainText("评论已提交，正在等待审核");
    await expect(reader).toContainText("普通读者的新评论仍需审核。");
    await expect(
      reader.locator(".comment-item--root").filter({ hasText: "普通读者的新评论仍需审核。" })
    ).toContainText("待审核");

    const unboundAdmin = await openComments(page, "admin", "unbound");
    await expect(
      unboundAdmin.locator(".comment-form").getByText("管理员", { exact: true })
    ).toBeVisible();
    await expect(unboundAdmin.getByRole("button", { name: "直接发布" })).toBeVisible();
    await unboundAdmin
      .getByRole("textbox", { name: "评论内容" })
      .fill("未绑定管理员的新评论也会直接公开。");
    await unboundAdmin.getByRole("button", { name: "直接发布" }).click();
    await expect(unboundAdmin.getByRole("alert")).toContainText("管理员评论已公开");
    const unboundCreated = unboundAdmin.locator(".comment-item--root").filter({
      hasText: "未绑定管理员的新评论也会直接公开。",
    });
    await expect(unboundCreated.getByText("管理员", { exact: true })).toBeVisible();

    const boundAdmin = await openComments(page, "admin", "bound");
    await expect(
      boundAdmin.locator(".comment-form").getByText("管理员", { exact: true })
    ).toBeVisible();
    await expect(boundAdmin.getByRole("button", { name: "直接发布" })).toBeVisible();
    const seeded = boundAdmin.locator(".comment-item--root").filter({
      hasText: seededAdminComment,
    });
    await expect(seeded.getByText("管理员", { exact: true })).toBeVisible();

    await boundAdmin
      .getByRole("textbox", { name: "评论内容" })
      .fill("绑定管理员的新评论会直接公开。");
    await boundAdmin.getByRole("button", { name: "直接发布" }).click();
    await expect(boundAdmin.getByRole("alert")).toContainText("管理员评论已公开");
    const created = boundAdmin.locator(".comment-item--root").filter({
      hasText: "绑定管理员的新评论会直接公开。",
    });
    await expect(created).toBeVisible();
    await expect(created.getByText("管理员", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("unbinds through the admin page and keeps existing admin comments public", async ({
    page,
  }) => {
    await page.goto("/admin/github-binding?d_persona=admin&d_github_binding=bound&d_delay=normal", {
      waitUntil: "domcontentloaded",
    });
    await expectNoHorizontalOverflow(page);
    const bindingStatus = page.getByText("已绑定", { exact: true });
    await expect(bindingStatus).toBeVisible();
    await expect(bindingStatus).toHaveCSS("white-space", "nowrap");
    const avatarBox = await page.locator('main img[alt="ivan-demo"]').boundingBox();
    const displayNameBox = await page.getByText("Ivan", { exact: true }).boundingBox();
    if (!avatarBox || !displayNameBox) throw new Error("GitHub profile identity is not rendered");
    expect(
      Math.abs(avatarBox.y + avatarBox.height / 2 - (displayNameBox.y + displayNameBox.height / 2))
    ).toBeLessThan(32);
    const unbindButton = page.getByRole("button", { name: "解绑" });
    await expect(unbindButton).toHaveAccessibleName("解绑");
    await unbindButton.focus();
    await expect(unbindButton).toBeFocused();
    await page.keyboard.press("Enter");
    const unbindDialog = page.getByRole("dialog", { name: "解绑 GitHub 身份" });
    await expect(unbindDialog).toBeVisible();
    await expect(unbindDialog).toHaveAttribute("aria-modal", "true");
    await expect(unbindDialog.getByRole("button", { name: "取消" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(unbindDialog).toBeHidden();
    await expect(unbindButton).toBeFocused();
    await page.keyboard.press("Enter");
    await unbindDialog.getByRole("button", { name: "确认解绑" }).click();
    await expect(page).toHaveURL(/d_github_binding=unbound/);
    await expect(page.getByText("GitHub 管理员身份已解绑", { exact: true })).toBeVisible();
    await expect(page.getByText("未绑定", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "绑定 GitHub" })).toBeVisible();
    await page.getByRole("button", { name: "绑定 GitHub" }).click();
    await expect(page.getByRole("status")).toContainText("演示绑定已完成");
    await expect(page.getByText("已绑定", { exact: true })).toBeVisible();
    await waitForWebDemoInspectorHydration(page, "admin");
    await page.getByTestId("web-demo-inspector-trigger").click();
    const inspectorPanel = page.getByRole("region", { name: "Web Demo 调试控制面板" });
    await expect(inspectorPanel).toContainText("模拟绑定 GitHub");
    await expectNoHorizontalOverflow(page);

    const publicPage = await page.goto(
      `${articlePath}?d_persona=admin&d_github_binding=unbound&d_delay=normal`,
      { waitUntil: "domcontentloaded" }
    );
    expect(publicPage?.ok()).toBe(true);
    const section = page.locator(".comment-section");
    await expect(section).toBeVisible();
    await expect(
      section.locator(".comment-form").getByText("管理员", { exact: true })
    ).toBeVisible();
    await expect(section.getByRole("button", { name: "直接发布" })).toBeVisible();
    const seeded = section.locator(".comment-item--root").filter({ hasText: seededAdminComment });
    await expect(seeded).toBeVisible();
    await expect(seeded.getByText("管理员", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("shares binding state and restores a soft-deleted admin comment as public", async ({
    page,
  }) => {
    await page.goto(`${articlePath}?d_persona=admin&d_github_binding=bound&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    await waitForWebDemoInspectorHydration(page, "public");
    const inspector = page.getByTestId("web-demo-inspector-trigger");
    await expect(inspector).toHaveAccessibleName("打开 Web Demo 调试控制面板");
    await inspector.focus();
    await expect(inspector).toBeFocused();
    await page.keyboard.press("Enter");
    const inspectorPanel = page.getByRole("region", { name: "Web Demo 调试控制面板" });
    await expect(inspectorPanel).toBeVisible();
    await expect(
      inspectorPanel.getByRole("button", { name: "收起 Web Demo 控制面板" })
    ).toBeVisible();
    await expect(page.getByTestId("web-demo-github-binding-bound")).toBeVisible();
    await page.getByTestId("web-demo-github-binding-unbound").click();
    await expect(page).toHaveURL(/d_github_binding=unbound/);
    await page.getByTestId("web-demo-github-binding-bound").click();
    await expect(page).toHaveURL(/d_github_binding=bound/);
    const closeInspector = page.getByRole("button", { name: "收起 Web Demo 控制面板" });
    await closeInspector.focus();
    await closeInspector.press("Enter");
    await expect(page.getByTestId("web-demo-inspector-trigger")).toBeVisible();

    const section = page.locator(".comment-section");
    await expect(section).toBeVisible();
    const seeded = section.locator(".comment-item--root").filter({ hasText: seededAdminComment });
    await seeded.getByRole("button", { name: "更多评论操作" }).click();
    await page.getByRole("menuitem", { name: "软删除" }).click();
    const deleteDialog = page.getByRole("dialog").filter({ hasText: "确认删除" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "确认删除" }).click();
    await expect(section.getByRole("alert")).toContainText("评论已删除");

    await seeded.getByRole("button", { name: "更多评论操作" }).click();
    await expect(page.getByRole("menuitem", { name: "恢复并公开" })).toBeVisible();
    await page.getByRole("menuitem", { name: "恢复并公开" }).click();
    await expect(section.getByRole("alert")).toContainText("管理员评论已恢复并公开");
    await expect(seeded.getByText("管理员", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
