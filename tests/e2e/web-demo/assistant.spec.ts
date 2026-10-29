import { expect, test } from "@playwright/test";

async function hideInspector(page: import("@playwright/test").Page) {
  const collapse = page.getByRole("button", { name: "收起 Web Demo 控制面板" });
  if (await collapse.isVisible()) {
    await collapse.click();
    return;
  }

  await page.evaluate(() => window.localStorage.setItem("web-demo-inspector-open", "true"));
  await page.reload();
  await page.getByRole("button", { name: "收起 Web Demo 控制面板" }).click();
}

test.describe("Knowledge Assistant Web Demo", () => {
  test("keeps a user conversation private and idempotent across the full-page flow", async ({
    page,
  }) => {
    await page.goto("/chat?d_persona=user&d_scene=assistant-ready&d_delay=normal");
    await hideInspector(page);

    await expect(page.getByTestId("assistant-route-header")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "站点导航" })).toContainText("文章");
    await expect(page.getByRole("navigation", { name: "站点导航" })).toContainText("项目");
    const footer = page.getByTestId("assistant-route-footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("RSS");
    await expect(footer).toContainText("©");
    await expect(footer).not.toContainText("站点入口");
    await expect(page.getByTestId("assistant-page")).toBeVisible();
    await expect(page.getByTestId("assistant-conversation-list")).toBeVisible();
    await expect(
      page.getByTestId("assistant-conversation-list").getByRole("button", { name: "新建对话" })
    ).toBeVisible();
    await expect(
      page.locator(".assistant-route-header-tools .nature-header-theme-toggle")
    ).toHaveCount(0);
    await expect(page.locator(".assistant-route-header-tools select")).toHaveCount(0);
    const themeTrigger = page.getByRole("combobox", { name: /主题：/ });
    await expect(themeTrigger).toBeVisible();
    await themeTrigger.click();
    await expect(page.getByRole("option", { name: "Dark" })).toBeVisible();
    await page.getByRole("option", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-ui-preference", "dark");
    await expect(page.getByText("公开知识库", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("assistant-quota")).toContainText("问题");

    const question = "如何验证公开内容？";
    await page.getByLabel("知识对话问题").fill(question);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(
      page.getByTestId("assistant-message-user").filter({ hasText: question })
    ).toBeVisible();
    await expect(
      page.getByTestId("assistant-message-assistant").filter({ hasText: "根据公开知识库" })
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "回答来源" }).first()).toBeVisible();

    const conversationId = new URL(page.url()).searchParams.get("conversation");
    expect(conversationId).toBeNull();
    await page.reload();
    await hideInspector(page);
    await expect(
      page.getByTestId("assistant-message-user").filter({ hasText: question })
    ).toBeVisible();
    await expect(
      page.getByTestId("assistant-message-assistant").filter({ hasText: "根据公开知识库" })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);
  });

  test("keeps the guest route read-only and preserves a pre-login draft", async ({ page }) => {
    await page.goto("/chat?d_persona=guest&d_scene=assistant-ready&d_delay=normal");
    await hideInspector(page);

    await expect(page.getByTestId("assistant-route-header")).toBeVisible();
    const footer = page.getByTestId("assistant-route-footer");
    await expect(footer).toBeVisible();
    await expect(footer).not.toContainText("站点入口");
    await expect(page.getByRole("heading", { name: "登录后使用知识对话" })).toBeVisible();
    await expect(page.getByTestId("assistant-conversation-list")).toBeVisible();
    await expect(page.getByTestId("assistant-guest-empty-state")).toBeVisible();
    await expect(
      page.getByText("登录后可以询问本站公开文章、项目经验和工作方法。", { exact: false })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "管理员入口" })).toHaveCount(0);
    const draft = page.getByLabel("登录前的知识对话草稿");
    await draft.fill("先保存这段问题");
    await expect(page.getByRole("button", { name: "保存草稿并登录" })).toBeVisible();
    await expect(page.getByTestId("assistant-message-user")).toHaveCount(0);
    await expect(page.getByTestId("assistant-message-assistant")).toHaveCount(0);
  });
});
