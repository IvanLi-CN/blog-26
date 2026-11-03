import { expect, test } from "@playwright/test";

const isMobileViewport = process.env.WEB_DEMO_VIEWPORT === "mobile";

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
  test("applies the admin launcher setting to the public runtime config", async ({ page }) => {
    await page.goto("/admin/site-features?d_persona=admin&d_delay=normal");
    await page.getByLabel("显示助手入口").click();
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("站点功能配置已保存。")).toBeVisible();

    await page.goto("/?d_persona=guest&d_delay=normal");
    await expect(page.getByTestId("assistant-fab")).toHaveCount(0);

    await page.goto("/admin/site-features?d_persona=admin&d_delay=normal");
    await page.getByLabel("启用助手服务").click();
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("站点功能配置已保存。")).toBeVisible();

    await page.goto("/chat?d_persona=user&d_delay=normal");
    await expect(page.getByTestId("assistant-request-error")).toContainText("站点助手功能未启用");
  });

  test("creates a distinct conversation after the first message", async ({ page }) => {
    await page.goto("/?d_persona=user&d_scene=assistant-ready");
    await page.getByTestId("assistant-fab").click();
    const panel = page.getByTestId("assistant-panel");
    const toggle = panel.getByRole("button", { name: "切换对话" });
    const list = page.getByTestId("assistant-conversation-list");
    await toggle.click();
    await list.getByRole("button", { name: "新建对话" }).first().click();
    await expect(panel.getByRole("heading", { name: "新对话" })).toBeVisible();
    await toggle.click();
    await expect(list.getByText("草稿 · 发送第一条消息后保存")).toBeVisible();
    await list.locator(".knowledge-assistant-list-select").filter({ hasText: "新对话" }).click();
    const question = "如何找到项目经验？";
    await panel.getByLabel("知识对话问题").fill(question);
    await toggle.click();
    await list
      .getByRole("button", { name: /知识对话/ })
      .first()
      .click();
    await toggle.click();
    await list.locator(".knowledge-assistant-list-select").filter({ hasText: "新对话" }).click();
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
    const list = page.getByTestId("assistant-conversation-list");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await toggle.click();
    await expect(list).toBeVisible();
    await expect(list).toHaveCSS("flex-direction", "column");
    await expect(panel.getByLabel("知识对话问题")).toBeVisible();
    await list.locator(".knowledge-assistant-list-select").first().click();
    await expect(list).toBeHidden();
    await expect(panel.getByLabel("知识对话问题")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("loads home cover media after navigating from chat without a development error overlay", async ({
    page,
  }) => {
    await page.goto("/chat?d_persona=user&d_scene=assistant-ready&d_delay=normal");
    if (isMobileViewport) {
      await page
        .getByTestId("assistant-route-mobile-header")
        .getByRole("link", { name: /Ivan's Blog/ })
        .click();
    } else {
      await page.getByRole("link", { name: "返回 Ivan's Blog 首页" }).click();
    }
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

    const routeHeader = page.getByTestId(
      isMobileViewport ? "assistant-route-mobile-header" : "assistant-route-header"
    );
    const navigation = page.getByRole("navigation", {
      name: isMobileViewport ? "Main navigation" : "站点导航",
    });
    await expect(routeHeader).toBeVisible();
    await expect(navigation).toContainText("文章");
    await expect(navigation).toContainText("项目");
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
      page
        .getByTestId("assistant-conversation-list")
        .getByRole("button", { name: "新建对话" })
        .first()
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
    await expect(page.getByTestId("assistant-quota")).toContainText("问题");
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

    await expect(
      page.getByTestId(
        isMobileViewport ? "assistant-route-mobile-header" : "assistant-route-header"
      )
    ).toBeVisible();
    const footer = page.getByTestId("assistant-route-footer");
    await expect(footer).toBeVisible();
    await expect(footer).not.toContainText("站点入口");
    await expect(page.getByRole("heading", { name: "登录后使用知识对话" })).toBeVisible();
    if (isMobileViewport) {
      await expect(page.getByTestId("assistant-conversation-list")).toBeHidden();
    } else {
      await expect(page.getByTestId("assistant-conversation-list")).toBeVisible();
    }
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

  test("preserves the original desktop header while switching to the public header on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/chat?d_persona=guest&d_scene=assistant-ready&d_theme=light");
    await hideInspector(page);

    const desktopHeader = page.getByTestId("assistant-route-header");
    const mobileHeader = page.getByTestId("assistant-route-mobile-header");
    const desktopNavigation = desktopHeader.getByRole("navigation", { name: "站点导航" });

    await expect(desktopHeader).toBeVisible();
    await expect(mobileHeader).toBeHidden();
    await expect(desktopHeader.locator(".assistant-route-header-inner")).toHaveCSS(
      "display",
      "grid"
    );
    await expect(desktopNavigation.getByRole("link")).toHaveText([
      "首页",
      "闪念",
      "文章",
      "项目",
      "标签",
      "执念",
      "搜索",
    ]);
    await expect(desktopHeader.locator(".assistant-route-brand-name")).toHaveText("Ivan's Blog");
    await expect(desktopHeader.locator(".assistant-route-brand-title")).toHaveText("知识对话");
    await expect(desktopHeader.getByRole("combobox", { name: /主题：/ })).toBeVisible();
  });

  test("uses the main public navigation on mobile without adding extra entries", async ({
    page,
  }) => {
    for (const width of [393, 360, 320]) {
      await page.setViewportSize({ width, height: 852 });
      await page.goto("/chat?d_persona=guest&d_scene=assistant-ready&d_theme=light");
      await hideInspector(page);

      const header = page.getByTestId("assistant-route-mobile-header");
      const navigation = page.getByRole("navigation", { name: "Main navigation" });

      await expect(navigation).toBeVisible();
      await expect(navigation.locator("a")).toHaveCount(5);
      await expect(navigation).not.toContainText("首页");
      await expect(navigation).not.toContainText("搜索");
      await expect(navigation.locator(".nature-nav-link-label")).toHaveCount(5);
      await expect(header.locator("[data-assistant-nav-toggle]")).toHaveCount(0);
      await expect(header.getByRole("link", { name: "RSS Feed" })).toHaveCount(0);
      await expect(header.getByRole("link", { name: "搜索" })).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      ).toBe(true);

      const measurements = await page.evaluate(() => {
        const header = document.querySelector<HTMLElement>(
          "[data-testid='assistant-route-mobile-header']"
        );
        const navigation = document.querySelector<HTMLElement>(
          "[data-testid='assistant-route-mobile-header'] nav"
        );
        const links = [
          ...document.querySelectorAll<HTMLElement>(
            "[data-testid='assistant-route-mobile-header'] nav a"
          ),
        ];
        const headerBox = header?.getBoundingClientRect();
        const navigationBox = navigation?.getBoundingClientRect();
        return {
          headerBottom: headerBox?.bottom ?? 0,
          navigationBottom: navigationBox?.bottom ?? 0,
          linkHeights: links.map((link) => link.getBoundingClientRect().height),
          bodyWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      expect(measurements.navigationBottom).toBeLessThanOrEqual(measurements.headerBottom + 1);
      expect(measurements.linkHeights.every((height) => height >= 44)).toBe(true);
      expect(measurements.bodyWidth).toBeLessThanOrEqual(measurements.viewportWidth);

      await page.getByLabel("登录前的知识对话草稿").focus();
      await page.evaluate(() => window.scrollTo({ top: 520, behavior: "instant" }));
      await page.waitForFunction(() => window.scrollY > 0);
      await expect(header).toHaveAttribute("data-public-header-state", /partial|collapsed/);
      const collapsedHeader = await header.evaluate(
        (element) => element.getBoundingClientRect().bottom
      );
      expect(collapsedHeader).toBeLessThanOrEqual(2);
    }
  });

  test("opens the mobile conversation list as a modal sheet above the chat surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/chat?d_persona=user&d_scene=assistant-ready&d_theme=light");
    await hideInspector(page);

    const toggle = page.getByRole("button", { name: "切换对话" });
    const list = page.getByTestId("assistant-conversation-list");
    const composer = page.getByLabel("知识对话问题");

    await expect(composer).toBeVisible();
    await expect(list).toBeHidden();
    await toggle.click();

    const sheet = page.getByTestId("assistant-conversation-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("role", "dialog");
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    await expect(sheet.getByRole("button", { name: "新建对话" }).first()).toBeVisible();
    await expect(page.getByTestId("assistant-create-conversation-card")).toBeVisible();
    await expect(page.getByTestId("assistant-conversation-sheet-backdrop")).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await expect(composer).toBeVisible();

    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(sheetBox?.width ?? 0).toBeLessThanOrEqual(393);
    expect(sheetBox?.height ?? 0).toBeGreaterThanOrEqual(852 * 0.55);
    expect(sheetBox?.height ?? 0).toBeLessThanOrEqual(852 * 0.65);
    expect(sheetBox?.y ?? 0).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });

  test("keeps the guest mobile surface focused on chat instead of an inline list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/chat?d_persona=guest&d_scene=assistant-ready&d_theme=light");
    await hideInspector(page);

    await expect(page.getByLabel("登录前的知识对话草稿")).toBeVisible();
    await expect(page.getByTestId("assistant-conversation-list")).toBeHidden();
    await expect(page.getByTestId("assistant-guest-empty-state")).toBeVisible();
  });
});
