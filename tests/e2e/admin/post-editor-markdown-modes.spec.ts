import type { Locator, Page } from "@playwright/test";
import { expect, adminTest as test } from "./fixtures";

const DEMO_EDITOR_URL = "/admin/posts/editor?demo=true&slug=react-hooks-deep-dive";

async function openDemoEditor(page: Page) {
  const response = await page.goto(DEMO_EDITOR_URL, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "WYSIWYG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Source" })).toBeVisible();
  await expect(page.getByRole("button", { name: "对照" })).toBeVisible();
}

async function openFileBrowserItem(page: Page, name: string, options: { dblClick?: boolean } = {}) {
  const item = page.getByRole("button", { name });
  await expect(item).toBeVisible({ timeout: 30_000 });
  if (options.dblClick) {
    await item.dblclick();
    return;
  }
  await item.click();
}

async function expectSourceMarkdown(textarea: Locator) {
  await expect(textarea).toHaveValue(/^---\n[\s\S]*?\n---/);
  await expect(textarea).toHaveValue(/title: React Hooks 深度解析/);
  await expect(textarea).toHaveValue(/slug: react-hooks-deep-dive/);
  await expect(textarea).toHaveValue(/# React Hooks 深度解析/);
  await expect(textarea).toHaveValue(/`useState`/);
  await expect(textarea).toHaveValue(/- 状态更新必须围绕用户动作组织。/);
  await expect(textarea).toHaveValue(/> 依赖数组不是优化开关/);
  await expect(textarea).toHaveValue(/```tsx/);
  await expect(textarea).toHaveValue(/function Counter\(\)/);
  await expect(textarea).toHaveValue(/useEffect\(\(\) =>/);
}

async function expectFrontmatterBlock(page: Page) {
  await expect(page.getByTestId("frontmatter-block")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Frontmatter YAML editor" })).toHaveValue(
    /title: React Hooks 深度解析/
  );
  await expect(page.getByRole("textbox", { name: "Frontmatter YAML editor" })).toHaveValue(
    /slug: react-hooks-deep-dive/
  );
  const frontmatterMetrics = await page
    .getByRole("textbox", { name: "Frontmatter YAML editor" })
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
  expect(frontmatterMetrics.overflowY).toBe("hidden");
  expect(frontmatterMetrics.scrollHeight).toBeLessThanOrEqual(frontmatterMetrics.clientHeight + 1);
}

async function expectFrontmatterFocusState(page: Page) {
  const focusState = await page.getByTestId("frontmatter-block").evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      borderColor: styles.borderColor,
      boxShadow: styles.boxShadow,
    };
  });

  expect(focusState.boxShadow).not.toBe("none");
  expect(focusState.boxShadow).toContain("rgb");
  expect(focusState.borderColor).not.toBe("rgba(0, 0, 0, 0)");
}

async function expectWysiwygTextColumnAlignment(page: Page) {
  const titleLeft = await page
    .locator("div.text-base.font-semibold")
    .filter({ hasText: "React Hooks 深度解析" })
    .first()
    .evaluate((element) => element.getBoundingClientRect().left);
  const frontmatterTextLeft = await page
    .getByRole("textbox", { name: "Frontmatter YAML editor" })
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      return element.getBoundingClientRect().left + parseFloat(styles.paddingLeft || "0");
    });
  const bodyTextLeft = await page
    .locator('[data-testid="content-input"] .ProseMirror')
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      return element.getBoundingClientRect().left + parseFloat(styles.paddingLeft || "0");
    });

  expect(Math.abs(frontmatterTextLeft - bodyTextLeft)).toBeLessThanOrEqual(2);
  expect(titleLeft).toBeLessThan(bodyTextLeft);
}

async function expectFrontmatterBodyRhythm(page: Page) {
  const spacing = await page.evaluate(() => {
    const frontmatter = document.querySelector('[data-testid="frontmatter-block"]');
    const prose = document.querySelector('[data-testid="content-input"] .ProseMirror');
    const firstHeading = document.querySelector('[data-testid="content-input"] .ProseMirror h1');

    if (
      !(frontmatter instanceof Element) ||
      !(prose instanceof Element) ||
      !(firstHeading instanceof Element)
    ) {
      return null;
    }

    const frontRect = frontmatter.getBoundingClientRect();
    const proseRect = prose.getBoundingClientRect();
    const headingRect = firstHeading.getBoundingClientRect();

    return {
      gapFrontToProse: Math.round(proseRect.top - frontRect.bottom),
      gapFrontToHeading: Math.round(headingRect.top - frontRect.bottom),
      gapProseToHeading: Math.round(headingRect.top - proseRect.top),
    };
  });

  expect(spacing).not.toBeNull();
  expect(spacing?.gapFrontToProse).toBe(16);
  expect(spacing?.gapProseToHeading).toBeLessThanOrEqual(28);
  expect(spacing?.gapFrontToHeading).toBeLessThanOrEqual(44);
}

async function richMarkdownState(page: Page, rootSelector: string) {
  return page.locator(rootSelector).evaluate((root) => {
    const h1 = root.querySelector("h1");
    const h2 = root.querySelector("h2");
    const paragraph = root.querySelector("p");
    const inlineCode = root.querySelector("p code");
    const listItem = root.querySelector("li");
    const blockquote = root.querySelector("blockquote");
    const codeEditor = root.querySelector(".cm-editor");
    const tokenSpans = Array.from(root.querySelectorAll(".cm-content span[class]")).filter(
      (node) => (node.textContent ?? "").trim().length > 0
    );
    const tokenColors = Array.from(new Set(tokenSpans.map((node) => getComputedStyle(node).color)));

    return {
      text: root.textContent ?? "",
      h1Text: h1?.textContent ?? "",
      h2Text: h2?.textContent ?? "",
      h1Size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
      paragraphSize: paragraph ? parseFloat(getComputedStyle(paragraph).fontSize) : 0,
      inlineCodeText: inlineCode?.textContent ?? "",
      inlineCodeBackground: inlineCode ? getComputedStyle(inlineCode).backgroundColor : "",
      listText: listItem?.textContent ?? "",
      blockquoteText: blockquote?.textContent ?? "",
      blockquoteBorderStyle: blockquote ? getComputedStyle(blockquote).borderTopStyle : "",
      codeText: codeEditor?.textContent ?? "",
      tokenCount: tokenSpans.length,
      tokenColorCount: tokenColors.length,
      contentEditable: root.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
    };
  });
}

async function shellLayoutState(page: Page) {
  return page.locator(".admin-app-shell-grid").evaluate((grid) => {
    const sidebar = grid.querySelector("aside");
    const main = grid.querySelector('[data-testid="admin-shell-main"]');
    const sidebarRect = sidebar?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();

    return {
      sidebarWidth: sidebarRect?.width ?? 0,
      mainX: mainRect?.x ?? 0,
      mainWidth: mainRect?.width ?? 0,
      storedWidth: window.localStorage.getItem("admin-sidebar-width"),
    };
  });
}

function expectRichMarkdownRendering(state: Awaited<ReturnType<typeof richMarkdownState>>) {
  expect(state.h1Text).toContain("React Hooks 深度解析");
  expect(state.h2Text).toContain("基础 Hooks");
  expect(state.h1Size).toBeGreaterThan(state.paragraphSize);
  expect(state.inlineCodeText).toContain("useState");
  expect(state.inlineCodeBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(state.listText).toContain("状态更新必须围绕用户动作组织");
  expect(state.blockquoteText).toContain("依赖数组不是优化开关");
  expect(state.blockquoteBorderStyle).toBe("solid");
  expect(state.codeText).toContain("function Counter()");
  expect(state.codeText).toContain("useEffect");
  expect(state.text).not.toContain("```tsx");
  expect(state.tokenCount).toBeGreaterThan(3);
  expect(state.tokenColorCount).toBeGreaterThan(1);
}

test.describe("Post editor Markdown modes", () => {
  test("source mode keeps raw Markdown syntax visible", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "Source" }).click();
    await expectSourceMarkdown(page.getByRole("textbox", { name: "Markdown source editor" }));
  });

  test("WYSIWYG renders Markdown structure and highlighted code", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await expectFrontmatterBlock(page);
    await expect(page.locator('[data-testid="content-input"] .ProseMirror')).toBeVisible();

    expectRichMarkdownRendering(await richMarkdownState(page, '[data-testid="content-input"]'));
  });

  test("frontmatter block exposes a visible keyboard focus state", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const frontmatter = page.getByRole("textbox", { name: "Frontmatter YAML editor" });
    await frontmatter.focus();

    await expectFrontmatterFocusState(page);
  });

  test("WYSIWYG body text aligns with the frontmatter text column", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await expectFrontmatterBlock(page);
    await expectWysiwygTextColumnAlignment(page);
  });

  test("WYSIWYG keeps frontmatter and body in one vertical writing rhythm", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await expectFrontmatterBlock(page);
    await expectFrontmatterBodyRhythm(page);
  });

  test("compare preview renders Markdown with Milkdown read-only highlighting", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "对照" }).click();
    await expectFrontmatterBlock(page);
    await expectSourceMarkdown(page.getByRole("textbox", { name: "Markdown source editor" }));
    await expect(page.locator('[data-testid="content-preview"] .ProseMirror')).toBeVisible();

    const previewState = await richMarkdownState(page, '[data-testid="content-preview"]');
    expectRichMarkdownRendering(previewState);
    expect(previewState.contentEditable).toBe("false");
  });

  test("WYSIWYG frontmatter block writes back to source frontmatter", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const frontmatter = page.getByRole("textbox", { name: "Frontmatter YAML editor" });
    await frontmatter.fill(
      "title: React Hooks 深度解析\nslug: react-hooks-deep-dive\ndraft: false\ncreatedVia: demo"
    );

    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /^---\n[\s\S]*?\n---/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /title: React Hooks 深度解析/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /slug: react-hooks-deep-dive/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /draft: false/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /createdVia: demo/
    );
  });

  test("frontmatter title change updates the tab label and preserves unknown keys", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const frontmatter = page.getByRole("textbox", { name: "Frontmatter YAML editor" });
    await frontmatter.fill(
      "title: Hooks Title From Frontmatter\nslug: react-hooks-deep-dive\ndraft: false\ncreatedVia: demo"
    );

    await expect(page.getByText("Hooks Title From Frontmatter")).toBeVisible();

    await page.getByRole("button", { name: "Source" }).click();
    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await expect(source).toHaveValue(/title: Hooks Title From Frontmatter/);
    await expect(source).toHaveValue(/createdVia: demo/);
  });

  test("frontmatter block respects explicit YAML deletion of unknown keys", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const frontmatter = page.getByRole("textbox", { name: "Frontmatter YAML editor" });
    await frontmatter.fill(
      "title: React Hooks 深度解析\nslug: react-hooks-deep-dive\ndraft: false"
    );

    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).not.toHaveValue(
      /createdVia: demo/
    );
  });

  test("opening a sample file keeps it saved until the user edits it", async ({ page }) => {
    await openDemoEditor(page);

    await openFileBrowserItem(page, "电子负载开发笔记.md");
    await expect(page.getByTestId("editor")).toContainText("已保存");
    await expect(page.getByTestId("editor-tab")).toHaveCount(2);

    await page.getByRole("button", { name: "Source" }).click();
    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await expect(source).toHaveValue(/title: 电子负载开发笔记/);
    await expect(source).toHaveValue(/!\[控制板\]\(\.\/assets\/load-board\.png\)/);
    await expect(source).toHaveValue(/\| OPA2277 \| SGM8552 \| AD8666 \|/);
    await expect(page.getByText("未保存")).toHaveCount(0);

    await source.fill(
      `---
title: 电子负载开发笔记
slug: electronic-load-notes
draft: false
public: true
tags:
  - Hardware
  - Circuit
---

# 电子负载开发笔记

更新正文`
    );
    await expect(page.getByText("未保存").first()).toBeVisible();
    const dirtyTab = page.getByTestId("editor-tab").filter({ hasText: "电子负载开发笔记" });
    await expect(dirtyTab.getByText("未保存")).toHaveCount(0);
    await expect(dirtyTab.getByTestId("editor-tab-dirty-dot")).toBeVisible();
    await dirtyTab.hover();
    await expect(page.getByRole("tooltip")).toContainText("电子负载开发笔记，未保存");
  });

  test("single click creates a temporary tab and double click promotes it to permanent", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await openFileBrowserItem(page, "电子负载开发笔记.md");
    await expect(page.getByTestId("editor-tab")).toHaveCount(2);
    const temporaryTab = page.getByTestId("editor-tab").first();
    await expect(temporaryTab).toContainText("电子负载开发笔记");
    await expect(temporaryTab).toHaveAttribute("data-temporary", "true");
    await expect(temporaryTab.getByText("电子负载开发笔记")).toHaveCSS("font-style", "italic");

    await openFileBrowserItem(page, "使用 CH335F 构建一个支持独立供电的 2A2C USB HUB.md");
    await expect(page.getByTestId("editor-tab")).toHaveCount(2);
    await expect(page.getByTestId("editor-tab").first()).toContainText(
      "使用 CH335F 构建一个支持独立供电的 2A2C USB HUB"
    );

    await openFileBrowserItem(page, "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新.md", {
      dblClick: true,
    });
    await expect(page.getByTestId("editor-tab")).toHaveCount(3);
    const permanentTab = page.getByTestId("editor-tab").first();
    await expect(permanentTab).toContainText("通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新");
    await expect(permanentTab).toHaveAttribute("data-temporary", "false");
    await expect(page.getByTestId("editor").locator("div.text-base.font-semibold")).toHaveText(
      "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新"
    );

    await openFileBrowserItem(page, "学习笔记：电子负载实现原理.md");
    await expect(page.getByTestId("editor-tab")).toHaveCount(3);
    await expect(page.getByTestId("editor-tab").first()).toContainText(
      "学习笔记：电子负载实现原理"
    );
    await expect(
      page.getByRole("tab", { name: /通过 WebUSB 和 STM32 MCU 实现 SPI/ })
    ).toBeVisible();
    await expect(page.getByTestId("editor").locator("div.text-base.font-semibold")).toHaveText(
      "学习笔记：电子负载实现原理"
    );
  });

  test("tab overflow exposes the opened files list on desktop and mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openDemoEditor(page);

    for (const name of [
      "电子负载开发笔记.md",
      "使用 CH335F 构建一个支持独立供电的 2A2C USB HUB.md",
      "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新.md",
      "学习笔记：电子负载实现原理.md",
    ]) {
      await openFileBrowserItem(page, name, { dblClick: true });
    }

    const strip = page.getByTestId("editor-tab-strip");
    const stripBox = await strip.boundingBox();
    expect(stripBox?.height).toBeLessThanOrEqual(42);
    const tops = await strip
      .locator('[data-testid="editor-tab"]')
      .evaluateAll((tabs) =>
        Array.from(new Set(tabs.map((tab) => Math.round(tab.getBoundingClientRect().top))))
      );
    expect(tops).toHaveLength(1);
    await expect(strip.getByText("未保存")).toHaveCount(0);

    const currentTab = strip.getByRole("tab", { name: /已保存/ }).first();
    await currentTab.hover();
    await expect(page.getByRole("tooltip")).toContainText("已保存");

    await page.getByTestId("editor-tabs-overflow").click();
    await expect(page.getByTestId("editor-tab-overflow-list")).toBeVisible();
    await expect(page.getByTestId("editor-tab-overflow-list")).toContainText(
      "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新"
    );

    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("editor-tabs-overflow")).toBeVisible();
    await page.getByTestId("editor-tabs-overflow").click();
    await expect(page.getByRole("heading", { name: "已打开文件" })).toBeVisible();
    await page.locator('[data-vaul-drawer][data-state="open"]').waitFor();
    await page.waitForTimeout(650);
    const drawerMetrics = await page
      .locator('[data-vaul-drawer][data-state="open"]')
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return {
          bottomGap: Math.abs(window.innerHeight - rect.bottom),
          direction: element.getAttribute("data-vaul-drawer-direction"),
          leftGap: Math.abs(rect.left),
          position: styles.position,
          rightGap: Math.abs(window.innerWidth - rect.right),
        };
      });
    expect(drawerMetrics.direction).toBe("bottom");
    expect(drawerMetrics.position).toBe("fixed");
    expect(drawerMetrics.bottomGap).toBeLessThanOrEqual(2);
    expect(drawerMetrics.leftGap).toBeLessThanOrEqual(2);
    expect(drawerMetrics.rightGap).toBeLessThanOrEqual(2);
  });

  test("WYSIWYG preserves a body-leading YAML fence instead of converting it into frontmatter", async ({
    page,
  }) => {
    await openDemoEditor(page);

    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await page.getByRole("button", { name: "Source" }).click();
    await source.fill(`---
title: React Hooks 深度解析
slug: react-hooks-deep-dive
draft: false
---
\`\`\`yaml
kind: example
value: true
\`\`\`

# React Hooks 深度解析

Body paragraph`);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const prose = page.locator('[data-testid="content-input"] .ProseMirror');
    await prose.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" updated");

    await page.getByRole("button", { name: "Source" }).click();
    await expect(source).toHaveValue(/```yaml\nkind: example\nvalue: true\n```/);
    await expect(source).not.toHaveValue(/^---\nkind: example\nvalue: true\n---/);
  });

  test("desktop sidebar drag handle resizes the shell and persists width", async ({ page }) => {
    await openDemoEditor(page);

    const before = await shellLayoutState(page);
    const handle = page.getByRole("separator", { name: /调整侧边栏宽度/ });
    await expect(handle).toHaveAttribute("aria-valuemin", "232");
    await expect(handle).toHaveAttribute("aria-valuemax", "460");
    await expect(handle).toHaveAttribute("aria-valuenow", String(Math.round(before.sidebarWidth)));
    await handle.hover();
    await expect(page.getByText("拖动调整侧栏宽度，双击恢复默认")).toBeVisible();

    const box = await handle.boundingBox();
    if (!box) {
      throw new Error("Sidebar resize handle is not visible");
    }

    await page.mouse.move(box.x + box.width / 2, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 116, box.y + 120, { steps: 8 });
    await page.mouse.up();

    const after = await shellLayoutState(page);
    expect(after.sidebarWidth).toBeGreaterThan(before.sidebarWidth + 90);
    expect(after.mainX).toBeGreaterThan(before.mainX + 90);
    expect(after.mainWidth).toBeLessThan(before.mainWidth - 90);
    expect(Number(after.storedWidth)).toBeGreaterThan(before.sidebarWidth + 90);
    await expect(handle).toHaveAttribute("aria-valuenow", String(Math.round(after.sidebarWidth)));

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible();
    const reloaded = await shellLayoutState(page);
    expect(Math.abs(reloaded.sidebarWidth - after.sidebarWidth)).toBeLessThanOrEqual(2);

    await handle.dblclick();
    const reset = await shellLayoutState(page);
    expect(Math.abs(reset.sidebarWidth - 272)).toBeLessThanOrEqual(2);
    expect(reset.storedWidth).toBe("272");
  });

  test("file tree creates items in the selected directory and renames inline", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "posts" }).click();

    await page.getByRole("button", { name: "新建文件" }).click();
    const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
    await expect(fileNameInput).toHaveValue("untitled.md");
    await fileNameInput.fill("notes.md");
    await fileNameInput.press("Enter");
    const newFile = page.getByRole("button", { name: "notes.md" });
    await expect(newFile).toBeVisible();
    await newFile.click();
    await expect(page.getByText("local:content/posts/notes.md")).toBeVisible();
    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue("");

    await page.getByRole("button", { name: "posts" }).click();
    await page.getByRole("button", { name: "新建目录" }).click();
    const directoryNameInput = page.getByRole("textbox", { name: "目录名称" });
    await expect(directoryNameInput).toHaveValue("new-folder");
    await directoryNameInput.fill("research");
    await directoryNameInput.press("Enter");
    await expect(page.getByRole("button", { name: "research" })).toBeVisible();
  });
});
