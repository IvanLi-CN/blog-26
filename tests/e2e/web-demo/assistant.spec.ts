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
  test("creates a distinct conversation after the first message", async ({ page }) => {
    await page.goto("/?d_persona=user&d_scene=assistant-ready");
    await page.getByTestId("assistant-fab").click();
    const panel = page.getByTestId("assistant-panel");
    await expect(panel.locator(".knowledge-assistant-toolbar")).toHaveCount(0);
    await expect(panel.getByTestId("assistant-quota")).toContainText("Token 10k/10k");
    await expect(panel.getByTestId("assistant-quota")).not.toContainText("问题");
    await expect(panel.getByTestId("assistant-quota")).not.toContainText("对话");
    await expect(panel.getByTestId("assistant-quota")).not.toContainText("本周");
    const toggle = panel.getByRole("button", { name: "切换对话" });
    const list = panel.getByTestId("assistant-conversation-list");
    await toggle.click();
    await list.getByRole("button", { name: "新建对话" }).click();
    await expect(panel.getByRole("heading", { name: "新对话" })).toBeVisible();
    await toggle.click();
    await expect(list.getByText("草稿 · 发送第一条消息后保存")).toBeVisible();
    await list.getByRole("button", { name: /新对话/ }).click();
    const question = "如何找到项目经验？";
    await panel.getByLabel("知识对话问题").fill(question);
    await toggle.click();
    await list
      .getByRole("button", { name: /知识对话/ })
      .first()
      .click();
    await toggle.click();
    await list.getByRole("button", { name: /新对话/ }).click();
    await expect(panel.getByLabel("知识对话问题")).toHaveValue(question);
    await panel.getByRole("button", { name: "发送", exact: true }).click();
    await expect(
      panel.getByTestId("assistant-message-user").filter({ hasText: question })
    ).toBeVisible();
    await toggle.click();
    await expect(list.getByRole("button", { name: new RegExp(question) }).first()).toBeVisible();
    await expect(list).toContainText("2 段已保存");
  });

  test("opens the vertical conversation switcher from the floating panel header", async ({
    page,
  }) => {
    await page.goto("/?d_persona=user&d_scene=assistant-ready");
    await page.getByTestId("assistant-fab").click();
    const panel = page.getByTestId("assistant-panel");
    const toggle = panel.locator("header").getByRole("button", { name: "切换对话" });
    const headerConversation = panel.locator(".knowledge-assistant-header-conversation");
    const quota = panel.getByTestId("assistant-quota");
    const titleRow = panel.locator(".knowledge-assistant-header-conversation-title-row");
    const list = panel.getByTestId("assistant-conversation-list");
    await expect(panel.getByRole("button", { name: "关闭知识对话" })).toHaveCount(1);
    await expect(headerConversation).toHaveCSS("display", "flex");
    const titleBeforeExpand = await titleRow.boundingBox();
    const quotaBeforeExpand = await quota.boundingBox();
    expect(titleBeforeExpand).not.toBeNull();
    expect(quotaBeforeExpand).not.toBeNull();
    if (!titleBeforeExpand || !quotaBeforeExpand) throw new Error("Header geometry is unavailable");
    expect(quotaBeforeExpand.y).toBeGreaterThanOrEqual(titleBeforeExpand.y);
    expect(quotaBeforeExpand.y + quotaBeforeExpand.height).toBeLessThanOrEqual(
      titleBeforeExpand.y + titleBeforeExpand.height
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await toggle.click();
    await expect(list).toBeVisible();
    await expect(list).toHaveCSS("flex-direction", "column");
    const titleBox = await titleRow.boundingBox();
    const listBox = await list.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(listBox).not.toBeNull();
    if (!titleBox || !listBox) throw new Error("Conversation list geometry is unavailable");
    const listGap = listBox.y - (titleBox.y + titleBox.height);
    expect(listGap).toBeGreaterThanOrEqual(4);
    expect(listGap).toBeLessThanOrEqual(12);
    await expect(panel).toHaveAttribute("data-list-expanded", "true");
    await expect
      .poll(async () =>
        Number(
          await panel
            .locator(".knowledge-assistant-content")
            .evaluate((element) => getComputedStyle(element, "::after").opacity)
        )
      )
      .toBeGreaterThan(0.5);
    await expect(list).toHaveCSS("backdrop-filter", "none");
    await expect(panel.getByLabel("知识对话问题")).toBeVisible();
    await toggle.click();
    await expect(list).toBeHidden();
    await expect(panel).toHaveAttribute("data-list-expanded", "false");
    await titleRow.locator(".knowledge-assistant-header-conversation-title-text").click();
    await expect(list).toBeVisible();
    const helpToggle = panel.getByRole("button", { name: "帮助" });
    await expect(helpToggle).toHaveAttribute("aria-expanded", "false");
    await helpToggle.click();
    const helpPanel = panel.getByTestId("assistant-help-panel");
    await expect(helpPanel).toBeVisible();
    await expect(helpPanel).toContainText("可以问什么");
    await expect(helpPanel).toContainText("额度与保留");
    await expect(panel.locator(".knowledge-assistant-notice")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(helpPanel).toBeHidden();
    await expect(helpToggle).toBeFocused();
    await helpToggle.click();
    await expect(helpPanel).toBeVisible();
    await helpPanel.getByRole("button", { name: "关闭帮助" }).click();
    await expect(helpPanel).toBeHidden();
    await expect(list).toBeHidden();
    await toggle.click();
    await expect(list).toBeVisible();
    await list.locator(".knowledge-assistant-list-select").first().click();
    await expect(list).toBeHidden();
    await expect(panel.getByLabel("知识对话问题")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await panel.locator("header").getByRole("button", { name: "关闭知识对话" }).click();
    const closingState = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-testid="assistant-panel"]');
      return node ? { ariaHidden: node.getAttribute("aria-hidden"), inert: node.inert } : null;
    });
    expect(closingState).toEqual({ ariaHidden: "true", inert: true });
    await expect(panel).toHaveCount(0);
  });

  test("loads home cover media after navigating from chat without a development error overlay", async ({
    page,
  }) => {
    await page.goto("/chat?d_persona=user&d_scene=assistant-ready&d_delay=normal");
    await page
      .getByRole("navigation", { name: "站点导航" })
      .getByRole("link", { name: "首页" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    const cover = page.locator('img[src*="/api/public/assets/post/"]').first();
    await expect(cover).toBeVisible();
    await expect
      .poll(() =>
        cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
      )
      .toBe(true);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  });

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
    const conversationToggle = page.getByRole("button", { name: "切换对话" });
    if (await conversationToggle.isVisible()) {
      await expect(page.getByTestId("assistant-conversation-list")).toBeHidden();
      await conversationToggle.click();
    }
    await expect(page.getByTestId("assistant-conversation-list")).toBeVisible();
    await expect(page.getByTestId("assistant-conversation-list")).toHaveCSS(
      "flex-direction",
      "column"
    );
    await expect(
      page.getByTestId("assistant-conversation-list").getByRole("button", { name: "新建对话" })
    ).toBeVisible();
    if (await conversationToggle.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("assistant-conversation-list")).toBeHidden();
    }
    await expect(
      page.locator(".assistant-route-header-tools .nature-header-theme-toggle")
    ).toHaveCount(0);
    await expect(page.locator(".assistant-route-header-tools select")).toHaveCount(0);
    const themeTrigger = page.getByRole("combobox", { name: /主题：/ });
    await expect(themeTrigger).toBeVisible();
    await expect(themeTrigger.locator(".theme-toggle-select-value")).toBeHidden();
    await themeTrigger.click();
    await expect(page.getByRole("option", { name: "Dark" })).toBeVisible();
    await page.getByRole("option", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-ui-preference", "dark");
    await expect(page.getByText("公开知识库", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("assistant-quota")).toHaveText("Token 10k/10k");
    const helpToggle = page.getByRole("button", { name: "帮助" });
    await helpToggle.click();
    const helpPanel = page.getByTestId("assistant-help-panel");
    await expect(helpPanel).toBeVisible();
    await expect(helpPanel).toContainText("回答如何来");
    await page.keyboard.press("Escape");
    await expect(helpPanel).toBeHidden();
    await expect(helpToggle).toBeFocused();
    await expect(page.getByTestId("assistant-send-shortcuts").getByText("发送")).toBeVisible();
    await expect(page.getByTestId("assistant-send-shortcuts").getByText("换行")).toBeVisible();
    const shortcutBox = await page.getByTestId("assistant-send-shortcuts").boundingBox();
    const sendButtonBox = await page
      .getByRole("button", { name: "发送", exact: true })
      .boundingBox();
    expect(shortcutBox).not.toBeNull();
    expect(sendButtonBox).not.toBeNull();
    expect((shortcutBox?.x ?? 0) + (shortcutBox?.width ?? 0)).toBeLessThanOrEqual(
      sendButtonBox?.x ?? Number.POSITIVE_INFINITY
    );

    const question = "如何验证公开内容？";
    const composer = page.getByLabel("知识对话问题");
    await composer.fill("先保留换行");
    await composer.press("Shift+Enter");
    await expect(composer).toHaveValue("先保留换行\n");
    await composer.fill(question);
    await composer.press("Enter");
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
    await expect(page.getByText("登录后保存对话", { exact: true })).toHaveCount(0);
    await expect(page.getByText("最多保留 3 段临时对话。", { exact: true })).toHaveCount(0);
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
